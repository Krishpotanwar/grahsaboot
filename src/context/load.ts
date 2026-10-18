/*
 * The context loader: one recent Sentinel-2 scene as a picture to find a place by. It is NOT evidence: nothing here hashes
 * or keeps the native pixels, and nothing reaches the report or a saved frame (guard.test.ts scans this folder).
 *
 *   region (at most 12 km a side, from regionFor)
 *     -> coarsenBbox -> deps.search: ONE search over the last 240 days                         stage "searching"
 *     -> rankScenes (metadata only): best item per date (selectPerDate) covering >= 90 % of a   stage "checking"
 *        9 x 9 grid of points over the region, then least scene cloud, then newest;
 *        window 75 days, widened to 150 then 240 while no scene has <= 20 % cloud; never older
 *     -> client.quality for the best <= 3 picks, two at a time, SCL over the region
 *        -> the first pick in rank order that is >= 80 % clear, else the clearest checked
 *     -> client.frame ONCE: level 0 | 1, grid of about 2 display pixels per 10 m pixel, <= 1024   stage "reading"
 *     -> ContextImage { display pixels only, grid, scene, date, age, clear %, cloudy, widened }
 *
 *   any step:  the caller aborts            -> ABORTED, and no client call after it
 *              nothing usable in range      -> NO_SCENES
 *              the search fails             -> OFFLINE
 *              every check fails, the frame read fails (worker crash, IMAGERY_TIMEOUT, AOI_OUTSIDE_SCENE),
 *              or the loader's own 60 s deadline passes (kept apart from the caller's signal)  -> FAILED
 *              no checked scene is 80 % clear -> ALL_CLOUDY, carrying the clearest picture, flagged
 *
 *   Not here (the satellite switch, E3): the too-wide gate, the map layer, the status line and the credit.
 */
import type { AoiGeometry, DisplayGrid } from '../evidence/types.ts'
import { coarsenBbox, type Bbox } from '../geo/aoi.ts'
import type { SearchArgs } from '../stac/search.ts'
import type { SearchResult } from '../stac/types.ts'
import type { ImageryClient } from '../workers/imagery-client.ts'
import { rankScenes, type ScenePick } from './rank.ts'
import { gridFor, levelFor, regionFits } from './region.ts'

export interface ContextImage {
  /** Display pixels on `grid`; alpha 0 where the scene has no data. */
  rgba: Uint8ClampedArray
  /** Where the picture sits: place it by `cornersLonLat`, the grid is a little larger than the region. */
  grid: DisplayGrid
  sceneId: string
  date: string
  ageDays: number
  clearPct: number
  /** No checked scene was 80 % clear: this is the clearest of them. */
  cloudy: boolean
  /** The search window had to grow past 75 days (this scene may still be younger): show its age when `ageDays > 75 || widened`. */
  widened: boolean
}
/**
 * Every way a load ends. `ok` and the stage callbacks may still arrive for a signal that aborted after the loader's last check:
 * the caller looks at its own signal before it applies a result or a stage word.
 */
export type ContextResult =
  | { ok: true; image: ContextImage }
  | { ok: false; reason: 'NO_SCENES' | 'OFFLINE' | 'ABORTED' | 'FAILED' }
  | { ok: false; reason: 'ALL_CLOUDY'; image: ContextImage }
export interface ContextDeps {
  search: (a: SearchArgs) => Promise<SearchResult>
  client: Pick<ImageryClient, 'quality' | 'frame'>
  now?: Date
  onStage?: (s: 'searching' | 'checking' | 'reading') => void
}

const SEARCH_DAYS = 240
const DEADLINE_MS = 60_000 // a stuck load; real runs took 15-39 s on the build VM (P11), and the person can Cancel any time
const CLEAR_ENOUGH = 0.8
const AT_ONCE = 2 // quality checks in flight; rankScenes hands over at most three picks
const DAY = 86_400_000

interface Checked {
  pick: ScenePick
  clear: number
}

