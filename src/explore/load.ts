/*
 * The time-lapse loader (plan F8, review answers D13, D15 and D29): one picture of the same season for each of the last 6 years of
 * one square, the strip of a time-lapse. The frames are display only, a picture to look at and never evidence: nothing here keeps
 * a native pixel or a hash, and nothing reaches a report or a saved frame (tests/unit/context-boundary.test.ts holds this folder to it).
 *
 *   square (a box of about 2 km) -> makeDisplayGrid: ONE grid for every check and every read (400 by 400 at 2 km)
 *
 *   the last frame, a year of its own, 90 s from its first request
 *     deps.search: ONE search over the last 12 months                           OFFLINE when it fails, NO_SCENES when no scene holds the square
 *     -> pickSeason (the square's corners are the points, so a scene counts only if it holds the whole square):
 *        the clearest stretch of the 12 months sets the target day, its scenes, newest first, are the candidates    ALL_CLOUDY when there is none
 *     -> onSeason: the grid, the target day and the 6 years, so the strip can show its slots
 *     -> client.quality for the best 2 candidates at once, with the grid: how clear the square is, and the mask of the display pixels
 *        that are not clear (kept). The first in rank order that is 80% clear wins and the other check is cancelled   ALL_CLOUDY when neither is
 *     -> client.frame ONCE for the winner, level 0 on the same grid: its display pixels are the last frame -> onYear   FAILED when a call fails
 *
 *   the five earlier years, once the last frame is there
 *     deps.search for all five at once (a window of 41 days each: about one page)
 *     a queue, the oldest year first (so the first and the last frame exist early), 3 years at once (1 at a time on a slow link):
 *       a year, 90 s from its own first request -> rankYear (inside its window, holds the square, least cloud, nearest the target day)
 *       -> the same two checks and the same read -> onYear: a frame, or a gap that says why:
 *          'no-clear-picture' nothing in the window is 80% clear   'timed-out' its 90 s, the 300 s, or a call that timed out   'offline' a call failed
 *   300 s in all: what is not finished is a 'timed-out' gap, the frames so far stay, and the load still ends ok
 *
 *   any step:  the caller aborts -> ABORTED, and no client call and no callback after it
 *              nothing throws: whatever goes wrong is one of the reasons above, or a labelled year
 *
 *   Not here (the screen's): the slow line after 20 s, the words of a gap, the player, the share link and the change rule.
 */
import { makeDisplayGrid } from '../evidence/display.ts'
import { haversineM } from '../evidence/geodesy.ts'
import type { AoiGeometry, DisplayGrid, LonLat } from '../evidence/types.ts'
import { coarsenBbox, type Bbox } from '../geo/aoi.ts'
import type { SearchArgs } from '../stac/search.ts'
import { selectPerDate } from '../stac/select.ts'
import type { DateCandidate, SearchResult } from '../stac/types.ts'
import type { ImageryClient } from '../workers/imagery-client.ts'
import {
  ageDays,
  LOOKBACK_DAYS,
  pickSeason,
  rankYear,
  settleYear,
  type Checked,
  type GapReason,
  type Season,
  type YearWindow,
} from './season.ts'

/** One year's picture. Display pixels only: the worker's native pixels and its hash are dropped, never kept or shown. */
export interface TimeLapseFrame {
  sceneId: string
  /** The scene's day, `YYYY-MM-DD`. */
  date: string
  /** Whole days from the scene to the day of now, as the satellite view counts them. */
  ageDays: number
  /** The share of the square that is clear, in whole percent: at least 80. */
  clearPct: number
  /** Display pixels on the grid; alpha 0 where the scene has no data. */
  rgba: Uint8ClampedArray
  /** One byte per display pixel on the same grid: 1 where the pixel is not clear (cloud, shadow, no data). */
  invalid: Uint8Array
}
/** What one year came to: its frame, or why it has none. A gap is never another season's picture. */
export type YearResult = { year: number; frame: TimeLapseFrame } | { year: number; gap: GapReason }
/** What the strip needs before the first picture: the grid, the target day (`MM-DD`) and the slots, oldest year first. */
export interface SeasonPlan {
  grid: DisplayGrid
  monthDay: string
  years: number[]
}
/**
 * Every way a load ends. `ok` means the last frame is there; the earlier years are frames or labelled gaps and may be few (the
 * player decides what to do with fewer than 3). No callback is called once the signal has aborted or the load has ended, and a
 * caller that has gone gets ABORTED whatever the load came to.
 */
export type TimeLapseResult =
  | {
      ok: true
      grid: DisplayGrid
      /** The target day, `MM-DD`: the same month and day in every year. */
      monthDay: string
      /** One entry per year of the span, oldest first. */
      years: YearResult[]
    }
  | { ok: false; reason: 'NO_SCENES' | 'OFFLINE' | 'ALL_CLOUDY' | 'FAILED' | 'ABORTED' }
