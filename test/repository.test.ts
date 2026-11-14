import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarClientePorCpf, OsServiceError } from "../src/repository";

const BASE = "https://kong.example.com/os";
const KEY = "chave-super-secreta";

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buscarClientePorCpf", () => {
  it("200 -> retorna o cliente", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ id: "abc", nome: "Ana", email: "a@x.com" }), { status: 200 }),
    );
    expect(await buscarClientePorCpf(BASE, KEY, "52998224725")).toEqual({
      id: "abc",
      nome: "Ana",
      email: "a@x.com",
    });
  });

  it("404 -> null", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    expect(await buscarClientePorCpf(BASE, KEY, "52998224725")).toBeNull();
  });

  it("500 -> lanca OsServiceError com status, sem a chave", async () => {
    stubFetch(async () => new Response("", { status: 500 }));
    const err = await buscarClientePorCpf(BASE, KEY, "52998224725").catch((e) => e);
    expect(err).toBeInstanceOf(OsServiceError);
    expect(err.status).toBe(500);
    expect(err.message).not.toContain(KEY);
  });

  it("400, 401 e 503 -> lancam", async () => {
    for (const status of [400, 401, 503]) {
      stubFetch(async () => new Response("", { status }));
      await expect(buscarClientePorCpf(BASE, KEY, "52998224725")).rejects.toThrow(OsServiceError);
    }
  });

  it("erro de rede -> lanca sem a chave", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await buscarClientePorCpf(BASE, KEY, "52998224725").catch((e) => e);
    expect(err).toBeInstanceOf(OsServiceError);
    expect(err.status).toBeUndefined();
    expect(err.message).not.toContain(KEY);
  });

  it("timeout -> lanca", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_res, rej) => {
          init.signal!.addEventListener("abort", () =>
            rej(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    await expect(buscarClientePorCpf(BASE, KEY, "52998224725", 20)).rejects.toThrow(/timeout/i);
  });

  it("URL com ou sem barra final, sem barra dupla", async () => {
    const fn = stubFetch(async () => new Response("", { status: 404 }));
    await buscarClientePorCpf(BASE, KEY, "52998224725");
    await buscarClientePorCpf(BASE + "/", KEY, "52998224725");
    const esperado = "https://kong.example.com/os/internal/clientes/por-documento/52998224725";
    expect(fn.mock.calls[0][0]).toBe(esperado);
    expect(fn.mock.calls[1][0]).toBe(esperado);
  });

  it("envia X-Service-Key", async () => {
    const fn = stubFetch(async () => new Response("", { status: 404 }));
    await buscarClientePorCpf(BASE, KEY, "52998224725");
    const headers = fn.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Service-Key"]).toBe(KEY);
  });

  it("CPF na URL contem so digitos", async () => {
    const fn = stubFetch(async () => new Response("", { status: 404 }));
    await buscarClientePorCpf(BASE, KEY, "529.982.247-25");
    expect(fn.mock.calls[0][0]).toMatch(/\/por-documento\/52998224725$/);
  });
});

describe("buscarClientePorCpf - resposta 200 invalida", () => {
  it("{} -> OsServiceError", async () => {
    stubFetch(async () => new Response("{}", { status: 200 }));
    const p = buscarClientePorCpf(BASE, KEY, "52998224725");
    await expect(p).rejects.toBeInstanceOf(OsServiceError);
    await expect(p).rejects.toThrow("Resposta invalida do servico de clientes");
  });

  it("campos vazios ou nao-string -> OsServiceError", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ id: "a", nome: "", email: 1 }), { status: 200 }),
    );
    await expect(buscarClientePorCpf(BASE, KEY, "52998224725")).rejects.toBeInstanceOf(OsServiceError);
  });

  it("JSON invalido -> OsServiceError", async () => {
    stubFetch(async () => new Response("not json", { status: 200 }));
    await expect(buscarClientePorCpf(BASE, KEY, "52998224725")).rejects.toBeInstanceOf(OsServiceError);
  });
});

describe("buscarClientePorCpf - corpo pendurado (servidor real)", () => {
  let server: Server;
  afterEach(() => {
    server.closeAllConnections();
    server.close();
  });

  it("headers + '{' sem fechar -> OsServiceError por timeout", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;

    const t0 = Date.now();
    const p = buscarClientePorCpf(`http://127.0.0.1:${port}`, KEY, "52998224725", 200);
    await expect(p).rejects.toBeInstanceOf(OsServiceError);
    await expect(p).rejects.toThrow(/timeout/i);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});