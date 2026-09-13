import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type { JwtConfig } from "./jwt";

export interface AppConfig {
  jwt: JwtConfig;
  databaseUrl: string;
}

let cached: AppConfig | null = null;

/**
 * Carrega a configuracao. O segredo JWT e a connection string sao lidos do
 * AWS Secrets Manager quando JWT_SECRET_ARN/DATABASE_SECRET_ARN estao definidos;
 * caso contrario caem para variaveis de ambiente (util em dev/teste).
 * Compatível com LocalStack (AWS_ENDPOINT_URL).
 */
export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  const issuer = process.env.JWT_ISSUER ?? "Oficina.Api";
  const audience = process.env.JWT_AUDIENCE ?? "Oficina.Api";
  const expirationMinutes = Number(process.env.JWT_EXPIRATION_MINUTES ?? "60");

  let secret = process.env.JWT_SECRET ?? "";
  let databaseUrl = process.env.DATABASE_URL ?? "";

  const endpoint = process.env.AWS_ENDPOINT_URL; // LocalStack
  const region = process.env.AWS_REGION ?? "us-east-1";

  if (process.env.JWT_SECRET_ARN || process.env.DATABASE_SECRET_ARN) {
    const sm = new SecretsManagerClient({ region, endpoint });
    if (process.env.JWT_SECRET_ARN) {
      secret = await readSecret(sm, process.env.JWT_SECRET_ARN);
    }
    if (process.env.DATABASE_SECRET_ARN) {
      databaseUrl = await readSecret(sm, process.env.DATABASE_SECRET_ARN);
    }
  }

  if (!databaseUrl) throw new Error("DATABASE_URL / DATABASE_SECRET_ARN nao configurado.");

  cached = {
    jwt: { secret, issuer, audience, expirationMinutes },
    databaseUrl,
  };
  return cached;
}

async function readSecret(sm: SecretsManagerClient, secretId: string): Promise<string> {
  const out = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  return out.SecretString ?? "";
}

// util para testes
export function __resetConfigCache(): void {
  cached = null;
}
