import { beforeEach, describe, expect, it } from 'vitest'
import { ewktLine, ewktPolygon, freshDb, ROAD, SQUARE, USER_A, USER_B, type Db } from './harness.ts'

let db: Db
beforeEach(async () => {
  db = await freshDb()
})

const insSite = (ring: [number, number][], from = '2025-01-01', to = '2025-12-31') =>
  db.as(
    USER_A,
    `insert into public.investigations (name, kind, geom, date_from, date_to) values ('x', 'site', $1, $2, $3) returning id`,
    [ewktPolygon(ring), from, to],
  )
const insRoad = (line: [number, number][], width = 30) =>
  db.as(
    USER_A,
    `insert into public.investigations (name, kind, geom, road_width_m, date_from, date_to) values ('r', 'road', $1, $2, '2025-01-01', '2025-12-31') returning id`,
    [ewktLine(line), width],
  )
const frame = (inv: unknown, n = 0) =>
  db.as(
    'service',
    `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
    values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', $3, 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $4, $4, 'verified')`,
    [inv, USER_A, `S2_${n}`, 'a'.repeat(64)],
  )

describe('geometry and date rules', () => {
  it('accepts valid sites and roads', async () => {
    await expect(insSite(SQUARE)).resolves.toHaveLength(1)
    await expect(insRoad(ROAD)).resolves.toHaveLength(1)
  })
  it('rejects self-intersecting, oversized and too-wide sites', async () => {
    await expect(
      insSite([
        [79, 21],
        [79.01, 21.01],
        [79.01, 21],
        [79, 21.01],
        [79, 21],
      ]),
    ).rejects.toThrow('GS:GEOM_INVALID')
    await expect(
      insSite([
        [79, 21],
        [79.05, 21],
        [79.05, 21.05],
        [79, 21.05],
        [79, 21],
      ]),
    ).rejects.toThrow('GS:TOO_LARGE')
    await expect(
      insSite([
        [79, 21],
        [79.045, 21],
        [79.045, 21.0005],
        [79, 21.0005],
        [79, 21],
      ]),
    ).rejects.toThrow('GS:TOO_WIDE')
  })
  it('rejects roads outside 0.2–10 km and wrong types', async () => {
    await expect(
      insRoad([
        [79, 21],
        [79, 21.0005],
      ]),
    ).rejects.toThrow('GS:BAD_LENGTH')
    await expect(
      insRoad([
        [79, 21],
        [79, 21.11],
      ]),
    ).rejects.toThrow('GS:BAD_LENGTH')
    await expect(
      db.as(
        USER_A,
        `insert into public.investigations (name, kind, geom, road_width_m, date_from, date_to) values ('r', 'road', $1, 30, '2025-01-01', '2025-12-31')`,
        [ewktPolygon(SQUARE)],
      ),
    ).rejects.toThrow('GS:GEOM_TYPE')
  })
  it('rejects dates before 2017 or in the future', async () => {
    await expect(insSite(SQUARE, '2016-12-31', '2025-01-01')).rejects.toThrow('GS:BAD_DATES')
    await expect(insSite(SQUARE, '2025-01-01', '2999-01-01')).rejects.toThrow('GS:BAD_DATES')
  })
  it('accepts the UTC date as the last day and refuses the next one, in any session time zone', async () => {
    const to = (sql: string) =>
      db.as(
        USER_A,
        `insert into public.investigations (name, kind, geom, date_from, date_to) values ('x', 'site', $1, '2025-01-01', ${sql}) returning id`,
        [ewktPolygon(SQUARE)],
      )
    // One of these two zones has a local date different from the UTC date at every hour of the day.
    for (const tz of ['Etc/GMT-14', 'Etc/GMT+12']) {
      await db.super(`set time zone '${tz}'`)
      await expect(to(`(now() at time zone 'utc')::date`), tz).resolves.toHaveLength(1)
      await expect(to(`(now() at time zone 'utc')::date + 1`), tz).rejects.toThrow('GS:BAD_DATES')
    }
  })
  it('rejects polygons with holes or without a ring (the browser draws exactly one ring)', async () => {
    const insEwkt = (ewkt: string) =>
      db.as(
        USER_A,
        `insert into public.investigations (name, kind, geom, date_from, date_to) values ('h', 'site', $1, '2025-01-01', '2025-12-31')`,
        [ewkt],
      )
    const ring = (r: [number, number][]) => r.map(([x, y]) => `${x} ${y}`).join(',')
    const hole: [number, number][] = [
      [79.0862, 21.1438],
      [79.0902, 21.1438],
      [79.0902, 21.1478],
      [79.0862, 21.1478],
      [79.0862, 21.1438],
    ]
    await expect(insEwkt(`SRID=4326;POLYGON((${ring(SQUARE)}),(${ring(hole)}))`)).rejects.toThrow(
      'GS:GEOM_TYPE',
    )
    await expect(insEwkt('SRID=4326;POLYGON EMPTY')).rejects.toThrow('GS:GEOM_TYPE')
  })
  it('rejects a geography that is not SRID 4326', async () => {
    await expect(
      db.as(
        USER_A,
        `insert into public.investigations (name, kind, geom, date_from, date_to) values ('n', 'site', $1, '2025-01-01', '2025-12-31')`,
        [ewktPolygon(SQUARE).replace('SRID=4326', 'SRID=4269')],
      ),
    ).rejects.toThrow(/investigations_srid/)
  })
})

