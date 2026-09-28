/**
 * Tiny structured logger. Server logs end up in Vercel's log drain; swap this
 * for pino/Sentry later without touching call sites.
 */
type Level = "info" | "warn" | "error";

function serializeError(error: unknown): Record<string, unknown> | undefined {
  if (error === undefined) return undefined;
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === "object" && error !== null) {
    const { message, code, status } = error as Record<string, unknown>;
    return { message, code, status };
  }
  return { message: String(error) };
}

function write(level: Level, message: string, context?: Record<string, unknown>, error?: unknown): void {
  const entry = { level, message, ...context, ...(error !== undefined ? { error: serializeError(error) } : {}) };
  const line = `[passme] ${JSON.stringify(entry)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>, error?: unknown) => write("warn", message, context, error),
  error: (message: string, context?: Record<string, unknown>, error?: unknown) =>
    write("error", message, context, error),
};