export interface TimeLapseDeps {
  search: (a: SearchArgs) => Promise<SearchResult>
  client: Pick<ImageryClient, 'quality' | 'frame'>
  now?: Date
  /** The browser reports save-data or a slow connection (`isSlowLink`): one year at a time instead of three. */
  slowLink?: boolean
  /** Once, as soon as the season is known and before the first check. */
  onSeason?: (s: SeasonPlan) => void
  /** Each year as it comes to something, in the order they do: the last frame first, then the oldest year, and so on. */
  onYear?: (y: YearResult) => void
}

const YEAR_MS = 90_000 // one year, from its own first request
const TOTAL_MS = 300_000 // the whole load
const YEARS_AT_ONCE = 3 // on a slow link, 1
const CHECKS_AT_ONCE = 2 // 3 years x 2 checks = 6 requests, the most a browser sends to the picture host (HTTP/1.1 only): neither goes up
const DISPLAY_PER_NATIVE = 2 // display pixels per 10 m pixel, as the satellite view's picture
const NATIVE_M = 10
const MAX_SIDE_M = 5_000 // the loader's own defence: a square is 500 m to 2.9 km (the share link's range)
const DAY = 86_400_000

type Cut = Exclude<GapReason, 'no-clear-picture'>
type Failure = { reason: Extract<TimeLapseResult, { ok: false }>['reason'] }
type Outcome = { frame: TimeLapseFrame } | { gap: GapReason }
type Run = <T>(call: () => Promise<T>) => Promise<T>
/** A candidate that was checked, with the mask of its display pixels that are not clear. */
interface Read extends Checked {
  invalid: Uint8Array
}

/** What every step reads of the load: its inputs, and the two signals that end it. */
interface Ctx {
  deps: TimeLapseDeps
  now: Date
  grid: DisplayGrid
  aoi: AoiGeometry
  /** The square's corners: `selectPerDate` counts a scene as covering only when it holds every one. */
  corners: LonLat[]
  /** What the catalogue is told of the square: the box on a coarse grid, as the satellite view does. */
  bbox: Bbox
  /** Ends every year: the caller's abort and the 300 s. */
  stop: AbortSignal
  /** The caller's own signal: it tells the caller's abort from the 300 s. */
  caller: AbortSignal
  late: () => boolean
  /** Nobody has gone and the load has not ended: a callback may still be called. */
  live: () => boolean
}

/**
 * Every call is raced against the abort, so a dependency that ignores its signal cannot hold a year back, and nothing is called
 * once the signal has gone.
 */
function guard(signal: AbortSignal): Run {
  const gone = new Promise<never>((_, reject) =>
    signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
  )
  gone.catch(() => {})
  return (call) => {
    signal.throwIfAborted()
    return Promise.race([call(), gone])
  }
}

/** One year's signal, guard and clock. The signal ends with the load's; the 90 s count from `arm()`, the year's own first request. */
interface Scope {
  signal: AbortSignal
  run: Run
  timedOut: () => boolean
  arm: () => void
  end: () => void
}
function scopeOf(load: AbortSignal): Scope {
  const own = new AbortController()
  const relay = () => own.abort(load.reason)
  load.addEventListener('abort', relay, { once: true })
  if (load.aborted) relay()
  let over = false
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    signal: own.signal,
    run: guard(own.signal),
    timedOut: () => over,
    arm: () => {
      timer = setTimeout(() => {
        over = true
        own.abort(new Error('YEAR_DEADLINE'))
      }, YEAR_MS)
    },
    end: () => {
      clearTimeout(timer)
      load.removeEventListener('abort', relay)
    },
  }
}

/** A callback is the caller's: not once the caller has gone or the load has ended. One that throws ends the load as FAILED. */
const say = (c: Ctx, tell: () => void) => {
  if (c.live()) tell()
}
const day = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Why a call failed, as a year's gap: out of time (its 90 s, the 300 s, or a call that timed out on its own) or not answered at all. */
function cutOf(c: Ctx, s: Scope, e: unknown): Cut {
  return s.timedOut() || c.late() || (e as { name?: unknown } | null)?.name === 'TimeoutError'
    ? 'timed-out'
    : 'offline'
}

/** One display grid of about 2 display pixels per 10 m pixel (400 by 400 at 2 km), or null for a box that is not a square to load. */
function gridFor(square: Bbox): DisplayGrid | null {
  const [w, s, e, n] = square
  if (![w, s, e, n].every(Number.isFinite) || w >= e || s >= n) return null
  const metres = Math.max(haversineM([w, s], [e, s]), haversineM([w, s], [w, n]))
  return metres > MAX_SIDE_M
    ? null
    : makeDisplayGrid(square, Math.round((DISPLAY_PER_NATIVE * metres) / NATIVE_M), 0)
}

