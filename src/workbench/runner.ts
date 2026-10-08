import type { AoiGeometry, DisplayGrid, LonLat } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import type { DateCandidate, S2Item, SearchResult } from '../stac/types.ts'
import type { FrameRequest, FrameResult, QualityRequest, QualityResult } from '../workers/imagery-core.ts'
import { isUsable } from './defaults.ts'

export type EntryStatus = 'queued' | 'checking' | 'checked' | 'error'
export interface DateEntry {
  date: string
  candidate: DateCandidate
  quality: QualityResult | null
  thumb: FrameResult | null
  full: FrameResult | null
  /** 1 byte per `grid` pixel, 1 = not clear. Arrives together with `full` (see `requestFull`). */
  invalid: Uint8Array | null
  status: EntryStatus
  /** Why the check (`status` 'error') or the full frame failed. A failed preview sets `thumbFailed`. */
  error: string | null
  thumbFailed: boolean
}
export interface EvidenceState {
  phase: 'searching' | 'ready' | 'error'
  /** True from the first list (the known days, shown while the whole range is searched) until the whole list or a failure. */
  more: boolean
  limited: boolean
  source: string | null
  entries: DateEntry[]
  error: string | null
}
export interface RunnerDeps {
  search(a: { bbox: Bbox; from: string; to: string; signal: AbortSignal }): Promise<SearchResult>
  select(items: S2Item[], points: LonLat[]): DateCandidate[]
  quality(req: QualityRequest, signal: AbortSignal): Promise<QualityResult>
  frame(req: FrameRequest, signal: AbortSignal): Promise<FrameResult>
}
export interface RunnerInput {
  aoi: AoiGeometry
  bbox: Bbox
  points: LonLat[]
  dateFrom: string
  dateTo: string
  grid: DisplayGrid
  thumbGrid: DisplayGrid
  priority: string[]
  only?: string[]
}

export function interleaveEnds(dates: string[]): string[] {
  const out: string[] = []
  for (let i = 0, j = dates.length - 1; i <= j; i++, j--) {
    out.push(dates[i]!)
    if (i !== j) out.push(dates[j]!)
  }
  return out
}

/** Thumbnails that load unasked. The review screen's estimate (src/geo/estimate.ts) counts the same 12. */
const EAGER_THUMBS = 12

/** One-day searches in flight at once: the known days searched first (no more than this many) and the days of an `only` run. */
const DAYS_AT_ONCE = 6

/**
 * `concurrency` 6 is what a browser opens per HTTP/1.1 host, and the COG hosts are the bottleneck. Measured on the worked example
 * (docs/ops/probes.md, P9): 48 checks in 30 s at 6 against 32 at 4; 8 and 12 did no better than 6.
 */
