import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "./supabase-stub";

/**
 * AGENTS.md invariants, checked against the real migrations: Supabase grants
 * EXECUTE on every new function to anon and authenticated (and PostgreSQL to
 * PUBLIC), so a function added by a future migration that forgets
 * `revoke ... from public, anon, authenticated` fails here, as does a new table
 * without RLS or with browser-role privileges nobody decided on.
 */

/** The RPCs the browser is meant to call without a session. */
const ANON_CALLABLE = new Set(["get_public_card", "resolve_slug_redirect"]);
/** ...and with one. `own_avatar_count` backs a Storage policy; `links_are_well_formed` a CHECK. */
const AUTHENTICATED_CALLABLE = new Set([
  ...ANON_CALLABLE,
  "is_slug_available",
  "get_card_stats",
  "own_avatar_count",
  "links_are_well_formed",
]);

/** What a signed-in user may do to each table directly (RLS narrows it to their own rows). */
const AUTHENTICATED_TABLE_PRIVILEGES: Record<string, string[]> = {
  profiles: ["INSERT", "SELECT", "UPDATE"],
  profile_events: ["SELECT"],
  contact_requests: ["DELETE", "SELECT"],
  meeting_requests: ["DELETE", "SELECT"],
};

const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

describe("functions in the public schema", () => {
  it("never leave EXECUTE on PUBLIC, and open only the allowlisted RPCs to the API roles", async () => {
    const { rows } = await db.query<{ name: string; public_x: boolean; anon_x: boolean; auth_x: boolean }>(`
      select p.proname as name,
             exists (
               select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where a.grantee = 0 and a.privilege_type = 'EXECUTE'
             ) as public_x,
             has_function_privilege('anon', p.oid, 'execute') as anon_x,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by 1`);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => r.public_x).map((r) => r.name)).toEqual([]);
    expect(rows.filter((r) => r.anon_x && !ANON_CALLABLE.has(r.name)).map((r) => r.name)).toEqual([]);
    expect(rows.filter((r) => r.auth_x && !AUTHENTICATED_CALLABLE.has(r.name)).map((r) => r.name)).toEqual([]);
  });

  it("pins search_path on every SECURITY DEFINER function", async () => {
    const { rows } = await db.query<{ name: string }>(`
      select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows.map((r) => r.name)).toEqual([]);
  });
});

describe("tables in the public schema", () => {
  it("all have row level security", async () => {
    const { rows } = await db.query<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("give anon nothing, and signed-in users only the listed privileges", async () => {
    const { rows } = await db.query<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    expect(rows.length).toBeGreaterThanOrEqual(9);

    const granted = async (role: string, table: string) => {
      const checks = PRIVILEGES.map((p) => `has_table_privilege('${role}', 'public.${table}', '${p}') as "${p}"`).join(", ");
      const { rows: r } = await db.query<Record<string, boolean>>(`select ${checks}`);
      return PRIVILEGES.filter((p) => r[0]![p]).sort();
    };
    for (const { name } of rows) {
      expect(await granted("anon", name), `anon on ${name}`).toEqual([]);
      expect(await granted("authenticated", name), `authenticated on ${name}`).toEqual((AUTHENTICATED_TABLE_PRIVILEGES[name] ?? []).slice().sort());
    }
  });
});
