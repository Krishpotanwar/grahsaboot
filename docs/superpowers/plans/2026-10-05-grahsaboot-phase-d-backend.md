# GrahSaboot Phase D: Accounts, Server Verification, Privacy and Launch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users save investigations, and every saved frame is re-derived by the server from the same public file, then stored as verified or mismatch. Users can delete anything, including their whole account. The privacy notice, audit trail, purge and security headers are in place, and the product launches in production on ₹0 infrastructure.

**Architecture:**
- **Supabase (Mumbai)** holds investigations, frames, annotations and an IDs-only audit log.
  - Postgres + PostGIS rules validate geometry and limits.
  - RLS isolates users.
- **Two Deno Edge Functions:**
  - `verify` re-reads frames with the shared `src/evidence` code and writes `frames` with the service role.
  - `delete-account` uses the admin API.
- **Browser:**
  - Google sign-in (PKCE).
  - A pure `saveAndVerify` orchestrator with retries.
  - Consent recorded once.

**Tech Stack:** Supabase (Postgres 15+/17, PostGIS, pg_cron, Edge Functions on Deno), @supabase/supabase-js 2.117.2, supabase CLI 2.119.0, deno 2.9.6 (npm), @electric-sql/pglite 0.5.8 + pglite-postgis 0.2.8 for local DB tests, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-10-05-grahsaboot-design.md`: §5.5 verify contract, §5.6 provenance, §8 backend, §9 privacy/security, §12 environments, §13 triggers, §14 probes P3/P4. Execution rules: `docs/superpowers/plans/2026-10-05-grahsaboot-plan.md`.

## Global Constraints

- Postgres:
  - Every function uses `set search_path = ''` and schema-qualifies names (`extensions.st_*`, `public.*`, `auth.*`).
  - PostGIS lives in schema `extensions`.
  - Errors raised by our rules use the message prefix `GS:` (for example `GS:TOO_LARGE`).
- Tolerance: server geometry limits allow +0.5 % over the client limits. Server spheroid measures differ slightly from client UTM measures, so this avoids refusing outlines the browser accepted.
- RLS everywhere.
  - Users see and change only their own investigations/annotations.
  - Users can only read their own frames, and can never write frames.
  - `audit_log` is invisible to clients.
  - Security-definer functions revoke `execute` from `public` and grant it to specific roles only.
- Audit rows hold IDs and action names only. They never contain names, geometry, notes or emails.
- `verify` accepts 1–4 frames per call, rejects item ids outside `^[A-Za-z0-9_.-]{1,100}$`, reads only allowlisted HTTPS hosts and enforces 600 frame checks per user per 24 h, counted from the audit log so re-checking the same frames counts too. A `mismatch` is stored and shown, never hidden.
- Secrets live only in `.env.local` (git-ignored), Supabase function secrets and Wrangler secrets. The browser only ever sees the publishable key.
- Production commands run only on the user's explicit go-ahead for that command: `supabase db push --linked` to prod, `supabase functions deploy` to prod, `wrangler deploy` with prod env, and Google OAuth publishing. Dev-project commands are allowed after Gate G0.
- Copy rules: all strings live in `src/ui/copy-account.ts`. The verdict-word test scans it automatically.

## Review Focus

1. **Another user's investigation id sent to `verify`.** The answer must be 404 with no frame written (tests in D3 and D6).
2. **A forged or stale client hash.** It is stored as `mismatch` and shown as "did not match the source", never silently accepted (tests in D6 and D8).
3. **`verify` failing mid-save (502).** The client retries ×3 with backoff, reports partial progress, and a second save resumes idempotently through the upsert (tests in D8).
4. **Account deletion.** It removes server rows (cascade) and local saved copies; audit keeps IDs only (tests in D3 and D9).
5. **Saving while signed out or with an expired session.** Sign-in returns to the same investigation with local work intact (test in D8).

---

### Task D0: Human gate G0 (accounts) and environment check

**Files:**
- Create: `.env.example`, `scripts/check-env.ts`, `docs/ops/accounts.md`

**Interfaces:**
- Produces: `npm run env:check` fails with a clear list of missing variables.

- [ ] **Step 1: Write `.env.example`**

```
# Browser (baked into the build; publishable values only)
VITE_SUPABASE_URL=https://<dev-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>

# Tooling only (never shipped to the browser)
SUPABASE_ACCESS_TOKEN=<personal access token from supabase.com/dashboard/account/tokens>
SUPABASE_DEV_REF=<dev project ref>
SUPABASE_DEV_DB_PASSWORD=<dev database password>
SUPABASE_PROD_REF=<prod project ref>
DEV_TEST_EMAIL=gs-smoke@example.com
DEV_TEST_PASSWORD=<long random password for the dev-only smoke user>
```

- [ ] **Step 2: Write `scripts/check-env.ts` and the npm script**

```ts
import { existsSync, readFileSync } from 'node:fs'

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DEV_REF', 'SUPABASE_DEV_DB_PASSWORD', 'DEV_TEST_EMAIL', 'DEV_TEST_PASSWORD']
const env = existsSync('.env.local')
  ? Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  : {}
const missing = REQUIRED.filter((k) => !env[k] || env[k]!.includes('<'))
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(', ')}. See docs/ops/accounts.md.`)
  process.exit(1)
}
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(env.VITE_SUPABASE_URL!)) {
  console.error('VITE_SUPABASE_URL must look like https://<20-char-ref>.supabase.co')
  process.exit(1)
}
console.log('env ok')
```
`package.json`: `"env:check": "tsx scripts/check-env.ts"`.

- [ ] **Step 3: Write `docs/ops/accounts.md` (the exact human steps)**

```markdown
# Accounts (Gate G0, done by the human owner)

1. Supabase:
   - At supabase.com, create organisation "GrahSaboot" (Free plan).
   - Create project `grahsaboot-dev`, region **South Asia (Mumbai)**, with a strong DB password.
   - Create project `grahsaboot-prod` the same way, also in Mumbai.
2. Google Cloud:
   - In console.cloud.google.com, create project "GrahSaboot".
   - Open Google Auth Platform → Branding: app name GrahSaboot, support email, and a privacy policy URL (the preview URL + `/privacy`).
   - Audience: External.
   - Data access: scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` only.
   - Clients → Create OAuth client (Web).
     - Authorised JavaScript origins: the preview/prod app URLs.
     - Authorised redirect URIs: `https://<dev-ref>.supabase.co/auth/v1/callback` and `https://<prod-ref>.supabase.co/auth/v1/callback`.
3. Supabase dashboard (each project):
   - Authentication → Sign In / Providers → Google: paste the client ID and secret, then enable.
   - URL Configuration: Site URL = app URL; Additional redirect URLs = `http://127.0.0.1:5173/**`, `http://localhost:5173/**` and the preview/prod URLs `/**`.
   - Disable Email signups in **prod**.
   - In **dev only**: enable Email with "Confirm email" off, so the automated smoke user can sign in with a password.
4. Create a personal access token, then on this VM run `npx supabase login`.
5. Fill in `.env.local` from `.env.example`, then run `npm run env:check`.

Region cannot be changed after creation. Choose Mumbai.
```

- [ ] **Step 4: Hand the gate to the user, and keep working on what needs no accounts**

Ask the user to complete `docs/ops/accounts.md`. Tasks D1–D3, D5, D6 and D8–D10 run entirely locally (PGlite, Deno, mocked Supabase in E2E), so continue with them meanwhile. D4, D7 and D11 start only after `npm run env:check` prints `env ok`.

- [ ] **Step 5: Commit**

```bash
git add .env.example scripts/check-env.ts docs/ops/accounts.md package.json
git commit -m "chore: account gate G0 runbook and environment check

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D1: Local Postgres test harness and the core schema

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/20261005000001_core.sql`, `tests/db/harness.ts`
- Modify: `vite.config.ts` (`test.hookTimeout`)
- Test: `tests/db/core.test.ts`

**Interfaces:**
- Produces:
  - Tables `public.investigations`, `public.frames`, `public.annotations`, `public.audit_log` (columns below).
  - Harness:
    - `freshDb(): Promise<Db>`
    - `interface Db { as(who: string | 'service' | 'anon', sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>; super(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> }`
    - Constants `USER_A`, `USER_B`.
    - Helpers `ewktPolygon(ring)`, `ewktLine(line)`.
    - It builds one migrated template database per test file and gives every test a cheap `clone()` of it.
  - Migrations whose filename contains `_cron` are skipped by the harness (PGlite has no pg_cron).

- [ ] **Step 1: Initialise Supabase config**

Run: `npx supabase init` (accept defaults; do not generate VS Code settings). Then in `supabase/config.toml` set `project_id = "grahsaboot"`.

- [ ] **Step 2: Write the harness `tests/db/harness.ts`**

```ts
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
create schema if not exists extensions;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`

export interface Db {
  as(who: string, sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  super(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}

let base: Promise<PGlite> | null = null

/** Migrated template database, built once per test file; every test gets a cheap clone of it. */
async function template(): Promise<PGlite> {
  const pg = new PGlite({ extensions: { postgis } })
  await pg.exec(AUTH_SHIM)
  const dir = 'supabase/migrations'
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql') && !n.includes('_cron')).sort()) await pg.exec(readFileSync(`${dir}/${f}`, 'utf8'))
  await pg.query(`insert into auth.users (id, email, last_sign_in_at) values ($1, 'a@example.com', now()), ($2, 'b@example.com', now())`, [USER_A, USER_B])
  return pg
}

export async function freshDb(): Promise<Db> {
  const pg: Pick<PGlite, 'query' | 'transaction'> = await (await (base ??= template())).clone()
  return {
    async as(who, sql, params = []) {
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
export const ewktPolygon = (ring: LL[]) => `SRID=4326;POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(',')}))`
export const ewktLine = (line: LL[]) => `SRID=4326;LINESTRING(${line.map(([x, y]) => `${x} ${y}`).join(',')})`
export const SQUARE: LL[] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]
export const ROAD: LL[] = [[79.07698, 21.138637], [79.095988, 21.157819]]
```

In `vite.config.ts`, add `hookTimeout: 60000` to the `test` block. The first PostGIS start in each test file takes several seconds.

- [ ] **Step 3: Write the failing test `tests/db/core.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ewktLine, ewktPolygon, freshDb, ROAD, SQUARE, USER_A, type Db } from './harness.ts'

let db: Db
beforeEach(async () => { db = await freshDb() })

describe('core schema', () => {
  it('stores a site and a road with PostGIS geography', async () => {
    const [site] = await db.super(
      `insert into public.investigations (owner, name, kind, geom, date_from, date_to) values ($1, 'Yard', 'site', $2, '2025-01-01', '2025-12-31') returning id, round(extensions.st_area(geom)::numeric) as m2`,
      [USER_A, ewktPolygon(SQUARE)],
    )
    expect(Number(site!.m2)).toBeGreaterThan(1_140_000)
    const [road] = await db.super(
      `insert into public.investigations (owner, name, kind, geom, road_width_m, date_from, date_to) values ($1, 'NH', 'road', $2, 30, '2025-01-01', '2025-12-31') returning round(extensions.st_length(geom)::numeric) as m`,
      [USER_A, ewktLine(ROAD)],
    )
    expect(Number(road!.m)).toBeGreaterThan(2890)
  })
  it('enforces kind/width consistency and frame hash format', async () => {
    await expect(db.super(`insert into public.investigations (owner, name, kind, geom, road_width_m, date_from, date_to) values ($1, 'x', 'site', $2, 30, '2025-01-01', '2025-12-31')`, [USER_A, ewktPolygon(SQUARE)])).rejects.toThrow()
    const [inv] = await db.super(`insert into public.investigations (owner, name, kind, geom, date_from, date_to) values ($1, 'x', 'site', $2, '2025-01-01', '2025-12-31') returning id`, [USER_A, ewktPolygon(SQUARE)])
    await expect(db.super(
      `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
       values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', 'nothex', 'nothex', 'verified')`,
      [inv!.id, USER_A],
    )).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/db/core.test.ts`
Expected: FAIL. The relation `public.investigations` does not exist because the migration is missing.

- [ ] **Step 5: Write `supabase/migrations/20261005000001_core.sql`**

```sql
create extension if not exists postgis schema extensions;

create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('site', 'road')),
  geom extensions.geography not null,
  road_width_m integer check (road_width_m is null or road_width_m between 5 and 200),
  date_from date not null,
  date_to date not null,
  before_date date,
  after_date date,
  pinned date[] not null default '{}' check (cardinality(pinned) <= 24),
  claim_text text check (claim_text is null or char_length(claim_text) <= 2000),
  claim_date date,
  claim_criterion text check (claim_criterion is null or char_length(claim_criterion) <= 500),
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to > date_from),
  check ((kind = 'road') = (road_width_m is not null)),
  check (before_date is null or after_date is null or before_date < after_date)
);
create index investigations_owner_updated on public.investigations (owner, updated_at desc);

