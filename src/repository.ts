export interface Cliente {
  id: string;
  nome: string;
  email: string;
}

/** Falha ao consultar o os-service (status != 200/404, rede ou timeout). */
export class OsServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OsServiceError";
  }
}

/**
 * Consulta um cliente pelo CPF (somente digitos) no endpoint interno do
 * oficina-os-service: GET {baseUrl}/internal/clientes/por-documento/{cpf}
 * com o header X-Service-Key. 200 -> Cliente; 404 -> null; qualquer outra
 * resposta, erro de rede ou timeout -> OsServiceError (sem a chave na mensagem).
 */
export async function buscarClientePorCpf(
  baseUrl: string,
  serviceKey: string,
  cpf: string,
  timeoutMs = 5000,
): Promise<Cliente | null> {
  const url = `${baseUrl.replace(/\/+$/, "")}/internal/clientes/por-documento/${cpf.replace(/\D/g, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // O timeout cobre fetch E leitura do corpo (clearTimeout so apos o texto).
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Service-Key": serviceKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (res.status !== 200) {
      throw new OsServiceError(`os-service respondeu status ${res.status}.`, res.status);
    }
    const texto = await res.text();
    let data: Partial<Cliente> | null;
    try {
      data = JSON.parse(texto) as Partial<Cliente> | null;
    } catch {
      throw new OsServiceError("Resposta invalida do servico de clientes");
    }
    const ok = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
    if (!data || !ok(data.id) || !ok(data.nome) || !ok(data.email)) {
      throw new OsServiceError("Resposta invalida do servico de clientes");
    }
    return { id: data.id, nome: data.nome, email: data.email };
  } catch (e) {
    if (e instanceof OsServiceError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new OsServiceError(`Timeout (${timeoutMs} ms) ao consultar o os-service.`);
    }
    throw new OsServiceError(`Falha de rede ao consultar o os-service: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}