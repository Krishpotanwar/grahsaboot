import {
  aoiPixelWindow,
  aoiPointsUtm,
  countMask,
  levelInfoFor,
  partsOf,
  rasterizeAoi,
  RECIPES,
  sclStats,
  sha256Hex,
  windowCovers,
  windowSize,
  type AoiGeometry,
  type Cog,
  type LonLat,
  type QualityStats,
  type Window,
} from '../_shared/evidence/index.ts'

export type Collection = 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'
export interface VerifyFrameIn {
  asset: 'visual' | 'scl'
  level: 0 | 1
  window: Window
  sha256: string
}
export interface VerifyRequest {
  investigation_id: string
  item: { collection: Collection; id: string }
  frames: VerifyFrameIn[]
}
export interface InvestigationRow {
  id: string
  owner: string
  kind: 'site' | 'road'
  geom_geojson: { type: string; coordinates: unknown }
  road_width_m: number | null
  date_from: string
  date_to: string
  pinned: string[]
}
export interface AssetLite {
  href: string
  transform: number[]
  shape: [number, number]
}
export interface ItemLite {
  id: string
  collection: Collection
  datetime: string
  epsg: number
  baseline: string | null
  footprint: LonLat[][]
  visual: AssetLite
  scl: AssetLite
}
export interface FrameRow {
  investigation_id: string
  owner: string
  acquired_at: string
  frame_date: string
  collection: Collection
  item_id: string
  processing_baseline: string | null
  asset: 'visual' | 'scl'
  level: 0 | 1
  win: Window
  crs: string
  transform: number[]
  href: string
  source_identity: Record<string, string>
  recipe: string
  client_sha256: string
  server_sha256: string
  status: 'verified' | 'mismatch'
  quality: unknown
}
export interface VerifyDeps {
  userId: string
  loadInvestigation(id: string): Promise<InvestigationRow | null>
  /** Frame checks (attempts) this user made in the last 24 h, counted from the audit log. Must throw when it cannot count. */
  countRecentFrames(userId: string): Promise<number>
  /** Writes one audit `check` row per requested frame. Must throw when it cannot write. */
  recordChecks(investigationId: string, n: number): Promise<void>
  /** Must return `parseStacItem`'s output only (the handler re-checks the asset hosts anyway). */
  fetchItem(collection: Collection, id: string): Promise<ItemLite | null>
  headAsset(href: string, collection: Collection): Promise<Record<string, string>>
  openCog(href: string, collection: Collection): Promise<Cog>
  /**
   * Deletes this investigation's frames that no longer belong (service role): those whose frame_date is not in `pinned`, and
   * those of `current.date` that came from another item than `current.itemId`. Must throw on failure.
   */
  pruneFrames(
    investigationId: string,
    pinned: string[],
    current: { date: string; itemId: string },
  ): Promise<void>
  saveFrames(rows: FrameRow[]): Promise<Array<{ id: string; verified_at: string }>>
  /** Optional operator log: which step failed and why. Never sent to the caller. */
  log?(step: string, e: unknown): void
}

// Starts alphanumeric, like frames.item_id in the database: `items/..` would normalise to the collection URL (E14).
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEX_RE = /^[0-9a-f]{64}$/
const DAILY_LIMIT = 600
const err = (status: number, error: string) => ({ status, body: { error } })

