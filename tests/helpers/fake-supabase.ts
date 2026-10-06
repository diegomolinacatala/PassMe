import type { TypedSupabaseClient } from "@/lib/supabase/server";

/**
 * Minimal chainable stand-in for the supabase-js query builder. Every awaited
 * query is resolved by a handler that sees the table and the recorded chain,
 * so tests can script results and assert on what the code asked for.
 */

export interface QueryResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export interface RecordedQuery {
  table: string;
  calls: Array<[method: string, args: unknown[]]>;
}

export type Handler = (query: RecordedQuery) => QueryResult;

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gte",
  "lt",
  "in",
  "limit",
  "range",
  "order",
  "single",
  "maybeSingle",
] as const;

class FakeQuery implements PromiseLike<QueryResult> {
  readonly calls: RecordedQuery["calls"] = [];

  constructor(
    private readonly table: string,
    private readonly handler: Handler,
    private readonly log: RecordedQuery[],
  ) {
    for (const method of CHAIN_METHODS) {
      (this as unknown as Record<string, (...args: unknown[]) => FakeQuery>)[method] = (...args: unknown[]) => {
        this.calls.push([method, args]);
        return this;
      };
    }
  }

  then<T1 = QueryResult, T2 = never>(
    onfulfilled?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    const query = { table: this.table, calls: this.calls };
    this.log.push(query);
    const result = this.handler(query);
    return Promise.resolve({ data: null, error: null, ...result }).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabase {
  client: TypedSupabaseClient;
  queries: RecordedQuery[];
}

export function fakeSupabase(handler: Handler): FakeSupabase {
  const queries: RecordedQuery[] = [];
  const client = {
    from: (table: string) => new FakeQuery(table, handler, queries),
    rpc: (fn: string, args: unknown) => {
      const query = new FakeQuery(`rpc:${fn}`, handler, queries);
      query.calls.push(["rpc", [args]]);
      return query;
    },
  };
  return { client: client as unknown as TypedSupabaseClient, queries };
}

/** Helpers for handlers. */
export function has(query: RecordedQuery, method: string, ...args: unknown[]): boolean {
  return query.calls.some(
    ([m, a]) => m === method && args.every((arg, i) => JSON.stringify(a[i]) === JSON.stringify(arg)),
  );
}

export function first(query: RecordedQuery): string {
  return query.calls[0]?.[0] ?? "";
}
