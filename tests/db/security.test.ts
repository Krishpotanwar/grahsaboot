import { readdirSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { ewktPolygon, freshDb, SQUARE, USER_A, USER_B, type Db } from './harness.ts'

let db: Db
beforeEach(async () => {
  db = await freshDb()
})

const GHOST = '00000000-0000-4000-8000-0000000000ff' // a user id with no row in auth.users
const HASH = 'a'.repeat(64)

const place = (who: string, name = 'Secret yard') =>
  db.as(
    who,
    `insert into public.investigations (name, kind, geom, date_from, date_to) values ($1, 'site', $2, '2025-01-01', '2025-12-31') returning id`,
    [name, ewktPolygon(SQUARE)],
  )
const mine = async () => (await place(USER_A))[0]!.id
const note = (who: string, investigation: unknown, body = 'a note') =>
  db.as(
    who,
    `insert into public.annotations (investigation_id, kind, body) values ($1, 'change', $2) returning id`,
    [investigation, body],
  )
const frame = (who: string, investigation: unknown, tail = '') =>
  db.as(
    who,
    `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
     values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'verified')${tail}`,
    [investigation, USER_A, HASH],
  )
const inactive = (user: string, months: number) =>
  db.super(`update auth.users set last_sign_in_at = now() - make_interval(months => $2) where id = $1`, [
    user,
    months,
  ])
const count = async (table: string, where = 'true') =>
  (await db.super(`select count(*)::int as n from public.${table} where ${where}`))[0]!.n

describe('row level security', () => {
  it('isolates investigations between users', async () => {
    const id = await mine()
    expect(await db.as(USER_B, `select id from public.investigations`)).toEqual([])
    expect(
      await db.as(USER_B, `update public.investigations set name = 'pwned' where id = $1 returning id`, [id]),
    ).toEqual([])
    expect(await db.as(USER_B, `delete from public.investigations where id = $1 returning id`, [id])).toEqual(
      [],
    )
    // Signed out there is no table privilege at all. Assert that cause: a catch-all would also pass on a typo.
    await expect(db.as('anon', `select id from public.investigations`)).rejects.toThrow(
      /permission denied for table investigations/,
    )
    // The owner still has it, unchanged.
    expect(await db.as(USER_A, `select name from public.investigations where id = $1`, [id])).toEqual([
      { name: 'Secret yard' },
    ])
  })
  it('refuses rows that name another user as owner', async () => {
    const id = await mine()
    await expect(
      db.as(
        USER_B,
        `insert into public.investigations (owner, name, kind, geom, date_from, date_to) values ($1, 'x', 'site', $2, '2025-01-01', '2025-12-31')`,
        [USER_A, ewktPolygon(SQUARE)],
      ),
    ).rejects.toThrow(/row-level security/)
    await expect(
      db.as(
        USER_A,
        `insert into public.annotations (investigation_id, owner, kind, body) values ($1, $2, 'change', 'x')`,
        [id, USER_B],
      ),
    ).rejects.toThrow(/row-level security/)
  })
  it('stops users writing notes into someone else’s investigation', async () => {
    const id = await mine()
    await expect(
      db.as(
        USER_B,
        `insert into public.annotations (investigation_id, kind, body) values ($1, 'change', 'x')`,
        [id],
      ),
    ).rejects.toThrow(/row-level security/)
  })
  it('keeps notes private to their owner', async () => {
    const [n] = await note(USER_A, await mine(), 'mine')
    expect(await db.as(USER_B, `select id from public.annotations`)).toEqual([])
    expect(
      await db.as(USER_B, `update public.annotations set body = 'pwned' where id = $1 returning id`, [n!.id]),
    ).toEqual([])
    expect(await db.as(USER_B, `delete from public.annotations where id = $1 returning id`, [n!.id])).toEqual(
      [],
    )
    expect(await db.as(USER_A, `select body from public.annotations where id = $1`, [n!.id])).toEqual([
      { body: 'mine' },
    ])
    await expect(db.as('anon', `select id from public.annotations`)).rejects.toThrow(
      /permission denied for table annotations/,
    )
  })
  it('lets users read but never write frames', async () => {
    const id = await mine()
    await expect(frame(USER_A, id)).rejects.toThrow(/permission denied for table frames/)
    await frame('service', id)
    expect(await db.as(USER_A, `select count(*)::int as n from public.frames`)).toEqual([{ n: 1 }])
    expect(await db.as(USER_B, `select count(*)::int as n from public.frames`)).toEqual([{ n: 0 }])
    await expect(db.as(USER_A, `update public.frames set status = 'mismatch'`)).rejects.toThrow(
      /permission denied for table frames/,
    )
    await expect(db.as(USER_A, `delete from public.frames`)).rejects.toThrow(
      /permission denied for table frames/,
    )
    await expect(db.as('anon', `select id from public.frames`)).rejects.toThrow(
      /permission denied for table frames/,
    )
  })
  it('lets owners delete an investigation with its frames, and nobody else', async () => {
    const id = await mine()
    await frame('service', id)
    expect(await db.as(USER_B, `delete from public.investigations where id = $1 returning id`, [id])).toEqual(
      [],
    )
    expect(await db.as(USER_A, `delete from public.investigations where id = $1 returning id`, [id])).toEqual(
      [{ id }],
    )
    expect(await db.super(`select count(*)::int as n from public.frames`)).toEqual([{ n: 0 }])
  })
  it('hides the audit log from clients', async () => {
    await mine()
    for (const who of [USER_A, 'anon'])
      for (const sql of [
        `select * from public.audit_log`,
        `insert into public.audit_log (action, entity) values ('x', 'y')`,
        `update public.audit_log set action = 'x'`,
        `delete from public.audit_log`,
      ])
        await expect(db.as(who, sql), `${who}: ${sql}`).rejects.toThrow(
          /permission denied for table audit_log/,
        )
  })
  it('refuses to hand an investigation or a note to someone else, or to move a note, from the client', async () => {
    const id = await mine()
    const [n] = await note(USER_A, id)
    const [b] = await place(USER_B, 'B yard')
    await expect(
      db.as(USER_A, `update public.investigations set owner = $2 where id = $1`, [id, USER_B]),
    ).rejects.toThrow('GS:OWNER_IMMUTABLE')
    await expect(
      db.as(USER_A, `update public.annotations set owner = $2 where id = $1`, [n!.id, USER_B]),
    ).rejects.toThrow('GS:OWNER_IMMUTABLE')
    await expect(
      db.as(USER_A, `update public.annotations set investigation_id = $2 where id = $1`, [n!.id, b!.id]),
    ).rejects.toThrow('GS:NOTE_MOVED')
  })
  it('has row level security on every table and exactly the owner policies', async () => {
    expect(
      await db.super(
        `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm', 'f') order by relname`,
      ),
    ).toEqual([
      { relname: 'annotations', relrowsecurity: true },
      { relname: 'audit_log', relrowsecurity: true },
      { relname: 'frames', relrowsecurity: true },
      { relname: 'investigations', relrowsecurity: true },
    ])
    expect(
      await db.super(
        `select tablename, policyname, cmd, roles::text as roles from pg_policies where schemaname = 'public' order by tablename`,
      ),
    ).toEqual([
      { tablename: 'annotations', policyname: 'annotations_owner', cmd: 'ALL', roles: '{authenticated}' },
      { tablename: 'frames', policyname: 'frames_owner_read', cmd: 'SELECT', roles: '{authenticated}' },
      {
        tablename: 'investigations',
        policyname: 'investigations_owner',
        cmd: 'ALL',
        roles: '{authenticated}',
      },
    ])
  })
})

describe('function privileges', () => {
  it('pins who can execute every function in public, and that each pins its search_path', async () => {
    // Supabase grants every new public function to anon, authenticated and service_role, so this fails for any function a
    // migration forgets to revoke. A new function must be added here on purpose.
    expect(
      await db.super(
        `select p.oid::regprocedure::text as fn,
           concat_ws(' ',
             case when has_function_privilege('public', p.oid, 'execute') then 'public' end,
             case when has_function_privilege('anon', p.oid, 'execute') then 'anon' end,
             case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' end,
             case when has_function_privilege('service_role', p.oid, 'execute') then 'service_role' end) as can
         from pg_proc p where p.pronamespace = 'public'::regnamespace order by p.proname collate "C"`,
      ),
    ).toEqual([
      { fn: 'geom_geojson(investigations)', can: 'authenticated service_role' },
      { fn: 'gs_annotation_guard()', can: 'service_role' },
      { fn: 'gs_audit()', can: '' },
      { fn: 'gs_freeze_on_frame()', can: 'service_role' },
      { fn: 'gs_limit_frames()', can: 'service_role' },
      { fn: 'gs_limit_investigations()', can: 'service_role' },
      { fn: 'gs_limit_notes()', can: 'service_role' },
      { fn: 'gs_touch()', can: 'service_role' },
      { fn: 'gs_validate_investigation()', can: 'service_role' },
      { fn: 'keep_alive()', can: 'anon authenticated service_role' },
      { fn: 'purge_expired()', can: '' },
      { fn: 'record_consent(text)', can: 'authenticated service_role' },
    ])
    expect(
      await db.super(
        `select proname from pg_proc where pronamespace = 'public'::regnamespace and not coalesce(proconfig @> array['search_path=""'], false)`,
      ),
    ).toEqual([])
    // The security-definer set is pinned too: a new one needs a review.
    expect(
      await db.super(
        `select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef order by proname collate "C"`,
      ),
    ).toEqual([
      { proname: 'gs_audit' },
      { proname: 'gs_freeze_on_frame' },
      { proname: 'purge_expired' },
      { proname: 'record_consent' },
    ])
  })
  it('refuses purge_expired to every API role, so nobody can run a purge on demand', async () => {
    await mine()
    await inactive(USER_A, 13)
    for (const who of ['anon', USER_A, 'service'])
      await expect(db.as(who, `select public.purge_expired()`), who).rejects.toThrow(
        /permission denied for function purge_expired/,
      )
    expect(await count('investigations')).toBe(1)
  })
  it('refuses record_consent and geom_geojson to anon and the audit trigger function to everyone', async () => {
    await expect(db.as('anon', `select public.record_consent('v1')`)).rejects.toThrow(
      /permission denied for function record_consent/,
    )
    await expect(db.as('anon', `select public.geom_geojson(null::public.investigations)`)).rejects.toThrow(
      /permission denied for function geom_geojson/,
    )
    for (const who of ['anon', USER_A, 'service'])
      await expect(db.as(who, `select public.gs_audit()`), who).rejects.toThrow(
        /permission denied for function gs_audit/,
      )
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
  it('audits notes, frames and deletes on all three tables, by the acting user, without their content', async () => {
    const id = await mine()
    const [n] = await note(USER_A, id, 'private note text')
    await db.as(USER_A, `update public.annotations set body = 'edited private text' where id = $1`, [n!.id])
    await frame('service', id) // actor falls back to the row owner for service writes; the first frame also freezes the row
    await db.as(USER_A, `delete from public.investigations where id = $1`, [id]) // cascades the note and the frame
    expect(await db.super(`select entity, action from public.audit_log order by entity, action, id`)).toEqual(
      [
        { entity: 'annotations', action: 'delete' },
        { entity: 'annotations', action: 'insert' },
        { entity: 'annotations', action: 'update' },
        { entity: 'frames', action: 'delete' },
        { entity: 'frames', action: 'insert' },
        { entity: 'investigations', action: 'delete' },
        { entity: 'investigations', action: 'insert' },
        { entity: 'investigations', action: 'update' },
      ],
    )
    expect(await db.super(`select distinct actor from public.audit_log`)).toEqual([{ actor: USER_A }])
    const text = JSON.stringify(await db.super(`select * from public.audit_log`))
    for (const secret of ['private', 'Secret yard', 'POLYGON', '79.08', 'a@example.com'])
      expect(text).not.toContain(secret)
  })
  it('logs every frame check, re-checks included, so the daily verify limit cannot be dodged', async () => {
    const id = await mine()
    const upsert = ` on conflict (investigation_id, item_id, asset, level) do update set verified_at = now()`
    await frame('service', id, upsert)
    await frame('service', id, upsert)
    expect(
      await db.super(
        `select action from public.audit_log where actor = $1 and entity = 'frames' order by id`,
        [USER_A],
      ),
    ).toEqual([{ action: 'insert' }, { action: 'update' }])
  })
  it('lets the service role write check rows for the daily limit, and no client write the audit log', async () => {
    const id = await mine()
    const sql = `insert into public.audit_log (actor, action, entity, entity_id) values ($1, 'check', 'frames', $2)`
    await db.as('service', sql, [USER_A, id])
    expect(
      await db.super(`select actor, action, entity, entity_id from public.audit_log where action = 'check'`),
    ).toEqual([{ actor: USER_A, action: 'check', entity: 'frames', entity_id: id }])
    await expect(db.as(USER_A, sql, [USER_A, id])).rejects.toThrow(/permission denied for table audit_log/)
  })
  it('keeps the audit log append-only, even for the service role', async () => {
    await db.super(
      `insert into public.audit_log (actor, action, entity, entity_id) values ($1, 'check', 'frames', null)`,
      [USER_A],
    )
    for (const sql of [
      'delete from public.audit_log',
      `update public.audit_log set action = 'x'`,
      'truncate public.audit_log',
    ])
      await expect(db.as('service', sql), sql).rejects.toThrow(/permission denied for table audit_log/)
    expect(await count('audit_log', `action = 'check'`)).toBe(1)
  })
  it('records consent and exposes keep_alive to anon only as a no-op', async () => {
    await db.as(USER_A, `select public.record_consent('v1')`)
    expect(
      await db.super(`select actor, action, entity, entity_id from public.audit_log order by id`),
    ).toEqual([{ actor: USER_A, action: 'consent:v1', entity: 'users', entity_id: USER_A }])
    expect(await db.as('anon', `select public.keep_alive() as ok`)).toEqual([{ ok: 1 }])
    expect(await db.as(USER_A, `select public.keep_alive() as ok`)).toEqual([{ ok: 1 }])
    expect(await count('audit_log')).toBe(1)
  })
  it('records one consent row per user and version, however often it is called', async () => {
    const consent = (who: string, version: string) =>
      db.as(who, `select public.record_consent($1)`, [version])
    await consent(USER_A, 'v1')
    await consent(USER_A, 'v1')
    await consent(USER_A, 'v1')
    expect(await db.super(`select actor, action from public.audit_log order by id`)).toEqual([
      { actor: USER_A, action: 'consent:v1' },
    ])
    // Another user's consent to the same version, and the same user's consent to a new version, are new facts.
    await consent(USER_B, 'v1')
    await consent(USER_A, 'v2')
    await consent(USER_B, 'v1')
    expect(await db.super(`select actor, action from public.audit_log order by id`)).toEqual([
      { actor: USER_A, action: 'consent:v1' },
      { actor: USER_B, action: 'consent:v1' },
      { actor: USER_A, action: 'consent:v2' },
    ])
  })
  it('throws, and writes nothing, when not signed in or when the version is malformed', async () => {
    // The client relies on the call throwing. Without a JWT subject only a role that may still execute it gets this far
    // (anon is refused earlier, see the function privileges tests).
    await expect(db.super(`select public.record_consent('v1')`)).rejects.toThrow('GS:NOT_SIGNED_IN')
    for (const bad of ['V1', '', 'v 1', 'v1;drop', 'a'.repeat(21), 'v1\n', null])
      await expect(
        db.as(USER_A, `select public.record_consent($1)`, [bad]),
        JSON.stringify(bad),
      ).rejects.toThrow('GS:BAD_VERSION')
    expect(await count('audit_log')).toBe(0)
    for (const ok of ['v1.2-rc', 'a'.repeat(20)])
      await db.as(USER_A, `select public.record_consent($1)`, [ok])
    expect(await count('audit_log')).toBe(2)
  })
  it('returns geometry as GeoJSON through the computed field', async () => {
    const id = await mine()
    const [r] = await db.as(
      USER_A,
      `select public.geom_geojson(i) as g from public.investigations i where id = $1`,
      [id],
    )
    const g = r!.g as { type: string; coordinates: unknown[][] }
    expect(g.type).toBe('Polygon')
    expect(g.coordinates[0]).toHaveLength(5)
    // The caller's row security still applies to the row it passes in.
    expect(
      await db.as(USER_B, `select public.geom_geojson(i) as g from public.investigations i where id = $1`, [
        id,
      ]),
    ).toEqual([])
  })
  it('purges investigations of users inactive for 12 months and audit rows older than a year', async () => {
    await mine()
    await db.super(`update auth.users set last_sign_in_at = now() - interval '13 months' where id = $1`, [
      USER_A,
    ])
    await db.super(
      `insert into public.audit_log (actor, action, entity, at) values (null, 'old', 'x', now() - interval '400 days')`,
    )
    const [r] = await db.super(`select public.purge_expired() as r`)
    expect(r!.r).toMatchObject({ investigations: 1, audit: 1 })
    expect(await db.super(`select count(*)::int as n from public.investigations`)).toEqual([{ n: 0 }])
    expect(await count('audit_log', `action = 'old'`)).toBe(0) // the count above could be a lie, check the effect
  })
  it('leaves active users and recent audit rows alone, cascades what it deletes, and logs it as IDs', async () => {
    const a = await mine()
    await note(USER_A, a)
    await frame('service', a)
    const [b] = await place(USER_B, 'B yard')
    await note(USER_B, b!.id)
    await inactive(USER_A, 13)
    await inactive(USER_B, 11)
    await db.super(
      `insert into public.audit_log (actor, action, entity, at) values (null, 'recent', 'x', now() - interval '300 days')`,
    )
    const [r] = await db.super(`select public.purge_expired() as r`)
    expect(r!.r).toEqual({ investigations: 1, audit: 0 })
    expect(await db.super(`select id from public.investigations`)).toEqual([{ id: b!.id }])
    expect(await count('annotations')).toBe(1) // B's
    expect(await count('frames')).toBe(0)
    expect(await count('audit_log', `action = 'recent'`)).toBe(1)
    expect(
      await db.super(
        `select distinct actor, entity from public.audit_log where action = 'delete' order by entity`,
      ),
    ).toEqual([
      { actor: USER_A, entity: 'annotations' },
      { actor: USER_A, entity: 'frames' },
      { actor: USER_A, entity: 'investigations' },
    ])
    expect(
      await db.super(
        `select entity_id from public.audit_log where action = 'delete' and entity = 'investigations'`,
      ),
    ).toEqual([{ entity_id: a }])
  })
  it('keeps the consent record of an account that still exists and purges that of a deleted one', async () => {
    const old = `now() - interval '400 days'`
    await db.super(
      `insert into public.audit_log (actor, action, entity, entity_id, at) values
         ($1, 'consent:v1', 'users', $1, ${old}),
         ($2, 'consent:v1', 'users', $2, ${old}),
         (null, 'consent:v1', 'users', null, ${old}),
         ($1, 'update', 'investigations', null, ${old}),
         ($1, 'consent:v2', 'users', $1, now())`,
      [USER_A, GHOST],
    )
    const [r] = await db.super(`select public.purge_expired() as r`)
    // The deleted account's consent, the one with no actor (`not in` would keep it for ever) and the ordinary old row.
    expect(r!.r).toMatchObject({ audit: 3 })
    expect(
      await db.super(
        `select actor, action, at < now() - interval '365 days' as old from public.audit_log order by id`,
      ),
    ).toEqual([
      { actor: USER_A, action: 'consent:v1', old: true },
      { actor: USER_A, action: 'consent:v2', old: false },
    ])
  })
  it('cascades a deleted user’s data and keeps only IDs in the audit log', async () => {
    const id = await mine()
    await db.super(`delete from auth.users where id = $1`, [USER_A])
    expect(await db.super(`select count(*)::int as n from public.investigations`)).toEqual([{ n: 0 }])
    const audit = await db.super(
      `select action, entity_id from public.audit_log where entity = 'investigations' order by id`,
    )
    expect(audit.at(-1)).toEqual({ action: 'delete', entity_id: id })
  })
})

describe('ops cron migration', () => {
  it('schedules the purge daily at 21:00 UTC (02:30 IST) and stays out of the PGlite harness', () => {
    const name = '20261005000004_ops_cron.sql'
    // harness.ts skips every migration whose name contains _cron: exactly this one.
    expect(readdirSync('supabase/migrations').filter((n) => n.includes('_cron'))).toEqual([name])
    expect(readFileSync(`supabase/migrations/${name}`, 'utf8')).toContain(
      `select cron.schedule('gs-purge', '0 21 * * *', $$select public.purge_expired()$$);`,
    )
  })
})