/**
 * The best scene of each day in a range, with whether it holds the whole square.
 * shortcut: `limited` (the search ran out of pages) is not looked at, as in the satellite view; a 41-day window is about one page and
 * the 12-month one about three of five, so look at it only if a place with many overlapping tiles shows scenes missing.
 */
async function scenesIn(c: Ctx, s: Scope, from: string, to: string): Promise<DateCandidate[]> {
  const found = await s.run(() => c.deps.search({ bbox: c.bbox, from, to, signal: s.signal }))
  return selectPerDate(found.items, c.corners)
}

/** One candidate checked at the grid: how clear the square is, and the mask of the display pixels that are not (one byte each). */
async function check(c: Ctx, s: Scope, scene: DateCandidate, signal: AbortSignal): Promise<Read> {
  const q = await s.run(() => c.deps.client.quality({ item: scene.item, aoi: c.aoi, grid: c.grid }, signal))
  const { invalid } = q
  if (invalid?.length !== c.grid.width * c.grid.height) throw new Error('BAD_MASK')
  return { scene, clear: q.stats.clearFraction, invalid }
}

/** The winner's picture, read once on the grid. Only the display pixels are kept: the native pixels and the hash are dropped here. */
async function read(c: Ctx, s: Scope, won: Read): Promise<TimeLapseFrame> {
  const f = await s.run(() =>
    c.deps.client.frame({ item: won.scene.item, level: 0, aoi: c.aoi, grid: c.grid }, s.signal),
  )
  const { rgba } = f.display
  if (rgba.length !== c.grid.width * c.grid.height * 4) throw new Error('BAD_FRAME')
  return {
    sceneId: won.scene.item.id,
    date: won.scene.date,
    ageDays: ageDays(won.scene.item, c.now),
    clearPct: Math.round(won.clear * 100),
    rgba,
    invalid: won.invalid,
  }
}

/**
 * What a year's candidates, in rank order, come to. The best two are checked at once; the first that is 80% clear wins, even when
 * the second answers first or is clearer, and the other check is cancelled. The winner is read once. A check that failed is no
 * answer: when nothing clear is found, the year says it was cut short, never "no clear picture".
 */
async function settle(c: Ctx, s: Scope, scenes: readonly DateCandidate[]): Promise<Outcome> {
  const checks = new AbortController()
  s.signal.addEventListener('abort', () => checks.abort(s.signal.reason), { once: true })
  const started = scenes
    .slice(0, CHECKS_AT_ONCE)
    .map((scene): Promise<Read | { cut: Cut }> =>
      check(c, s, scene, checks.signal).catch((e: unknown) => ({ cut: cutOf(c, s, e) })),
    )
  const done: Read[] = []
  let cut: Cut | undefined
  for (const pending of started) {
    const r = await pending
    if ('cut' in r) cut ??= r.cut
    else done.push(r)
    if ('frame' in settleYear(done)) break
  }
  checks.abort() // the other check, if it is still running, is not needed
  const settled = settleYear(done, cut)
  return 'frame' in settled ? { frame: await read(c, s, settled.frame as Read) } : settled
}

/** The target day and its candidates: from the one search of the last 12 months. */
async function findSeason(c: Ctx, s: Scope): Promise<Season | Failure> {
  const from = day(c.now.getTime() - LOOKBACK_DAYS * DAY)
  const to = day(c.now.getTime())
  let scenes: DateCandidate[]
  try {
    scenes = await scenesIn(c, s, from, to)
  } catch (e) {
    if (c.caller.aborted) throw e
    return { reason: s.timedOut() ? 'FAILED' : 'OFFLINE' }
  }
  if (!scenes.some((x) => x.coversAoi)) return { reason: 'NO_SCENES' }
  return pickSeason(scenes, c.now) ?? { reason: 'ALL_CLOUDY' }
}

interface Anchored {
  season: Season
  last: YearResult
}
/** The target day and the last frame: a year of its own and serial, before anything else is asked. */
async function anchor(c: Ctx): Promise<Anchored | Failure> {
  const s = scopeOf(c.stop)
  s.arm()
  try {
    const season = await findSeason(c, s)
    if ('reason' in season) return season
    const years = season.windows.map((w) => w.year).reverse()
    say(c, () => c.deps.onSeason?.({ grid: c.grid, monthDay: season.monthDay, years }))
    const outcome = await settle(c, s, season.cluster)
    if ('gap' in outcome) return { reason: outcome.gap === 'no-clear-picture' ? 'ALL_CLOUDY' : 'FAILED' }
    return { season, last: { year: season.windows[0]!.year, frame: outcome.frame } }
  } catch (e) {
    if (c.caller.aborted) throw e
    return { reason: 'FAILED' }
  } finally {
    s.end()
  }
}

