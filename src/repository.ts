import { Client } from "pg";

export interface Cliente {
  id: string;
  nome: string;
  email: string;
}

/**
 * Consulta um cliente pelo numero de CPF (somente digitos) na tabela `clientes`,
 * considerando apenas documentos do tipo CPF. Retorna null se nao existir.
 *
 * Abre/fecha uma conexao por invocacao (padrao simples para Lambda; para alta
 * carga usar RDS Proxy/pool). SSL configuravel via PGSSL.
 */
export async function buscarClientePorCpf(
  connectionString: string,
  cpfDigits: string,
): Promise<Cliente | null> {
  const ssl =
    process.env.PGSSL === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  const client = new Client({ connectionString, ssl });
  await client.connect();
  try {
    const res = await client.query<Cliente>(
      `SELECT id::text AS id, nome, email
         FROM clientes
        WHERE documento_numero = $1
          AND documento_tipo = 'Cpf'
        LIMIT 1`,
      [cpfDigits],
    );
    return res.rows[0] ?? null;
  } finally {
    await client.end();
  }
}
