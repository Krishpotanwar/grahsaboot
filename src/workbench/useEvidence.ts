import { useEffect, useMemo, useRef, useState } from 'react'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { DisplayGrid, LonLat } from '../evidence/types.ts'
import {
  coarsenBbox,
  summarizeAoi,
  toAoiGeometry,
  type AoiInput,
  type AoiResult,
  type AoiSummary,
} from '../geo/aoi.ts'
import type { Investigation } from '../data/investigation.ts'
import { searchSentinel2 } from '../stac/search.ts'
import { selectPerDate } from '../stac/select.ts'
import { createImageryClient } from '../workers/imagery-client.ts'
import { createRunner, type EvidenceState } from './runner.ts'

const vertices = (aoi: AoiInput): LonLat[] =>
  aoi.kind === 'site' ? aoi.geometry.coordinates[0]! : aoi.geometry.coordinates

const SEARCHING: EvidenceState = {
  phase: 'searching',
  limited: false,
  source: null,
  entries: [],
  error: null,
}
// A stored outline that no longer validates: say so, never an endless "Searching".
const BAD_OUTLINE: EvidenceState = { ...SEARCHING, phase: 'error', error: 'BAD_OUTLINE' }

export function useEvidence(
  inv: Investigation | null | undefined,
  maxSide: number,
  opts: { only?: string[] } = {},
) {
  const [state, setState] = useState<EvidenceState>(SEARCHING)
  const runner = useRef<ReturnType<typeof createRunner> | null>(null)
  const checked = useMemo<AoiResult | null>(() => {
    if (!inv) return null
    try {
      return summarizeAoi(inv.aoi)
    } catch {
      return { ok: false, issues: [] } // a record too damaged to validate is as unreadable as one that fails
    }
  }, [inv?.aoi]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary: AoiSummary | null = checked?.ok ? checked.summary : null
  const grid: DisplayGrid | null = useMemo(
    () => (summary ? makeDisplayGrid(summary.bbox, maxSide) : null),
    [summary, maxSide],
  )
  const thumbGrid: DisplayGrid | null = useMemo(
    () => (summary ? makeDisplayGrid(summary.bbox, 256) : null),
    [summary],
  )
  const onlyKey = opts.only?.join(',') ?? ''

  useEffect(() => {
    setState(SEARCHING) // a new run never shows the previous run's dates
    if (!inv || !summary || !grid || !thumbGrid) return
    const client = createImageryClient()
    const r = createRunner(
      {
        search: (a) => searchSentinel2({ ...a, bbox: coarsenBbox(a.bbox) }),
        select: selectPerDate,
        quality: (q, s) => client.quality(q, s),
        frame: (f, s) => client.frame(f, s),
      },
      {
        aoi: toAoiGeometry(inv.aoi),
        bbox: summary.bbox,
        points: vertices(inv.aoi),
        dateFrom: inv.dateFrom,
        dateTo: inv.dateTo,
        grid,
        thumbGrid,
        priority: [inv.before, inv.after, ...inv.pinned].filter((d): d is string => !!d),
        only: opts.only,
      },
      setState,
    )
    runner.current = r
    void r.start()
    return () => {
      r.dispose()
      client.dispose()
      runner.current = null
    }
  }, [inv?.id, inv?.dateFrom, inv?.dateTo, summary, grid, thumbGrid, onlyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable, so effects that depend on them do not re-run on every render. All of them are safe to call repeatedly.
  const api = useMemo(
    () => ({
      requestFull: (date: string) => runner.current?.requestFull(date),
      requestThumb: (date: string) => runner.current?.requestThumb(date),
      requestCheck: (date: string) => runner.current?.requestCheck(date),
      retry: (date?: string) => runner.current?.retry(date),
    }),
    [],
  )

  return { state: inv && !summary ? BAD_OUTLINE : state, grid, thumbGrid, summary, ...api }
}
