import type { JwtConfig } from "./jwt";

export interface AppConfig {
  jwt: JwtConfig;
  databaseUrl: string;
}

let cached: AppConfig | null = null;

/**
 * Carrega a configuracao a partir de variaveis de ambiente.
 *
 * - JWT_SECRET   : segredo HS256 (mesmo issuer/audience/secret da API .NET).
 * - DATABASE_URL : connection string do PostgreSQL gerenciado (Railway).
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
  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (!secret) throw new Error("JWT_SECRET nao configurado.");
  if (!databaseUrl) throw new Error("DATABASE_URL nao configurado.");

  cached = {
    jwt: { secret, issuer, audience, expirationMinutes },
    databaseUrl,
  };
  return cached;
}

// util para testes
export function __resetConfigCache(): void {
  cached = null;
}
