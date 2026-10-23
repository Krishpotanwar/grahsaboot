import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config.ts'
import { bboxOf } from '../geo/aoi.ts'
import { squareAround } from '../geo/square.ts'
import { realDate } from '../lib/dates.ts'
import { isSlowLink } from '../map/tier.ts'
import type { Place } from '../search/nominatim.ts'
import { searchSentinel2 } from '../stac/search.ts'
import { createImageryClient, type ImageryClient } from '../workers/imagery-client.ts'
import { loadTimeLapse, type SeasonPlan, type TimeLapseResult, type YearResult } from './load.ts'
import { SIDE_M } from './params.ts'
import { spendStart } from './startFlag.ts'

/** Why a load came to nothing; every other end has at least the last frame. */
export type Failure = Exclude<Extract<TimeLapseResult, { ok: false }>['reason'], 'ABORTED'>
export interface Run {
  /** `idle`: nothing asked for yet (the start screen). `done`: the load has ended and has its last frame. */
  phase: 'idle' | 'loading' | 'done' | 'failed'
  /** The grid, the target day and the years, once the loader knows them. */
  plan: SeasonPlan | null
  /** Each year as it came to a frame or a labelled gap. */
  years: ReadonlyMap<number, YearResult>
  failure: Failure | null
}
const IDLE: Run = { phase: 'idle', plan: null, years: new Map(), failure: null }
const LOADING: Run = { ...IDLE, phase: 'loading' }

/** Test builds only: `?now=YYYY-MM-DD` is the day the loader counts back from (the fixture scenes are not recent). */
const testNow = () =>
  config.testMode ? realDate(new URLSearchParams(location.search).get('now')) : undefined
const slowLink = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  return isSlowLink({ saveData: !!c?.saveData, effectiveType: c?.effectiveType ?? null })
}

/**
 * One load of the time-lapse of `place`, started now (`auto`) or when `start` is called. The imagery client lives for the load
 * only, and leaving the page aborts every call and ends the client (the pattern of src/new/ContextToggle.tsx).
 */
export function useTimeLapse(place: Pick<Place, 'lat' | 'lon'>, auto: boolean) {
  const [run, setRun] = useState<Run>(auto ? LOADING : IDLE)
  const live = useRef<AbortController | null>(null)

  const start = useCallback(() => {
    live.current?.abort()
    let client: ImageryClient
    try {
      client = createImageryClient()
    } catch {
      setRun({ ...IDLE, phase: 'failed', failure: 'FAILED' }) // no worker to read with: the calm failure line and Try again
      return
    }
    const ac = new AbortController()
    live.current = ac
    ac.signal.addEventListener('abort', () => client.dispose(), { once: true })
    setRun(LOADING)
    void loadTimeLapse(
      {
        search: searchSentinel2,
        client,
        now: testNow(),
        slowLink: slowLink(),
        onSeason: (plan) => setRun((r) => ({ ...r, plan })),
        onYear: (y) => setRun((r) => ({ ...r, years: new Map(r.years).set(y.year, y) })),
      },
      bboxOf(squareAround(place.lon, place.lat, SIDE_M)),
      ac.signal,
    )
      .then((res) => {
        if (ac.signal.aborted) return
        setRun((r) =>
          res.ok
            ? { ...r, phase: 'done' }
            : { ...r, phase: 'failed', failure: res.reason === 'ABORTED' ? 'FAILED' : res.reason },
        )
      })
      .finally(() => {
        client.dispose()
        if (live.current === ac) live.current = null
      })
  }, [place.lat, place.lon])

  // The first load starts with the page when the person pressed our own button (D8); the flag is spent as it does. In development
  // React runs this effect twice: the first load is aborted by the cleanup and the second one is the one that stays.
  useEffect(() => {
    if (auto) {
      spendStart()
      start()
    }
    return () => live.current?.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { run, start }
}
