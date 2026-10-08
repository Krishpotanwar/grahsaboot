import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { setBeforeAfter, togglePin } from '../data/investigation.ts'
import { useInvestigation } from '../data/useInvestigation.ts'
import { rgbaToPngDataUrl } from '../lib/canvas.ts'
import { fmtDate } from '../lib/format.ts'
import { Link } from '../lib/router.tsx'
import { useRested } from '../lib/useRested.ts'
import { accentColor, fitAoi, removeAoiLayer, setAoiLayer } from '../map/aoiLayer.ts'
import { removeFrameLayer, setFrameLayer } from '../map/frameLayer.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, MicroLabel, Skeleton } from '../ui/kit.tsx'
import { ClaimPanel } from '../workbench/ClaimPanel.tsx'
import { canPickDefaults, isUsable, pickDefaults } from '../workbench/defaults.ts'
import { EvidenceViewer, type Slot } from '../workbench/EvidenceViewer.tsx'
import { NotesPanel } from '../workbench/NotesPanel.tsx'
import type { DateEntry } from '../workbench/runner.ts'
import { SectionGrid } from '../workbench/SectionGrid.tsx'
import { Timeline } from '../workbench/Timeline.tsx'
import { useEvidence } from '../workbench/useEvidence.ts'
import NotFound from './NotFound.tsx'

