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
 * Abre/fecha uma conexao por requisicao (padrao simples; para alta
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
    // Colunas em PascalCase (mapeamento EF Core) exigem aspas duplas no Postgres.
    // documento_* vem do owned type (snake_case).
    const res = await client.query<Cliente>(
      `SELECT "Id"::text AS id, "Nome" AS nome, "Email" AS email
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