create table public.frames (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  acquired_at timestamptz not null,
  frame_date date not null,
  collection text not null check (collection in ('sentinel-2-l2a', 'pc:sentinel-2-l2a')),
  item_id text not null check (item_id ~ '^[A-Za-z0-9_.-]{1,100}$'),
  processing_baseline text,
  asset text not null check (asset in ('visual', 'scl')),
  level smallint not null check (level in (0, 1)),
  win integer[] not null check (cardinality(win) = 4),
  crs text not null,
  transform double precision[] not null check (cardinality(transform) = 6),
  href text not null,
  source_identity jsonb not null default '{}',
  recipe text not null check (recipe in ('frame-v1', 'scl-v2')),
  client_sha256 text not null check (client_sha256 ~ '^[0-9a-f]{64}$'),
  server_sha256 text not null check (server_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('verified', 'mismatch')),
  quality jsonb,
  verified_at timestamptz not null default now(),
  unique (investigation_id, item_id, asset, level)
);
create index frames_owner_verified on public.frames (owner, verified_at);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('change', 'no_clear_change', 'unsure')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  frame_date date,
  section_idx smallint check (section_idx is null or section_idx between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index annotations_investigation on public.annotations (investigation_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now()
);
create index audit_log_at on public.audit_log (at);
-- verify's daily limit counts a user's frame checks here (inserts and re-checks alike).
create index audit_log_actor_at on public.audit_log (actor, entity, at);

-- Table privileges (RLS policies come in the security migration).
revoke all on public.investigations, public.frames, public.annotations, public.audit_log from anon, authenticated;
grant select, insert, update, delete on public.investigations to authenticated;
grant select, insert, update, delete on public.annotations to authenticated;
grant select on public.frames to authenticated;
grant all on public.investigations, public.frames, public.annotations, public.audit_log to service_role;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/db/core.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add supabase tests/db vite.config.ts
git commit -m "feat(db): core schema (investigations, frames, annotations, audit) with a PGlite+PostGIS harness

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D2: Database rules (geometry, dates, limits, freeze)

**Files:**
- Create: `supabase/migrations/20261005000002_rules.sql`
- Test: `tests/db/rules.test.ts`

**Interfaces:**
- Produces: triggers raising
  - geometry: `GS:GEOM_TYPE`, `GS:GEOM_INVALID`, `GS:TOO_MANY_VERTICES`, `GS:TOO_LARGE`, `GS:TOO_WIDE`, `GS:BAD_LENGTH`;
  - dates and state: `GS:BAD_DATES`, `GS:FROZEN`, `GS:OWNER_IMMUTABLE`;
  - limits: `GS:LIMIT_INVESTIGATIONS`, `GS:LIMIT_NOTES`, `GS:LIMIT_FRAMES`.

  `frozen_at` is set by the first frame insert.

- [ ] **Step 1: Write the failing test `tests/db/rules.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ewktLine, ewktPolygon, freshDb, ROAD, SQUARE, USER_A, type Db } from './harness.ts'

let db: Db
beforeEach(async () => { db = await freshDb() })

const insSite = (ring: [number, number][], from = '2025-01-01', to = '2025-12-31') =>
  db.as(USER_A, `insert into public.investigations (name, kind, geom, date_from, date_to) values ('x', 'site', $1, $2, $3) returning id`, [ewktPolygon(ring), from, to])
const insRoad = (line: [number, number][], width = 30) =>
  db.as(USER_A, `insert into public.investigations (name, kind, geom, road_width_m, date_from, date_to) values ('r', 'road', $1, $2, '2025-01-01', '2025-12-31') returning id`, [ewktLine(line), width])
const frame = (inv: unknown, n = 0) =>
  db.as('service', `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
    values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', $3, 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $4, $4, 'verified')`, [inv, USER_A, `S2_${n}`, 'a'.repeat(64)])

describe('geometry and date rules', () => {
  it('accepts valid sites and roads', async () => {
    await expect(insSite(SQUARE)).resolves.toHaveLength(1)
    await expect(insRoad(ROAD)).resolves.toHaveLength(1)
  })
  it('rejects self-intersecting, oversized and too-wide sites', async () => {
    await expect(insSite([[79, 21], [79.01, 21.01], [79.01, 21], [79, 21.01], [79, 21]])).rejects.toThrow('GS:GEOM_INVALID')
    await expect(insSite([[79, 21], [79.05, 21], [79.05, 21.05], [79, 21.05], [79, 21]])).rejects.toThrow('GS:TOO_LARGE')
    await expect(insSite([[79, 21], [79.045, 21], [79.045, 21.0005], [79, 21.0005], [79, 21]])).rejects.toThrow('GS:TOO_WIDE')
  })
  it('rejects roads outside 0.2–10 km and wrong types', async () => {
    await expect(insRoad([[79, 21], [79, 21.0005]])).rejects.toThrow('GS:BAD_LENGTH')
    await expect(insRoad([[79, 21], [79, 21.11]])).rejects.toThrow('GS:BAD_LENGTH')
    await expect(db.as(USER_A, `insert into public.investigations (name, kind, geom, road_width_m, date_from, date_to) values ('r', 'road', $1, 30, '2025-01-01', '2025-12-31')`, [ewktPolygon(SQUARE)])).rejects.toThrow('GS:GEOM_TYPE')
  })
  it('rejects dates before 2017 or in the future', async () => {
    await expect(insSite(SQUARE, '2016-12-31', '2025-01-01')).rejects.toThrow('GS:BAD_DATES')
    await expect(insSite(SQUARE, '2025-01-01', '2999-01-01')).rejects.toThrow('GS:BAD_DATES')
  })
})

describe('limits and freezing', () => {
  it('caps investigations at 50 per user', async () => {
    for (let i = 0; i < 50; i++) await insSite(SQUARE)
    await expect(insSite(SQUARE)).rejects.toThrow('GS:LIMIT_INVESTIGATIONS')
  })
  it('caps notes at 200 per investigation', async () => {
    const [inv] = await insSite(SQUARE)
    await db.super(`insert into public.annotations (investigation_id, owner, kind, body) select $1, $2, 'unsure', 'n' || g from generate_series(1, 200) g`, [inv!.id, USER_A])
    await expect(db.as(USER_A, `insert into public.annotations (investigation_id, kind, body) values ($1, 'unsure', 'one more')`, [inv!.id])).rejects.toThrow('GS:LIMIT_NOTES')
  })
  it('caps frames at 50 per investigation', async () => {
    const [inv] = await insSite(SQUARE)
    for (let i = 0; i < 50; i++) await frame(inv!.id, i)
    await expect(frame(inv!.id, 99)).rejects.toThrow('GS:LIMIT_FRAMES')
    // Re-verifying an existing frame at the cap still works (upsert, as the verify function does).
    await expect(db.as('service', `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
      values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2_0', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'mismatch')
      on conflict (investigation_id, item_id, asset, level) do update set status = excluded.status returning status`, [inv!.id, USER_A, 'b'.repeat(64)])).resolves.toEqual([{ status: 'mismatch' }])
  })
  it('freezes geometry and dates after the first frame, but allows name and notes changes', async () => {
    const [inv] = await insSite(SQUARE)
    await frame(inv!.id)
    const [row] = await db.as(USER_A, `select frozen_at from public.investigations where id = $1`, [inv!.id])
    expect(row!.frozen_at).not.toBeNull()
    await expect(db.as(USER_A, `update public.investigations set date_to = '2025-11-30' where id = $1`, [inv!.id])).rejects.toThrow('GS:FROZEN')
    await expect(db.as(USER_A, `update public.investigations set name = 'Renamed' where id = $1 returning name`, [inv!.id])).resolves.toEqual([{ name: 'Renamed' }])
  })
  it('never lets the owner change', async () => {
    const [inv] = await insSite(SQUARE)
    await expect(db.super(`update public.investigations set owner = '00000000-0000-4000-8000-00000000000b' where id = $1`, [inv!.id])).rejects.toThrow('GS:OWNER_IMMUTABLE')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/db/rules.test.ts`
Expected: FAIL (for example, the self-intersecting site is accepted).

- [ ] **Step 3: Write `supabase/migrations/20261005000002_rules.sql`**

```sql
-- Geometry, date and immutability rules. Server limits are 0.5 % looser than the browser's UTM-based limits (spheroid vs UTM).
create or replace function public.gs_validate_investigation() returns trigger
language plpgsql set search_path = '' as $$
declare
  g extensions.geometry := new.geom::extensions.geometry;
begin
  if tg_op = 'UPDATE' then
    if new.owner is distinct from old.owner then raise exception 'GS:OWNER_IMMUTABLE'; end if;
    if old.frozen_at is not null and (
      new.kind is distinct from old.kind or new.road_width_m is distinct from old.road_width_m
      or new.date_from is distinct from old.date_from or new.date_to is distinct from old.date_to
      or not extensions.st_equals(new.geom::extensions.geometry, old.geom::extensions.geometry)
    ) then
      raise exception 'GS:FROZEN';
    end if;
  end if;

  if new.kind = 'site' then
    if extensions.geometrytype(g) <> 'POLYGON' then raise exception 'GS:GEOM_TYPE'; end if;
    if not extensions.st_isvalid(g) then raise exception 'GS:GEOM_INVALID'; end if;
    if extensions.st_npoints(g) - 1 > 200 then raise exception 'GS:TOO_MANY_VERTICES'; end if;
    if extensions.st_area(new.geom) > 9e6 * 1.005 then raise exception 'GS:TOO_LARGE'; end if;
    if (
      select max(extensions.st_distance(a.geom::extensions.geography, b.geom::extensions.geography))
      from extensions.st_dumppoints(g) a, extensions.st_dumppoints(g) b
    ) > 4250 * 1.005 then
      raise exception 'GS:TOO_WIDE';
    end if;
  else
    if extensions.geometrytype(g) <> 'LINESTRING' then raise exception 'GS:GEOM_TYPE'; end if;
    if extensions.st_npoints(g) > 200 then raise exception 'GS:TOO_MANY_VERTICES'; end if;
    if extensions.st_length(new.geom) < 200 * 0.995 or extensions.st_length(new.geom) > 10000 * 1.005 then
      raise exception 'GS:BAD_LENGTH';
    end if;
  end if;

  if new.date_from < date '2017-01-01' or new.date_to > current_date then raise exception 'GS:BAD_DATES'; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger gs_investigations_validate
  before insert or update on public.investigations
  for each row execute function public.gs_validate_investigation();

-- ponytail: count-based caps can race under concurrent inserts by one user; acceptable for small caps, use advisory locks if abused
create or replace function public.gs_limit_investigations() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.investigations where owner = new.owner) >= 50 then raise exception 'GS:LIMIT_INVESTIGATIONS'; end if;
  return new;
end $$;
create trigger gs_investigations_limit before insert on public.investigations for each row execute function public.gs_limit_investigations();

create or replace function public.gs_limit_notes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.annotations where investigation_id = new.investigation_id) >= 200 then raise exception 'GS:LIMIT_NOTES'; end if;
  return new;
end $$;
create trigger gs_annotations_limit before insert on public.annotations for each row execute function public.gs_limit_notes();

create or replace function public.gs_limit_frames() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Re-verifying a frame (upsert on the unique key) never counts against the cap.
  if exists (select 1 from public.frames where investigation_id = new.investigation_id and item_id = new.item_id and asset = new.asset and level = new.level) then return new; end if;
  if (select count(*) from public.frames where investigation_id = new.investigation_id) >= 50 then raise exception 'GS:LIMIT_FRAMES'; end if;
  return new;
end $$;
create trigger gs_frames_limit before insert on public.frames for each row execute function public.gs_limit_frames();

create or replace function public.gs_freeze_on_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.investigations set frozen_at = coalesce(frozen_at, now()) where id = new.investigation_id and frozen_at is null;
  return new;
end $$;
create trigger gs_frames_freeze after insert on public.frames for each row execute function public.gs_freeze_on_frame();

create or replace function public.gs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger gs_annotations_touch before update on public.annotations for each row execute function public.gs_touch();

revoke execute on function public.gs_validate_investigation(), public.gs_limit_investigations(), public.gs_limit_notes(), public.gs_limit_frames(), public.gs_freeze_on_frame(), public.gs_touch() from public;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/db`
Expected: PASS (core 2, rules 9).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/db
git commit -m "feat(db): geometry, date, limit and freeze rules as Postgres triggers

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D3: RLS, grants, audit log, consent, keep-alive, purge

**Files:**
- Create: `supabase/migrations/20261005000003_security.sql`, `supabase/migrations/20261005000004_ops_cron.sql`
- Test: `tests/db/security.test.ts`

**Interfaces:**
- Produces:
  - RLS policies (owner only). Table grants already come from the core migration.
  - `public.geom_geojson(public.investigations) returns jsonb` (PostgREST computed field).
  - `public.record_consent(version text)`, `public.keep_alive() returns integer` (anon), `public.purge_expired() returns jsonb` (no client grant).
  - Audit triggers on all three tables.
  - Daily cron `gs-purge` at 21:00 UTC (02:30 IST).

- [ ] **Step 1: Write the failing test `tests/db/security.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ewktPolygon, freshDb, SQUARE, USER_A, USER_B, type Db } from './harness.ts'

let db: Db
beforeEach(async () => { db = await freshDb() })
const mine = async () => (await db.as(USER_A, `insert into public.investigations (name, kind, geom, date_from, date_to) values ('Secret yard', 'site', $1, '2025-01-01', '2025-12-31') returning id`, [ewktPolygon(SQUARE)]))[0]!.id

describe('row level security', () => {
  it('isolates investigations between users', async () => {
    const id = await mine()
    expect(await db.as(USER_B, `select id from public.investigations`)).toEqual([])
    expect(await db.as(USER_B, `update public.investigations set name = 'pwned' where id = $1 returning id`, [id])).toEqual([])
    expect(await db.as(USER_B, `delete from public.investigations where id = $1 returning id`, [id])).toEqual([])
    expect(await db.as('anon', `select id from public.investigations`).catch(() => [])).toEqual([])
  })
  it('stops users writing notes into someone else’s investigation', async () => {
    const id = await mine()
    await expect(db.as(USER_B, `insert into public.annotations (investigation_id, kind, body) values ($1, 'change', 'x')`, [id])).rejects.toThrow()
  })
  it('lets users read but never write frames', async () => {
    const id = await mine()
    await expect(db.as(USER_A, `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
      values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'verified')`, [id, USER_A, 'a'.repeat(64)])).rejects.toThrow()
    await db.as('service', `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
      values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'verified')`, [id, USER_A, 'a'.repeat(64)])
    expect(await db.as(USER_A, `select count(*)::int as n from public.frames`)).toEqual([{ n: 1 }])
    expect(await db.as(USER_B, `select count(*)::int as n from public.frames`)).toEqual([{ n: 0 }])
  })
  it('lets owners delete an investigation with its frames, and nobody else', async () => {
    const id = await mine()
    await db.as('service', `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
      values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'verified')`, [id, USER_A, 'a'.repeat(64)])
    expect(await db.as(USER_B, `delete from public.investigations where id = $1 returning id`, [id])).toEqual([])
    expect(await db.as(USER_A, `delete from public.investigations where id = $1 returning id`, [id])).toEqual([{ id }])
    expect(await db.super(`select count(*)::int as n from public.frames`)).toEqual([{ n: 0 }])
  })
  it('hides the audit log from clients', async () => {
    await mine()
    await expect(db.as(USER_A, `select * from public.audit_log`)).rejects.toThrow()
  })
})

describe('audit, consent, keep-alive, purge', () => {
  it('writes IDs-only audit rows for every change', async () => {
    const id = await mine()
    await db.as(USER_A, `update public.investigations set name = 'Renamed' where id = $1`, [id])
    const rows = await db.super(`select actor, action, entity, entity_id from public.audit_log order by id`)
    expect(rows).toEqual([
      { actor: USER_A, action: 'insert', entity: 'investigations', entity_id: id },
      { actor: USER_A, action: 'update', entity: 'investigations', entity_id: id },
    ])
    expect(JSON.stringify(await db.super(`select * from public.audit_log`))).not.toContain('Secret yard')
  })
  it('logs every frame check, re-checks included, so the daily verify limit cannot be dodged', async () => {
    const id = await mine()
    const upsert = `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
      values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'verified')
      on conflict (investigation_id, item_id, asset, level) do update set verified_at = now()`
    await db.as('service', upsert, [id, USER_A, 'a'.repeat(64)])
    await db.as('service', upsert, [id, USER_A, 'a'.repeat(64)])
    expect(await db.super(`select action from public.audit_log where actor = $1 and entity = 'frames' order by id`, [USER_A])).toEqual([{ action: 'insert' }, { action: 'update' }])
  })
  it('records consent and exposes keep_alive to anon only as a no-op', async () => {
    await db.as(USER_A, `select public.record_consent('v1')`)
    expect(await db.super(`select action from public.audit_log`)).toEqual([{ action: 'consent:v1' }])
    expect(await db.as('anon', `select public.keep_alive() as ok`)).toEqual([{ ok: 1 }])
    await expect(db.as(USER_A, `select public.purge_expired()`)).rejects.toThrow()
  })
  it('returns geometry as GeoJSON through the computed field', async () => {
    const id = await mine()
    const [r] = await db.as(USER_A, `select public.geom_geojson(i) as g from public.investigations i where id = $1`, [id])
    expect((r!.g as { type: string }).type).toBe('Polygon')
  })
  it('purges investigations of users inactive for 12 months and audit rows older than a year', async () => {
    await mine()
    await db.super(`update auth.users set last_sign_in_at = now() - interval '13 months' where id = $1`, [USER_A])
    await db.super(`insert into public.audit_log (actor, action, entity, at) values (null, 'old', 'x', now() - interval '400 days')`)
    const [r] = await db.super(`select public.purge_expired() as r`)
    expect(r!.r).toMatchObject({ investigations: 1, audit: 1 })
    expect(await db.super(`select count(*)::int as n from public.investigations`)).toEqual([{ n: 0 }])
  })
  it('cascades a deleted user’s data and keeps only IDs in the audit log', async () => {
    const id = await mine()
    await db.super(`delete from auth.users where id = $1`, [USER_A])
    expect(await db.super(`select count(*)::int as n from public.investigations`)).toEqual([{ n: 0 }])
    const audit = await db.super(`select action, entity_id from public.audit_log where entity = 'investigations' order by id`)
    expect(audit.at(-1)).toEqual({ action: 'delete', entity_id: id })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/db/security.test.ts`
Expected: FAIL, 10 of 11 (no RLS yet, so user B can see user A's rows; the functions and audit triggers do not exist).

- [ ] **Step 3: Write `supabase/migrations/20261005000003_security.sql`**

```sql
alter table public.investigations enable row level security;
alter table public.frames enable row level security;
alter table public.annotations enable row level security;
alter table public.audit_log enable row level security;

create policy investigations_owner on public.investigations for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy annotations_owner on public.annotations for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and exists (select 1 from public.investigations i where i.id = investigation_id and i.owner = (select auth.uid())));

create policy frames_owner_read on public.frames for select to authenticated using (owner = (select auth.uid()));
-- audit_log: RLS on, no policy, no grant -> invisible to clients.

create or replace function public.geom_geojson(i public.investigations) returns jsonb
language sql stable set search_path = '' as $$ select extensions.st_asgeojson(i.geom)::jsonb $$;
grant execute on function public.geom_geojson(public.investigations) to authenticated, service_role;

create or replace function public.gs_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, action, entity, entity_id)
  values (coalesce(auth.uid(), (r ->> 'owner')::uuid), lower(tg_op), tg_table_name, (r ->> 'id')::uuid);
  return coalesce(new, old);
end $$;
create trigger gs_investigations_audit after insert or update or delete on public.investigations for each row execute function public.gs_audit();
create trigger gs_frames_audit after insert or update or delete on public.frames for each row execute function public.gs_audit();
create trigger gs_annotations_audit after insert or update or delete on public.annotations for each row execute function public.gs_audit();

create or replace function public.record_consent(version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'GS:NOT_SIGNED_IN'; end if;
  if version !~ '^[a-z0-9.-]{1,20}$' then raise exception 'GS:BAD_VERSION'; end if;
  insert into public.audit_log (actor, action, entity, entity_id) values (auth.uid(), 'consent:' || version, 'users', auth.uid());
end $$;

create or replace function public.keep_alive() returns integer language sql stable set search_path = '' as $$ select 1 $$;

create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv_n integer; log_n integer;
begin
  delete from public.investigations i using auth.users u
    where i.owner = u.id and u.last_sign_in_at < now() - interval '12 months';
  get diagnostics inv_n = row_count;
  delete from public.audit_log where at < now() - interval '365 days';
  get diagnostics log_n = row_count;
  return jsonb_build_object('investigations', inv_n, 'audit', log_n);
end $$;

revoke execute on function public.gs_audit(), public.record_consent(text), public.keep_alive(), public.purge_expired() from public;
grant execute on function public.record_consent(text) to authenticated;
grant execute on function public.keep_alive() to anon, authenticated;
```

`supabase/migrations/20261005000004_ops_cron.sql` (skipped by the PGlite harness; applied on Supabase):
```sql
create extension if not exists pg_cron;
select cron.schedule('gs-purge', '0 21 * * *', $$select public.purge_expired()$$);
```
If Supabase rejects `create extension pg_cron` from a migration, enable it in Dashboard → Database → Extensions, keep only the `cron.schedule` line, and record it in `docs/ops/probes.md` (P3).

- [ ] **Step 4: Run all DB tests**

Run: `npx vitest run tests/db`
Expected: PASS (core 2, rules 9, security 11).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/db
git commit -m "feat(db): owner-only RLS, IDs-only audit, consent, keep-alive, 12-month purge and daily cron

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D4: Apply migrations to the dev project (probe P3, database half)

**Files:**
- Modify: `docs/ops/probes.md` (P3 database row), `package.json` (scripts `db:push:dev`, `db:status:dev`)

**Interfaces:**
- Produces: the dev database at the D3 schema; `keep_alive` reachable with the publishable key.

- [ ] **Step 1: Link and push**

```bash
set -a; . ./.env.local; set +a
npx supabase link --project-ref "$SUPABASE_DEV_REF" -p "$SUPABASE_DEV_DB_PASSWORD"
npx supabase db push --linked -p "$SUPABASE_DEV_DB_PASSWORD"
npx supabase migration list --linked -p "$SUPABASE_DEV_DB_PASSWORD"
```
Expected: four migrations listed as applied on remote.

Add the scripts:
```json
"db:push:dev": "set -a && . ./.env.local && set +a && supabase db push --linked -p \"$SUPABASE_DEV_DB_PASSWORD\"",
"db:status:dev": "set -a && . ./.env.local && set +a && supabase migration list --linked -p \"$SUPABASE_DEV_DB_PASSWORD\""
```

- [ ] **Step 2: Smoke the API**

```bash
set -a; . ./.env.local; set +a
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/keep_alive" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "content-type: application/json" -d '{}'
curl -s "$VITE_SUPABASE_URL/rest/v1/investigations?select=id" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```
Expected:
- First call prints `1`.
- Second call prints `[]` or a permission error. Anonymous users see nothing.

- [ ] **Step 3: Record P3 (database) in `docs/ops/probes.md`**

Record:
- the region shown in the dashboard (it must be Mumbai);
- PostGIS enabled;
- the pg_cron job listed (`select * from cron.job` in the SQL editor);
- the keep-alive result.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/ops/probes.md
git commit -m "chore(db): push schema to the dev project and record probe P3 (database)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D5: Share the evidence core with Deno

**Files:**
- Create: `scripts/sync-evidence.ts`, `supabase/functions/_shared/evidence/*.ts` (generated, committed), `supabase/functions/deno.json`
- Test: `tests/unit/evidence-sync.test.ts`

**Interfaces:**
- Produces:
  - `npm run sync:evidence` copies `src/evidence/*.ts` (no tests) into `supabase/functions/_shared/evidence/`, with a header comment.
  - The test fails if the copies drift.
  - `supabase/functions/deno.json` maps `geotiff`, `proj4` and `@supabase/supabase-js` to pinned npm specifiers.

- [ ] **Step 1: Write the failing test `tests/unit/evidence-sync.test.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const HEADER = '// GENERATED by scripts/sync-evidence.ts from src/evidence. Do not edit.\n'
const src = readdirSync('src/evidence').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

describe('evidence core shared with Deno', () => {
  it('has an identical copy of every evidence module', () => {
    const shared = readdirSync('supabase/functions/_shared/evidence').sort()
    expect(shared).toEqual([...src].sort())
    for (const f of src) expect(readFileSync(`supabase/functions/_shared/evidence/${f}`, 'utf8'), f).toBe(HEADER + readFileSync(`src/evidence/${f}`, 'utf8'))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/evidence-sync.test.ts`
Expected: FAIL (the directory is missing).

- [ ] **Step 3: Write the sync script, the Deno config, and run them**

`scripts/sync-evidence.ts`:
```ts
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const HEADER = '// GENERATED by scripts/sync-evidence.ts from src/evidence. Do not edit.\n'
const out = 'supabase/functions/_shared/evidence'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const f of readdirSync('src/evidence').filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
  writeFileSync(`${out}/${f}`, HEADER + readFileSync(`src/evidence/${f}`, 'utf8'))
}
console.log('evidence synced')
```

`supabase/functions/deno.json`:
```json
{
  "imports": {
    "geotiff": "npm:geotiff@3.0.5",
    "proj4": "npm:proj4@2.22.0",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.117.2"
  }
}
```

`package.json` scripts: `"sync:evidence": "tsx scripts/sync-evidence.ts"`. Also make `check` run it first: `"check": "npm run sync:evidence && npm run typecheck && npm run test && npm run build && tsx scripts/check-bundle.ts"`.

Run: `npm run sync:evidence && npx deno check --config supabase/functions/deno.json supabase/functions/_shared/evidence/index.ts`
Expected: `evidence synced`; `deno check` reports no errors.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/evidence-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-evidence.ts supabase/functions package.json tests/unit/evidence-sync.test.ts
git commit -m "feat(fn): share the evidence core with Supabase Deno functions via a checked sync

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D6: The `verify` handler (pure, dependency-injected) with Deno tests

**Files:**
- Create: `supabase/functions/verify/handler.ts`, `supabase/functions/verify/handler.test.ts`

**Interfaces:**
- Consumes: `supabase/functions/_shared/evidence/index.ts`; fixtures `tests/fixtures/scene.ts` (imported by relative path in Deno tests).
- Produces:
  - `interface VerifyFrameIn { asset: 'visual' | 'scl'; level: 0 | 1; window: [number, number, number, number]; sha256: string }`
  - `interface VerifyRequest { investigation_id: string; item: { collection: 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'; id: string }; frames: VerifyFrameIn[] }`
  - `interface InvestigationRow { id: string; owner: string; kind: 'site' | 'road'; geom_geojson: { type: string; coordinates: unknown }; road_width_m: number | null; date_from: string; date_to: string }`
  - `interface ItemLite { id; collection; datetime: string; epsg: number; baseline: string | null; footprint: [number, number][][]; visual: AssetLite; scl: AssetLite }` with `AssetLite = { href: string; transform: number[]; shape: [number, number] }`
  - `interface FrameRow` (the columns of `public.frames` without `id` and `verified_at`)
  - `interface VerifyDeps { userId: string; loadInvestigation(id): Promise<InvestigationRow | null>; countRecentFrames(userId): Promise<number>; fetchItem(collection, id): Promise<ItemLite | null>; headAsset(href): Promise<Record<string, string>>; openCog(href, collection): Promise<Cog>; saveFrames(rows: FrameRow[]): Promise<Array<{ id: string; verified_at: string }>> }`
  - `handleVerify(deps, body: unknown): Promise<{ status: number; body: unknown }>`
  - `parseStacItem(raw: unknown, collection): ItemLite | null` (allowlisted HTTPS hosts only)

- [ ] **Step 1: Write the failing Deno test `supabase/functions/verify/handler.test.ts`**

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogBuffer, sha256Hex, type Cog } from '../_shared/evidence/index.ts'
import { FIXTURE_DATES, NAGPUR_SQUARE, SCL_SHAPE, SCL_TRANSFORM, TCI_SHAPE, TCI_TRANSFORM, makeScl, makeTci, toArrayBuffer } from '../../../tests/fixtures/scene.ts'
import { handleVerify, parseStacItem, type ItemLite, type VerifyDeps } from './handler.ts'

const USER = '00000000-0000-4000-8000-00000000000a'
const INV = { id: '11111111-1111-4111-8111-111111111111', owner: USER, kind: 'site' as const, geom_geojson: { type: 'Polygon', coordinates: [NAGPUR_SQUARE] }, road_width_m: null, date_from: '2025-01-01', date_to: '2025-12-31' }
const ITEM: ItemLite = {
  id: 'S2B_44QKJ_20251220_0_L2A', collection: 'sentinel-2-l2a', datetime: '2025-12-20T05:30:00Z', epsg: 32644, baseline: '05.11',
  footprint: [[[78.9, 21.0], [79.3, 21.0], [79.3, 21.3], [78.9, 21.3], [78.9, 21.0]]],
  visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/TCI.tif', transform: TCI_TRANSFORM, shape: TCI_SHAPE },
  scl: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/SCL.tif', transform: SCL_TRANSFORM, shape: SCL_SHAPE },
}
const files: Record<string, Uint8Array> = { [ITEM.visual.href]: makeTci(true), [ITEM.scl.href]: makeScl(FIXTURE_DATES[3]!.scl) }
const aoi = { kind: 'site' as const, rings: [NAGPUR_SQUARE] }

async function clientFrame(asset: 'visual' | 'scl', level: 0 | 1) {
  const a = asset === 'visual' ? ITEM.visual : ITEM.scl
  const cog = await openCogBuffer(toArrayBuffer(files[a.href]!))
  const lvl = levelInfoFor(a, cog, level)
  const window = aoiPixelWindow(aoiPointsUtm(aoi, ITEM.epsg), lvl, 2)!.clamped
  return { asset, level, window, sha256: await sha256Hex(await cog.read(level, window, asset === 'visual' ? [0, 1, 2] : [0])) }
}

function deps(over: Partial<VerifyDeps> = {}): VerifyDeps & { saved: unknown[] } {
  const saved: unknown[] = []
  return {
    saved,
    userId: USER,
    loadInvestigation: async (id) => (id === INV.id ? INV : null),
    countRecentFrames: async () => 0,
    fetchItem: async (_c, id) => (id === ITEM.id ? ITEM : null),
    headAsset: async () => ({ etag: '"x"' }),
    openCog: async (href): Promise<Cog> => openCogBuffer(toArrayBuffer(files[href]!)),
    saveFrames: async (rows) => { saved.push(...rows); return rows.map((_, i) => ({ id: `f${i}`, verified_at: '2026-10-05T10:00:00Z' })) },
    ...over,
  }
}
const body = async (frames: unknown[], over: Record<string, unknown> = {}) => ({ investigation_id: INV.id, item: { collection: 'sentinel-2-l2a', id: ITEM.id }, frames, ...over })

Deno.test('verifies matching client hashes and computes authoritative quality', async () => {
  const d = deps()
  const r = await handleVerify(d, await body([await clientFrame('scl', 0), await clientFrame('visual', 0)]))
  assertEquals(r.status, 200)
  const out = r.body as { frames: Array<{ status: string; quality?: { label: string } }> }
  assertEquals(out.frames.map((f) => f.status), ['verified', 'verified'])
  assertEquals(out.frames[0]!.quality?.label, 'CLEAR')
  assertEquals((d.saved[1] as { recipe: string; level: number }).recipe, 'frame-v1')
})

Deno.test('stores a forged hash as mismatch', async () => {
  const f = await clientFrame('visual', 1)
  const r = await handleVerify(deps(), await body([{ ...f, sha256: 'f'.repeat(64) }]))
  assertEquals(r.status, 200)
  assertEquals((r.body as { frames: Array<{ status: string }> }).frames[0]!.status, 'mismatch')
})

Deno.test('404 for an investigation the user cannot see (RLS returns nothing)', async () => {
  const r = await handleVerify(deps(), await body([await clientFrame('scl', 0)], { investigation_id: '22222222-2222-4222-8222-222222222222' }))
  assertEquals(r, { status: 404, body: { error: 'INVESTIGATION_NOT_FOUND' } })
})

Deno.test('422 for a window that does not cover the outline', async () => {
  const f = await clientFrame('visual', 0)
  const r = await handleVerify(deps(), await body([{ ...f, window: [0, 0, 40, 40] }]))
  assertEquals(r, { status: 422, body: { error: 'BAD_WINDOW' } })
})

Deno.test('422 when the item date is outside the investigation range', async () => {
  const r = await handleVerify(deps({ fetchItem: async () => ({ ...ITEM, datetime: '2024-06-01T05:30:00Z' }) }), await body([await clientFrame('scl', 0)]))
  assertEquals(r, { status: 422, body: { error: 'DATE_OUTSIDE_RANGE' } })
})

Deno.test('429 past 600 frames per day', async () => {
  const r = await handleVerify(deps({ countRecentFrames: async () => 599 }), await body([await clientFrame('scl', 0), await clientFrame('visual', 1)]))
  assertEquals(r, { status: 429, body: { error: 'RATE_LIMITED' } })
})

Deno.test('502 when the source cannot be read', async () => {
  const r = await handleVerify(deps({ openCog: async () => { throw new Error('S3 down') } }), await body([await clientFrame('scl', 0)]))
  assertEquals(r, { status: 502, body: { error: 'UPSTREAM' } })
})

Deno.test('400 for malformed bodies, path-like ids, too many frames, SCL above level 0', async () => {
  const f = await clientFrame('scl', 0)
  assertEquals((await handleVerify(deps(), null)).status, 400)
  assertEquals((await handleVerify(deps(), await body([f], { item: { collection: 'sentinel-2-l2a', id: '../../etc' } }))).status, 400)
  assertEquals((await handleVerify(deps(), await body([f, f, f, f, f]))).status, 400)
  assertEquals((await handleVerify(deps(), await body([{ ...f, level: 1 }]))).status, 400)
})

Deno.test('parseStacItem accepts allowlisted HTTPS hosts only', () => {
  const raw = {
    id: ITEM.id, properties: { datetime: ITEM.datetime, 'proj:epsg': 32644, 's2:processing_baseline': '05.11' },
    geometry: { type: 'Polygon', coordinates: ITEM.footprint },
    assets: { visual: { href: ITEM.visual.href, 'proj:transform': TCI_TRANSFORM, 'proj:shape': TCI_SHAPE }, scl: { href: ITEM.scl.href, 'proj:transform': SCL_TRANSFORM, 'proj:shape': SCL_SHAPE } },
  }
  assertEquals(parseStacItem(raw, 'sentinel-2-l2a')?.epsg, 32644)
  assertEquals(parseStacItem({ ...raw, assets: { ...raw.assets, visual: { ...raw.assets.visual, href: 'http://127.0.0.1/x.tif' } } }, 'sentinel-2-l2a'), null)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx deno test --config supabase/functions/deno.json -A supabase/functions/verify/handler.test.ts`
Expected: FAIL, `./handler.ts` not found.

- [ ] **Step 3: Implement `supabase/functions/verify/handler.ts`**

```ts
import {
  aoiPixelWindow, aoiPointsUtm, countMask, levelInfoFor, partsOf, rasterizeAoi, RECIPES, sclStats, sha256Hex, windowCovers, windowSize,
  type AoiGeometry, type Cog, type LonLat, type QualityStats, type Window,
} from '../_shared/evidence/index.ts'

export type Collection = 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'
export interface VerifyFrameIn { asset: 'visual' | 'scl'; level: 0 | 1; window: Window; sha256: string }
export interface VerifyRequest { investigation_id: string; item: { collection: Collection; id: string }; frames: VerifyFrameIn[] }
export interface InvestigationRow { id: string; owner: string; kind: 'site' | 'road'; geom_geojson: { type: string; coordinates: unknown }; road_width_m: number | null; date_from: string; date_to: string }
export interface AssetLite { href: string; transform: number[]; shape: [number, number] }
export interface ItemLite { id: string; collection: Collection; datetime: string; epsg: number; baseline: string | null; footprint: LonLat[][]; visual: AssetLite; scl: AssetLite }
export interface FrameRow {
  investigation_id: string; owner: string; acquired_at: string; frame_date: string; collection: Collection; item_id: string; processing_baseline: string | null
  asset: 'visual' | 'scl'; level: 0 | 1; win: Window; crs: string; transform: number[]; href: string; source_identity: Record<string, string>
  recipe: string; client_sha256: string; server_sha256: string; status: 'verified' | 'mismatch'; quality: unknown
}
export interface VerifyDeps {
  userId: string
  loadInvestigation(id: string): Promise<InvestigationRow | null>
  countRecentFrames(userId: string): Promise<number>
  fetchItem(collection: Collection, id: string): Promise<ItemLite | null>
  headAsset(href: string): Promise<Record<string, string>>
  openCog(href: string, collection: Collection): Promise<Cog>
  saveFrames(rows: FrameRow[]): Promise<Array<{ id: string; verified_at: string }>>
}

const ID_RE = /^[A-Za-z0-9_.-]{1,100}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEX_RE = /^[0-9a-f]{64}$/
const DAILY_LIMIT = 600
const err = (status: number, error: string) => ({ status, body: { error } })

function parseRequest(raw: unknown): VerifyRequest | null {
  const r = raw as Partial<VerifyRequest> | null
  if (!r || typeof r !== 'object' || typeof r.investigation_id !== 'string' || !UUID_RE.test(r.investigation_id)) return null
  if (!r.item || (r.item.collection !== 'sentinel-2-l2a' && r.item.collection !== 'pc:sentinel-2-l2a') || typeof r.item.id !== 'string' || !ID_RE.test(r.item.id)) return null
  if (!Array.isArray(r.frames) || r.frames.length < 1 || r.frames.length > 4) return null
  for (const f of r.frames) {
    if (!f || (f.asset !== 'visual' && f.asset !== 'scl') || (f.level !== 0 && f.level !== 1) || (f.asset === 'scl' && f.level !== 0)) return null
    if (!Array.isArray(f.window) || f.window.length !== 4 || !f.window.every((v) => Number.isInteger(v) && v >= 0 && v <= 20000)) return null
    if (typeof f.sha256 !== 'string' || !HEX_RE.test(f.sha256)) return null
  }
  return r as VerifyRequest
}

function toAoi(inv: InvestigationRow): AoiGeometry | null {
  const g = inv.geom_geojson
  if (inv.kind === 'site' && g.type === 'Polygon') return { kind: 'site', rings: g.coordinates as LonLat[][] }
  if (inv.kind === 'road' && g.type === 'LineString' && inv.road_width_m) return { kind: 'road', line: g.coordinates as LonLat[], widthM: inv.road_width_m }
  return null
}

function bbox(points: LonLat[]): [number, number, number, number] {
  return points.reduce<[number, number, number, number]>((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity])
}
const overlaps = (a: number[], b: number[]) => a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!
const scaled = (t: number[], level: number) => [t[0]! * 2 ** level, t[1]!, t[2]!, t[3]!, t[4]! * 2 ** level, t[5]!]
const summarise = (s: QualityStats) => ({ label: s.label, clearFraction: s.clearFraction, validFraction: s.validFraction, uncertainFraction: s.uncertainFraction, obstructedFraction: s.obstructedFraction, nodataFraction: s.nodataFraction, counts: s.counts, total: s.total, policy: s.policy })

export async function handleVerify(deps: VerifyDeps, raw: unknown): Promise<{ status: number; body: unknown }> {
  const req = parseRequest(raw)
  if (!req) return err(400, 'BAD_REQUEST')
  const inv = await deps.loadInvestigation(req.investigation_id)
  if (!inv) return err(404, 'INVESTIGATION_NOT_FOUND')
  const aoi = toAoi(inv)
  if (!aoi) return err(422, 'BAD_GEOMETRY')
  if ((await deps.countRecentFrames(deps.userId)) + req.frames.length > DAILY_LIMIT) return err(429, 'RATE_LIMITED')

  let item: ItemLite | null
  try {
    item = await deps.fetchItem(req.item.collection, req.item.id)
  } catch {
    return err(502, 'UPSTREAM')
  }
  if (!item) return err(404, 'ITEM_NOT_FOUND')
  const date = item.datetime.slice(0, 10)
  if (date < inv.date_from || date > inv.date_to) return err(422, 'DATE_OUTSIDE_RANGE')
  const aoiPoints = aoi.kind === 'site' ? aoi.rings.flat() : aoi.line
  if (!item.footprint.some((ring) => overlaps(bbox(ring), bbox(aoiPoints)))) return err(422, 'NO_OVERLAP')

  const rows: FrameRow[] = []
  for (const f of req.frames) {
    const asset = f.asset === 'visual' ? item.visual : item.scl
    let cog: Cog
    try {
      cog = await deps.openCog(asset.href, item.collection)
    } catch {
      return err(502, 'UPSTREAM')
    }
    let lvl
    try {
      lvl = levelInfoFor(asset, cog, f.level)
    } catch {
      return err(422, 'BAD_LEVEL')
    }
    const points = aoiPointsUtm(aoi, item.epsg)
    if (!windowCovers(f.window, points, lvl)) return err(422, 'BAD_WINDOW')
    let bytes: Uint8Array
    try {
      bytes = await cog.read(f.level, f.window, f.asset === 'visual' ? [0, 1, 2] : [0])
    } catch {
      return err(502, 'UPSTREAM')
    }
    const server = await sha256Hex(bytes)
    let quality: unknown = null
    if (f.asset === 'scl') {
      const { width, height } = windowSize(f.window)
      const full = aoiPixelWindow(points, lvl, 2)?.full ?? f.window
      const statsFor = (g: AoiGeometry) => {
        const mask = rasterizeAoi(g, item!.epsg, f.window, lvl, 2)
        const outside = countMask(rasterizeAoi(g, item!.epsg, full, lvl, 2)) - countMask(mask)
        return sclStats(bytes, width, height, mask, 2, Math.max(0, outside))
      }
      quality = { ...summarise(statsFor(aoi)), parts: partsOf(aoi).map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM, ...summarise(statsFor(p.geometry)) })) }
    }
    rows.push({
      investigation_id: inv.id, owner: deps.userId, acquired_at: item.datetime, frame_date: date, collection: item.collection, item_id: item.id,
      processing_baseline: item.baseline, asset: f.asset, level: f.level, win: f.window, crs: `EPSG:${item.epsg}`, transform: scaled(asset.transform, f.level),
      href: asset.href, source_identity: await deps.headAsset(asset.href).catch(() => ({})),
      recipe: f.asset === 'visual' ? RECIPES.frame : RECIPES.scl, client_sha256: f.sha256, server_sha256: server,
      status: server === f.sha256 ? 'verified' : 'mismatch', quality,
    })
  }
  const saved = await deps.saveFrames(rows)
  return {
    status: 200,
    body: {
      frames: rows.map((r, i) => ({ asset: r.asset, level: r.level, status: r.status, server_sha256: r.server_sha256, frame_id: saved[i]!.id, verified_at: saved[i]!.verified_at, quality: r.quality })),
    },
  }
}

const HOSTS = ['sentinel-cogs.s3.us-west-2.amazonaws.com', 'e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com']
const allowed = (href: unknown) => {
  try {
    const u = new URL(String(href))
    return u.protocol === 'https:' && (HOSTS.includes(u.hostname) || u.hostname.endsWith('.blob.core.windows.net'))
  } catch {
    return false
  }
}

export function parseStacItem(raw: unknown, collection: Collection): ItemLite | null {
  const r = raw as { id?: unknown; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown }; assets?: Record<string, Record<string, unknown>> } | null
  if (!r?.properties || !r.assets || typeof r.id !== 'string' || !ID_RE.test(r.id)) return null
  const p = r.properties
  const code = typeof p['proj:code'] === 'string' ? (p['proj:code'] as string) : ''
  const epsg = typeof p['proj:epsg'] === 'number' ? (p['proj:epsg'] as number) : code.startsWith('EPSG:') ? Number(code.slice(5)) : NaN
  const asset = (a: Record<string, unknown> | undefined): AssetLite | null => {
    const t = (a?.['proj:transform'] ?? p['proj:transform']) as number[] | undefined
    const s = (a?.['proj:shape'] ?? p['proj:shape']) as number[] | undefined
    return a && allowed(a.href) && Array.isArray(t) && t.length >= 6 && Array.isArray(s) && s.length === 2 ? { href: String(a.href), transform: t.slice(0, 6), shape: [s[0]!, s[1]!] } : null
  }
  const visual = asset(r.assets.visual)
  const scl = asset(r.assets.scl ?? r.assets.SCL)
  const datetime = typeof p.datetime === 'string' ? p.datetime : ''
  const g = r.geometry
  const footprint = g?.type === 'Polygon' ? [(g.coordinates as LonLat[][])[0]!] : g?.type === 'MultiPolygon' ? (g.coordinates as LonLat[][][]).map((x) => x[0]!) : null
  if (!Number.isFinite(epsg) || !visual || !scl || Number.isNaN(Date.parse(datetime)) || !footprint) return null
  return { id: r.id, collection, datetime, epsg, baseline: typeof p['s2:processing_baseline'] === 'string' ? (p['s2:processing_baseline'] as string) : null, footprint, visual, scl }
}
```

- [ ] **Step 4: Run the Deno tests**

Run: `npx deno test --config supabase/functions/deno.json -A supabase/functions/verify/handler.test.ts`
Expected: `ok | 9 passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/verify
git commit -m "feat(fn): verify handler re-derives frames, stores verified or mismatch, with Deno tests

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D7: Edge entry points (`verify`, `delete-account`), dev deploy and probe P3 (CPU)

**Files:**
- Create: `supabase/functions/verify/index.ts`, `supabase/functions/delete-account/index.ts`, `supabase/functions/_shared/http.ts`, `scripts/dev-verify-smoke.ts`
- Modify: `docs/ops/probes.md` (P3 function row)

**Interfaces:**
- Consumes: `handleVerify`, `parseStacItem` (D6), `openCogUrl` (shared evidence).
- Produces:
  - `POST /functions/v1/verify` (user JWT).
  - `POST /functions/v1/delete-account` (user JWT; deletes the auth user through the admin API, which cascades all rows).
  - `npm run smoke:verify:dev`.

- [ ] **Step 1: Implement the shared HTTP helpers and both functions**

`supabase/functions/_shared/http.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

export async function clients(req: Request): Promise<{ user: { id: string } | null; asUser: SupabaseClient; admin: SupabaseClient }> {
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data } = await asUser.auth.getUser()
  return { user: data.user ? { id: data.user.id } : null, asUser, admin }
}
```

`supabase/functions/verify/index.ts`:
```ts
import { openCogUrl } from '../_shared/evidence/cog.ts'
import { clients, CORS, json } from '../_shared/http.ts'
import { handleVerify, parseStacItem, type Collection, type VerifyDeps } from './handler.ts'

const ES = 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/'
const PC = 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/'
const PC_SAS = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a'
let sas: { token: string; until: number } | null = null

async function signed(href: string, collection: Collection): Promise<string> {
  if (collection !== 'pc:sentinel-2-l2a') return href
  if (!sas || sas.until - Date.now() < 60_000) {
    const j = await (await fetch(PC_SAS)).json()
    sas = { token: j.token, until: Date.parse(j['msft:expiry']) }
  }
  return `${href}${href.includes('?') ? '&' : '?'}${sas.token}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'METHOD' })
  const { user, asUser, admin } = await clients(req)
  if (!user) return json(401, { error: 'UNAUTHORIZED' })
  const deps: VerifyDeps = {
    userId: user.id,
    loadInvestigation: async (id) => {
      const { data } = await asUser.from('investigations').select('id, owner, kind, geom_geojson, road_width_m, date_from, date_to').eq('id', id).maybeSingle()
      return data
    },
    // Every frame insert or re-check leaves an audit row, so repeated checks of the same frames still count.
    countRecentFrames: async (uid) => {
      const { count } = await admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('actor', uid).eq('entity', 'frames').gte('at', new Date(Date.now() - 86_400_000).toISOString())
      return count ?? 0
    },
    fetchItem: async (collection, id) => {
      const r = await fetch(`${collection === 'pc:sentinel-2-l2a' ? PC : ES}${encodeURIComponent(id)}`)
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`STAC_${r.status}`)
      return parseStacItem(await r.json(), collection)
    },
    headAsset: async (href) => {
      const r = await fetch(href, { method: 'HEAD', headers: { 'x-amz-checksum-mode': 'ENABLED' } })
      const pick = (k: string) => r.headers.get(k) ?? ''
      return Object.fromEntries(Object.entries({ etag: pick('etag'), last_modified: pick('last-modified'), crc64nvme: pick('x-amz-checksum-crc64nvme') }).filter(([, v]) => v))
    },
    openCog: async (href, collection) => openCogUrl(await signed(href, collection)),
    saveFrames: async (rows) => {
      const now = new Date().toISOString()
      const { data, error } = await admin.from('frames').upsert(rows.map((r) => ({ ...r, verified_at: now })), { onConflict: 'investigation_id,item_id,asset,level' }).select('id, verified_at')
      if (error) throw new Error(error.message)
      return data
    },
  }
  try {
    const r = await handleVerify(deps, await req.json().catch(() => null))
    return json(r.status, r.body)
  } catch (e) {
    const msg = (e as Error).message
    return json(msg.includes('GS:LIMIT_FRAMES') ? 422 : 500, { error: msg.includes('GS:') ? msg.slice(msg.indexOf('GS:')) : 'INTERNAL' })
  }
})
```

`supabase/functions/delete-account/index.ts`:
```ts
import { clients, CORS, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'METHOD' })
  const { user, admin } = await clients(req)
  if (!user) return json(401, { error: 'UNAUTHORIZED' })
  await admin.from('audit_log').insert({ actor: user.id, action: 'delete_account', entity: 'users', entity_id: user.id })
  const { error } = await admin.auth.admin.deleteUser(user.id)
  return error ? json(500, { error: 'DELETE_FAILED' }) : json(200, { ok: true })
})
```

In `supabase/config.toml`, add:
```toml
[functions.verify]
verify_jwt = true

[functions.delete-account]
verify_jwt = true
```

- [ ] **Step 2: Type-check and deploy to dev**

```bash
npx deno check --config supabase/functions/deno.json supabase/functions/verify/index.ts supabase/functions/delete-account/index.ts
set -a; . ./.env.local; set +a
npx supabase functions deploy verify --project-ref "$SUPABASE_DEV_REF"
npx supabase functions deploy delete-account --project-ref "$SUPABASE_DEV_REF"
```
Expected: both deploy; the URLs print.

- [ ] **Step 3: Write and run the dev smoke `scripts/dev-verify-smoke.ts` (probe P3, function half)**

```ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogUrl, sha256Hex } from '../src/evidence/index.ts'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!)
let { error } = await sb.auth.signInWithPassword({ email: env.DEV_TEST_EMAIL!, password: env.DEV_TEST_PASSWORD! })
if (error) {
  await sb.auth.signUp({ email: env.DEV_TEST_EMAIL!, password: env.DEV_TEST_PASSWORD! })
  ;({ error } = await sb.auth.signInWithPassword({ email: env.DEV_TEST_EMAIL!, password: env.DEV_TEST_PASSWORD! }))
  if (error) throw error
}
const ring: [number, number][] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]
const ewkt = `SRID=4326;POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(',')}))`
const { data: inv, error: e1 } = await sb.from('investigations').insert({ name: 'smoke', kind: 'site', geom: ewkt, date_from: '2026-01-01', date_to: '2026-05-31' }).select('id').single()
if (e1) throw e1
const item = await (await fetch('https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_44QLJ_20260512_0_L2A')).json()
const frames = []
for (const [key, asset, level, samples] of [['scl', 'scl', 0, [0]], ['visual', 'visual', 0, [0, 1, 2]]] as const) {
  const a = { transform: item.assets[key]['proj:transform'], shape: item.assets[key]['proj:shape'] }
  const cog = await openCogUrl(item.assets[key].href)
  const lvl = levelInfoFor(a, cog, level)
  const window = aoiPixelWindow(aoiPointsUtm({ kind: 'site', rings: [ring] }, item.properties['proj:epsg']), lvl, 2)!.clamped
  frames.push({ asset, level, window, sha256: await sha256Hex(await cog.read(level, window, [...samples])) })
}
const t0 = Date.now()
const { data, error: e2 } = await sb.functions.invoke('verify', { body: { investigation_id: inv.id, item: { collection: 'sentinel-2-l2a', id: item.id }, frames } })
console.log(JSON.stringify({ ms: Date.now() - t0, error: e2?.message ?? null, statuses: data?.frames?.map((f: { status: string }) => f.status), quality: data?.frames?.[0]?.quality?.label }))
await sb.from('investigations').delete().eq('id', inv.id)
```
`package.json`: `"smoke:verify:dev": "tsx scripts/dev-verify-smoke.ts"`.

Run: `npm run smoke:verify:dev`
Expected: JSON with `"statuses":["verified","verified"]`, no error, and `ms` recorded.

Record P3 in `docs/ops/probes.md`:
- the elapsed time;
- any `WORKER_LIMIT`, CPU or memory errors from Dashboard → Edge Functions → verify → Logs.

Pass means no resource errors. If it fails on CPU, apply spec §13 row 2 (verify SCL and level-1 frames only, or move verify to Cloudflare Workers Paid), and ask the user before any paid change.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions scripts/dev-verify-smoke.ts package.json docs/ops/probes.md supabase/config.toml
git commit -m "feat(fn): verify and delete-account edge functions, dev deploy and probe P3 smoke

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D8: Sign-in, save and verify-all in the app

**Files:**
- Create: `src/data/supabase.ts`, `src/data/auth.ts`, `src/data/remote.ts`, `src/data/save.ts`, `src/ui/copy-account.ts`, `src/workbench/SaveBar.tsx`
- Modify:
  - `src/data/investigation.ts`: add `verification?: Record<string, FrameVerification>` and the helpers below.
  - `src/data/useInvestigation.ts`: open saved investigations by server id.
  - `src/workbench/EvidenceViewer.tsx`: per-photo verification badge.
  - `src/screens/Workbench.tsx`: `SaveBar` under the header; saved label; badges.
  - `src/report/provenance.ts` and `src/report/html.ts`: per-frame verification, the report badge and a "Server check" column.
  - `src/ui/copy-flow.ts`: report strings.
  - `.env.e2e`: fake Supabase URL/key.
  - Also create `src/workbench/ConsentDialog.tsx` now (code in D9 Step 3); `SaveBar` needs it.
- Test: `src/data/save.test.ts`, `tests/e2e/save.spec.ts`

**Interfaces:**
- Consumes: `VerifyRequest`/response shapes (D6), `Investigation`, `DateEntry`.
- Produces:
  - `interface FrameVerification { status: 'verified' | 'mismatch'; verifiedAt: string; frameId: string; serverSha256: string }`
  - `verificationKey(date, asset, level): string` (format `${date}:${asset}:${level}`)
  - `setVerification(inv, entries: Record<string, FrameVerification>, now?)`, `setServerId(inv, id, now?)`
  - `verificationFor(inv, date, asset, level, sha256): FrameVerification | null`. A verified record counts only when its server hash equals the hash of the pixels the browser holds now; a mismatch always shows.
  - `getSupabase(): SupabaseClient | null` (null when not configured; storage key `gs-auth`; PKCE)
  - `useSession(): { session: Session | null; ready: boolean }`, `signInWithGoogle(returnTo: string)`, `signOut()`
  - `interface SaveDeps { saveInvestigation(inv): Promise<string>; replaceNotes(serverId, notes): Promise<void>; verify(body): Promise<{ ok: true; frames: VerifyFrameOut[] } | { ok: false; status: number; error: string }>; sleep?(ms): Promise<void> }`
  - `framesToVerify(inv, entries): Array<{ date; item; frames: VerifyFrameIn[] }>`
  - `saveAndVerify(deps, inv, entries, onProgress): Promise<SaveOutcome>`
  - `SaveOutcome = { serverId: string; verification: Record<string, FrameVerification>; verified: number; mismatched: number; failed: number; stoppedBy: string | null }`
  - Remote: `remoteDeps(): SaveDeps`, `loadRemoteInvestigation(id): Promise<Investigation | null>`, `listRemote(): Promise<Array<{ id; name; updated_at }>>`, `deleteRemote(id)`, `deleteAccount()`, `recordConsent(version)`

- [ ] **Step 1: Write the failing unit test `src/data/save.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { framesToVerify, saveAndVerify, type SaveDeps } from './save.ts'
import { newInvestigation, setBeforeAfter, togglePin } from './investigation.ts'
import type { DateEntry } from '../workbench/runner.ts'

const T = new Date('2026-10-05T10:00:00Z')
let inv = newInvestigation({ name: 'Yard', aoi: { kind: 'site', geometry: { type: 'Polygon', coordinates: [[[79.08, 21.14], [79.09, 21.14], [79.09, 21.15], [79.08, 21.14]]] } }, dateFrom: '2025-01-01', dateTo: '2025-12-31' }, T, '00000000-0000-4000-8000-000000000001')
inv = togglePin(setBeforeAfter(inv, '2025-01-10', '2025-12-20', T), '2025-06-15', T)
const entry = (date: string, label: string, opts: { full?: boolean; thumb?: boolean } = {}): DateEntry => ({
  date, status: 'checked', error: null,
  candidate: { date, coversAoi: true, alternates: [], item: { id: `S2_${date}`, collection: 'sentinel-2-l2a' } as never },
  quality: { window: [1, 2, 3, 4], level: 0, sha256: 's'.repeat(64), stats: { label } as never, parts: [] },
  full: opts.full ? ({ window: [5, 6, 7, 8], level: 0, sha256: 'f'.repeat(64) } as never) : null,
  thumb: opts.thumb ? ({ window: [9, 9, 10, 10], level: 1, sha256: 't'.repeat(64) } as never) : null,
})
const ENTRIES = [entry('2025-01-10', 'CLEAR', { full: true, thumb: true }), entry('2025-06-15', 'OBSCURED'), entry('2025-12-20', 'CLEAR', { full: true, thumb: true })]

describe('framesToVerify', () => {
  it('sends SCL for every pinned date plus the best photo the browser holds', () => {
    expect(framesToVerify(inv, ENTRIES).map((x) => [x.date, x.frames.map((f) => `${f.asset}${f.level}`)])).toEqual([
      ['2025-01-10', ['scl0', 'visual0']],
      ['2025-06-15', ['scl0']],
      ['2025-12-20', ['scl0', 'visual0']],
    ])
  })
})

describe('saveAndVerify', () => {
  const ok = (body: { frames: Array<{ asset: string; level: number }> }) => ({ ok: true as const, frames: body.frames.map((f) => ({ ...f, status: 'verified' as const, server_sha256: 'x'.repeat(64), frame_id: `id-${f.asset}`, verified_at: '2026-10-05T10:00:00Z', quality: null })) })
  it('saves, replaces notes, verifies each pinned date and reports progress', async () => {
    const progress: number[] = []
    const deps: SaveDeps = { saveInvestigation: vi.fn().mockResolvedValue('srv-1'), replaceNotes: vi.fn().mockResolvedValue(undefined), verify: vi.fn().mockImplementation(async (b) => ok(b)), sleep: async () => {} }
    const out = await saveAndVerify(deps, inv, ENTRIES, (p) => progress.push(p.done))
    expect(out).toMatchObject({ serverId: 'srv-1', verified: 5, mismatched: 0, failed: 0, stoppedBy: null })
    expect(out.verification['2025-01-10:visual:0']).toMatchObject({ status: 'verified', frameId: 'id-visual' })
    expect(progress.at(-1)).toBe(3)
  })
  it('retries 502 three times, then counts the date as failed and continues', async () => {
    const verify = vi.fn().mockImplementation(async (b) => (b.item.id === 'S2_2025-06-15' ? { ok: false, status: 502, error: 'UPSTREAM' } : ok(b)))
    const out = await saveAndVerify({ saveInvestigation: async () => 'srv', replaceNotes: async () => {}, verify, sleep: async () => {} }, inv, ENTRIES, () => {})
    expect(verify.mock.calls.filter(([b]) => b.item.id === 'S2_2025-06-15')).toHaveLength(3)
    expect(out).toMatchObject({ verified: 4, failed: 1 })
  })
  it('stops at the daily limit and keeps what was verified', async () => {
    const verify = vi.fn().mockImplementation(async (b) => (b.item.id === 'S2_2025-12-20' ? { ok: false, status: 429, error: 'RATE_LIMITED' } : ok(b)))
    const out = await saveAndVerify({ saveInvestigation: async () => 'srv', replaceNotes: async () => {}, verify, sleep: async () => {} }, inv, ENTRIES, () => {})
    expect(out.stoppedBy).toBe('RATE_LIMITED')
    expect(Object.keys(out.verification)).toContain('2025-01-10:scl:0')
  })
  it('counts mismatches', async () => {
    const verify = vi.fn().mockImplementation(async (b) => ({ ok: true, frames: b.frames.map((f: { asset: string; level: number }) => ({ ...f, status: 'mismatch', server_sha256: 'y'.repeat(64), frame_id: 'm', verified_at: 'now', quality: null })) }))
    const out = await saveAndVerify({ saveInvestigation: async () => 'srv', replaceNotes: async () => {}, verify, sleep: async () => {} }, inv, ENTRIES, () => {})
    expect(out.mismatched).toBe(5)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/data/save.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Extend the model and implement `src/data/save.ts`**

In `src/data/investigation.ts`, add this field to the `Investigation` interface after `claim`:
```ts
  /** Server verification per frame, keyed by verificationKey(); present once saved. */
  verification?: Record<string, FrameVerification>
```
Then append:
```ts
export interface FrameVerification { status: 'verified' | 'mismatch'; verifiedAt: string; frameId: string; serverSha256: string }
export const verificationKey = (date: string, asset: 'visual' | 'scl', level: number) => `${date}:${asset}:${level}`
export const setVerification = (inv: Investigation, v: Record<string, FrameVerification>, now = new Date()): Investigation => ({ ...inv, verification: { ...(inv.verification ?? {}), ...v }, updatedAt: iso(now) })
export const setServerId = (inv: Investigation, id: string, now = new Date()): Investigation => ({ ...inv, serverId: id, updatedAt: iso(now) })

/** A "verified" record counts only for the exact pixels the browser holds now (same server hash); a mismatch always shows. */
export function verificationFor(inv: Investigation, date: string, asset: 'visual' | 'scl', level: number, sha256: string): FrameVerification | null {
  const v = inv.verification?.[verificationKey(date, asset, level)]
  return v && (v.status === 'mismatch' || v.serverSha256 === sha256) ? v : null
}
```

`src/data/save.ts`:
```ts
import { verificationKey, type FrameVerification, type Investigation, type Note } from './investigation.ts'
import type { DateEntry } from '../workbench/runner.ts'
import type { S2Item } from '../stac/types.ts'

export interface VerifyFrameIn { asset: 'visual' | 'scl'; level: 0 | 1; window: [number, number, number, number]; sha256: string }
export interface VerifyFrameOut { asset: 'visual' | 'scl'; level: 0 | 1; status: 'verified' | 'mismatch'; server_sha256: string; frame_id: string; verified_at: string; quality: unknown }
export interface VerifyBody { investigation_id: string; item: { collection: S2Item['collection']; id: string }; frames: VerifyFrameIn[] }
export interface SaveDeps {
  saveInvestigation(inv: Investigation): Promise<string>
  replaceNotes(serverId: string, notes: Note[]): Promise<void>
  verify(body: VerifyBody): Promise<{ ok: true; frames: VerifyFrameOut[] } | { ok: false; status: number; error: string }>
  sleep?(ms: number): Promise<void>
}
export interface SaveProgress { total: number; done: number }
export interface SaveOutcome { serverId: string; verification: Record<string, FrameVerification>; verified: number; mismatched: number; failed: number; stoppedBy: string | null }

export function framesToVerify(inv: Investigation, entries: DateEntry[]): Array<{ date: string; item: S2Item; frames: VerifyFrameIn[] }> {
  return entries
    .filter((e) => inv.pinned.includes(e.date) && e.quality)
    .map((e) => {
      const frames: VerifyFrameIn[] = [{ asset: 'scl', level: 0, window: e.quality!.window, sha256: e.quality!.sha256 }]
      // Same rule as the report and provenance: the best photo the browser holds (10 m before 20 m).
      const visual = e.full ?? e.thumb
      if (visual) frames.push({ asset: 'visual', level: visual.level, window: visual.window, sha256: visual.sha256 })
      return { date: e.date, item: e.candidate.item, frames }
    })
}

const BACKOFF = [1000, 3000]

export async function saveAndVerify(deps: SaveDeps, inv: Investigation, entries: DateEntry[], onProgress: (p: SaveProgress) => void): Promise<SaveOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const serverId = await deps.saveInvestigation(inv)
  await deps.replaceNotes(serverId, inv.notes)
  const jobs = framesToVerify(inv, entries)
  const out: SaveOutcome = { serverId, verification: {}, verified: 0, mismatched: 0, failed: 0, stoppedBy: null }
  onProgress({ total: jobs.length, done: 0 })
  for (const [i, job] of jobs.entries()) {
    let result: Awaited<ReturnType<SaveDeps['verify']>> | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await deps.verify({ investigation_id: serverId, item: { collection: job.item.collection, id: job.item.id }, frames: job.frames })
      if (result.ok || ![502, 503, 504].includes(result.status)) break
      if (attempt < 2) await sleep(BACKOFF[attempt]!)
    }
    if (result?.ok) {
      for (const f of result.frames) {
        out.verification[verificationKey(job.date, f.asset, f.level)] = { status: f.status, verifiedAt: f.verified_at, frameId: f.frame_id, serverSha256: f.server_sha256 }
        if (f.status === 'verified') out.verified++
        else out.mismatched++
      }
    } else if (result && result.status === 429) {
      out.stoppedBy = 'RATE_LIMITED'
      onProgress({ total: jobs.length, done: i })
      break
    } else {
      out.failed++
    }
    onProgress({ total: jobs.length, done: i + 1 })
  }
  return out
}
```

- [ ] **Step 4: Implement the Supabase client, auth, remote calls and copy**

`src/config.ts`: no change needed; it already exposes `supabaseUrl` and `supabaseKey`.

`src/data/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config.ts'

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseKey) return null
  return (client ??= createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, storageKey: 'gs-auth' },
  }))
}
```

`src/data/auth.ts`:
```ts
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { getSupabase } from './supabase.ts'

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) { setReady(true); return }
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, ready }
}