function parseRequest(raw: unknown): VerifyRequest | null {
  const r = raw as Partial<VerifyRequest> | null
  if (
    !r ||
    typeof r !== 'object' ||
    typeof r.investigation_id !== 'string' ||
    !UUID_RE.test(r.investigation_id)
  )
    return null
  if (
    !r.item ||
    (r.item.collection !== 'sentinel-2-l2a' && r.item.collection !== 'pc:sentinel-2-l2a') ||
    typeof r.item.id !== 'string' ||
    !ID_RE.test(r.item.id)
  )
    return null
  if (!Array.isArray(r.frames) || r.frames.length < 1 || r.frames.length > 4) return null
  for (const f of r.frames) {
    if (
      !f ||
      (f.asset !== 'visual' && f.asset !== 'scl') ||
      (f.level !== 0 && f.level !== 1) ||
      (f.asset === 'scl' && f.level !== 0)
    )
      return null
    if (
      !Array.isArray(f.window) ||
      f.window.length !== 4 ||
      !f.window.every((v) => Number.isInteger(v) && v >= 0 && v <= 20000)
    )
      return null
    if (typeof f.sha256 !== 'string' || !HEX_RE.test(f.sha256)) return null
  }
  // One frame per asset:level: a repeat would fail the upsert after the reads (E2).
  if (new Set(r.frames.map((f) => `${f.asset}:${f.level}`)).size !== r.frames.length) return null
  return r as VerifyRequest
}

function toAoi(inv: InvestigationRow): AoiGeometry | null {
  const g = inv.geom_geojson
  if (inv.kind === 'site' && g.type === 'Polygon') return { kind: 'site', rings: g.coordinates as LonLat[][] }
  if (inv.kind === 'road' && g.type === 'LineString' && inv.road_width_m)
    return { kind: 'road', line: g.coordinates as LonLat[], widthM: inv.road_width_m }
  return null
}

