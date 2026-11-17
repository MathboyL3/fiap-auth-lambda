import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// index.ts (Railway, arquivo unico) duplica a logica de repository.ts: os dois
// precisam permanecer identicos.
const raiz = resolve(__dirname, "..");
const ler = (p: string) => readFileSync(resolve(raiz, p), "utf8");

/** Texto de `inicio` ate a chave de fechamento correspondente. */
function extrairBloco(src: string, inicio: RegExp): string {
  const m = inicio.exec(src);
  if (!m) throw new Error(`bloco nao encontrado: ${inicio}`);
  const abre = src.indexOf("{", m.index);
  let depth = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error("chaves desbalanceadas");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const repo = ler("src/repository.ts");
const index = ler("src/function/index.ts");

describe("equivalencia index.ts x repository.ts", () => {
  it("OsServiceError identica", () => {
    const re = /class OsServiceError\b/;
    expect(norm(extrairBloco(index, re))).toBe(norm(extrairBloco(repo, re)));
  });

  it("buscarClientePorCpf identica", () => {
    const re = /async function buscarClientePorCpf\b/;
    expect(norm(extrairBloco(index, re))).toBe(norm(extrairBloco(repo, re)));
  });
});