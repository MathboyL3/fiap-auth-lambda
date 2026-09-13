import { describe, it, expect } from "vitest";
import { normalizarCpf } from "../src/cpf";

describe("normalizarCpf", () => {
  it("aceita CPF valido com pontuacao e retorna digitos", () => {
    expect(normalizarCpf("529.982.247-25")).toBe("52998224725");
  });

  it("aceita CPF valido sem pontuacao", () => {
    expect(normalizarCpf("52998224725")).toBe("52998224725");
  });

  it("rejeita CPF vazio", () => {
    expect(() => normalizarCpf("")).toThrow(/vazio/);
  });

  it("rejeita tamanho diferente de 11", () => {
    expect(() => normalizarCpf("123")).toThrow(/11 digitos/);
  });

  it("rejeita digitos todos iguais", () => {
    expect(() => normalizarCpf("11111111111")).toThrow(/iguais/);
  });

  it("rejeita digito verificador invalido", () => {
    expect(() => normalizarCpf("52998224724")).toThrow(/verificador/);
  });
});