function bbox(points: LonLat[]): [number, number, number, number] {
  return points.reduce<[number, number, number, number]>(
    (b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}
const overlaps = (a: number[], b: number[]) =>
  a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!
const scaled = (t: number[], level: number) => [
  t[0]! * 2 ** level,
  t[1]!,
  t[2]!,
  t[3]!,
  t[4]! * 2 ** level,
  t[5]!,
]
const summarise = (s: QualityStats) => ({
  label: s.label,
  clearFraction: s.clearFraction,
  validFraction: s.validFraction,
  uncertainFraction: s.uncertainFraction,
  obstructedFraction: s.obstructedFraction,
  nodataFraction: s.nodataFraction,
  counts: s.counts,
  total: s.total,
  policy: s.policy,
})

/** Never throws: every dependency failure is mapped to a status, and anything unexpected is a 500 with no detail. */
export async function handleVerify(
  deps: VerifyDeps,
  raw: unknown,
): Promise<{ status: number; body: unknown }> {
  try {
    return await verify(deps, raw)
  } catch (e) {
    deps.log?.('unexpected', e)
    return err(500, 'INTERNAL')
  }
}

async function verify(deps: VerifyDeps, raw: unknown): Promise<{ status: number; body: unknown }> {
  const req = parseRequest(raw)
  if (!req) return err(400, 'BAD_REQUEST')
  // A query error is not "not found": 503 so the browser retries (a 404 would be shown as a missing investigation).
  let inv: InvestigationRow | null
  try {
    inv = await deps.loadInvestigation(req.investigation_id)
  } catch (e) {
    deps.log?.('load', e)
    return err(503, 'UNAVAILABLE')
  }
  // The loader runs as the user (RLS), but the write path is the service role, so ownership is asserted here too: a loader
  // built with the wrong client must fail closed, not verify and freeze somebody else's investigation.
  if (!inv || inv.owner !== deps.userId) return err(404, 'INVESTIGATION_NOT_FOUND')
  // A row without these is a loader bug (a column left out of the select): refuse before anything is counted.
  if (!Array.isArray(inv.pinned) || !inv.geom_geojson || typeof inv.geom_geojson !== 'object')
    return err(500, 'INTERNAL')
  const aoi = toAoi(inv)
  if (!aoi) return err(422, 'BAD_GEOMETRY')
  // Count ATTEMPTS and fail closed: no source is read unless the count and the record both succeeded (E3).
  // ponytail: count then record is not atomic, so parallel requests can overshoot 600 by up to 4 per request in flight; a
  // single insert-or-refuse SQL function would close it if abuse shows.
  try {
    const used = await deps.countRecentFrames(deps.userId)
    if (!Number.isInteger(used) || used < 0) return err(503, 'UNAVAILABLE')
    if (used + req.frames.length > DAILY_LIMIT) return err(429, 'RATE_LIMITED')
    await deps.recordChecks(inv.id, req.frames.length)
  } catch (e) {
    deps.log?.('count', e)
    return err(503, 'UNAVAILABLE')
  }

  let item: ItemLite | null
  try {
    item = await deps.fetchItem(req.item.collection, req.item.id)
  } catch (e) {
    deps.log?.('item', e)
    return err(502, 'UPSTREAM')
  }
  if (!item) return err(404, 'ITEM_NOT_FOUND')
  // parseStacItem allowlists the asset hosts; enforce it again where the hrefs are used, whatever `fetchItem` returned (E13).
  if (!allowed(item.visual.href) || !allowed(item.scl.href)) return err(404, 'ITEM_NOT_FOUND')
  // The UTC date, derived the way the browser derives the date it pins (src/stac/parse.ts).
  const date = new Date(item.datetime).toISOString().slice(0, 10)
  if (date < inv.date_from || date > inv.date_to) return err(422, 'DATE_OUTSIDE_RANGE')
  // Only pinned dates are verified (before and after are always pinned): frames of other dates would eat the 50-frame cap (E11).
  if (!inv.pinned.includes(date)) return err(422, 'NOT_PINNED')
  const aoiPoints = aoi.kind === 'site' ? aoi.rings.flat() : aoi.line
  if (!item.footprint.some((ring) => overlaps(bbox(ring), bbox(aoiPoints)))) return err(422, 'NO_OVERLAP')

  const rows: FrameRow[] = []
  for (const f of req.frames) {
    const asset = f.asset === 'visual' ? item.visual : item.scl
    let cog: Cog
    try {
      cog = await deps.openCog(asset.href, item.collection)
    } catch (e) {
      deps.log?.('open', e)
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
    } catch (e) {
      deps.log?.('read', e)
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
      const whole = summarise(statsFor(aoi))
      // Same as the browser's runQuality: a site is its own single part, so its stats are computed once.
      quality = {
        ...whole,
        parts:
          aoi.kind === 'site'
            ? [{ idx: 0, fromM: 0, toM: 0, ...whole }]
            : partsOf(aoi).map((p) => ({
                idx: p.idx,
                fromM: p.fromM,
                toM: p.toM,
                ...summarise(statsFor(p.geometry)),
              })),
      }
    }
    rows.push({
      investigation_id: inv.id,
      owner: inv.owner,
      acquired_at: item.datetime,
      frame_date: date,
      collection: item.collection,
      item_id: item.id,
      processing_baseline: item.baseline,
      asset: f.asset,
      level: f.level,
      win: f.window,
      crs: `EPSG:${item.epsg}`,
      transform: scaled(asset.transform, f.level),
      href: asset.href,
      source_identity: await Promise.resolve()
        .then(() => deps.headAsset(asset.href, item!.collection))
        .catch(() => ({})),
      recipe: f.asset === 'visual' ? RECIPES.frame : RECIPES.scl,
      client_sha256: f.sha256,
      server_sha256: server,
      status: server === f.sha256 ? 'verified' : 'mismatch',
      quality,
    })
  }
  // Frames that no longer belong must not keep eating the 50-frame cap: those of a date unpinned since the last save, and
  // those of this date that came from another item (an alternate or the fallback source was picked). A failed prune is a
  // 503, never a silent skip.
  try {
    await deps.pruneFrames(inv.id, inv.pinned, { date, itemId: item.id })
  } catch (e) {
    deps.log?.('prune', e)
    return err(503, 'UNAVAILABLE')
  }
  let saved: Array<{ id: string; verified_at: string }>
  try {
    saved = await deps.saveFrames(rows)
    if (saved.length !== rows.length) throw new Error('SHORT_WRITE')
  } catch (e) {
    deps.log?.('save', e)
    // A database rule refusing the write (GS:LIMIT_FRAMES, ...) cannot succeed on a retry: 422 with its code only, never the
    // 503 the browser retries three times. Anything else is an outage.
    const rule = e instanceof Error ? /GS:[A-Z][A-Z0-9_]{0,39}/.exec(e.message)?.[0] : undefined
    return rule ? err(422, rule) : err(503, 'UNAVAILABLE')
  }
  return {
    status: 200,
    body: {
      frames: rows.map((r, i) => ({
        asset: r.asset,
        level: r.level,
        status: r.status,
        server_sha256: r.server_sha256,
        frame_id: saved[i]!.id,
        verified_at: saved[i]!.verified_at,
        quality: r.quality,
      })),
    },
  }
}

// The browser's three hosts (ASSET_HOSTS in src/config.ts), exactly: no wildcard (E13).
const HOSTS = [
  'sentinel-cogs.s3.us-west-2.amazonaws.com',
  'e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com',
  'sentinel2l2a01.blob.core.windows.net',
]
/** The normalised URL when it is https on one of the three hosts, with no credentials and no port; otherwise null. */
const allowedHref = (href: unknown): string | null => {
  try {
    const u = new URL(String(href))
    const ok = u.protocol === 'https:' && !u.username && !u.password && !u.port && HOSTS.includes(u.hostname)
    return ok ? u.href : null
  } catch {
    return null
  }
}
const allowed = (href: unknown) => allowedHref(href) !== null

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ringOf = (x: unknown): LonLat[] | null =>
  Array.isArray(x) &&
  x.length >= 4 &&
  x.every((pt) => Array.isArray(pt) && pt.length >= 2 && isNum(pt[0]) && isNum(pt[1]))
    ? (x as LonLat[])
    : null

export function parseStacItem(raw: unknown, collection: Collection): ItemLite | null {
  const r = raw as {
    id?: unknown
    properties?: Record<string, unknown>
    geometry?: { type?: string; coordinates?: unknown }
    assets?: Record<string, Record<string, unknown>>
  } | null
  if (!r?.properties || !r.assets || typeof r.id !== 'string' || !ID_RE.test(r.id)) return null
  const p = r.properties
  const code = typeof p['proj:code'] === 'string' ? (p['proj:code'] as string) : ''
  const epsg =
    typeof p['proj:epsg'] === 'number'
      ? (p['proj:epsg'] as number)
      : code.startsWith('EPSG:')
        ? Number(code.slice(5))
        : NaN
  const asset = (a: Record<string, unknown> | undefined): AssetLite | null => {
    const href = allowedHref(a?.href)
    const t = a?.['proj:transform'] ?? p['proj:transform']
    const s = a?.['proj:shape'] ?? p['proj:shape']
    return href &&
      Array.isArray(t) &&
      t.length >= 6 &&
      t.slice(0, 6).every(isNum) &&
      Array.isArray(s) &&
      s.length === 2 &&
      s.every((v) => Number.isInteger(v) && v > 0)
      ? { href, transform: (t as number[]).slice(0, 6), shape: [s[0] as number, s[1] as number] }
      : null
  }
  const visual = asset(r.assets.visual)
  const scl = asset(r.assets.scl ?? r.assets.SCL)
  const datetime = typeof p.datetime === 'string' ? p.datetime : ''
  const g = r.geometry
  let footprint: LonLat[][] | null = null
  if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const outer = ringOf(g.coordinates[0])
    footprint = outer ? [outer] : null
  } else if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length) {
    const outers = g.coordinates.map((poly) => (Array.isArray(poly) ? ringOf(poly[0]) : null))
    footprint = outers.every((o) => o !== null) ? (outers as LonLat[][]) : null
  }
  if (!Number.isFinite(epsg) || !visual || !scl || Number.isNaN(Date.parse(datetime)) || !footprint)
    return null
  return {
    id: r.id,
    collection,
    datetime,
    epsg,
    baseline:
      typeof p['s2:processing_baseline'] === 'string' ? (p['s2:processing_baseline'] as string) : null,
    footprint,
    visual,
    scl,
  }
}
