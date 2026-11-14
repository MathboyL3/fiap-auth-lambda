// index.ts — Railway Function (runtime Bun) — autenticação por CPF → JWT.
//
// Function Serverless nativa do Railway (produto "Functions"): um único
// arquivo executado no runtime Bun. Valida o CPF do cliente, consulta o
// oficina-os-service (endpoint interno, sem acesso a banco) e devolve um JWT HS256 compatível com a API .NET.
//
// Deploy: colar este arquivo no "Source Code" da Function no canvas do
// Railway (Ctrl+S para salvar, Shift+Enter para deployar). Imports NPM no
// formato `pacote@versao` (resolvidos pela Function). Configuração via
// Service Variables (process.env): JWT_SECRET, OS_SERVICE_URL, OS_SERVICE_KEY e opcionais
// JWT_ISSUER, JWT_AUDIENCE, JWT_EXPIRATION_MINUTES, OS_SERVICE_TIMEOUT_MS.
//
// Rotas:
//   POST /auth    { "cpf": "529..." } -> 200 { access_token, token_type, expires_in }
//   GET  /health                       -> 200 "ok"
import jwt from "jsonwebtoken@9.0.2";
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
interface AppConfig { jwt: JwtConfig; osServiceUrl: string; osServiceKey: string; osServiceTimeoutMs: number; }

/** Inteiro positivo <= 2147483647 (limite do setTimeout); senao 5000. */
function parseTimeoutMs(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : 5000;
}

let cachedConfig: AppConfig | null = null;
function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const secret = process.env.JWT_SECRET ?? "";
  const osServiceUrl = process.env.OS_SERVICE_URL ?? "";
  const osServiceKey = process.env.OS_SERVICE_KEY ?? "";
  if (!secret) throw new Error("JWT_SECRET nao configurado.");
  if (!osServiceUrl) throw new Error("OS_SERVICE_URL nao configurado.");
  if (!osServiceKey) throw new Error("OS_SERVICE_KEY nao configurado.");

  cachedConfig = {
    jwt: {
      secret,
      issuer: process.env.JWT_ISSUER ?? "Oficina.Api",
      audience: process.env.JWT_AUDIENCE ?? "Oficina.Api",
      expirationMinutes: Number(process.env.JWT_EXPIRATION_MINUTES ?? "60"),
    },
    osServiceUrl,
    osServiceKey,
    osServiceTimeoutMs: parseTimeoutMs(process.env.OS_SERVICE_TIMEOUT_MS),
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
// Repositorio: busca cliente pelo CPF no endpoint interno do oficina-os-service
// (via Kong). A function NAO acessa o banco do os-service.
// ---------------------------------------------------------------------------
interface Cliente { id: string; nome: string; email: string; }

class OsServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OsServiceError";
  }
}

/**
 * Consulta um cliente pelo CPF (somente digitos) no endpoint interno do
 * oficina-os-service: GET {baseUrl}/internal/clientes/por-documento/{cpf}
 * com o header X-Service-Key. 200 -> Cliente; 404 -> null; qualquer outra
 * resposta, erro de rede ou timeout -> OsServiceError (sem a chave na mensagem).
 */
async function buscarClientePorCpf(
  baseUrl: string,
  serviceKey: string,
  cpf: string,
  timeoutMs = 5000,
): Promise<Cliente | null> {
  const url = `${baseUrl.replace(/\/+$/, "")}/internal/clientes/por-documento/${cpf.replace(/\D/g, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // O timeout cobre fetch E leitura do corpo (clearTimeout so apos o texto).
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Service-Key": serviceKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (res.status !== 200) {
      throw new OsServiceError(`os-service respondeu status ${res.status}.`, res.status);
    }
    const texto = await res.text();
    let data: Partial<Cliente> | null;
    try {
      data = JSON.parse(texto) as Partial<Cliente> | null;
    } catch {
      throw new OsServiceError("Resposta invalida do servico de clientes");
    }
    const ok = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
    if (!data || !ok(data.id) || !ok(data.nome) || !ok(data.email)) {
      throw new OsServiceError("Resposta invalida do servico de clientes");
    }
    return { id: data.id, nome: data.nome, email: data.email };
  } catch (e) {
    if (e instanceof OsServiceError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new OsServiceError(`Timeout (${timeoutMs} ms) ao consultar o os-service.`);
    }
    throw new OsServiceError(`Falha de rede ao consultar o os-service: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
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
  let cliente: Cliente | null;
  try {
    cliente = await buscarClientePorCpf(cfg.osServiceUrl, cfg.osServiceKey, cpfDigits, cfg.osServiceTimeoutMs);
  } catch (e) {
    const err = e as OsServiceError;
    log("error", "Falha ao consultar o os-service", { requestId, status: err.status, error: err.message, cpf: mask(cpfDigits) });
    return json(503, { error: "Servico de clientes indisponivel." }, requestId);
  }
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