interface Job {
  window: YearWindow
  scope: Scope
  /** Its search, started with the other years' and awaited when the year's turn comes. */
  scenes: Promise<DateCandidate[]>
}
/** An earlier year, 90 s from its own first request. Null once the caller has gone. Never rejects. */
async function runYear(c: Ctx, { window, scope, scenes }: Job): Promise<YearResult | null> {
  scope.arm()
  try {
    const outcome = await settle(c, scope, rankYear(await scenes, window))
    return { year: window.year, ...outcome }
  } catch (e) {
    return c.caller.aborted ? null : { year: window.year, gap: cutOf(c, scope, e) }
  } finally {
    scope.end()
  }
}

/** The earlier years, `windows` oldest first: all the searches start together, the years go through a queue 3 at once (1 on a slow link). */
async function loadYears(c: Ctx, windows: readonly YearWindow[]): Promise<YearResult[]> {
  const queue = windows.map((window): Job => {
    const scope = scopeOf(c.stop)
    const scenes = scenesIn(c, scope, window.from, window.to)
    scenes.catch(() => {}) // a year that is never reached must not leave an unhandled rejection behind
    return { window, scope, scenes }
  })
  const done: YearResult[] = []
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      let r: YearResult | null
      if (c.stop.aborted) {
        // the 300 s left no time for this year: a gap that says so, and nothing once the caller has gone
        job.scope.end()
        r = c.caller.aborted ? null : { year: job.window.year, gap: 'timed-out' }
      } else r = await runYear(c, job)
      if (!r) continue
      done.push(r)
      const y = r
      say(c, () => c.deps.onYear?.(y))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(c.deps.slowLink ? 1 : YEARS_AT_ONCE, queue.length) }, worker),
  )
  return done
}

async function load(c: Ctx): Promise<TimeLapseResult> {
  const a = await anchor(c)
  if ('reason' in a) return { ok: false, reason: a.reason }
  say(c, () => c.deps.onYear?.(a.last))
  const earlier = await loadYears(c, a.season.windows.slice(1).reverse())
  return {
    ok: true,
    grid: c.grid,
    monthDay: a.season.monthDay,
    years: [a.last, ...earlier].sort((x, y) => x.year - y.year),
  }
}

/** The context of a load, or null when the square or the day of now is not one. */
function contextFor(
  deps: TimeLapseDeps,
  square: Bbox,
  life: Pick<Ctx, 'stop' | 'caller' | 'late' | 'live'>,
): Ctx | null {
  const now = deps.now ?? new Date()
  const grid = gridFor(square)
  if (!grid || Number.isNaN(now.getTime())) return null
  const [w, s, e, n] = square
  const corners: LonLat[] = [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ]
  const aoi: AoiGeometry = { kind: 'site', rings: [[...corners, [w, s]]] }
  return { deps, now, grid, aoi, corners, bbox: coarsenBbox(square), ...life }
}

/**
 * One picture for each of the last 6 years of `square` (west, south, east, north), as they arrive. Never throws: every way it can
 * end is a TimeLapseResult, and every year that has no picture says why.
 */
export async function loadTimeLapse(
  deps: TimeLapseDeps,
  square: Bbox,
  signal: AbortSignal,
): Promise<TimeLapseResult> {
  // One signal ends every year: the caller's abort and the 300 s. They are told apart below, so a late load is still a result.
  const stop = new AbortController()
  const relay = () => stop.abort(signal.reason)
  signal.addEventListener('abort', relay, { once: true })
  let late = false
  let ended = false
  const timer = setTimeout(() => {
    late = true
    stop.abort(new Error('TOTAL_DEADLINE'))
  }, TOTAL_MS)
  try {
    if (signal.aborted) relay()
    stop.signal.throwIfAborted()
    const c = contextFor(deps, square, {
      stop: stop.signal,
      caller: signal,
      late: () => late,
      live: () => !ended && !signal.aborted,
    })
    const result: TimeLapseResult = c ? await load(c) : { ok: false, reason: 'FAILED' }
    signal.throwIfAborted() // a caller that has gone is told so, whatever the load came to
    return result
  } catch {
    return { ok: false, reason: signal.aborted ? 'ABORTED' : 'FAILED' }
  } finally {
    ended = true // nothing is called back after this, and nothing still running may ask for more
    clearTimeout(timer)
    signal.removeEventListener('abort', relay)
    stop.abort()
  }
}
