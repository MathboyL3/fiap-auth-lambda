// index.ts — Railway Function (runtime Bun) — autenticação por CPF → JWT.
//
// Function Serverless nativa do Railway (produto "Functions"): um único
// arquivo executado no runtime Bun. Valida o CPF do cliente, consulta o
// Postgres gerenciado e devolve um JWT HS256 compatível com a API .NET.
//
// Deploy: colar este arquivo no "Source Code" da Function no canvas do
// Railway (Ctrl+S para salvar, Shift+Enter para deployar). Imports NPM no
// formato `pacote@versao` (resolvidos pela Function). Configuração via
// Service Variables (process.env): JWT_SECRET, DATABASE_URL, e opcionais
// JWT_ISSUER, JWT_AUDIENCE, JWT_EXPIRATION_MINUTES, PGSSL.
//
// Rotas:
//   POST /auth    { "cpf": "529..." } -> 200 { access_token, token_type, expires_in }
//   GET  /health                       -> 200 "ok"
import jwt from "jsonwebtoken@9.0.2";
import { Client } from "pg@8.13.1";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? "3000");

// ---------------------------------------------------------------------------
// Log estruturado (JSON) para correlação em New Relic. O campo service mantém
// o nome "fiap-auth-lambda" (a query NRQL do dashboard depende dele).
// ---------------------------------------------------------------------------
type Level = "info" | "warn" | "error";
function log(level: Level, message: string, ctx: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "fiap-auth-lambda",
    message,
    ...ctx,
  }));
}

// ---------------------------------------------------------------------------
// Configuração (variáveis de ambiente).
// ---------------------------------------------------------------------------
interface JwtConfig { secret: string; issuer: string; audience: string; expirationMinutes: number; }
interface AppConfig { jwt: JwtConfig; databaseUrl: string; }

let cachedConfig: AppConfig | null = null;
function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const secret = process.env.JWT_SECRET ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!secret) throw new Error("JWT_SECRET nao configurado.");
  if (!databaseUrl) throw new Error("DATABASE_URL nao configurado.");

  cachedConfig = {
    jwt: {
      secret,
      issuer: process.env.JWT_ISSUER ?? "Oficina.Api",
      audience: process.env.JWT_AUDIENCE ?? "Oficina.Api",
      expirationMinutes: Number(process.env.JWT_EXPIRATION_MINUTES ?? "60"),
    },
    databaseUrl,
  };
  return cachedConfig;
}

// ---------------------------------------------------------------------------
// Validação de CPF (mesmo algoritmo do Value Object Cpf da aplicação .NET).
// ---------------------------------------------------------------------------
function normalizarCpf(input: string): string {
  if (!input || !input.trim()) throw new Error("CPF nao pode ser vazio.");
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 11) throw new Error("CPF deve conter 11 digitos.");
  if (new Set(digits).size === 1) throw new Error("CPF invalido (todos os digitos iguais).");
  if (!validarDigitos(digits)) throw new Error("CPF com digito verificador invalido.");
  return digits;
}

function validarDigitos(digits: string): boolean {
  const nums = digits.split("").map((c) => c.charCodeAt(0) - 48);
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += nums[i] * (10 - i);
  const d1 = ((sum1 * 10) % 11) % 10;
  if (d1 !== nums[9]) return false;
  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += nums[i] * (11 - i);
  const d2 = ((sum2 * 10) % 11) % 10;
  return d2 === nums[10];
}

// ---------------------------------------------------------------------------
// Repositório: busca cliente pelo CPF no Postgres gerenciado.
// SSL configurável via PGSSL=require (o TCP proxy público exige SSL).
// ---------------------------------------------------------------------------
interface Cliente { id: string; nome: string; email: string; }

async function buscarClientePorCpf(connectionString: string, cpfDigits: string): Promise<Cliente | null> {
  const ssl = process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined;
  const client = new Client({ connectionString, ssl });
  await client.connect();
  try {
    const res = await client.query<Cliente>(
      `SELECT "Id"::text AS id, "Nome" AS nome, "Email" AS email
         FROM clientes
        WHERE documento_numero = $1
          AND documento_tipo = 'Cpf'
        LIMIT 1`,
      [cpfDigits],
    );
    return res.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Emissão de JWT HS256 compatível com a validação da API .NET (mesmo
// issuer/audience/secret). role = "Cliente".
// ---------------------------------------------------------------------------
interface ClienteClaims { clienteId: string; email: string; cpf: string; nome: string; }

function gerarToken(cfg: JwtConfig, claims: ClienteClaims): { token: string; expiresInSeconds: number } {
  if (!cfg.secret || cfg.secret.length < 32) throw new Error("JWT secret deve ter ao menos 32 caracteres.");
  const expiresInSeconds = cfg.expirationMinutes * 60;

  const payload = {
    sub: claims.clienteId,
    email: claims.email,
    // ClaimTypes.Role do .NET: URI completa garante o mapeamento para role.
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": "Cliente",
    role: "Cliente",
    cpf: claims.cpf,
    name: claims.nome,
    jti: randomUUID(),
  };

  const token = jwt.sign(payload, cfg.secret, {
    algorithm: "HS256",
    issuer: cfg.issuer,
    audience: cfg.audience,
    expiresIn: expiresInSeconds,
    notBefore: 0,
  });
  return { token, expiresInSeconds };
}

// ---------------------------------------------------------------------------
// Handler HTTP.
// ---------------------------------------------------------------------------
function json(status: number, body: Record<string, unknown>, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

function mask(cpf: string): string {
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}` : "***";
}

async function autenticar(req: Request, requestId: string): Promise<Response> {
  const t0 = Date.now();
  let cpfRaw = "";
  try {
    const parsed = (await req.json().catch(() => ({}))) as { cpf?: string };
    cpfRaw = parsed.cpf ?? "";
  } catch {
    // corpo inválido -> tratado como CPF ausente
  }

  let cpfDigits: string;
  try {
    cpfDigits = normalizarCpf(cpfRaw);
  } catch (e) {
    log("warn", "CPF invalido", { requestId, error: (e as Error).message });
    return json(400, { error: (e as Error).message }, requestId);
  }

  const cfg = loadConfig();
  const cliente = await buscarClientePorCpf(cfg.databaseUrl, cpfDigits);
  if (!cliente) {
    log("warn", "Cliente nao encontrado", { requestId, cpf: mask(cpfDigits) });
    return json(404, { error: "Cliente nao encontrado para o CPF informado." }, requestId);
  }

  const { token, expiresInSeconds } = gerarToken(cfg.jwt, {
    clienteId: cliente.id,
    email: cliente.email,
    cpf: cpfDigits,
    nome: cliente.nome,
  });

  log("info", "Token emitido", { requestId, clienteId: cliente.id, cpf: mask(cpfDigits), latencyMs: Date.now() - t0 });
  return json(200, { access_token: token, token_type: "Bearer", expires_in: expiresInSeconds }, requestId);
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
      return new Response("ok", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === "/auth") {
      try {
        return await autenticar(req, requestId);
      } catch (e) {
        log("error", "Erro interno: " + (e as Error).message, { requestId, error: (e as Error).message });
        return json(500, { error: "Erro interno ao autenticar." }, requestId);
      }
    }
    return json(404, { error: "Rota nao encontrada." }, requestId);
  },
});

log("info", "Railway Function auth iniciada", { port: server.port });