export async function signInWithGoogle(returnTo: string) {
  await getSupabase()?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}${returnTo}`, scopes: 'openid email profile' } })
}

export async function signOut() {
  await getSupabase()?.auth.signOut()
}
```

`src/data/remote.ts`:
```ts
import { getSupabase } from './supabase.ts'
import type { Investigation, Note } from './investigation.ts'
import type { SaveDeps, VerifyBody } from './save.ts'

const ewkt = (inv: Investigation) =>
  inv.aoi.kind === 'site'
    ? `SRID=4326;POLYGON((${inv.aoi.geometry.coordinates[0]!.map(([x, y]) => `${x} ${y}`).join(',')}))`
    : `SRID=4326;LINESTRING(${inv.aoi.geometry.coordinates.map(([x, y]) => `${x} ${y}`).join(',')})`

const row = (inv: Investigation) => ({
  name: inv.name, before_date: inv.before, after_date: inv.after, pinned: inv.pinned,
  claim_text: inv.claim?.text ?? null, claim_date: inv.claim?.date ?? null, claim_criterion: inv.claim?.criterion ?? null,
})

export function remoteDeps(): SaveDeps {
  const sb = getSupabase()!
  return {
    async saveInvestigation(inv) {
      if (inv.serverId) {
        const { data, error } = await sb.from('investigations').update(row(inv)).eq('id', inv.serverId).select('id')
        if (error) throw new Error(error.message)
        if (data.length) return inv.serverId
        // Deleted on another device: fall through and save it again as a new row.
      }
      const { data, error } = await sb.from('investigations')
        .insert({ ...row(inv), kind: inv.aoi.kind, geom: ewkt(inv), road_width_m: inv.aoi.kind === 'road' ? inv.aoi.widthM : null, date_from: inv.dateFrom, date_to: inv.dateTo })
        .select('id').single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    async replaceNotes(serverId: string, notes: Note[]) {
      const del = await sb.from('annotations').delete().eq('investigation_id', serverId)
      if (del.error) throw new Error(del.error.message)
      if (!notes.length) return
      const ins = await sb.from('annotations').insert(notes.map((n) => ({ investigation_id: serverId, kind: n.kind, body: n.body, frame_date: n.date, section_idx: n.sectionIdx, created_at: n.createdAt })))
      if (ins.error) throw new Error(ins.error.message)
    },
    async verify(body: VerifyBody) {
      const { data, error } = await sb.functions.invoke('verify', { body })
      if (!error) return { ok: true as const, frames: data.frames }
      const res = (error as { context?: Response }).context
      const status = res?.status ?? 502
      const payload = res ? await res.json().catch(() => ({})) : {}
      return { ok: false as const, status, error: (payload as { error?: string }).error ?? 'UNKNOWN' }
    },
  }
}

export async function loadRemoteInvestigation(id: string): Promise<Investigation | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: r } = await sb.from('investigations').select('id, name, kind, geom_geojson, road_width_m, date_from, date_to, before_date, after_date, pinned, claim_text, claim_date, claim_criterion, created_at, updated_at').eq('id', id).maybeSingle()
  if (!r) return null
  const [{ data: notes }, { data: frames }] = await Promise.all([
    sb.from('annotations').select('id, kind, body, frame_date, section_idx, created_at, updated_at').eq('investigation_id', id).order('created_at'),
    sb.from('frames').select('id, frame_date, asset, level, status, server_sha256, verified_at').eq('investigation_id', id),
  ])
  const aoi = r.kind === 'site'
    ? { kind: 'site' as const, geometry: { type: 'Polygon' as const, coordinates: r.geom_geojson.coordinates } }
    : { kind: 'road' as const, geometry: { type: 'LineString' as const, coordinates: r.geom_geojson.coordinates }, widthM: r.road_width_m }
  return {
    id: r.id, serverId: r.id, name: r.name, aoi, dateFrom: r.date_from, dateTo: r.date_to, before: r.before_date, after: r.after_date, pinned: r.pinned ?? [],
    claim: r.claim_text ? { text: r.claim_text, date: r.claim_date, criterion: r.claim_criterion ?? '' } : null,
    notes: (notes ?? []).map((n) => ({ id: n.id, kind: n.kind, body: n.body, date: n.frame_date, sectionIdx: n.section_idx, createdAt: n.created_at, updatedAt: n.updated_at })),
    verification: Object.fromEntries((frames ?? []).map((f) => [`${f.frame_date}:${f.asset}:${f.level}`, { status: f.status, verifiedAt: f.verified_at, frameId: f.id, serverSha256: f.server_sha256 }])),
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function listRemote() {
  const { data } = (await getSupabase()?.from('investigations').select('id, name, updated_at').order('updated_at', { ascending: false })) ?? { data: null }
  return data ?? []
}
export async function deleteRemote(id: string) {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('investigations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
export async function recordConsent(version: string) {
  await getSupabase()?.rpc('record_consent', { version })
}
export async function deleteAccount() {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.functions.invoke('delete-account', { body: {} })
  if (error) throw new Error('DELETE_FAILED')
  await sb.auth.signOut()
}
```

