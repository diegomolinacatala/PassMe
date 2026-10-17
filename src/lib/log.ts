/**
 * Tiny structured logger. Server logs end up in Vercel's log drain; swap this
 * for pino/Sentry later without touching call sites.
 */
type Level = "info" | "warn" | "error";

/** Error fields worth keeping: supabase-js, PostgREST and Node errors all use some of these. */
const ERROR_FIELDS = ["code", "status", "details", "hint"] as const;
const MAX_CAUSE_DEPTH = 3;
const MAX_STACK_LINES = 6;

/** The first lines of a stack: enough to find the call site without flooding the log. */
function trimStack(stack: unknown): string | undefined {
  if (typeof stack !== "string") return undefined;
  return stack.split("\n").slice(0, MAX_STACK_LINES).join("\n");
}

/**
 * Postgres puts the whole offending row in `details` ("Failing row contains (…)",
 * "Key (email)=(…) already exists"): for a contact or meeting form that is a
 * visitor's name, email and phone. Keep which constraint failed, drop the values.
 */
function redactDetails(details: unknown): unknown {
  if (typeof details !== "string") return details;
  if (/^Failing row contains/i.test(details)) return "Failing row contains (…)";
  return details.replace(/=\(.*?\)( already exists| is not present)/g, "=(…)$1");
}

export function serializeError(error: unknown, depth = 0): Record<string, unknown> | undefined {
  if (error === undefined) return undefined;
  if (typeof error !== "object" || error === null) return { message: String(error) };

  const source = error as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (error instanceof Error) out.name = error.name;
  out.message = source.message;
  for (const field of ERROR_FIELDS) {
    if (source[field] !== undefined && source[field] !== null) out[field] = field === "details" ? redactDetails(source[field]) : source[field];
  }
  const stack = trimStack(source.stack);
  if (stack) out.stack = stack;
  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) out.cause = serializeError(source.cause, depth + 1);
  return out;
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