describe('limits and freezing', () => {
  it('caps vertices at 200 for a site and for a road', async () => {
    const ring = (n: number): [number, number][] => {
      const pts = Array.from({ length: n }, (_, i): [number, number] => [
        79 + 0.0009 * Math.cos((2 * Math.PI * i) / n),
        21 + 0.0009 * Math.sin((2 * Math.PI * i) / n),
      ])
      return [...pts, pts[0]!]
    }
    const line = (n: number): [number, number][] =>
      Array.from({ length: n }, (_, i): [number, number] => [
        ROAD[0]![0] + ((ROAD[1]![0] - ROAD[0]![0]) * i) / (n - 1),
        ROAD[0]![1] + ((ROAD[1]![1] - ROAD[0]![1]) * i) / (n - 1),
      ])
    await expect(insSite(ring(200))).resolves.toHaveLength(1)
    await expect(insSite(ring(201))).rejects.toThrow('GS:TOO_MANY_VERTICES')
    await expect(insRoad(line(200))).resolves.toHaveLength(1)
    await expect(insRoad(line(201))).rejects.toThrow('GS:TOO_MANY_VERTICES')
  })
  it('caps investigations at 50 per user', async () => {
    for (let i = 0; i < 50; i++) await insSite(SQUARE)
    await expect(insSite(SQUARE)).rejects.toThrow('GS:LIMIT_INVESTIGATIONS')
  })
  it('caps notes at 200 per investigation', async () => {
    const [inv] = await insSite(SQUARE)
    await db.super(
      `insert into public.annotations (investigation_id, owner, kind, body) select $1, $2, 'unsure', 'n' || g from generate_series(1, 200) g`,
      [inv!.id, USER_A],
    )
    await expect(
      db.as(
        USER_A,
        `insert into public.annotations (investigation_id, kind, body) values ($1, 'unsure', 'one more')`,
        [inv!.id],
      ),
    ).rejects.toThrow('GS:LIMIT_NOTES')
  })
  it('caps frames at 50 per investigation', async () => {
    const [inv] = await insSite(SQUARE)
    for (let i = 0; i < 50; i++) await frame(inv!.id, i)
    await expect(frame(inv!.id, 99)).rejects.toThrow('GS:LIMIT_FRAMES')
    // Re-verifying an existing frame at the cap still works (upsert, as the verify function does).
    await expect(
      db.as(
        'service',
        `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
      values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2_0', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, $3, 'mismatch')
      on conflict (investigation_id, item_id, asset, level) do update set status = excluded.status returning status`,
        [inv!.id, USER_A, 'b'.repeat(64)],
      ),
    ).resolves.toEqual([{ status: 'mismatch' }])
  })
  it('freezes geometry and dates after the first frame, but allows name and notes changes', async () => {
    const [inv] = await insSite(SQUARE)
    await frame(inv!.id)
    const [row] = await db.as(USER_A, `select frozen_at from public.investigations where id = $1`, [inv!.id])
    expect(row!.frozen_at).not.toBeNull()
    await expect(
      db.as(USER_A, `update public.investigations set date_to = '2025-11-30' where id = $1`, [inv!.id]),
    ).rejects.toThrow('GS:FROZEN')
    const moved = SQUARE.map(([x, y]) => [x + 0.001, y] as [number, number])
    await expect(
      db.as(USER_A, `update public.investigations set geom = $2 where id = $1`, [
        inv!.id,
        ewktPolygon(moved),
      ]),
    ).rejects.toThrow('GS:FROZEN')
    await expect(
      db.as(USER_A, `update public.investigations set name = 'Renamed' where id = $1 returning name`, [
        inv!.id,
      ]),
    ).resolves.toEqual([{ name: 'Renamed' }])
  })
  it('never lets the owner change', async () => {
    const [inv] = await insSite(SQUARE)
    await expect(
      db.super(
        `update public.investigations set owner = '00000000-0000-4000-8000-00000000000b' where id = $1`,
        [inv!.id],
      ),
    ).rejects.toThrow('GS:OWNER_IMMUTABLE')
  })
  it('does not let the owner clear frozen_at to unfreeze: the freeze holds and the dates stay refused', async () => {
    const [inv] = await insSite(SQUARE)
    await frame(inv!.id)
    const frozenAt = async () =>
      (await db.as(USER_A, `select frozen_at from public.investigations where id = $1`, [inv!.id]))[0]!
        .frozen_at
    const first = await frozenAt()
    expect(first).not.toBeNull()
    await db.as(USER_A, `update public.investigations set frozen_at = null where id = $1`, [inv!.id])
    expect(await frozenAt()).toEqual(first)
    await expect(
      db.as(USER_A, `update public.investigations set date_to = '2025-11-30' where id = $1`, [inv!.id]),
    ).rejects.toThrow('GS:FROZEN')
  })
  it('does not let the owner freeze an unfrozen investigation either', async () => {
    const [inv] = await insSite(SQUARE)
    await db.as(USER_A, `update public.investigations set frozen_at = now() where id = $1`, [inv!.id])
    const [row] = await db.as(USER_A, `select frozen_at from public.investigations where id = $1`, [inv!.id])
    expect(row!.frozen_at).toBeNull()
    await expect(
      db.as(USER_A, `update public.investigations set date_to = '2025-11-30' where id = $1 returning id`, [
        inv!.id,
      ]),
    ).resolves.toHaveLength(1)
  })
  it('never lets a note move to another investigation (it would walk round the 200-note cap)', async () => {
    const [a] = await insSite(SQUARE)
    const [b] = await insSite(SQUARE)
    const [note] = await db.as(
      USER_A,
      `insert into public.annotations (investigation_id, kind, body) values ($1, 'unsure', 'x') returning id`,
      [a!.id],
    )
    await expect(
      db.as(USER_A, `update public.annotations set investigation_id = $1 where id = $2`, [b!.id, note!.id]),
    ).rejects.toThrow('GS:NOTE_MOVED')
    await expect(
      db.super(`update public.annotations set owner = $2 where id = $1`, [note!.id, USER_B]),
    ).rejects.toThrow('GS:OWNER_IMMUTABLE')
    await expect(
      db.as(USER_A, `update public.annotations set body = 'edited' where id = $1 returning body`, [note!.id]),
    ).resolves.toEqual([{ body: 'edited' }])
  })
  it('ignores a client-supplied frozen_at on insert', async () => {
    const [row] = await db.as(
      USER_A,
      `insert into public.investigations (name, kind, geom, date_from, date_to, frozen_at) values ('x', 'site', $1, '2025-01-01', '2025-12-31', now()) returning frozen_at`,
      [ewktPolygon(SQUARE)],
    )
    expect(row!.frozen_at).toBeNull()
  })
})

describe('function privileges', () => {
  it('leaves the rule functions executable by no API role (Supabase default privileges grant anon and authenticated)', async () => {
    const rows = await db.super(
      `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('gs_validate_investigation', 'gs_limit_investigations', 'gs_limit_notes', 'gs_limit_frames', 'gs_freeze_on_frame', 'gs_touch', 'gs_annotation_guard')`,
    )
    expect(rows).toHaveLength(7)
    expect(rows.filter((r) => r.anon || r.authenticated)).toEqual([])
  })
})
