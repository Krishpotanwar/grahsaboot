import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'
import { readdirSync, readFileSync } from 'node:fs'

export const USER_A = '00000000-0000-4000-8000-00000000000a'
export const USER_B = '00000000-0000-4000-8000-00000000000b'

/** Minimal stand-in for Supabase's auth schema and roles, so migrations and RLS behave as in production. */
const AUTH_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- Supabase's baseline does the same: every new public table, function and sequence is granted to the API roles,
-- so revoking from PUBLIC alone does not close a function. Without this, "anon cannot call X" tests pass for the wrong reason.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema if not exists extensions;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`

export interface Db {
  as(who: string, sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  super(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}

let dump: Promise<File | Blob> | null = null
let live: PGlite | null = null

/** Migrated template database, built once per test file and kept as a data-dir dump (its instance is closed). */
async function template(): Promise<File | Blob> {
  const pg = new PGlite({ extensions: { postgis } })
  try {
    await pg.exec(AUTH_SHIM)
    const dir = 'supabase/migrations'
    for (const f of readdirSync(dir)
      .filter((n) => n.endsWith('.sql') && !n.includes('_cron'))
      .sort())
      await pg.exec(readFileSync(`${dir}/${f}`, 'utf8'))
    await pg.query(
      `insert into auth.users (id, email, last_sign_in_at) values ($1, 'a@example.com', now()), ($2, 'b@example.com', now())`,
      [USER_A, USER_B],
    )
    return await pg.dumpDataDir('none')
  } finally {
    await pg.close()
  }
}

/**
 * A fresh copy of the template for one test. One live database per test file: each PGlite instance holds 0.6 to 1 GB of
 * WASM memory and unclosed copies add up (4 tests = 4 GB), so the previous one is closed here. Do not keep two Db at once.
 */
export async function freshDb(): Promise<Db> {
  await live?.close()
  const pg = (live = await PGlite.create({
    loadDataDir: await (dump ??= template()),
    extensions: { postgis },
  }))
  return {
    async as(who, sql, params = []) {
      // A typo such as 'Anon' must not quietly become an authenticated user.
      if (!['service', 'anon'].includes(who) && !/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(who))
        throw new Error(`Db.as: unknown caller "${who}"`)
      const role = who === 'service' ? 'service_role' : who === 'anon' ? 'anon' : 'authenticated'
      const sub = who === 'service' || who === 'anon' ? '' : who
      return pg.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`)
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub])
        return (await tx.query<Record<string, unknown>>(sql, params)).rows
      })
    },
    async super(sql, params = []) {
      return (await pg.query<Record<string, unknown>>(sql, params)).rows
    },
  }
}

type LL = [number, number]
export const ewktPolygon = (ring: LL[]) =>
  `SRID=4326;POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(',')}))`
export const ewktLine = (line: LL[]) => `SRID=4326;LINESTRING(${line.map(([x, y]) => `${x} ${y}`).join(',')})`
export const SQUARE: LL[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
export const ROAD: LL[] = [
  [79.07698, 21.138637],
  [79.095988, 21.157819],
]
