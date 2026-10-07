import { useEffect, useMemo, useState } from 'react'
import { setBeforeAfter } from '../data/investigation.ts'
import { useInvestigation } from '../data/useInvestigation.ts'
import { fmtDate } from '../lib/format.ts'
import { Link } from '../lib/router.tsx'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, MicroLabel, Skeleton } from '../ui/kit.tsx'
import { isUsable, pickDefaults, quartilesDone } from '../workbench/defaults.ts'
import { EvidenceViewer, type Slot } from '../workbench/EvidenceViewer.tsx'
import type { DateEntry } from '../workbench/runner.ts'
import { useEvidence } from '../workbench/useEvidence.ts'
import NotFound from './NotFound.tsx'

const slot = (e: DateEntry | undefined): Slot =>
  e
    ? {
        date: e.date,
        frame: e.full,
        stats: e.quality?.stats ?? null,
        itemId: e.candidate.item.id,
        failed: e.error !== null && e.full === null,
      }
    : null

export default function Workbench({ id }: { id: string }) {
  const { inv, update, error } = useInvestigation(id)
  const { tier } = useMapStage()
  useMapLayout('hidden')
  // Fixed at mount: a tier downgrade, a resize or a rotation must not rebuild the grid and restart the search and checks.
  const [maxSide] = useState(() =>
    matchMedia('(min-width: 1024px)').matches ? (tier >= 2 ? 1024 : 768) : 512,
  )
  const { state, grid, summary, requestFull, retry } = useEvidence(inv, maxSide)
  const entries = state.entries
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  const beforeEntry = inv?.before ? byDate.get(inv.before) : undefined
  const afterEntry = inv?.after ? byDate.get(inv.after) : undefined
  // A pixel is unusable for the difference when either photo cannot show it clearly. Null until both masks have arrived.
  const invalid = useMemo(() => {
    const a = beforeEntry?.invalid
    const b = afterEntry?.invalid
    return a && b ? a.map((v, i) => (v || b[i] ? 1 : 0)) : null
  }, [beforeEntry?.invalid, afterEntry?.invalid])

  useEffect(() => {
    if (!inv || inv.before || !quartilesDone(entries, inv.dateFrom, inv.dateTo)) return
    const d = pickDefaults(entries, inv.dateFrom, inv.dateTo)
    if (d.before && d.after) update((i) => setBeforeAfter(i, d.before!, d.after!)) // a refusal sets `error`, shown below
  }, [inv, entries, update])

  useEffect(() => {
    if (state.phase !== 'ready' || !inv) return
    for (const d of [inv.before, inv.after]) if (d && byDate.get(d) && !byDate.get(d)!.full) requestFull(d)
  }, [state.phase, inv?.before, inv?.after, byDate]) // eslint-disable-line react-hooks/exhaustive-deps

  if (inv === undefined) return <Skeleton className="m-6 h-64" />
  if (inv === null)
    return error ? (
      <div className="mx-auto max-w-[65ch] px-4 py-20">
        <p role="alert" className="text-fg-2">
          {flow.workbench.errors[error] ?? error}
        </p>
        <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-[6px] border border-control px-4">
          {copy.notFound.home}
        </Link>
      </div>
    ) : (
      <NotFound text={{ title: copy.notFound.title, body: flow.workbench.notFound }} />
    )

  // With no pair to show, say plainly why there is none. A failed check is not "obscured", so any failure holds these back.
  const settled =
    state.phase === 'ready' &&
    entries.length > 0 &&
    !(beforeEntry && afterEntry) &&
    entries.every((e) => e.status === 'checked')
  const usable = entries.filter(isUsable).length
  const allCloudy = settled && usable === 0
  const notEnoughClear = settled && usable === 1
  const dates =
    inv.before && inv.after
      ? flow.workbench.meta.pair(fmtDate(inv.before), fmtDate(inv.after))
      : flow.review.range(fmtDate(inv.dateFrom), fmtDate(inv.dateTo))
  const meta = !summary
    ? dates
    : inv.aoi.kind === 'road'
      ? flow.workbench.meta.road(summary.lengthKm ?? 0, inv.aoi.widthM, dates)
      : flow.workbench.meta.site(summary.areaKm2, dates)

  return (
    <div className="grid min-h-[calc(100dvh-64px)] gap-px bg-line lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid content-start gap-4 bg-bg p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <MicroLabel>{flow.workbench.notSaved}</MicroLabel>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-[-0.02em]">{inv.name}</h1>
            <p className="mt-1 font-mono text-[0.75rem] text-fg-2 num">{meta}</p>
          </div>
          <Link
            to={`/i/${inv.id}/report`}
            className="inline-flex h-11 items-center rounded-[6px] border border-control px-4"
          >
            {flow.workbench.report}
          </Link>
        </header>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {flow.workbench.errors[error] ?? error}
          </p>
        )}
        <div aria-live="polite" className="grid justify-items-start gap-2 text-sm text-fg-2">
          {state.phase === 'searching' && <p>{flow.workbench.searching}</p>}
          {state.phase === 'error' && state.error === 'BAD_OUTLINE' && (
            <p className="text-bad">{flow.workbench.badOutline}</p>
          )}
          {state.phase === 'error' && state.error !== 'BAD_OUTLINE' && (
            <>
              <p className="text-bad">{flow.workbench.searchFailed}</p>
              <Button onClick={() => retry()}>{copy.common.retry}</Button>
            </>
          )}
          {state.phase === 'ready' && entries.length === 0 && <p>{flow.workbench.none}</p>}
          {allCloudy && <p>{flow.workbench.allCloudy}</p>}
          {notEnoughClear && <p>{flow.workbench.notEnoughClear}</p>}
          {state.limited && <p>{flow.workbench.limited}</p>}
        </div>
        {grid && !allCloudy && !notEnoughClear && entries.length > 0 && (
          <EvidenceViewer
            before={slot(beforeEntry)}
            after={slot(afterEntry)}
            grid={grid}
            invalid={invalid}
            aoi={inv.aoi}
            onRetry={retry}
          />
        )}
        <p className="text-sm text-fg-2">
          {flow.workbench.disclaimer} {flow.workbench.catalogueNote}
        </p>
      </div>
      <aside className="grid content-start gap-6 bg-bg p-4 lg:p-6" aria-label={flow.workbench.timeline} />
    </div>
  )
}
