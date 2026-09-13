import jwt from "jsonwebtoken";

export interface JwtConfig {
  secret: string;
  issuer: string;
  audience: string;
  expirationMinutes: number;
}

export interface ClienteClaims {
  clienteId: string;
  email: string;
  cpf: string;
  nome: string;
}

/**
 * Gera um JWT HS256 compativel com a validacao da aplicacao .NET
 * (mesmo issuer/audience/secret). role = "Cliente".
 */
export function gerarToken(
  cfg: JwtConfig,
  claims: ClienteClaims,
): { token: string; expiresInSeconds: number } {
  if (!cfg.secret || cfg.secret.length < 32) {
    throw new Error("JWT secret deve ter ao menos 32 caracteres.");
  }
  const expiresInSeconds = cfg.expirationMinutes * 60;

  const payload = {
    sub: claims.clienteId,
    email: claims.email,
    // ClaimTypes.Role do .NET: URI completa garante mapeamento para role
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": "Cliente",
    role: "Cliente",
    cpf: claims.cpf,
    name: claims.nome,
    jti: cryptoRandomId(),
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

function cryptoRandomId(): string {
  return require("crypto").randomUUID();
}