export function createRunner(
  deps: RunnerDeps,
  input: RunnerInput,
  onState: (s: EvidenceState) => void,
  concurrency = 6,
) {
  const ac = new AbortController()
  let state: EvidenceState = {
    phase: 'searching',
    more: false,
    limited: false,
    source: null,
    entries: [],
    error: null,
  }
  const emit = (patch: Partial<EvidenceState>) => {
    if (ac.signal.aborted) return
    state = { ...state, ...patch }
    onState(state)
  }
  const patchEntry = (date: string, patch: Partial<DateEntry>) =>
    emit({ entries: state.entries.map((e) => (e.date === date ? { ...e, ...patch } : e)) })
  const entry = (date: string) => state.entries.find((e) => e.date === date)

  const queue: Array<() => Promise<void>> = []
  let active = 0
  const pump = () => {
    while (active < concurrency && queue.length && !ac.signal.aborted) {
      const job = queue.shift()!
      active++
      job().finally(() => {
        active--
        pump()
      })
    }
  }
  const enqueue = (job: () => Promise<void>, front = false) => {
    if (front) queue.unshift(job)
    else queue.push(job)
    pump()
  }

  // Failures stay until `retry(date)`. `entry.error` shows the check's reason first, else the full frame's.
  const checkErr = new Map<string, string>()
  const fullErr = new Map<string, string>()
  const errorOf = (date: string) => checkErr.get(date) ?? fullErr.get(date) ?? null
  // Queued or loading, so a repeated request cannot start the same download twice.
  const fullBusy = new Set<string>()
  const thumbBusy = new Set<string>()
  let eager = 0

  const loadThumb = (date: string) => async () => {
    try {
      const e = entry(date)
      if (!e || e.thumb) return
      const thumb = await deps.frame(
        { item: e.candidate.item, level: 1, aoi: input.aoi, grid: input.thumbGrid },
        ac.signal,
      )
      patchEntry(date, { thumb })
    } catch {
      patchEntry(date, { thumbFailed: true })
    } finally {
      thumbBusy.delete(date)
    }
  }
  const queueThumb = (date: string, front = false) => {
    thumbBusy.add(date)
    enqueue(loadThumb(date), front)
  }

  const loadFull = (date: string) => async () => {
    try {
      const e = entry(date)
      if (!e || e.full) return
      const { item } = e.candidate
      // The mask is one more quality call, now with the grid (its SCL read comes from the byte cache).
      // Frame and mask are stored together, so a loaded `full` always has its `invalid`.
      const [full, q] = await Promise.all([
        deps.frame({ item, level: 0, aoi: input.aoi, grid: input.grid }, ac.signal),
        deps.quality({ item, aoi: input.aoi, grid: input.grid }, ac.signal),
      ])
      patchEntry(date, { full, invalid: q.invalid ?? null })
    } catch (err) {
      fullErr.set(date, (err as Error).message)
      patchEntry(date, { error: errorOf(date) })
    } finally {
      fullBusy.delete(date)
    }
  }
  const queueFull = (date: string) => {
    fullBusy.add(date)
    enqueue(loadFull(date), true)
  }

  const check = (date: string) => async () => {
    const e = entry(date)
    if (!e || e.status !== 'queued') return
    patchEntry(date, { status: 'checking' })
    try {
      // No grid: a mask per date would be 1 MiB each. `requestFull` fetches the masks of the dates shown.
      const q = await deps.quality({ item: e.candidate.item, aoi: input.aoi }, ac.signal)
      patchEntry(date, { quality: q, status: 'checked' })
      const checked = entry(date)
      if (checked && isUsable(checked) && eager < EAGER_THUMBS) {
        eager++
        // In this job's own place, not queued: at the back it would wait out the whole sweep (minutes on a long range),
        // and meanwhile `thumbBusy` would turn away `requestThumb` for the date on show.
        thumbBusy.add(date)
        await loadThumb(date)()
      }
    } catch (err) {
      checkErr.set(date, (err as Error).message)
      patchEntry(date, { status: 'error', error: errorOf(date) })
    }
  }

  const newEntry = (c: DateCandidate): DateEntry => ({
    date: c.date,
    candidate: c,
    quality: null,
    thumb: null,
    full: null,
    invalid: null,
    status: 'queued',
    error: null,
    thumbFailed: false,
  })
  const pick = (rs: SearchResult[]) =>
    deps.select(
      rs.flatMap((r) => r.items),
      input.points,
    )

  /**
   * Shows `cands` with `patch`. A date that already has an entry keeps it (object, quality, photos, status), a date the search no
   * longer returns stays, and only the new dates are queued for a check: `priority` first, then both ends inward.
   */
  const show = (patch: Partial<EvidenceState>, cands: DateCandidate[]) => {
    const have = new Set(state.entries.map((e) => e.date))
    const fresh = cands.filter((c) => !have.has(c.date))
    const entries = [...state.entries, ...fresh.map(newEntry)]
    emit({ ...patch, entries: entries.sort((a, b) => a.date.localeCompare(b.date)) })
    const isNew = new Set(fresh.map((c) => c.date))
    const all = cands.map((c) => c.date)
    for (const d of new Set([...input.priority.filter((d) => all.includes(d)), ...interleaveEnds(all)]))
      if (isNew.has(d)) enqueue(check(d))
  }

  const searchDay = (d: string) => deps.search({ bbox: input.bbox, from: d, to: d, signal: ac.signal })
  const inRange = (d: string) => d >= input.dateFrom && d <= input.dateTo

  /** The days alone, `DAYS_AT_ONCE` at a time. One failed day fails the lot, and no new day starts after it. */
  const searchDays = async (days: string[]) => {
    const found: SearchResult[] = []
    let next = 0
    let failed = false
    const worker = async () => {
      while (!failed && next < days.length) {
        const i = next++
        found[i] = await searchDay(days[i]!).catch((e) => {
          failed = true
          throw e
        })
      }
    }
    await Promise.all(Array.from({ length: Math.min(DAYS_AT_ONCE, days.length) }, worker))
    return found
  }

  const start = async () => {
    let over = false // the search of the range has ended: a list of the known days arriving now is stale
    try {
      if (input.only) {
        // Exactly the named days, never the range. A pinned date must not drop out unseen, hence all or nothing.
        const named = [...new Set(input.only)].filter(inRange)
        const found = await searchDays(named)
        const cands = pick(found).filter((c) => named.includes(c.date))
        return show({ phase: 'ready', more: false, limited: false, source: found[0]?.source ?? null }, cands)
      }
      // The known days (before, after, pins) are searched alone at the same time, and shown first if the range is still being searched.
      const known = [...new Set(input.priority)].filter(inRange).slice(0, DAYS_AT_ONCE)
      if (known.length)
        void Promise.allSettled(known.map(searchDay))
          .then((rs) => {
            const ok = rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
            const cands = over || !ok.length ? [] : pick(ok)
            if (cands.length)
              show({ phase: 'ready', more: true, limited: false, source: ok[0]!.source }, cands)
          })
          // What can throw above is `select`. The search of the range runs it on these days' items too and reports a failure
          // as `phase: 'error'`, so skipping this first list hides nothing.
          .catch(() => {})
      const res = await deps.search({
        bbox: input.bbox,
        from: input.dateFrom,
        to: input.dateTo,
        signal: ac.signal,
      })
      show({ phase: 'ready', more: false, limited: res.limited, source: res.source }, pick([res]))
    } catch (err) {
      emit({ phase: 'error', more: false, error: (err as Error).message })
    } finally {
      over = true
    }
  }

  /** Full frame plus mask. Idempotent: nothing when loaded, loading, or failed (until `retry(date)`). */
  const requestFull = (date: string) => {
    const e = entry(date)
    if (!e || e.full || fullBusy.has(date) || fullErr.has(date)) return
    queueFull(date)
  }

  /**
   * Quality check of a date still waiting in the sweep, next, ahead of the rest. Idempotent: the date's own slot in the
   * queue finds it no longer `queued` and does nothing, and a date that is checking, checked or failed is left alone.
   */
  const requestCheck = (date: string) => {
    if (entry(date)?.status === 'queued') enqueue(check(date), true)
  }

  /** 256 px preview of a usable date. Idempotent, like `requestFull`. */
  const requestThumb = (date: string) => {
    const e = entry(date)
    if (!e || !isUsable(e) || e.thumb || e.thumbFailed || thumbBusy.has(date)) return
    queueThumb(date, true)
  }

  /** With a date: redo its failed check, full frame and preview, before queued work. Without: the search. */
  const retry = (date?: string) => {
    if (ac.signal.aborted) return
    if (date === undefined) {
      if (state.phase !== 'error') return
      emit({ phase: 'searching', error: null })
      void start()
      return
    }
    const e = entry(date)
    if (!e) return
    if (e.status === 'error') {
      checkErr.delete(date)
      patchEntry(date, { status: 'queued', error: errorOf(date) })
      enqueue(check(date), true)
    }
    if (fullErr.delete(date)) {
      patchEntry(date, { error: errorOf(date) })
      queueFull(date)
    }
    if (e.thumbFailed) {
      patchEntry(date, { thumbFailed: false })
      queueThumb(date, true)
    }
  }

  const dispose = () => {
    ac.abort()
    queue.length = 0
  }

  return { start, requestFull, requestThumb, requestCheck, retry, dispose }
}
