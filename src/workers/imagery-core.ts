import {
  aoiPixelWindow,
  aoiPointsUtm,
  countMask,
  isClearClass,
  levelInfoFor,
  partsOf,
  rasterizeAoi,
  reprojectToGrid,
  sclStats,
  sha256Hex,
  windowSize,
  type AoiGeometry,
  type Cog,
  type DisplayGrid,
  type QualityStats,
  type Window,
} from '../evidence/index.ts'
import type { ByteCache } from '../lib/byte-cache.ts'
import type { S2Item } from '../stac/types.ts'

export interface CoreDeps {
  openCog(href: string, signal?: AbortSignal): Promise<Cog>
  cache?: ByteCache
}
export interface QualityRequest {
  item: S2Item
  aoi: AoiGeometry
  grid?: DisplayGrid
}
export interface QualityResult {
  window: Window
  level: 0
  sha256: string
  stats: QualityStats
  parts: Array<{ idx: number; fromM: number; toM: number; stats: QualityStats }>
  invalid?: Uint8Array
}
export interface FrameRequest {
  item: S2Item
  level: 0 | 1
  aoi: AoiGeometry
  grid: DisplayGrid
}
export interface FrameResult {
  window: Window
  level: 0 | 1
  sha256: string
  native: { width: number; height: number; rgb: Uint8Array }
  display: { width: number; height: number; rgba: Uint8ClampedArray }
}

const SUB = 2
/** Opening a COG is a few small range requests; past this the network has stalled. */
const OPEN_TIMEOUT_MS = 30_000
const cogs = new Map<string, Promise<Cog>>()

/** Test hook: the opened-COG cache is module-level. */
export function clearCogCache() {
  cogs.clear()
}

function getCog(deps: CoreDeps, href: string): Promise<Cog> {
  let p = cogs.get(href)
  if (!p) {
    // A stalled open must fail for everyone waiting on it and leave the cache, or no later request could recover.
    // Aborting it frees the stuck request, which Chrome would otherwise keep ahead of an identical retry.
    p = new Promise<Cog>((resolve, reject) => {
      const ac = new AbortController()
      const t = setTimeout(() => {
        reject(new DOMException('COG_OPEN_TIMEOUT', 'TimeoutError'))
        ac.abort()
      }, OPEN_TIMEOUT_MS)
      deps
        .openCog(href, ac.signal)
        .then(resolve, reject)
        .finally(() => clearTimeout(t))
    })
    p.catch(() => cogs.delete(href))
    cogs.set(href, p)
    if (cogs.size > 12) cogs.delete(cogs.keys().next().value!)
  }
  return p
}

async function readCached(
  deps: CoreDeps,
  cog: Cog,
  href: string,
  level: number,
  win: Window,
  samples: number[],
  signal?: AbortSignal,
) {
  // No query string: a rotating Planetary Computer SAS token must neither split the cache nor enter IndexedDB.
  const key = `${href.split('?')[0]}|${level}|${win.join(',')}|${samples.join('')}`
  const hit = await deps.cache?.get(key)
  if (hit) return hit
  const bytes = await cog.read(level, win, samples, signal)
  await deps.cache?.put(key, bytes)
  return bytes
}

/** Fresh per call: one shared object (or `counts`) edited by a caller would change every result. */
const emptyStats = (): QualityStats => ({
  policy: 'scl-v2',
  counts: new Array<number>(12).fill(0),
  total: 0,
  clearFraction: 0,
  validFraction: 0,
  uncertainFraction: 0,
  obstructedFraction: 0,
  nodataFraction: 0,
  label: 'NOT_COVERED',
})

export async function runQuality(
  deps: CoreDeps,
  req: QualityRequest,
  signal?: AbortSignal,
): Promise<QualityResult> {
  signal?.throwIfAborted()
  // Openers are shared through the cache, so the first caller's abort must not poison later readers: no signal here.
  const cog = await getCog(deps, req.item.scl.href)
  const lvl = levelInfoFor(req.item.scl, cog, 0)
  const wins = aoiPixelWindow(aoiPointsUtm(req.aoi, req.item.epsg), lvl, 2)
  const parts = partsOf(req.aoi)
  if (!wins) {
    return {
      window: [0, 0, 0, 0],
      level: 0,
      sha256: await sha256Hex(new Uint8Array()),
      stats: emptyStats(),
      parts: parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM, stats: emptyStats() })),
      // Nothing of the scene is in view: every display pixel is invalid, never "unchanged".
      invalid: req.grid && new Uint8Array(req.grid.width * req.grid.height).fill(1),
    }
  }
  const bytes = await readCached(deps, cog, req.item.scl.href, 0, wins.clamped, [0], signal)
  signal?.throwIfAborted()
  const { width, height } = windowSize(wins.clamped)
  const statsFor = (g: AoiGeometry) => {
    const mask = rasterizeAoi(g, req.item.epsg, wins.clamped, lvl, SUB)
    const outside = countMask(rasterizeAoi(g, req.item.epsg, wins.full, lvl, SUB)) - countMask(mask)
    return sclStats(bytes, width, height, mask, SUB, Math.max(0, outside))
  }
  const stats = statsFor(req.aoi)
  let invalid: Uint8Array | undefined
  if (req.grid) {
    const cls = reprojectToGrid(
      {
        data: bytes,
        width,
        height,
        samples: 1,
        win: wins.clamped,
        lvl,
        epsg: req.item.epsg,
        nodataZero: false,
      },
      req.grid,
      'nearest',
    )
    invalid = new Uint8Array(req.grid.width * req.grid.height)
    for (let i = 0; i < invalid.length; i++)
      invalid[i] = cls[i * 4 + 3] === 0 || !isClearClass(cls[i * 4]!) ? 1 : 0
  }
  return {
    window: wins.clamped,
    level: 0,
    sha256: await sha256Hex(bytes),
    stats,
    parts:
      req.aoi.kind === 'road'
        ? parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM, stats: statsFor(p.geometry) }))
        : [{ idx: 0, fromM: 0, toM: 0, stats }],
    invalid,
  }
}

export async function runFrame(
  deps: CoreDeps,
  req: FrameRequest,
  signal?: AbortSignal,
): Promise<FrameResult> {
  signal?.throwIfAborted()
  const cog = await getCog(deps, req.item.visual.href)
  const lvl = levelInfoFor(req.item.visual, cog, req.level)
  const wins = aoiPixelWindow(aoiPointsUtm(req.aoi, req.item.epsg), lvl, 2)
  if (!wins) throw new Error('AOI_OUTSIDE_SCENE')
  const bytes = await readCached(deps, cog, req.item.visual.href, req.level, wins.clamped, [0, 1, 2], signal)
  signal?.throwIfAborted()
  const { width, height } = windowSize(wins.clamped)
  const rgba = reprojectToGrid(
    { data: bytes, width, height, samples: 3, win: wins.clamped, lvl, epsg: req.item.epsg, nodataZero: true },
    req.grid,
    'bilinear',
  )
  return {
    window: wins.clamped,
    level: req.level,
    sha256: await sha256Hex(bytes),
    native: { width, height, rgb: bytes },
    display: { width: req.grid.width, height: req.grid.height, rgba },
  }
}
