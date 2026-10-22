import { config } from '../config.ts'
import type { ContextImage, ContextResult } from '../context/load.ts'
import { realDate } from '../lib/dates.ts'

// What the satellite switch (ContextToggle.tsx) needs that is not a component: the states it shows, how a finished load becomes
// one, the guard that keeps a stale load from changing the screen, the remembered choice and the test clock.

export type Stage = 'searching' | 'checking' | 'reading'
export type Choice = 'map' | 'satellite'

/** What the slot under the switch is about. The picture on the map is the `image` of `on`, and only that. */
export type View =
  | { s: 'off' }
  | { s: 'loading'; stage: Stage; slow: boolean }
  | { s: 'on'; image: ContextImage; cloudy: boolean }
  | { s: 'none' }
  | { s: 'fail'; offline: boolean }
export const OFF: View = { s: 'off' }

/**
 * What the Satellite option says it costs: the STAC and COG bytes of six cold loads, measured on 2026-10-18 on the build VM with the
 * real services (scripts/probe-e/context-view.mts; the worked example and the village, each at views 1.8, 3.6 and 7.1 km wide):
 * 2.6, 2.6, 4.1, 4.2, 8.0 and 8.0 MB, median 4.1, mean 4.9. It depends on how the view falls across the scene's 10 km blocks. The
 * label asks for metered data, so it says the mean rounded (5), not the median, which would understate the two 8 MB loads.
 */
export const COST_MB = 5
/** A load still running after this long says so (the loader's own hard stop is 60 s). */
export const SLOW_MS = 20_000

export function viewOf(r: ContextResult): View {
  if (r.ok) return { s: 'on', image: r.image, cloudy: false }
  switch (r.reason) {
    case 'ALL_CLOUDY':
      return { s: 'on', image: r.image, cloudy: true }
    case 'NO_SCENES':
      return { s: 'none' }
    case 'OFFLINE':
      return { s: 'fail', offline: true }
    case 'FAILED':
      return { s: 'fail', offline: false }
    default:
      return OFF // ABORTED
  }
}

/**
 * Runs one load and tells `on` what happened, unless `signal` has aborted: the loader may still hand back `ok`, or a stage word,
 * a few microtask hops after the abort, and the caller's own signal is the one that says whether anyone still wants the answer.
 * Never throws: a load that does becomes the failure line.
 */
export async function runLoad(
  load: (onStage: (s: Stage) => void) => Promise<ContextResult>,
  signal: AbortSignal,
  on: { stage(s: Stage): void; done(v: View): void },
): Promise<void> {
  let result: ContextResult
  try {
    result = await load((s) => {
      if (!signal.aborted) on.stage(s)
    })
  } catch {
    result = { ok: false, reason: 'FAILED' }
  }
  if (!signal.aborted) on.done(viewOf(result))
}

export const CHOICE_KEY = 'gs-context-view'

/** The remembered choice. Storage may be missing or blocked: then it is Map, as for everyone who has not chosen. */
export function readChoice(): Choice {
  try {
    return localStorage.getItem(CHOICE_KEY) === 'satellite' ? 'satellite' : 'map'
  } catch {
    return 'map'
  }
}
export function writeChoice(c: Choice): void {
  try {
    localStorage.setItem(CHOICE_KEY, c)
  } catch {
    /* never required */
  }
}

/** Test builds only: `?now=YYYY-MM-DD` is the loader's today (the fixture scenes are dated 2025). A real build ignores it. */
export function nowFromUrl(search: string, testMode = config.testMode): Date | undefined {
  return testMode ? realDate(new URLSearchParams(search).get('now')) : undefined
}
