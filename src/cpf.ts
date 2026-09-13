/**
 * Validacao de CPF (mesmo algoritmo do Value Object Cpf da aplicacao .NET).
 * Retorna apenas digitos se valido; lanca Error caso contrario.
 */
export function normalizarCpf(input: string): string {
  if (!input || !input.trim()) {
    throw new Error("CPF nao pode ser vazio.");
  }
  const digits = input.replace(/\D/g, "");

  if (digits.length !== 11) {
    throw new Error("CPF deve conter 11 digitos.");
  }
  if (new Set(digits).size === 1) {
    throw new Error("CPF invalido (todos os digitos iguais).");
  }
  if (!validarDigitos(digits)) {
    throw new Error("CPF com digito verificador invalido.");
  }
  return digits;
}

function validarDigitos(digits: string): boolean {
  const nums = digits.split("").map((c) => c.charCodeAt(0) - 48);

  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += nums[i] * (10 - i);
  const d1 = ((sum1 * 10) % 11) % 10;
  if (d1 !== nums[9]) return false;

  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += nums[i] * (11 - i);
  const d2 = ((sum2 * 10) % 11) % 10;
  return d2 === nums[10];
}
