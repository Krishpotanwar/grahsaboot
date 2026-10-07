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

export function createRunner(
  deps: RunnerDeps,
  input: RunnerInput,
  onState: (s: EvidenceState) => void,
  concurrency = 4,
) {
  const ac = new AbortController()
  let state: EvidenceState = { phase: 'searching', limited: false, source: null, entries: [], error: null }
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
        queueThumb(date)
      }
    } catch (err) {
      checkErr.set(date, (err as Error).message)
      patchEntry(date, { status: 'error', error: errorOf(date) })
    }
  }

  const start = async () => {
    try {
      const res = await deps.search({
        bbox: input.bbox,
        from: input.dateFrom,
        to: input.dateTo,
        signal: ac.signal,
      })
      let cands = deps.select(res.items, input.points)
      if (input.only) cands = cands.filter((c) => input.only!.includes(c.date))
      emit({
        phase: 'ready',
        limited: res.limited,
        source: res.source,
        entries: cands.map((c) => ({
          date: c.date,
          candidate: c,
          quality: null,
          thumb: null,
          full: null,
          invalid: null,
          status: 'queued',
          error: null,
          thumbFailed: false,
        })),
      })
      const all = cands.map((c) => c.date)
      const order = [...new Set([...input.priority.filter((d) => all.includes(d)), ...interleaveEnds(all)])]
      for (const d of order) enqueue(check(d))
    } catch (err) {
      emit({ phase: 'error', error: (err as Error).message })
    }
  }

  /** Full frame plus mask. Idempotent: nothing when loaded, loading, or failed (until `retry(date)`). */
  const requestFull = (date: string) => {
    const e = entry(date)
    if (!e || e.full || fullBusy.has(date) || fullErr.has(date)) return
    queueFull(date)
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

  return { start, requestFull, requestThumb, retry, dispose }
}