`src/ui/copy-account.ts`:
```ts
export const account = {
  signIn: 'Sign in with Google',
  signOut: 'Sign out',
  menu: 'Account',
  mine: 'My investigations',
  none: 'Nothing saved yet.',
  save: 'Save and verify',
  savedLabel: 'Saved to your account',
  saving: (done: number, total: number) => `Verifying ${done} of ${total} dates`,
  saved: (verified: number, at: string) => `Saved · ${verified} frames verified · ${at}`,
  mismatched: (n: number) => `${n} frame${n === 1 ? '' : 's'} did not match the source file. It is shown as unverified.`,
  failed: (n: number) => `${n} date${n === 1 ? '' : 's'} could not be checked. Save again to retry.`,
  limited: 'Daily verification limit reached. The rest will verify when you save again tomorrow.',
  saveFailed: 'Could not save. Your work is still in this browser.',
  verifiedBadge: (at: string) => `Verified · ${at}`,
  mismatchBadge: 'Did not match the source',
  notConfigured: 'Saving is not available on this copy of GrahSaboot.',
  consent: {
    title: 'Before you save',
    intro: 'Saving stores your outline, dates, notes and claim with your Google name and email, so you can open them on any device.',
    points: [
      'We read satellite photos from public files; we never send your name or email to them.',
      'Each saved photo is re-checked by our server against the public source file.',
      'We keep a log of actions with IDs only, for one year, for security.',
      'You can delete any investigation, or your whole account, at any time. We delete saved data 12 months after your last sign-in.',
    ],
    age: 'I am 18 or older.',
    agree: 'Agree and save',
    privacy: 'Read the privacy notice',
  },
  delete: {
    investigation: 'Delete investigation',
    confirmInvestigation: 'Delete this investigation from this browser and from your account? This cannot be undone.',
    account: 'Delete my account and data',
    confirmAccount: 'Delete your account and everything saved with it? This cannot be undone.',
    confirm: 'Delete',
    cancel: 'Keep',
    done: 'Deleted.',
    failed: 'Could not delete. Check your connection and try again.',
  },
}
```

