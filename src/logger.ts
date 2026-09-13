/**
 * Logger estruturado (JSON) para correlacao em CloudWatch / New Relic.
 * Cada linha e um objeto JSON com timestamp, nivel, mensagem e contexto.
 */
type Level = "info" | "warn" | "error";

export function log(level: Level, message: string, ctx: Record<string, unknown> = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "fiap-auth-lambda",
    message,
    ...ctx,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}
