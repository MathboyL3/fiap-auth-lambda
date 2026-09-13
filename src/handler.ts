import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { normalizarCpf } from "./cpf";
import { buscarClientePorCpf } from "./repository";
import { gerarToken } from "./jwt";
import { loadConfig } from "./config";
import { log } from "./logger";

interface AuthRequest {
  cpf?: string;
}

function resposta(
  statusCode: number,
  body: Record<string, unknown>,
  requestId: string,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  };
}

/**
 * POST /auth  { "cpf": "529..." }
 *  200 -> { access_token, token_type, expires_in }
 *  400 -> CPF ausente/invalido
 *  404 -> cliente nao encontrado
 *  500 -> erro interno
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> {
  const requestId = context?.awsRequestId ?? "local";
  const t0 = Date.now();

  try {
    const parsed: AuthRequest = event.body ? JSON.parse(event.body) : {};
    const cpfRaw = parsed.cpf ?? "";

    let cpfDigits: string;
    try {
      cpfDigits = normalizarCpf(cpfRaw);
    } catch (e) {
      log("warn", "CPF invalido", { requestId, error: (e as Error).message });
      return resposta(400, { error: (e as Error).message }, requestId);
    }

    const cfg = await loadConfig();
    const cliente = await buscarClientePorCpf(cfg.databaseUrl, cpfDigits);

    if (!cliente) {
      log("warn", "Cliente nao encontrado", { requestId, cpf: mask(cpfDigits) });
      return resposta(404, { error: "Cliente nao encontrado para o CPF informado." }, requestId);
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

    return resposta(
      200,
      { access_token: token, token_type: "Bearer", expires_in: expiresInSeconds },
      requestId,
    );
  } catch (e) {
    log("error", "Erro interno", { requestId, error: (e as Error).message, stack: (e as Error).stack });
    return resposta(500, { error: "Erro interno ao autenticar." }, requestId);
  }
}

function mask(cpf: string): string {
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}` : "***";
}