- [ ] **Step 5: Wire `SaveBar`, verification badges, server loading, provenance and the report**

`src/workbench/ConsentDialog.tsx`: create it now with the code in Task D9 Step 3. `SaveBar` imports it; D9 adds its tests.

`src/workbench/SaveBar.tsx`. After Google sign-in it returns with `?save=1` and continues the save the user asked for, once:
```tsx
import { useEffect, useRef, useState } from 'react'
import { setServerId, setVerification, type Investigation } from '../data/investigation.ts'
import { signInWithGoogle, useSession } from '../data/auth.ts'
import { recordConsent, remoteDeps } from '../data/remote.ts'
import { saveAndVerify, type SaveOutcome } from '../data/save.ts'
import { getSupabase } from '../data/supabase.ts'
import { fmtDate } from '../lib/format.ts'
import { account } from '../ui/copy-account.ts'
import { Button } from '../ui/kit.tsx'
import type { DateEntry } from './runner.ts'
import { ConsentDialog, hasConsent, storeConsent } from './ConsentDialog.tsx'

export function SaveBar({ inv, entries, update }: { inv: Investigation; entries: DateEntry[]; update: (fn: (i: Investigation) => Investigation) => void }) {
  const { session, ready } = useSession()
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null)
  const [failed, setFailed] = useState(false)
  const [asking, setAsking] = useState(false)
  const resumed = useRef(false)

  const run = async () => {
    setFailed(false)
    setBusy({ done: 0, total: 0 })
    try {
      const out = await saveAndVerify(remoteDeps(), inv, entries, setBusy)
      update((i) => setVerification(setServerId(i, out.serverId), out.verification))
      setOutcome(out)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }
  const start = () => {
    if (!session) return void signInWithGoogle(`${location.pathname}?save=1`)
    if (!hasConsent()) return setAsking(true)
    void run()
  }

  // Back from Google sign-in with ?save=1: continue the save the user asked for, once.
  useEffect(() => {
    if (resumed.current || !session || new URLSearchParams(location.search).get('save') !== '1') return
    resumed.current = true
    history.replaceState(history.state, '', location.pathname)
    start()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!getSupabase()) return <p className="text-sm text-fg-2">{account.notConfigured}</p>
  return (
    <div className="grid gap-2" aria-live="polite">
      <Button variant="primary" disabled={!ready || !!busy} onClick={start}>
        {busy ? account.saving(busy.done, busy.total) : account.save}
      </Button>
      {outcome && <p className="text-sm text-fg-2">{account.saved(outcome.verified, fmtDate(new Date().toISOString().slice(0, 10)))}</p>}
      {outcome && outcome.mismatched > 0 && <p className="text-sm text-warn">{account.mismatched(outcome.mismatched)}</p>}
      {outcome && outcome.failed > 0 && <p className="text-sm text-warn">{account.failed(outcome.failed)}</p>}
      {outcome?.stoppedBy === 'RATE_LIMITED' && <p className="text-sm text-warn">{account.limited}</p>}
      {failed && <p role="alert" className="text-sm text-bad">{account.saveFailed}</p>}
      <ConsentDialog
        open={asking}
        onOpenChange={setAsking}
        onAgree={async () => {
          setAsking(false)
          storeConsent()
          await recordConsent('v1')
          void run()
        }}
      />
    </div>
  )
}
```

