import type { JwtConfig } from "./jwt";

export interface AppConfig {
  jwt: JwtConfig;
  osServiceUrl: string;
  osServiceKey: string;
  osServiceTimeoutMs: number;
}

/** Inteiro positivo <= 2147483647 (limite do setTimeout); senao 5000. */
function parseTimeoutMs(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : 5000;
}

let cached: AppConfig | null = null;

/**
 * Carrega a configuracao a partir de variaveis de ambiente.
 *
 * - JWT_SECRET   : segredo HS256 (mesmo issuer/audience/secret da API .NET).
 * - OS_SERVICE_URL : base do oficina-os-service via Kong (ex.: https://<kong>/os).
 * - OS_SERVICE_KEY : chave do endpoint interno (= InternalApi__ServiceKey do os-service).
 * - OS_SERVICE_TIMEOUT_MS (opcional, default 5000).
 *
 * No Railway essas variaveis sao injetadas no servico; em dev/teste podem ser
 * exportadas no ambiente.
 */
export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  const issuer = process.env.JWT_ISSUER ?? "Oficina.Api";
  const audience = process.env.JWT_AUDIENCE ?? "Oficina.Api";
  const expirationMinutes = Number(process.env.JWT_EXPIRATION_MINUTES ?? "60");

  const secret = process.env.JWT_SECRET ?? "";
  const osServiceUrl = process.env.OS_SERVICE_URL ?? "";
  const osServiceKey = process.env.OS_SERVICE_KEY ?? "";
  const osServiceTimeoutMs = parseTimeoutMs(process.env.OS_SERVICE_TIMEOUT_MS);

  if (!secret) throw new Error("JWT_SECRET nao configurado.");
  if (!osServiceUrl) throw new Error("OS_SERVICE_URL nao configurado.");
  if (!osServiceKey) throw new Error("OS_SERVICE_KEY nao configurado.");

  cached = {
    jwt: { secret, issuer, audience, expirationMinutes },
    osServiceUrl,
    osServiceKey,
    osServiceTimeoutMs,
  };
  return cached;
}

// util para testes
export function __resetConfigCache(): void {
  cached = null;
}
