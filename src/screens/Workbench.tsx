import { X } from '@phosphor-icons/react'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadAccounts } from '../accounts/enabled.ts'
import { setBeforeAfter, togglePin, verificationFor, type Investigation } from '../data/investigation.ts'
import { useInvestigation } from '../data/useInvestigation.ts'
import { fmtDate } from '../lib/format.ts'
import { Link } from '../lib/router.tsx'
import { useToast } from '../ui/toast.tsx'
import { useRested } from '../lib/useRested.ts'
import { accentColor, fitAoi, removeAoiLayer, setAoiLayer } from '../map/aoiLayer.ts'
import { removeFrameLayer, setFrameLayer } from '../map/frameLayer.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Skeleton } from '../ui/kit.tsx'
import { Optional } from '../ui/Optional.tsx'
import { ClaimPanel } from '../workbench/ClaimPanel.tsx'
import { canPickDefaults, isUsable, pickDefaults } from '../workbench/defaults.ts'
import { EvidenceViewer, MapTool, type Slot } from '../workbench/EvidenceViewer.tsx'
import { NotesPanel } from '../workbench/NotesPanel.tsx'
import type { DateEntry } from '../workbench/runner.ts'
import { trimRing } from '../workbench/ring.ts'
import { saveWait } from '../workbench/saveReady.ts'
import { GridSkeleton, SectionGrid } from '../workbench/SectionGrid.tsx'
import { Timeline, TimelineSkeleton } from '../workbench/Timeline.tsx'
import { useEvidence } from '../workbench/useEvidence.ts'
import NotFound from './NotFound.tsx'

// A fallback that is the same array every render, so the memoised NotesPanel is not rendered again for it.
const NO_PARTS: never[] = []

/** The status of an investigation that is not saved: the title block's, as it has always been, and its place until a save control is. */
function NotSaved() {
  return (
    <span className="mr-2 inline-flex items-center gap-2 font-mono text-[0.8125rem] text-fg-2">
      <span aria-hidden className="h-[7px] w-[7px] rounded-full border-[1.5px] border-fg-2" />
      {flow.workbench.notSaved}
    </span>
  )
}
// Null in a build without accounts: the save control and the delete button below are then not rendered, requested or loaded at
// all, and the title block is what it was before accounts existed. The one import() lives in src/accounts/enabled.ts (the
// bundle guard proves it). Each sits in an `Optional`: code that cannot be loaded, or that throws, must not blank the workbench.
const load = loadAccounts
const LazySaveBar = load ? lazy(() => load().then((m) => ({ default: m.SaveBar }))) : null
const LazyDelete = load ? lazy(() => load().then((m) => ({ default: m.DeleteInvestigation }))) : null

/** `verification`: the saved investigation's records. The photo's own check shows only for the exact pixels on screen. */
const slot = (e: DateEntry | undefined, verification: Investigation['verification']): Slot =>
  e
    ? {
        date: e.date,
        frame: e.full,
        stats: e.quality?.stats ?? null,
        itemId: e.candidate.item.id,
        failed: e.error !== null && e.full === null,
        verification: e.full
          ? verificationFor(
              { verification },
              e.date,
              'visual',
              e.full.level,
              e.full.sha256,
              e.candidate.item.id,
            )
          : null,
      }
    : null

