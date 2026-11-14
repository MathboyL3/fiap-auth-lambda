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