`src/data/useInvestigation.ts` (replace the file). "My investigations" links open saved work by server id; the hook reuses this browser's copy, otherwise it fetches the investigation and keeps a local copy:
```ts
import { useCallback, useEffect, useState } from 'react'
import { InvestigationError, type Investigation } from './investigation.ts'
import { loadRemoteInvestigation } from './remote.ts'
import { getStore } from './store.ts'

export function useInvestigation(id: string) {
  const [inv, setInv] = useState<Investigation | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setInv(undefined)
    void (async () => {
      const store = getStore()
      // Saved investigations open by server id (from "My investigations"): reuse this browser's copy, else fetch and keep one.
      let v = (await store.get(id)) ?? (await store.list()).find((i) => i.serverId === id)
      if (!v && !id.startsWith('local-')) {
        v = (await loadRemoteInvestigation(id).catch(() => null)) ?? undefined
        if (v) await store.put(v)
      }
      if (live) setInv(v ?? null)
    })()
    return () => { live = false }
  }, [id])
  const update = useCallback((fn: (i: Investigation) => Investigation) => {
    setInv((prev) => {
      if (!prev) return prev
      try {
        const next = fn(prev)
        if (next !== prev) void getStore().put(next)
        setError(null)
        return next
      } catch (e) {
        if (e instanceof InvestigationError) { setError(e.message); return prev }
        throw e
      }
    })
  }, [])
  return { inv, update, error }
}
```

`src/workbench/EvidenceViewer.tsx`, three edits:
1. Add the imports:
```tsx
import type { FrameVerification } from '../data/investigation.ts'
import { account } from '../ui/copy-account.ts'
```
2. Replace the `Slot` type:
```tsx
export type Slot = { date: string; frame: FrameResult | null; stats: QualityStats | null; verification?: FrameVerification | null } | null
```
3. In `Caption`, directly after `{slot.stats && <QualityTag label={slot.stats.label} />}`, add:
```tsx
      {slot.verification && (
        <span className={slot.verification.status === 'verified' ? 'text-ok' : 'text-warn'}>
          {slot.verification.status === 'verified' ? account.verifiedBadge(fmtDate(slot.verification.verifiedAt.slice(0, 10))) : account.mismatchBadge}
        </span>
      )}
```

`src/screens/Workbench.tsx`, four edits:
1. Imports: change the investigation import to `import { setBeforeAfter, togglePin, verificationFor, type Investigation } from '../data/investigation.ts'`, and add `import { account } from '../ui/copy-account.ts'` and `import { SaveBar } from '../workbench/SaveBar.tsx'`.
2. Replace the module-level `slot` helper. A badge shows only for the exact pixels on screen:
```tsx
const slot = (inv: Investigation, e: DateEntry | undefined): Slot =>
  e ? { date: e.date, frame: e.full, stats: e.quality?.stats ?? null, verification: e.full ? verificationFor(inv, e.date, 'visual', e.full.level, e.full.sha256) : null } : null
```
   Then render `<EvidenceViewer before={slot(inv, beforeEntry)} after={slot(inv, afterEntry)} grid={grid} invalid={invalid} />`.
3. The header micro-label shows the saved state: `<MicroLabel>{inv.serverId ? account.savedLabel : flow.workbench.notSaved}</MicroLabel>`.
4. Directly after `</header>`, render `<SaveBar inv={inv} entries={entries} update={update} />`.

`src/report/provenance.ts` (replace the file). Each frame carries its own verification record, or `null`:
```ts
import { verificationFor, type Investigation } from '../data/investigation.ts'
import { RECIPES } from '../evidence/types.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { copy } from '../ui/copy.ts'
import type { DateEntry } from '../workbench/runner.ts'

export interface ProvenanceFrame {
  date: string; collection: string; itemId: string; acquiredAt: string; processingBaseline: string | null
  asset: 'visual' | 'scl'; href: string; level: number; window: [number, number, number, number]
  crs: string; transform: number[]; recipe: string; sha256: string
  verification: null | { status: string; verifiedAt: string; serverSha256: string }
  quality?: unknown
}
export interface Provenance {
  schema: 'grahsaboot.provenance/1'
  generatedAt: string
  app: { name: string; version: string }
  investigation: Record<string, unknown>
  parts: Array<{ idx: number; fromM: number; toM: number }>
  recipes: typeof RECIPES
  frames: ProvenanceFrame[]
  notes: Investigation['notes']
  attribution: string[]
}

const scaled = (t: number[], level: number) => [t[0]! * 2 ** level, t[1]!, t[2]!, t[3]!, t[4]! * 2 ** level, t[5]!]

export function buildProvenance(inv: Investigation, summary: AoiSummary, entries: DateEntry[], appVersion: string, generatedAt = new Date()): Provenance {
  const pinned = entries.filter((e) => inv.pinned.includes(e.date))
  const frames: ProvenanceFrame[] = pinned.flatMap((e) => {
    const it = e.candidate.item
    const base = { date: e.date, collection: it.collection, itemId: it.id, acquiredAt: it.datetime, processingBaseline: it.baseline, crs: `EPSG:${it.epsg}` }
    const check = (asset: 'visual' | 'scl', level: number, sha256: string) => {
      const v = verificationFor(inv, e.date, asset, level, sha256)
      return v ? { status: v.status, verifiedAt: v.verifiedAt, serverSha256: v.serverSha256 } : null
    }
    const out: ProvenanceFrame[] = []
    if (e.quality) out.push({ ...base, verification: check('scl', 0, e.quality.sha256), asset: 'scl', href: it.scl.href, level: 0, window: e.quality.window, transform: it.scl.transform, recipe: RECIPES.scl, sha256: e.quality.sha256, quality: { ...e.quality.stats, parts: e.quality.parts.map((p) => ({ idx: p.idx, label: p.stats.label, clearFraction: p.stats.clearFraction, validFraction: p.stats.validFraction })) } })
    const f = e.full ?? e.thumb
    if (f) out.push({ ...base, verification: check('visual', f.level, f.sha256), asset: 'visual', href: it.visual.href, level: f.level, window: f.window, transform: scaled(it.visual.transform, f.level), recipe: RECIPES.frame, sha256: f.sha256 })
    return out
  })
  const years = [...new Set(pinned.map((e) => Number(e.date.slice(0, 4))))].sort()
  return {
    schema: 'grahsaboot.provenance/1',
    generatedAt: generatedAt.toISOString(),
    app: { name: copy.app.name, version: appVersion },
    investigation: {
      id: inv.id, name: inv.name, kind: inv.aoi.kind, geometry: inv.aoi.geometry, roadWidthM: inv.aoi.kind === 'road' ? inv.aoi.widthM : null,
      dateFrom: inv.dateFrom, dateTo: inv.dateTo, before: inv.before, after: inv.after, pinned: inv.pinned, claim: inv.claim,
    },
    parts: summary.parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM })),
    recipes: RECIPES,
    frames,
    notes: inv.notes,
    attribution: [...years.map((y) => copy.attribution.sentinel(y)), copy.attribution.osm],
  }
}
```