/** One recent scene for `region` (see regionFor). Never throws: every way it can end is a ContextResult. */
export async function loadContext(
  deps: ContextDeps,
  region: Bbox,
  signal: AbortSignal,
): Promise<ContextResult> {
  // One signal for everything below: the caller's abort and the loader's own deadline both end in it.
  const stop = new AbortController()
  const relay = () => stop.abort()
  signal.addEventListener('abort', relay, { once: true })
  const timer = setTimeout(relay, DEADLINE_MS)
  try {
    if (signal.aborted) relay()
    return await load(deps, region, stop.signal)
  } catch {
    // The caller's abort and the deadline are told apart here; anything else that went wrong is a failure too.
    return { ok: false, reason: signal.aborted ? 'ABORTED' : 'FAILED' }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', relay)
  }
}

async function load(deps: ContextDeps, region: Bbox, stop: AbortSignal): Promise<ContextResult> {
  stop.throwIfAborted()
  const [w, s, e, n] = region
  if (![w, s, e, n].every(Number.isFinite) || w >= e || s >= n || !regionFits(region))
    return { ok: false, reason: 'FAILED' }
  // Every call is raced against the abort, so a dependency that ignores its signal cannot hold the result back,
  // and nothing is called once the signal has gone.
  const gone = new Promise<never>((_, reject) =>
    stop.addEventListener('abort', () => reject(stop.reason), { once: true }),
  )
  gone.catch(() => {})
  const run = <T>(call: () => Promise<T>): Promise<T> => {
    stop.throwIfAborted()
    return Promise.race([call(), gone])
  }
  const now = deps.now ?? new Date()
  const day = (t: number) => new Date(t).toISOString().slice(0, 10)

  deps.onStage?.('searching')
  let found: SearchResult
  try {
    found = await run(() =>
      deps.search({
        bbox: coarsenBbox(region),
        from: day(now.getTime() - SEARCH_DAYS * DAY),
        to: day(now.getTime()),
        signal: stop,
      }),
    )
  } catch (err) {
    if (stop.aborted) throw err
    return { ok: false, reason: 'OFFLINE' }
  }

  deps.onStage?.('checking')
  const ranking = rankScenes(found.items, region, now)
  if (!ranking) return { ok: false, reason: 'NO_SCENES' }
  const aoi: AoiGeometry = {
    kind: 'site',
    rings: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  }
  // Two checks at a time, in rank order; the third only if neither of the first two is clear enough. The first pick in
  // rank order that is clear enough wins even when a later one is clearer, and a check still running then is cancelled.
  const checks = new AbortController()
  stop.addEventListener('abort', () => checks.abort(), { once: true })
  const checked: Checked[] = []
  let winner: Checked | undefined
  for (let i = 0; i < ranking.picks.length && !winner; i += AT_ONCE) {
    const batch = ranking.picks.slice(i, i + AT_ONCE).map(async (pick): Promise<Checked | null> => {
      try {
        const q = await run(() => deps.client.quality({ item: pick.item, aoi }, checks.signal))
        return { pick, clear: q.stats.clearFraction }
      } catch {
        return null // a failed check is skipped; an abort is caught right after the await below
      }
    })
    for (const pending of batch) {
      const r = await pending
      stop.throwIfAborted()
      if (!r) continue
      checked.push(r)
      if (r.clear >= CLEAR_ENOUGH) {
        winner = r
        break
      }
    }
  }
  checks.abort()
  if (!checked.length) return { ok: false, reason: 'FAILED' }
  const best = winner ?? checked.reduce((a, b) => (b.clear > a.clear ? b : a)) // ties keep the better rank

  deps.onStage?.('reading')
  const grid = gridFor(region)
  const frame = await run(() =>
    deps.client.frame({ item: best.pick.item, level: levelFor(region), aoi, grid }, stop),
  )
  // Only the display pixels are kept; the rest of the worker's answer is dropped here.
  const { rgba } = frame.display
  if (rgba.length !== grid.width * grid.height * 4) throw new Error('BAD_FRAME')
  stop.throwIfAborted()
  const image: ContextImage = {
    rgba,
    grid,
    sceneId: best.pick.item.id,
    date: best.pick.item.date,
    ageDays: best.pick.ageDays,
    // 79.6 % rounds to 80: a picture flagged cloudy must never read "80 % clear".
    clearPct: Math.min(Math.round(best.clear * 100), winner ? 100 : 79),
    cloudy: !winner,
    widened: ranking.widened,
  }
  return winner ? { ok: true, image } : { ok: false, reason: 'ALL_CLOUDY', image }
}
