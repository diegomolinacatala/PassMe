import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal stand-in for the parts of a Supabase Postgres that our migrations
 * rely on (auth schema, roles, storage schema), so we can run the real SQL in
 * PGlite and test RLS + functions without Docker.
 */
const SUPABASE_STUB_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  -- Supabase also grants EXECUTE on new functions to the API roles by default.
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Applies migration files in the order Supabase does, optionally only some of them. */
export async function applyMigrations(db: PGlite, include: (file: string) => boolean = () => true): Promise<void> {
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (include(file)) await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
}

/** A database with every migration applied — or only those before `before` (a file name). */
export async function createTestDatabase({ before }: { before?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB_SQL);
  await applyMigrations(db, (file) => !before || file < before);
  return db;
}

/** Runs `fn` as a Supabase role, optionally impersonating a user id. */
export async function asRole<T>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${userId ?? ""}'`);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec("reset request.jwt.claim.sub");
  }
}