// A fallback that is the same array every render, so the memoised NotesPanel is not rendered again for it.
const NO_PARTS: never[] = []

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
  const { map, tier, layout, installLayers } = useMapStage()
  const [mapOpen, setMapOpen] = useState(false)
  useMapLayout(mapOpen && tier > 0 ? 'mini' : 'hidden')
  // Fixed at mount: a tier downgrade, a resize or a rotation must not rebuild the grid and restart the search and checks.
  const [maxSide] = useState(() =>
    matchMedia('(min-width: 1024px)').matches ? (tier >= 2 ? 1024 : 768) : 512,
  )
  const { state, grid, thumbGrid, summary, requestFull, requestThumb, requestCheck, retry } = useEvidence(
    inv,
    maxSide,
  )
  const entries = state.entries
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  const beforeEntry = inv?.before ? byDate.get(inv.before) : undefined
  const afterEntry = inv?.after ? byDate.get(inv.after) : undefined
  // Stable while those two entries are, so scrubbing the timeline never renders the viewer again.
  const beforeSlot = useMemo(() => slot(beforeEntry), [beforeEntry])
  const afterSlot = useMemo(() => slot(afterEntry), [afterEntry])
  // A pixel is unusable for the difference when either photo cannot show it clearly. Null until both masks have arrived.
  const invalid = useMemo(() => {
    const a = beforeEntry?.invalid
    const b = afterEntry?.invalid
    return a && b ? a.map((v, i) => (v || b[i] ? 1 : 0)) : null
  }, [beforeEntry?.invalid, afterEntry?.invalid])

  useEffect(() => {
    // Only from the whole list: the clearest early and late passes are in it, not in the first few found (`more`) nor in what is
    // left of them when the search failed.
    if (
      !inv ||
      inv.before ||
      state.phase !== 'ready' ||
      state.more ||
      !canPickDefaults(entries, inv.dateFrom, inv.dateTo)
    )
      return
    const d = pickDefaults(entries, inv.dateFrom, inv.dateTo)
    // Once: `update` reads the latest record, so a run racing the first pick cannot overwrite it.
    if (d.before && d.after) update((i) => (i.before ? i : setBeforeAfter(i, d.before!, d.after!))) // a refusal sets `error`, shown below
  }, [inv, entries, state.phase, state.more, update])

  useEffect(() => {
    if (state.phase !== 'ready' || !inv) return
    for (const d of [inv.before, inv.after]) if (d && byDate.get(d) && !byDate.get(d)!.full) requestFull(d)
  }, [state.phase, inv?.before, inv?.after, byDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // The date on show in the timeline: the after date, else the latest pass, and kept for as long as it is a pass.
  const [current, setCurrent] = useState<string | null>(null)
  useLayoutEffect(() => {
    // Before paint, so the first passes never show a frame of the wrong date.
    if (current !== null && byDate.has(current)) return
    const d = inv?.after && byDate.has(inv.after) ? inv.after : entries[entries.length - 1]?.date
    if (d) setCurrent(d)
  }, [current, byDate, entries, inv?.after])

  // Resting on a date asks for what it still lacks, after 250 ms so that scrubbing past dates asks for nothing: its check,
  // moved to the front of the sweep (which takes minutes on a long range), then, once it is usable, its preview.
  const cur = current ? byDate.get(current) : undefined
  const wantCheck = cur?.status === 'queued'
  const wantThumb = !!cur && isUsable(cur) && !cur.thumb && !cur.thumbFailed
  useEffect(() => {
    if (!current || !(wantCheck || wantThumb)) return
    const t = setTimeout(() => {
      requestCheck(current)
      if (wantThumb) requestThumb(current)
    }, 250)
    return () => clearTimeout(t)
  }, [current, wantCheck, wantThumb, requestCheck, requestThumb])

  // Mini map: the outline, and the photo of the date the slider rests on. Never `current`: a fast slider (about 1,100 passes)
  // would ask for a full frame and encode a PNG at every step.
  const aoi = inv?.aoi
  useEffect(
    () =>
      map && aoi
        ? installLayers('aoi', (m) => setAoiLayer(m, aoi, accentColor()), removeAoiLayer)
        : undefined,
    [map, aoi, installLayers],
  )
  const mapDate = useRested(current, 250)
  const shown = mapDate ? byDate.get(mapDate) : undefined
  useEffect(() => {
    if (mapOpen && tier > 0 && shown && isUsable(shown) && !shown.full) requestFull(shown.date)
  }, [mapOpen, tier, shown, requestFull])
  const frameUrl = useMemo(
    () =>
      mapOpen && tier > 0 && shown?.full && grid
        ? rgbaToPngDataUrl(shown.full.display.rgba, grid.width, grid.height)
        : null,
    [mapOpen, tier, shown?.full, grid],
  )
  useEffect(
    () =>
      map && grid
        ? installLayers('frame', (m) => setFrameLayer(m, frameUrl, grid), removeFrameLayer)
        : undefined,
    [map, grid, frameUrl, installLayers],
  )
  // Once the stage has the corner box (a layout later than `mapOpen`), so the fit is to that size and not to the hidden map's.
  useEffect(() => {
    if (!map || layout !== 'mini' || !summary) return
    map.resize()
    fitAoi(map, summary.bbox, matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [map, layout, summary])

  // The road grid's columns: the pinned dates, which always include before and after.
  const pinnedEntries = useMemo(() => {
    const pins = new Set(inv?.pinned)
    return entries.filter((e) => pins.has(e.date))
  }, [entries, inv?.pinned])

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

  // A refused pin is shown next to the pin buttons, a refused note or claim in its own panel (the header is far above a panel
  // the user has scrolled to); every other error in the header.
  const pinError = error === 'TOO_MANY_PINS' || error === 'BAD_ORDER' ? error : null
  const noteError =
    error === 'NOTE_EMPTY' || error === 'NOTE_TOO_LONG' || error === 'TOO_MANY_NOTES' ? error : null
  const claimError = error === 'CLAIM_TOO_LONG' ? error : null

  // With no pair to show, say plainly why there is none. A failed check is not "obscured", so any failure holds these back.
  const settled =
    state.phase === 'ready' &&
    !state.more &&
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
          {tier > 0 && (
            <Button aria-pressed={mapOpen} className="ml-auto" onClick={() => setMapOpen((o) => !o)}>
              {mapOpen ? flow.workbench.hideMap : flow.workbench.showMap}
            </Button>
          )}
          <Link
            to={`/i/${inv.id}/report`}
            className="inline-flex h-11 items-center rounded-[6px] border border-control px-4"
          >
            {flow.workbench.report}
          </Link>
        </header>
        {error && !pinError && !noteError && !claimError && (
          <p role="alert" className="text-sm text-bad">
            {flow.workbench.errors[error] ?? error}
          </p>
        )}
        <div aria-live="polite" className="grid justify-items-start gap-2 text-sm text-fg-2">
          {state.phase === 'searching' && <p>{flow.workbench.searching}</p>}
          {state.more && <p>{flow.workbench.searchingMore}</p>}
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
            before={beforeSlot}
            after={afterSlot}
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
      <aside
        className="grid min-w-0 content-start gap-6 bg-bg p-4 lg:p-6"
        aria-label={flow.workbench.timeline}
      >
        <Timeline
          entries={entries}
          from={inv.dateFrom}
          to={inv.dateTo}
          current={current}
          before={inv.before}
          after={inv.after}
          pinned={inv.pinned}
          thumbGrid={thumbGrid}
          sections={summary?.kind === 'road' ? summary.parts : undefined}
          error={pinError}
          onSelect={setCurrent}
          onBefore={(d) => update((i) => setBeforeAfter(i, d, i.after!))}
          onAfter={(d) => update((i) => setBeforeAfter(i, i.before!, d))}
          onPin={(d) => update((i) => togglePin(i, d))}
          onRetry={retry}
        />
        {summary?.kind === 'road' && (
          <SectionGrid
            entries={pinnedEntries}
            parts={summary.parts}
            current={current}
            onSelect={setCurrent}
          />
        )}
        <NotesPanel
          inv={inv}
          parts={summary?.parts ?? NO_PARTS}
          current={current}
          update={update}
          error={noteError}
        />
        <ClaimPanel inv={inv} update={update} error={claimError} />
      </aside>
    </div>
  )
}
