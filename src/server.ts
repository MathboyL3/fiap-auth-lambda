/**
 * Servidor HTTP (Bun) para deploy em nuvem (Railway).
 *
 * Mesma lógica de negócio da função Lambda (validação de CPF, consulta ao
 * Postgres e emissão de JWT HS256 compatível com a API .NET), exposta como um
 * serviço HTTP de longa duração. A configuração vem de variáveis de ambiente
 * (JWT_SECRET, DATABASE_URL).
 *
 * Rotas:
 *   POST /auth   { "cpf": "529..." }  -> 200 { access_token, token_type, expires_in }
 *   GET  /health                       -> 200 "ok"
 */
import { normalizarCpf } from "./cpf";
import { buscarClientePorCpf } from "./repository";
import { gerarToken } from "./jwt";
import { loadConfig } from "./config";
import { log } from "./logger";

const PORT = Number(process.env.PORT ?? "3000");

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

  const cfg = await loadConfig();
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

  log("info", "Token emitido", {
    requestId,
    clienteId: cliente.id,
    cpf: mask(cpfDigits),
    latencyMs: Date.now() - t0,
  });

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

log("info", "Servidor auth iniciado", { port: server.port });
