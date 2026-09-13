import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dos modulos com efeito externo
vi.mock("../src/repository", () => ({
  buscarClientePorCpf: vi.fn(),
}));

import { handler } from "../src/handler";
import { buscarClientePorCpf } from "../src/repository";
import { __resetConfigCache } from "../src/config";

const ctx = { awsRequestId: "req-1" } as any;

function evt(body: unknown) {
  return { body: JSON.stringify(body) } as any;
}

beforeEach(() => {
  __resetConfigCache();
  process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/db";
  delete process.env.JWT_SECRET_ARN;
  delete process.env.DATABASE_SECRET_ARN;
  vi.clearAllMocks();
});

describe("handler", () => {
  it("400 quando CPF invalido", async () => {
    const r = await handler(evt({ cpf: "123" }), ctx);
    expect(r.statusCode).toBe(400);
  });

  it("404 quando cliente nao existe", async () => {
    (buscarClientePorCpf as any).mockResolvedValue(null);
    const r = await handler(evt({ cpf: "529.982.247-25" }), ctx);
    expect(r.statusCode).toBe(404);
  });

  it("200 com access_token quando cliente existe", async () => {
    (buscarClientePorCpf as any).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      nome: "Fulano",
      email: "f@ex.com",
    });
    const r = await handler(evt({ cpf: "52998224725" }), ctx);
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(typeof body.access_token).toBe("string");
  });
});
