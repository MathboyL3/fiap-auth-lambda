import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { gerarToken } from "../src/jwt";

const cfg = {
  secret: "0123456789abcdef0123456789abcdef", // 32 chars
  issuer: "Oficina.Api",
  audience: "Oficina.Api",
  expirationMinutes: 60,
};

describe("gerarToken", () => {
  it("gera JWT HS256 com claims e issuer/audience corretos", () => {
    const { token, expiresInSeconds } = gerarToken(cfg, {
      clienteId: "11111111-1111-1111-1111-111111111111",
      email: "cliente@ex.com",
      cpf: "52998224725",
      nome: "Fulano",
    });
    expect(expiresInSeconds).toBe(3600);

    const decoded = jwt.verify(token, cfg.secret, {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: ["HS256"],
    }) as Record<string, unknown>;

    expect(decoded.sub).toBe("11111111-1111-1111-1111-111111111111");
    expect(decoded.role).toBe("Cliente");
    expect(decoded.cpf).toBe("52998224725");
    expect(decoded.name).toBe("Fulano");
  });

  it("rejeita secret curto", () => {
    expect(() =>
      gerarToken({ ...cfg, secret: "curto" }, {
        clienteId: "x", email: "e", cpf: "c", nome: "n",
      }),
    ).toThrow(/32 caracteres/);
  });
});