`src/report/html.ts` (replace the file). The badge has three states: not saved, fully verified (with the latest check date), or partly verified. A "Server check" column shows each pinned date:
```ts
import { verificationFor, type Investigation } from '../data/investigation.ts'
import type { QualityStats } from '../evidence/types.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import type { DateEntry } from '../workbench/runner.ts'
import { escapeHtml as e, jsonForHtml } from './escape.ts'
import type { Provenance } from './provenance.ts'

export interface ReportImage { date: string; role: 'before' | 'after'; displayUrl: string; nativeUrl: string; stats: QualityStats | null; sha256: string }

const CSS = `
:root{--bg:#09090b;--panel:#18181b;--line:#27272a;--fg:#f4f4f5;--fg2:#a1a1aa;--accent:#e48444}
[data-theme="light"]{--bg:#fff;--panel:#fafafa;--line:#e4e4e7;--fg:#18181b;--fg2:#52525b;--accent:#a74e1b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 ui-sans-serif,system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 20px}h1{font-size:2.25rem;letter-spacing:-.04em;line-height:1;margin:.5rem 0 1rem}
h2{font-size:.75rem;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:var(--fg2);border-top:1px solid var(--line);padding-top:16px;margin-top:32px}
.mono{font-family:ui-monospace,monospace;font-size:.8rem;color:var(--fg2)}.grid{display:grid;gap:16px}@media(min-width:700px){.two{grid-template-columns:1fr 1fr}}
figure{margin:0}img{width:100%;height:auto;display:block;border:1px solid var(--line)}img.native{width:auto;max-width:100%;image-rendering:pixelated}
table{border-collapse:collapse;width:100%;font-size:.9rem}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left}.note{white-space:pre-wrap;word-break:break-word}
.badge{display:inline-block;border:1px solid var(--line);padding:2px 6px;font-family:ui-monospace,monospace;font-size:.75rem}
details pre{white-space:pre-wrap;word-break:break-all;font-size:.7rem}
@media print{:root,[data-theme="dark"],[data-theme="light"]{--bg:#fff;--panel:#fff;--line:#ccc;--fg:#000;--fg2:#333}main{padding:0}figure,table,tr{break-inside:avoid}details{display:none}}
`

const word = (s: QualityStats | null | undefined) => (s ? copy.quality[s.label].word : '')

/** Server check for one pinned date: every frame it holds verified, any mismatch, or not checked. */
function dateCheck(inv: Investigation, x: DateEntry): { status: 'verified' | 'mismatch' | 'none'; at: string | null } {
  const f = x.full ?? x.thumb
  const held: Array<['visual' | 'scl', number, string]> = []
  if (x.quality) held.push(['scl', 0, x.quality.sha256])
  if (f) held.push(['visual', f.level, f.sha256])
  const vs = held.map(([asset, level, sha]) => verificationFor(inv, x.date, asset, level, sha))
  if (vs.some((v) => v?.status === 'mismatch')) return { status: 'mismatch', at: null }
  if (vs.length && vs.every((v) => v?.status === 'verified')) return { status: 'verified', at: vs.map((v) => v!.verifiedAt).sort().at(-1)! }
  return { status: 'none', at: null }
}

export function buildReportHtml(a: { inv: Investigation; summary: AoiSummary; images: ReportImage[]; entries: DateEntry[]; provenance: Provenance; theme: 'dark' | 'light'; preparedBy: string; generatedAt: Date }): string {
  const { inv, summary: s } = a
  const pinned = a.entries.filter((x) => inv.pinned.includes(x.date))
  const checks = pinned.map((x) => dateCheck(inv, x))
  const latest = checks.map((c) => c.at ?? '').sort().at(-1)
  const badge = !inv.serverId
    ? flow.report.unverified
    : checks.length && checks.every((c) => c.status === 'verified') ? flow.report.verified(fmtDate(latest!.slice(0, 10))) : flow.report.partlyVerified
  const obscured = pinned.filter((x) => x.quality && (x.quality.stats.label === 'OBSCURED' || x.quality.stats.label === 'NOT_COVERED')).length
  const looked = s.kind === 'site' ? flow.outline.summarySite(s.areaKm2, s.extentKm) : flow.outline.summaryRoad(s.lengthKm ?? 0, s.parts.length)
  const fig = (img: ReportImage) => `
    <figure class="grid"><img src="${img.displayUrl}" alt="${e(flow.workbench.photoAlt(img.role === 'before' ? flow.workbench.before : flow.workbench.after, fmtDate(img.date)))}">
    <figcaption class="mono">${e(flow.workbench.caption(fmtDate(img.date), img.stats ? pct(img.stats.clearFraction) : 0))} · <span class="badge">${e(word(img.stats))}</span><br>SHA-256 ${e(img.sha256)}</figcaption></figure>`
  const grid = s.kind === 'road' && pinned.length
    ? `<h2>${e(flow.report.sections.grid)}</h2><table><thead><tr><th>km</th>${pinned.map((x) => `<th>${e(fmtDate(x.date))}</th>`).join('')}</tr></thead><tbody>${s.parts
        .map((p) => `<tr><th>${e(flow.workbench.section(p.fromM, p.toM))}</th>${pinned.map((x) => `<td>${e(word(x.quality?.parts.find((q) => q.idx === p.idx)?.stats))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : ''
  return `<!doctype html>
<html lang="en" data-theme="${a.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(flow.report.title)}: ${e(inv.name)}</title><style>${CSS}</style></head>
<body><main>
<p class="mono">${e(copy.app.name.toUpperCase())} · ${e(flow.report.title.toUpperCase())} · ${e(flow.report.generated)} ${e(a.generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC</p>
<h1>${e(inv.name)}</h1>
${a.preparedBy.trim() ? `<p>${e(flow.report.preparedBy.replace(' (optional)', ''))}: ${e(a.preparedBy.trim())}</p>` : ''}
<p class="badge">${e(badge)}</p>
<h2>${e(flow.report.sections.looked)}</h2>
<p>${e(flow.review.kind[s.kind])} · ${e(looked)} · ${e(flow.review.range(inv.dateFrom, inv.dateTo))}</p>
<h2>${e(flow.report.sections.evidence)}</h2>
<div class="grid two">${a.images.map(fig).join('')}</div>
${a.images.length ? `<p class="mono">${e(flow.report.nativeNote)}</p><div class="grid two">${a.images.map((i) => `<img class="native" src="${i.nativeUrl}" alt="">`).join('')}</div>` : ''}
<h2>${e(flow.report.sections.timeline)}</h2>
<table><thead><tr><th>Date</th><th>View</th><th>Clear</th><th>${e(flow.report.checkColumn)}</th><th>Source</th></tr></thead><tbody>${pinned
    .map((x, i) => `<tr><td>${e(fmtDate(x.date))}</td><td>${e(word(x.quality?.stats))}</td><td>${x.quality ? pct(x.quality.stats.clearFraction) : 0}%</td><td>${e(flow.report.check[checks[i]!.status])}</td><td class="mono">${e(x.candidate.item.id)}</td></tr>`)
    .join('')}</tbody></table>
${grid}
<h2>${e(flow.report.sections.notes)}</h2>
${inv.notes.length ? inv.notes.map((n) => `<p><span class="badge">${e(flow.notes.kinds[n.kind])}</span> ${n.date ? `<span class="mono">${e(fmtDate(n.date))}</span>` : ''}</p><p class="note">${e(n.body)}</p>`).join('') : `<p>${e(flow.report.noNotes)}</p>`}
<h2>${e(flow.report.sections.claim)}</h2>
${inv.claim ? `<p class="note">${e(inv.claim.text)}</p><p class="mono">${e(inv.claim.date ?? '')} · ${e(inv.claim.criterion)}</p>` : `<p>${e(flow.report.noClaim)}</p>`}
<h2>${e(flow.report.sections.gaps)}</h2>
<p>${e(flow.report.obscured(obscured, pinned.length))}</p>
<ul>${copy.pages.limits.items.map((t) => `<li>${e(t)}</li>`).join('')}</ul>
<h2>${e(flow.report.sections.provenance)}</h2>
<details><summary>JSON</summary><pre>${e(JSON.stringify(a.provenance, null, 2))}</pre></details>
<script type="application/json" id="provenance">${jsonForHtml(a.provenance)}</script>
<h2>${e(flow.report.sections.attribution)}</h2>
<p class="mono">${a.provenance.attribution.map(e).join(' · ')}</p>
</main></body></html>`
}
```

`src/ui/copy-flow.ts`, in `flow.report` directly after `unverified`:
```ts
    verified: (date: string) => `Verified ${date}. The GrahSaboot server re-read every pinned photo from its public source file and got the same pixels.`,
    partlyVerified: 'Saved, but not every pinned photo is verified yet. The table shows each date; save again to check the rest.',
    checkColumn: 'Server check',
    check: { verified: 'Verified', mismatch: 'Did not match the source', none: 'Not checked' },
```

`.env.e2e`, append:
```
VITE_SUPABASE_URL=http://127.0.0.1:4300/supabase
VITE_SUPABASE_PUBLISHABLE_KEY=e2e-publishable-key
```

- [ ] **Step 6: Write `tests/e2e/save.spec.ts` (Supabase mocked at the network edge)**

```ts
import { expect, test, type Page } from '@playwright/test'
import { account } from '../../src/ui/copy-account.ts'
import { openFixtureSite, waitForPhotos } from './helpers.ts'

const USER = { id: '00000000-0000-4000-8000-00000000000a', email: 'a@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-10-05T00:00:00Z' }
async function signedIn(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('gs-auth', JSON.stringify({ access_token: 'e2e', refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }))
  }, USER)
}
async function mockSupabase(page: Page, verifyStatus = 'verified') {
  const calls: { verify: any[] } = { verify: [] }
  await page.route('**/supabase/rest/v1/investigations**', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }) }))
  await page.route('**/supabase/rest/v1/annotations**', (r) => r.fulfill({ status: 204, body: '' }))
  await page.route('**/supabase/rest/v1/rpc/record_consent', (r) => r.fulfill({ status: 204, body: '' }))
  await page.route('**/supabase/auth/v1/user', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }))
  await page.route('**/supabase/functions/v1/verify', async (r) => {
    const body = r.request().postDataJSON()
    calls.verify.push(body)
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ frames: body.frames.map((f: any) => ({ asset: f.asset, level: f.level, status: verifyStatus, server_sha256: f.sha256, frame_id: `f-${f.asset}`, verified_at: '2026-10-05T10:00:00Z', quality: null })) }) })
  })
  return calls
}

test('signed-in save asks consent once, then verifies every pinned date', async ({ page }) => {
  await signedIn(page)
  const calls = await mockSupabase(page)
  await openFixtureSite(page)
  await waitForPhotos(page)
  await page.getByRole('button', { name: account.save }).click()
  await page.getByLabel(account.consent.age).check()
  await page.getByRole('button', { name: account.consent.agree }).click()
  await expect(page.getByText(/^Saved · 4 frames verified/)).toBeVisible({ timeout: 30_000 })
  expect(calls.verify.map((b) => b.item.id)).toEqual(['S2B_44QKJ_20250110_0_L2A', 'S2B_44QKJ_20251220_0_L2A'])
  expect(calls.verify[0].frames.map((f: any) => `${f.asset}${f.level}`)).toEqual(['scl0', 'visual0'])
  await expect(page.getByText(/^Verified · 20 Dec 2025|^Verified · /).first()).toBeVisible()
  await page.getByRole('button', { name: account.save }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a server mismatch is shown, not hidden', async ({ page }) => {
  await signedIn(page)
  await page.addInitScript(() => localStorage.setItem('gs-consent', 'v1'))
  await mockSupabase(page, 'mismatch')
  await openFixtureSite(page)
  await waitForPhotos(page)
  await page.getByRole('button', { name: account.save }).click()
  await expect(page.getByText(account.mismatched(4))).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(account.mismatchBadge).first()).toBeVisible()
})

test('signed-out save starts Google sign-in and keeps local work', async ({ page }) => {
  let authorize = ''
  await page.route('**/supabase/auth/v1/authorize**', (r) => { authorize = r.request().url(); return r.fulfill({ status: 200, body: 'ok' }) })
  await openFixtureSite(page)
  const url = page.url()
  await page.getByRole('button', { name: account.save }).click()
  await expect.poll(() => authorize).toContain('provider=google')
  expect(decodeURIComponent(authorize)).toContain(`${new URL(url).pathname}?save=1`)
})
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/data && npm run check && npm run e2e -- save`
Expected: save unit 5 PASS; save E2E 3 green, and every earlier E2E test still green (the header now shows "Sign in with Google", because `.env.e2e` configures a fake Supabase). The stored-session shape in `signedIn()` was checked against supabase-js 2.117.2; if a newer version stores it differently, adapt only `signedIn()` after reading the `@supabase/auth-js` storage code, and note it in the commit.

- [ ] **Step 8: Commit**

```bash
git add src tests/e2e .env.e2e
git commit -m "feat(account): Google sign-in, save and verify-all with retries, verification badges and server loading

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D9: Consent, privacy notice, account menu, deletions

**Files:**
- Create: `src/workbench/ConsentDialog.tsx` (if not already created in D8), `src/ui/AccountMenu.tsx`, `src/ui/MyInvestigations.tsx`
- Modify:
  - `src/ui/Shell.tsx`: account menu when signed in; sign-in button otherwise (lazy-loaded, so supabase-js stays out of the entry bundle).
  - `src/screens/GlobeScreen.tsx`: "My investigations" list when signed in.
  - `src/screens/Workbench.tsx`: "Delete investigation".
  - `src/screens/KitScreen.tsx`: the consent dialog on `?consent=1` (dev-only screen, for the test).
  - `src/ui/copy.ts`: final privacy text with the grievance contact placeholder → **user supplies the contact**.
- Test: `tests/e2e/account.spec.ts`

**Interfaces:**
- Produces: `ConsentDialog({ open, onOpenChange, onAgree })`, `hasConsent()`, `storeConsent()` (localStorage `gs-consent` = `v1`), `AccountMenu` (default export), `MyInvestigations`.

- [ ] **Step 1: Ask the user for the grievance contact**

The DPDP notice needs a named contact and email. Ask the user, and put the answer into `copy.pages.privacy.items` as `Questions or complaints: <name>, <email>. You can also complain to the Data Protection Board of India.` Do not invent a contact.