export default function Workbench({ id }: { id: string }) {
  const { inv, update, error } = useInvestigation(id)
  // A failed save is said where the person is (the page header is far above the notes and the grid), once per failure.
  const toast = useToast()
  useEffect(() => {
    if (error === 'SAVE_FAILED') toast(flow.workbench.errors.SAVE_FAILED)
  }, [error, toast])
  const { map, tier, layout, stage, installLayers } = useMapStage()
  const [mapOpen, setMapOpen] = useState(false)
  // One identity for the life of the page: the viewer is memoised and must not render again for a slider step.
  const toggleMap = useCallback(() => setMapOpen((o) => !o), [])
  useMapLayout(mapOpen && tier > 0 ? 'mini' : 'hidden')
  // Fixed at mount: a tier downgrade, a resize or a rotation must not rebuild the grid and restart the search and checks.
  const [maxSide] = useState(() =>
    matchMedia('(min-width: 1024px)').matches ? (tier >= 2 ? 1024 : 768) : 512,
  )
  const { state, grid, thumbGrid, summary, requestFull, releaseFull, requestThumb, requestCheck, retry } =
    useEvidence(inv, maxSide)
  const entries = state.entries
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  const beforeEntry = inv?.before ? byDate.get(inv.before) : undefined
  const afterEntry = inv?.after ? byDate.get(inv.after) : undefined
  // Stable while those two entries and the records are, so scrubbing the timeline never renders the viewer again.
  const verification = inv?.verification
  const beforeSlot = useMemo(() => slot(beforeEntry, verification), [beforeEntry, verification])
  const afterSlot = useMemo(() => slot(afterEntry, verification), [afterEntry, verification])
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

  // Every pinned date has its preview: its row shows it, and a save sends it. The runner loads the first twelve usable dates
  // unasked, so these are the pins past them. Asked for once, through the runner's own queue (never more than its cap in flight),
  // and for at most 24 dates: nothing here grows with the number of passes. A check still waiting in the sweep goes first.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (byDate.size === 0) asked.current.clear() // a new run
    for (const d of inv?.pinned ?? []) {
      const e = byDate.get(d)
      if (!e) continue
      if (e.status === 'queued') {
        if (asked.current.has(d)) continue
        asked.current.add(d)
        requestCheck(d)
      } else if (isUsable(e) && !e.thumb && !e.thumbFailed) requestThumb(d)
    }
  }, [byDate, inv?.pinned, requestCheck, requestThumb])

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
  // Full photos of dates the person has moved on from are released (about 5 MiB each): the last few rested dates stay, and the
  // before and after photos and the pinned dates always do.
  const ring = useRef<string[]>([])
  useEffect(() => {
    if (!mapDate || !inv) return
    const protect = new Set([inv.before, inv.after, ...inv.pinned].filter((d): d is string => !!d))
    const r = trimRing(ring.current, mapDate, 6, protect)
    ring.current = r.ring
    for (const d of r.release) releaseFull(d)
  }, [mapDate, inv?.before, inv?.after, inv?.pinned, releaseFull]) // eslint-disable-line react-hooks/exhaustive-deps
  // Decoded pixels for the map (no PNG encode, no data: URL): the same `ImageData` while the photo is.
  const frameImage = useMemo(
    () =>
      mapOpen && tier > 0 && shown?.full && grid
        ? new ImageData(new Uint8ClampedArray(shown.full.display.rgba), grid.width, grid.height)
        : null,
    [mapOpen, tier, shown?.full, grid],
  )
  useEffect(
    () =>
      map && grid
        ? installLayers('frame', (m) => setFrameLayer(m, frameImage, grid), removeFrameLayer)
        : undefined,
    [map, grid, frameImage, installLayers],
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

  // No pass found yet: hold the places of the viewer and of the timeline (and a road's grid), so that what is below them, on a phone
  // the whole side column, is not pushed down 20-30 s later when they arrive.
  const searching = state.phase === 'searching' && entries.length === 0
  const showViewer = grid && !allCloudy && !notEnoughClear && (searching || entries.length > 0)
  // Nothing is pinned until the pair is: the grid's place stays held while a pair can still come (the sweep is running).
  const road = summary?.kind === 'road' && summary.parts.length > 1 ? summary.parts : null
  const gridPending =
    !!road &&
    !inv.before &&
    (searching || entries.some((e) => e.status === 'queued' || e.status === 'checking'))
  // What a save is waiting for, when there is one to press (E7): the whole range searched, or every pinned date in.
  const wait = LazySaveBar ? saveWait(inv, byDate, state.phase === 'ready' && !state.more) : null
  return (
    <div className="min-h-[calc(100dvh-64px)]">
      <header className="flex flex-col gap-4 border-b border-line px-4 pb-5 pt-5 sm:flex-row sm:items-end sm:justify-between lg:px-8">
        <div className="min-w-0">
          <h1 className="break-words text-[1.875rem] font-[650] leading-[1.15] tracking-[-0.025em]">
            {inv.name}
          </h1>
          <p className="mt-2 font-mono text-[0.8125rem] uppercase leading-snug tracking-[0.04em] text-fg-2 num">
            {meta}
          </p>
        </div>
        {/* A row that takes one more control without wrapping: the status sits first, the buttons after it. */}
        <div className="flex flex-wrap items-center gap-2.5">
          {LazySaveBar ? (
            <Optional fallback={<NotSaved />}>
              <Suspense
                fallback={
                  <>
                    {/* Until the chunk arrives: the status it has now, and the button's place held (160 px by 44, as in SaveBar), so
                      the row does not change size. A saved copy must not say "Not saved" meanwhile: its status (208 px wide, as
                      in SaveBar) is held blank. */}
                    {inv.serverId ? <span aria-hidden className="invisible mr-2 w-52" /> : <NotSaved />}
                    <span aria-hidden className="invisible h-11 w-40" />
                    {/* The line SaveBar shows while the page is not ready: its place is held too, so nothing steps down. */}
                    {wait !== null && (
                      <span aria-hidden className="invisible order-last h-5 w-0 min-w-full" />
                    )}
                  </>
                }
              >
                <LazySaveBar inv={inv} entries={entries} ready={wait === null} why={wait} update={update} />
              </Suspense>
            </Optional>
          ) : (
            <NotSaved />
          )}
          <Link
            to={`/i/${inv.id}/report`}
            className="inline-flex h-11 select-none items-center justify-center rounded-[6px] bg-fg px-4 text-[0.9375rem] font-medium text-bg transition-transform duration-100 hover:opacity-90 active:scale-[0.98]"
          >
            {flow.workbench.report}
          </Link>
        </div>
      </header>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="grid min-w-0 content-start gap-3 px-4 pb-5 pt-3 lg:px-8">
          {/* SAVE_FAILED is the toast's (above): said where the person is, once. */}
          {error && error !== 'SAVE_FAILED' && !pinError && !noteError && !claimError && (
            <p role="alert" className="text-sm text-bad">
              {flow.workbench.errors[error] ?? error}
            </p>
          )}
          {/* A live region has to be in the page before its words are. Empty it takes no room, except while a "finding" line is on its way or comes and goes (the search runs): then it keeps its line, so the viewer below does not step down for it. */}
          <div
            aria-live="polite"
            className={`grid justify-items-start gap-2 text-sm text-fg-2 ${state.phase === 'searching' || state.more ? 'min-h-5' : 'empty:sr-only'}`}
          >
            {state.phase === 'searching' && !searching && <p>{flow.workbench.searching}</p>}
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
          {!showViewer && tier > 0 && (
            // No viewer to hold it (nothing found, all obscured, one clear photo): the tool stays where the viewer's row would be.
            <div className="flex justify-end">
              <MapTool open={mapOpen} onToggle={toggleMap} />
            </div>
          )}
          {showViewer && (
            <EvidenceViewer
              before={beforeSlot}
              after={afterSlot}
              grid={grid}
              invalid={invalid}
              aoi={inv.aoi}
              sections={road ?? undefined}
              searching={searching}
              mapOpen={mapOpen}
              onToggleMap={tier > 0 ? toggleMap : undefined}
              onRetry={retry}
            />
          )}
          <p className="text-sm text-fg-2">
            {flow.workbench.disclaimer} {flow.workbench.catalogueNote}
          </p>
        </div>
        <aside
          className="min-w-0 border-t border-line lg:border-l lg:border-t-0"
          aria-label={flow.workbench.timeline}
        >
          {(searching || entries.length > 0) &&
            (searching ? (
              <TimelineSkeleton
                from={inv.dateFrom}
                to={inv.dateTo}
                road={summary?.kind === 'road'}
                sections={summary?.kind === 'road' ? summary.parts.length : 0}
                // The pinned dates; with no pair yet, the two the search is about to pin. When it arrives the list has one row
                // (the latest pass on show), then three (the pair and that pass) or two (when the latest is the after date): two
                // is the middle, so no step of it is more than a row from what is held.
                rows={inv.pinned.length + (inv.before ? 0 : 2)}
              />
            ) : (
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
                more={state.more}
                error={pinError}
                onSelect={setCurrent}
                onBefore={(d) => update((i) => setBeforeAfter(i, d, i.after!))}
                onAfter={(d) => update((i) => setBeforeAfter(i, i.before!, d))}
                onPin={(d) => update((i) => togglePin(i, d))}
                onRetry={retry}
              />
            ))}
          {(searching || entries.length > 0) &&
            (gridPending && road ? (
              <GridSkeleton rows={road.length} />
            ) : (
              summary?.kind === 'road' && (
                <SectionGrid
                  entries={pinnedEntries}
                  parts={summary.parts}
                  current={current}
                  shown={cur}
                  onSelect={setCurrent}
                />
              )
            ))}
          <NotesPanel
            inv={inv}
            parts={summary?.parts ?? NO_PARTS}
            current={current}
            update={update}
            error={noteError}
          />
          <ClaimPanel inv={inv} update={update} error={claimError} />
          {LazyDelete && (
            // The only way to delete one: at the end of the column, quiet. In the page only in a build with accounts.
            <Optional>
              <Suspense fallback={null}>
                <LazyDelete localId={inv.id} serverId={inv.serverId} />
              </Suspense>
            </Optional>
          )}
        </aside>
      </div>
      {/* In the stage, so it sits inside the panel and on top of the canvas (the page itself is under the stage). */}
      {mapOpen &&
        tier > 0 &&
        stage &&
        createPortal(
          <button
            type="button"
            aria-label={flow.workbench.hideMap}
            title={flow.workbench.hideMap}
            onClick={() => {
              // This button is about to unmount: keyboard focus goes to the map tool in the page, not to <body>.
              document.getElementById('gs-map-tool')?.focus()
              toggleMap()
            }}
            className="glass absolute right-2 top-2 z-[3] grid h-11 w-11 place-items-center rounded-[6px] text-fg active:scale-[0.98]"
          >
            <X size={20} weight="bold" aria-hidden />
          </button>,
          stage,
        )}
    </div>
  )
}
