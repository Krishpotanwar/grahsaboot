import { beforeEach, describe, expect, it } from 'vitest'
import { ewktLine, ewktPolygon, freshDb, ROAD, SQUARE, USER_A, type Db } from './harness.ts'

let db: Db
beforeEach(async () => {
  db = await freshDb()
})

const site = `insert into public.investigations (owner, name, kind, geom, date_from, date_to) values ($1, 'x', 'site', $2, '2025-01-01', '2025-12-31') returning id`
const frame = (investigation: unknown, itemId: string) =>
  db.super(
    `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
     values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', $3, 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $4, $4, 'verified') returning item_id`,
    [investigation, USER_A, itemId, 'a'.repeat(64)],
  )

describe('core schema', () => {
  it('stores a site and a road with PostGIS geography', async () => {
    const [yard] = await db.super(
      `insert into public.investigations (owner, name, kind, geom, date_from, date_to) values ($1, 'Yard', 'site', $2, '2025-01-01', '2025-12-31') returning id, round(extensions.st_area(geom)::numeric) as m2`,
      [USER_A, ewktPolygon(SQUARE)],
    )
    expect(Number(yard!.m2)).toBeGreaterThan(1_140_000)
    const [road] = await db.super(
      `insert into public.investigations (owner, name, kind, geom, road_width_m, date_from, date_to) values ($1, 'NH', 'road', $2, 30, '2025-01-01', '2025-12-31') returning round(extensions.st_length(geom)::numeric) as m`,
      [USER_A, ewktLine(ROAD)],
    )
    expect(Number(road!.m)).toBeGreaterThan(2890)
  })

  it('enforces kind/width consistency and frame hash format', async () => {
    await expect(
      db.super(
        `insert into public.investigations (owner, name, kind, geom, road_width_m, date_from, date_to) values ($1, 'x', 'site', $2, 30, '2025-01-01', '2025-12-31')`,
        [USER_A, ewktPolygon(SQUARE)],
      ),
    ).rejects.toThrow(/violates check constraint/)
    const [inv] = await db.super(site, [USER_A, ewktPolygon(SQUARE)])
    await expect(
      db.super(
        `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
         values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', 'nothex', 'nothex', 'verified')`,
        [inv!.id, USER_A],
      ),
    ).rejects.toThrow(/frames_client_sha256_check/)
  })

  it('pins the server hash and a road width too, and the frame key', async () => {
    const [inv] = await db.super(site, [USER_A, ewktPolygon(SQUARE)])
    await expect(
      db.super(
        `insert into public.frames (investigation_id, owner, acquired_at, frame_date, collection, item_id, asset, level, win, crs, transform, href, recipe, client_sha256, server_sha256, status)
         values ($1, $2, now(), '2025-01-10', 'sentinel-2-l2a', 'S2', 'visual', 0, '{1,2,3,4}', 'EPSG:32644', '{10,0,0,0,-10,0}', 'https://x', 'frame-v1', $3, 'nothex', 'verified')`,
        [inv!.id, USER_A, 'a'.repeat(64)],
      ),
    ).rejects.toThrow(/frames_server_sha256_check/)
    await expect(
      db.super(
        `insert into public.investigations (owner, name, kind, geom, date_from, date_to) values ($1, 'x', 'road', $2, '2025-01-01', '2025-12-31')`,
        [USER_A, ewktLine(ROAD)],
      ),
    ).rejects.toThrow(/violates check constraint/)
    await frame(inv!.id, 'S2B_X')
    await expect(frame(inv!.id, 'S2B_X')).rejects.toThrow(/frames_investigation_id_item_id_asset_level_key/)
  })

  it('accepts only plain STAC item ids on frames (no leading dot, 100 characters at most)', async () => {
    const [inv] = await db.super(site, [USER_A, ewktPolygon(SQUARE)])
    for (const bad of ['..', '.x', '-x', 'a/b', '', 'a'.repeat(101)])
      await expect(frame(inv!.id, bad), `"${bad}"`).rejects.toThrow(/frames_item_id_check/)
    for (const good of ['S2B_43QBB_20180222_0_L2A', 'a'.repeat(100), 'x.y-z_0'])
      expect(await frame(inv!.id, good), good).toEqual([{ item_id: good }])
  })
})

describe('harness', () => {
  it('Db.as switches role and JWT subject; tables and sequences get the default grants', async () => {
    const who = async (w: string) => (await db.as(w, 'select current_user as r, auth.uid() as u'))[0]
    expect(await who(USER_A)).toEqual({ r: 'authenticated', u: USER_A })
    expect(await who('anon')).toEqual({ r: 'anon', u: null })
    expect(await who('service')).toEqual({ r: 'service_role', u: null })
    await db.super('create table public.gs_probe_t (x int)')
    await db.super('create sequence public.gs_probe_s')
    expect(await db.as('anon', 'select * from public.gs_probe_t')).toEqual([])
    expect(await db.as(USER_A, `select nextval('public.gs_probe_s') as n`)).toEqual([{ n: 1 }])
    await expect(db.as('Anon', 'select 1')).rejects.toThrow(/unknown caller/)
  })

  it('emulates Supabase default privileges: a new public function is callable by anon and authenticated until revoked from them', async () => {
    await db.super(`create function public.gs_probe() returns int language sql as 'select 1'`)
    const callable = async () => {
      for (const who of ['anon', USER_A])
        expect(await db.as(who, 'select public.gs_probe() as v')).toEqual([{ v: 1 }])
    }
    await callable()
    // Revoking from PUBLIC alone changes nothing on Supabase: anon and authenticated hold their own grants.
    await db.super(`revoke execute on function public.gs_probe() from public`)
    await callable()
    await db.super(`revoke execute on function public.gs_probe() from anon, authenticated`)
    for (const who of ['anon', USER_A])
      await expect(db.as(who, 'select public.gs_probe()')).rejects.toThrow(/permission denied/)
    expect(await db.as('service', 'select public.gs_probe() as v')).toEqual([{ v: 1 }])
  })
})