- [ ] **Step 2: Write `tests/e2e/account.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { account } from '../../src/ui/copy-account.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureSite } from './helpers.ts'

const USER = { id: '00000000-0000-4000-8000-00000000000a', email: 'a@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-10-05T00:00:00Z' }

test('account menu lists saved investigations and deletes the account after confirmation', async ({ page }) => {
  await page.addInitScript((user) => localStorage.setItem('gs-auth', JSON.stringify({ access_token: 'e2e', refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user })), USER)
  await page.route('**/supabase/auth/v1/user', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }))
  await page.route('**/supabase/auth/v1/logout**', (r) => r.fulfill({ status: 204, body: '' }))
  await page.route('**/supabase/rest/v1/investigations**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', name: 'Saved yard', updated_at: '2026-10-05T10:00:00Z' }]) }))
  let deleted = false
  await page.route('**/supabase/functions/v1/delete-account', (r) => { deleted = true; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) })
  await page.goto('/?tier=0')
  await expect(page.getByRole('link', { name: 'Saved yard' })).toHaveAttribute('href', '/i/11111111-1111-4111-8111-111111111111')
  await page.getByRole('button', { name: account.menu }).click()
  await page.getByRole('menuitem', { name: account.delete.account }).click()
  await expect(page.getByText(account.delete.confirmAccount)).toBeVisible()
  await page.getByRole('button', { name: account.delete.confirm }).click()
  await expect.poll(() => deleted).toBe(true)
  await expect(page.getByRole('button', { name: account.signIn })).toBeVisible()
})

test('consent requires the 18+ confirmation', async ({ page }) => {
  await page.goto('/dev/kit')
  await page.evaluate(() => localStorage.removeItem('gs-consent'))
  await page.goto('/dev/kit?consent=1')
  await expect(page.getByRole('button', { name: account.consent.agree })).toBeDisabled()
  await page.getByLabel(account.consent.age).check()
  await expect(page.getByRole('button', { name: account.consent.agree })).toBeEnabled()
})

test('deleting an investigation asks first, then removes it from this browser', async ({ page }) => {
  await openFixtureSite(page)
  const url = page.url()
  await page.getByRole('button', { name: account.delete.investigation }).click()
  await expect(page.getByText(account.delete.confirmInvestigation)).toBeVisible()
  await page.getByRole('button', { name: account.delete.confirm, exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto(url)
  await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
})
```
For the second test, `src/screens/KitScreen.tsx` imports `ConsentDialog` from `../workbench/ConsentDialog.tsx` and renders this just before its `<Sheet>`:
```tsx
      <ConsentDialog open={new URLSearchParams(location.search).get('consent') === '1'} onOpenChange={() => {}} onAgree={() => {}} />
```

- [ ] **Step 3: Implement the consent dialog, account menu and list**

`src/workbench/ConsentDialog.tsx`:
```tsx
import { Dialog } from '@base-ui/react/dialog'
import { useState } from 'react'
import { Link } from '../lib/router.tsx'
import { account } from '../ui/copy-account.ts'
import { Button } from '../ui/kit.tsx'

const KEY = 'gs-consent'
export const hasConsent = () => { try { return localStorage.getItem(KEY) === 'v1' } catch { return false } }
export const storeConsent = () => { try { localStorage.setItem(KEY, 'v1') } catch { /* consent is also recorded server-side */ } }

export function ConsentDialog({ open, onOpenChange, onAgree }: { open: boolean; onOpenChange(o: boolean): void; onAgree(): void }) {
  const [adult, setAdult] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="glass fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 gap-4 p-6">
          <Dialog.Title className="text-xl font-semibold">{account.consent.title}</Dialog.Title>
          <Dialog.Description className="text-fg-2">{account.consent.intro}</Dialog.Description>
          <ul className="grid list-disc gap-2 pl-5 text-sm">{account.consent.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <Link to="/privacy" className="text-sm underline underline-offset-4">{account.consent.privacy}</Link>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="accent-[var(--gs-accent)]" />
            {account.consent.age}
          </label>
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button>{account.delete.cancel}</Button>} />
            <Button variant="primary" disabled={!adult} onClick={onAgree}>{account.consent.agree}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```
If `Dialog.Close` does not accept `render` in Base UI 1.8, wrap a plain `Button` with `onClick={() => onOpenChange(false)}` instead.

`src/ui/AccountMenu.tsx`:
```tsx
import { Menu } from '@base-ui/react/menu'
import { useState } from 'react'
import { signInWithGoogle, signOut, useSession } from '../data/auth.ts'
import { deleteAccount } from '../data/remote.ts'
import { getStore } from '../data/store.ts'
import { getSupabase } from '../data/supabase.ts'
import { navigate } from '../lib/router.tsx'
import { account } from './copy-account.ts'
import { Button } from './kit.tsx'

export default function AccountMenu() {
  const { session, ready } = useSession()
  const [confirming, setConfirming] = useState(false)
  if (!getSupabase() || !ready) return null
  if (!session) return <Button size="sm" variant="ghost" onClick={() => void signInWithGoogle(location.pathname)}>{account.signIn}</Button>
  const removeAll = async () => {
    await deleteAccount()
    const store = getStore()
    for (const inv of await store.list()) if (inv.serverId) await store.remove(inv.id)
    setConfirming(false)
    navigate('/')
  }
  return (
    <>
      <Menu.Root>
        <Menu.Trigger render={<Button size="sm" variant="ghost">{account.menu}</Button>} />
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} className="z-50">
            <Menu.Popup className="glass grid min-w-56 p-1">
              <Menu.Item onClick={() => void signOut()} className="rounded-[6px] px-3 py-2 text-sm data-[highlighted]:bg-line">{account.signOut}</Menu.Item>
              <Menu.Item onClick={() => setConfirming(true)} className="rounded-[6px] px-3 py-2 text-sm text-bad data-[highlighted]:bg-line">{account.delete.account}</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {confirming && (
        <div role="alertdialog" aria-modal="true" aria-label={account.delete.account} className="glass fixed left-1/2 top-24 z-50 grid w-[min(92vw,480px)] -translate-x-1/2 gap-4 p-5">
          <p>{account.delete.confirmAccount}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirming(false)}>{account.delete.cancel}</Button>
            <Button variant="danger" onClick={() => void removeAll()}>{account.delete.confirm}</Button>
          </div>
        </div>
      )}
    </>
  )
}
```
In `src/ui/Shell.tsx`, load the menu lazily so supabase-js stays out of the entry bundle. Change the React import to `import { lazy, Suspense, type ReactNode } from 'react'`, add below the imports:
```tsx
// Lazy, so the Supabase client stays out of the entry bundle.
const AccountMenu = lazy(() => import('./AccountMenu.tsx'))
```
and render it in the `<nav>` just before the theme toggle:
```tsx
          <Suspense fallback={null}><AccountMenu /></Suspense>
```

`src/ui/MyInvestigations.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useSession } from '../data/auth.ts'
import { listRemote } from '../data/remote.ts'
import { Link } from '../lib/router.tsx'
import { account } from './copy-account.ts'
import { Panel } from './kit.tsx'

export function MyInvestigations() {
  const { session } = useSession()
  const [rows, setRows] = useState<Array<{ id: string; name: string; updated_at: string }> | null>(null)
  useEffect(() => { if (session) void listRemote().then(setRows) }, [session])
  if (!session || !rows) return null
  return (
    <Panel title={account.mine}>
      {rows.length === 0 ? <p className="text-sm text-fg-2">{account.none}</p> : (
        <ul className="grid gap-px bg-line">
          {rows.map((r) => <li key={r.id} className="bg-panel"><Link to={`/i/${r.id}`} className="block px-3 py-3 hover:bg-line">{r.name}</Link></li>)}
        </ul>
      )}
    </Panel>
  )
}
```
In `src/screens/GlobeScreen.tsx`, import `MyInvestigations` from `../ui/MyInvestigations.tsx` and render `<MyInvestigations />` directly after the row of links under the search box (before the tier notices).

In `src/screens/Workbench.tsx`, add deletion. The server copy goes first; if that fails, the local copy stays and the dialog says so.
1. Imports: `import { deleteRemote } from '../data/remote.ts'`, `import { getStore } from '../data/store.ts'`, and `navigate` from `../lib/router.tsx` next to `Link`.
2. With the other state hooks: `const [deleting, setDeleting] = useState<'ask' | 'failed' | null>(null)`.
3. After the early returns (next to `invalid`):
```tsx
  const remove = async () => {
    try {
      if (inv.serverId) await deleteRemote(inv.serverId)
      await getStore().remove(inv.id)
      navigate('/')
    } catch {
      setDeleting('failed')
    }
  }
```
4. In the header buttons, after the Report link: `<Button variant="danger" onClick={() => setDeleting('ask')}>{account.delete.investigation}</Button>`.
5. After `<SaveBar … />`:
```tsx
        {deleting && (
          <div role="alertdialog" aria-modal="true" aria-label={account.delete.investigation} className="glass grid gap-4 p-5">
            <p>{deleting === 'failed' ? account.delete.failed : account.delete.confirmInvestigation}</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>{account.delete.cancel}</Button>
              <Button variant="danger" onClick={() => void remove()}>{account.delete.confirm}</Button>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Run tests**

Run: `npm run check && npm run e2e -- account save a11y`
Expected: account 3, save 3 and a11y 4 green on every project; axe passes with the dialog and menu. The bundle check stays green because supabase-js loads lazily with the account menu (about 75 KB gzip entry in validation).

- [ ] **Step 5: Commit**

```bash
git add src tests/e2e
git commit -m "feat(account): consent with 18+ gate, account menu, my investigations, investigation and account deletion

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D10: Hardening (CSP for Supabase, keep-alive, runbooks, README, CI)

**Files:**
- Modify: `public/_headers` (add `https://*.supabase.co` to `connect-src`), `worker/index.ts` (scheduled keep-alive), `wrangler.jsonc` (cron trigger and vars)
- Create: `worker/keepalive.test.ts`, `docs/ops/runbook.md`, `README.md`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: Worker `scheduled()` calls `POST {SUPABASE_URL}/rest/v1/rpc/keep_alive` daily with the publishable key.

- [ ] **Step 1: Write the failing test `worker/keepalive.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { keepAlive } from './index.ts'

describe('keepAlive', () => {
  it('calls the keep_alive RPC with the publishable key', async () => {
    const f = vi.fn().mockResolvedValue(new Response('1'))
    await keepAlive({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk' }, f)
    expect(f).toHaveBeenCalledWith('https://abc.supabase.co/rest/v1/rpc/keep_alive', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ apikey: 'pk' }) }))
  })
  it('does nothing when not configured', async () => {
    const f = vi.fn()
    await keepAlive({}, f)
    expect(f).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement the scheduled handler**

`worker/index.ts` (replace):
```ts
import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
}

export async function keepAlive(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>, f: typeof fetch = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return
  await f(`${env.SUPABASE_URL}/rest/v1/rpc/keep_alive`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => undefined)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname === '/api/tle') return handleTle(req, { fetch, cache: (caches as unknown as { default: TleCache }).default })
    return env.ASSETS.fetch(req)
  },
  async scheduled(_c: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(keepAlive(env))
  },
}
```

`wrangler.jsonc`: add `"triggers": { "crons": ["30 3 * * *"] }` and `"vars": { "SUPABASE_URL": "" }`. The real URL is set per environment at deploy time with `--var SUPABASE_URL:...`, and the key with `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 3: Update `public/_headers`, and write the runbook, README and CI**

In `public/_headers`, append ` https://*.supabase.co` to `connect-src`.

`docs/ops/runbook.md`:
```markdown
# GrahSaboot runbook

## Deploys (user-authorised)
- Database:
  - Dev: `npm run db:push:dev`.
  - Prod: `supabase link --project-ref $SUPABASE_PROD_REF` then `supabase db push --linked`, only after the user says go.
- Functions: `supabase functions deploy verify --project-ref <ref>` and `delete-account`.
- Web: build with the target environment's `VITE_SUPABASE_*`, then run `npx wrangler deploy --var SUPABASE_URL:<url>`.

## Restore
1. Free plan has no managed backups. Take a nightly `supabase db dump --linked -f backups/$(date +%F).sql` on the owner's machine and keep it encrypted.
2. To restore, load the dump into a fresh project.
3. Then re-apply deletions newer than the dump: for each `audit_log` row in the live database with action `delete` on `investigations`/`annotations`/`frames`, or `delete_account` on `users`, after the dump time, delete the same IDs in the restored database. Do this **before** opening access.
4. Verify that no deleted ID reappears.

## Breach (DPDP Rules: notify affected users without delay, Board within 72 hours)
1. Contain: rotate the Supabase service-role key and the Google OAuth secret, and redeploy the functions.
2. Assess: use `audit_log` to find affected IDs and the time window.
3. Notify the affected users by email with what happened, the data involved, what we did and what they can do.
4. Report to the Data Protection Board within 72 hours.
5. Record everything in `docs/ops/incidents/<date>.md`.

## Limits and triggers (spec §13)
Watch the Supabase usage page monthly:
- DB > 400 MB → propose Pro ($25/month) to the user.
- `verify` CPU errors → spec §13 row 2.
```

`README.md`:
```markdown
# GrahSaboot

Satellite proof for any place. Compare dated Sentinel-2 photos of a site or road, check clouds, write notes and export an evidence report.

- Run: `npm install`, then `npm run dev` (http://127.0.0.1:5173).
- Test: `npm run check` (types, unit, DB and build budget) and `npm run e2e` (Playwright, hermetic fixtures).
- Live probes: `npm run probe` and `npm run e2e:live`.
- Docs:
  - Design: `docs/superpowers/specs/2026-10-05-grahsaboot-design.md`
  - Plan: `docs/superpowers/plans/`
  - Ops: `docs/ops/`
  - Research history: `docs/geoverify/`

Data: Contains modified Copernicus Sentinel data. Map data © OpenStreetMap contributors (OpenFreeMap). NASA GIBS. Search by OpenStreetMap Nominatim.
```

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npx deno test --config supabase/functions/deno.json -A supabase/functions/verify/handler.test.ts
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
        env: { E2E_BROWSERS: chromium }
```

- [ ] **Step 4: Run everything**

Run: `npx vitest run worker && npm run check && npx deno test --config supabase/functions/deno.json -A supabase/functions/verify/handler.test.ts && npm run e2e`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add worker public/_headers wrangler.jsonc docs/ops README.md .github
git commit -m "chore(ops): Supabase CSP, daily keep-alive, restore/breach runbook, README and CI

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task D11: Production launch (each command user-authorised)

**Files:**
- Modify: `docs/ops/deploy.md` (production record), `docs/ops/probes.md` (P4)

- [ ] **Step 1: Pre-flight**

Run: `npm run check && npm run e2e && npm run smoke:verify:dev`
Expected: green. If anything is red, stop.

- [ ] **Step 2: Ask the user to approve each production step, then run them one at a time**

```bash
set -a; . ./.env.local; set +a
npx supabase link --project-ref "$SUPABASE_PROD_REF"            # user enters the prod DB password
npx supabase db push --linked
npx supabase functions deploy verify --project-ref "$SUPABASE_PROD_REF"
npx supabase functions deploy delete-account --project-ref "$SUPABASE_PROD_REF"
VITE_SUPABASE_URL="https://$SUPABASE_PROD_REF.supabase.co" VITE_SUPABASE_PUBLISHABLE_KEY="<prod publishable key>" npm run build
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler deploy --var "SUPABASE_URL:https://$SUPABASE_PROD_REF.supabase.co"
```
After the deploy, relink the CLI to dev (`npx supabase link --project-ref "$SUPABASE_DEV_REF"`) so later dev pushes cannot hit prod by accident.

- [ ] **Step 3: Google OAuth to production (human)**

In Google Auth Platform → Audience, click "Publish app". With basic scopes only, no Google review is required.

**Probe P4:** sign in on production with a Google account that is not a project team member. Record the result in `docs/ops/probes.md`.

- [ ] **Step 4: Production smoke (human-observed)**

On the production URL:
1. The globe loads and the satellites are live.
2. Search for Nagpur.
3. Open the worked example and wait for before/after.
4. Sign in, save and verify; expect "Saved · N frames verified".
5. Download the report and open it offline.
6. Delete the investigation.
7. Check `/api/tle`.

Record each result in `docs/ops/deploy.md`.

- [ ] **Step 5: Tag the release (local only; the user pushes)**

```bash
git tag -a v0.1.0 -m "GrahSaboot v0.1.0: first public launch"
```

- [ ] **Step 6: Commit the records**

```bash
git add docs/ops
git commit -m "docs(ops): production launch record and probe P4

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase D exit criteria

- These are all green:
  - DB tests (PGlite + PostGIS, including RLS isolation);
  - Deno `verify` tests;
  - unit tests;
  - E2E (including mocked save/verify, mismatch and account deletion);
  - the dev smoke, with real data, giving `verified, verified`.
- Probes P3 and P4 are recorded.
- Production is live, with the user having authorised each step.
- The human assignment from spec §15 continues against production.
