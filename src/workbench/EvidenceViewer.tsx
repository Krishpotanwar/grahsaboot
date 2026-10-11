import {
  CaretLeft,
  CaretRight,
  CircleHalf,
  Columns,
  MapTrifold,
  SplitHorizontal,
} from '@phosphor-icons/react'
import { animate } from 'motion/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { brightnessDiff } from '../evidence/diff.ts'
import type { DisplayGrid, QualityStats } from '../evidence/types.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, QualityTag, Skeleton } from '../ui/kit.tsx'
import type { FrameResult } from '../workers/imagery-core.ts'
import { FrameCanvas } from './FrameCanvas.tsx'
import { outlinePath, pointAlong } from './overlay.ts'
import { scaleBar } from './scale.ts'

export type Slot = {
  date: string
  frame: FrameResult | null
  stats: QualityStats | null
  /** The source item's id, shown in the caption. */
  itemId: string
  /** The check or the full frame failed and nothing is retrying it. */
  failed: boolean
} | null
type Mode = 'swipe' | 'side' | 'diff'

const MODE_ICON = { swipe: SplitHorizontal, side: Columns, diff: CircleHalf } as const
const BOX = 'relative overflow-hidden border border-line'
// On the photos: light text on a dark chip, whichever theme the page is in (the photos are imagery, not page).
const CHIP =
  'absolute top-0 rounded-[4px] border border-[#3f3f46] bg-[rgb(9_9_11/0.8)] px-[9px] py-[7px] font-mono text-xs font-medium uppercase leading-none tracking-[0.08em] text-[#f4f4f5]'
const BACKDROP = 'absolute bottom-0 rounded-[4px] bg-[rgb(9_9_11/0.72)] font-mono text-[#f4f4f5]'

function Caption({ slot, right = false }: { slot: NonNullable<Slot>; right?: boolean }) {
  return (
    <p
      className={`grid gap-1.5 font-mono text-[0.8125rem] leading-[1.3] num${right ? ' sm:justify-items-end sm:text-right' : ''}`}
    >
      <span>{flow.workbench.captionLine1(fmtDate(slot.date), slot.itemId)}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-fg-2">
        {slot.stats && (
          <>
            <span>{flow.workbench.clearView(pct(slot.stats.clearFraction))}</span>
            <QualityTag label={slot.stats.label} />
            <span aria-hidden>·</span>
          </>
        )}
        <span>{flow.workbench.notSaved}</span>
      </span>
      <span className="max-w-[28ch] truncate text-fg-2" title={slot.itemId}>
        {slot.itemId}
      </span>
    </p>
  )
}

/**
 * What sits over a photo: date chips, a scale bar and a north arrow (the photos are north-up). Decoration for people who can
 * see it, so the caption and the photo's name carry the same; never in the way of the pointer. The bar is drawn in `cqw`, a
 * share of the photo's own width (the layer that fills the photo is a size container), so it stays to scale at any size.
 */
function Chrome({
  grid,
  chips,
  tight = false,
}: {
  grid: DisplayGrid
  chips: Array<[text: string, side: 'left' | 'right']>
  tight?: boolean
}) {
  const bar = scaleBar(grid)
  // Two chips share one photo's width (swipe): each may take half and is cut with an ellipsis, so on a phone they never overlap.
  const two = chips.length > 1
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 [container-type:inline-size]">
      <div className={`absolute ${tight ? 'inset-2.5' : 'inset-3.5'}`}>
        {chips.map(([text, side]) => (
          <span
            key={side}
            data-chip=""
            className={`${CHIP}${two ? ' max-w-[calc(50%-4px)] truncate' : ''} ${side === 'left' ? 'left-0' : 'right-0'}`}
          >
            {text}
          </span>
        ))}
        <span className={`${BACKDROP} left-0 px-[9px] pb-[7px] pt-1.5 text-[0.6875rem] leading-none`}>
          {flow.workbench.scale(bar.m)}
          <span
            className="mt-1 block h-[5px] border-[1.5px] border-t-0 border-[#f4f4f5]"
            style={{ width: `${bar.share * 100}cqw` }}
          />
        </span>
        <span
          className={`${BACKDROP} right-0 grid h-[30px] w-[30px] place-items-center text-[10px] font-semibold leading-none`}
        >
          {flow.workbench.north}
        </span>
      </div>
    </div>
  )
}

/** Where a road's sections are numbered: the middle of each, in grid pixels. */
type Marks = Array<{ no: string; x: number; y: number }>

/** The user's outline over a photo: accent, dashed, a light fill, so it never hides the ground. A road's sections are numbered along it. */
function Outline({ aoi, grid, marks }: { aoi: AoiInput; grid: DisplayGrid; marks: Marks | null }) {
  return (
    <>
      <svg
        aria-hidden
        viewBox={`0 0 ${grid.width} ${grid.height}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path
          d={outlinePath(aoi, grid)}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          style={{
            fill: aoi.kind === 'site' ? 'var(--gs-accent)' : 'none',
            fillOpacity: 0.08,
            stroke: 'var(--gs-accent)',
            strokeWidth: 2,
          }}
        />
      </svg>
      {/* Boxes of their own size, not part of the drawing: its units shrink with the photo, and a number must stay readable. */}
      {marks && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {marks.map((m) => (
            <span
              key={m.no}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[#f4f4f5] bg-[#09090b] px-1 py-0.5 font-mono text-[10px] leading-[12px] text-[#f4f4f5]"
              style={{ left: `${(m.x / grid.width) * 100}%`, top: `${(m.y / grid.height) * 100}%` }}
            >
              {m.no}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function Photo({
  slot,
  role,
  grid,
  aoi,
  marks,
}: {
  slot: NonNullable<Slot>
  role: string
  grid: DisplayGrid
  aoi: AoiInput | null
  marks: Marks | null
}) {
  if (!slot.frame)
    return slot.failed ? <div className="h-full w-full bg-panel" /> : <Skeleton className="h-full w-full" />
  return (
    <div className="relative">
      <FrameCanvas
        rgba={slot.frame.display.rgba}
        width={grid.width}
        height={grid.height}
        label={flow.workbench.photoAlt(
          role,
          fmtDate(slot.date),
          slot.stats ? pct(slot.stats.clearFraction) : undefined,
        )}
      />
      {aoi && <Outline aoi={aoi} grid={grid} marks={marks} />}
    </div>
  )
}

/**
 * The photos' place until there is a pair to show: the boxes they will fill and the lines that will caption them, so what is
 * below them (on a phone, the whole side column) does not move when they arrive. The first box says what is going on: the
 * search is on, or it has found passes and no pair is chosen yet. Said here and not in a line above the viewer, because that
 * line would take its room away again when the search ends.
 */
function Waiting({
  mode,
  grid,
  message,
  live,
}: {
  mode: Mode
  grid: DisplayGrid
  message: string
  /** Said to a screen reader as it appears (the search is on), not "pick a date" for the moment before the pair is chosen. */
  live: boolean
}) {
  const photo = (say: string | null) => (
    <div className={BOX} style={{ aspectRatio: `${grid.width} / ${grid.height}` }}>
      {/* A pulse says "loading": only while the search runs, not while the page waits for the user to pick a pair. */}
      {live ? (
        <Skeleton className="absolute inset-0" />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-line" />
      )}
      {say && (
        <p
          role={live ? 'status' : undefined}
          className="absolute inset-0 grid place-items-center p-6 text-center text-fg-2"
        >
          {say}
        </p>
      )}
      <Chrome grid={grid} chips={[]} tight={mode === 'side'} />
    </div>
  )
  // As tall as a caption: three lines of 13 px at 1.3, and the 6 px between them.
  const lines = (
    <div aria-hidden className="grid h-[63px] content-start gap-2">
      <Skeleton className="h-3.5 w-3/5" />
      <Skeleton className="h-3.5 w-2/5" />
      <Skeleton className="h-3.5 w-1/2" />
    </div>
  )
  return (
    <>
      {mode === 'side' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[message, null].map((say, i) => (
            <div key={i} className="grid gap-2">
              {photo(say)}
              {lines}
            </div>
          ))}
        </div>
      ) : (
        <>
          {photo(message)}
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-6">
            {lines}
            {lines}
          </div>
        </>
      )}
      <div className="h-5" />
    </>
  )
}

/**
 * Show map / Hide map: the viewer's row holds it; `Workbench` puts it alone where there is no viewer. The label says what
 * pressing does, so it is not also a toggle button (a screen reader would say the state twice).
 */
export function MapTool({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      id="gs-map-tool"
      type="button"
      onClick={onToggle}
      className="inline-flex h-11 select-none items-center gap-2 rounded-[6px] px-2.5 text-sm text-fg-2 hover:bg-panel hover:text-fg active:scale-[0.98]"
    >
      <MapTrifold size={16} aria-hidden />
      {open ? flow.workbench.hideMap : flow.workbench.showMap}
    </button>
  )
}

interface ViewerProps {
  before: Slot
  after: Slot
  grid: DisplayGrid
  /** Pixels either photo cannot show clearly (clouds, shadow, no data); null until both masks have arrived. */
  invalid: Uint8Array | null
  aoi: AoiInput
  /** A road's sections, when it has more than one: their numbers are drawn along the line. A memoised summary's, so stable. */
  sections?: Array<{ idx: number; fromM: number; toM: number }>
  /** The search has found no pass yet: the viewer holds its place and says so. */
  searching: boolean
  /** The map tool in the tool row: the open state and its toggle, which exists only where there is a map. Stable between slider steps. */
  mapOpen: boolean
  onToggleMap?: () => void
  onRetry: (date: string) => void
}

function EvidenceViewerBody({
  before,
  after,
  grid,
  invalid,
  aoi,
  sections,
  searching,
  mapOpen,
  onToggleMap,
  onRetry,
}: ViewerProps) {
  const [mode, setMode] = useState<Mode>(() => (matchMedia('(max-width: 599px)').matches ? 'side' : 'swipe'))
  const [pos, setPos] = useState(50)
  const [showOutline, setShowOutline] = useState(true)
  const spring = useRef<{ stop(): void } | null>(null)
  useEffect(() => () => spring.current?.stop(), [])
  const diff = useMemo(
    () =>
      mode === 'diff' && before?.frame && after?.frame && invalid
        ? brightnessDiff(before.frame.display.rgba, after.frame.display.rgba, invalid)
        : null,
    [mode, before?.frame, after?.frame, invalid],
  )

  const marks = useMemo<Marks | null>(
    () =>
      aoi.kind === 'road' && sections && sections.length > 1
        ? sections.map((p) => {
            const [x, y] = pointAlong(aoi.geometry.coordinates, grid, (p.fromM + p.toM) / 2)
            return { no: flow.workbench.sectionNo(p.idx), x, y }
          })
        : null,
    [aoi, sections, grid],
  )
  const aspect = { aspectRatio: `${grid.width} / ${grid.height}` }
  const outline = showOutline ? aoi : null
  const years = [before, after].filter((s) => s?.frame).map((s) => Number(s!.date.slice(0, 4)))

  const snap = () => {
    const target = [0, 50, 100].find((t) => Math.abs(t - pos) < 4)
    if (target === undefined || target === pos) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPos(target)
    else
      spring.current = animate(pos, target, { type: 'spring', stiffness: 400, damping: 40, onUpdate: setPos })
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {/* Real radios in one group (arrow keys move between them); only their look is a row of tabs. */}
        <fieldset disabled={!before || !after} className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <legend className="sr-only">{flow.workbench.view}</legend>
          {(['swipe', 'side', 'diff'] as const).map((m) => {
            const Icon = MODE_ICON[m]
            return (
              <label key={m} className="relative">
                <input
                  type="radio"
                  name="view"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                />
                <span className="inline-flex h-[54px] cursor-pointer items-center gap-2 border-b-2 border-transparent px-2.5 text-[0.9375rem] font-medium text-fg-2 peer-checked:border-accent peer-checked:text-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-default peer-disabled:opacity-60 sm:px-3.5">
                  {/* Icons only from 400 px: three labelled tabs do not fit a 360 px phone with them. */}
                  <Icon size={18} aria-hidden className="hidden min-[400px]:block" />
                  {flow.workbench.modes[m]}
                </span>
              </label>
            )
          })}
        </fieldset>
        <div className="ml-auto flex flex-wrap items-center gap-x-1">
          <label className="relative inline-flex h-11 cursor-pointer items-center gap-2 px-2 text-sm text-fg-2 hover:text-fg has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[:disabled]:hover:text-fg-2">
            <input
              type="checkbox"
              disabled={!before || !after}
              checked={showOutline}
              onChange={(e) => setShowOutline(e.target.checked)}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
            />
            <span
              aria-hidden
              className="relative h-[18px] w-[30px] shrink-0 rounded-full bg-control transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-3.5 before:w-3.5 before:rounded-full before:bg-bg before:transition-transform peer-checked:bg-accent peer-checked:before:translate-x-3 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
            />
            {flow.workbench.outlineToggle}
          </label>
          {onToggleMap && <MapTool open={mapOpen} onToggle={onToggleMap} />}
        </div>
      </div>

      {!before || !after ? (
        <Waiting
          mode={mode}
          grid={grid}
          message={searching ? flow.workbench.searching : flow.workbench.pickPair}
          live={searching}
        />
      ) : (
        <>
          {[before, after].map(
            (s) =>
              s.failed && (
                <p key={s.date} role="alert" className="flex flex-wrap items-center gap-3 text-sm text-bad">
                  <span className="font-mono num">{fmtDate(s.date)}</span>
                  {flow.workbench.checkFailed}
                  <Button onClick={() => onRetry(s.date)}>{copy.common.retry}</Button>
                </p>
              ),
          )}

          {mode === 'swipe' && (
            <div className="relative select-none" style={aspect}>
              <div className="absolute inset-0 overflow-hidden border border-line">
                <div className="absolute inset-0">
                  <Photo slot={before} role={flow.workbench.before} grid={grid} aoi={outline} marks={marks} />
                </div>
                <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
                  <Photo slot={after} role={flow.workbench.after} grid={grid} aoi={outline} marks={marks} />
                </div>
              </div>
              <Chrome
                grid={grid}
                chips={[
                  [flow.workbench.chip(flow.workbench.before, fmtDate(before.date)), 'left'],
                  [flow.workbench.chip(flow.workbench.after, fmtDate(after.date)), 'right'],
                ]}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent"
                style={{ left: `${pos}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(pos)}
                onChange={(e) => {
                  spring.current?.stop()
                  setPos(Number(e.target.value))
                }}
                onPointerUp={snap}
                aria-label={flow.workbench.swipeLabel}
                className="swipe-range peer absolute inset-0 h-full w-full focus-visible:outline-none"
              />
              {/* The native range above is the control; this is its visible handle, kept whole inside the photo. */}
              <div
                aria-hidden
                data-handle=""
                className="pointer-events-none absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-on-accent shadow-[0_2px_10px_rgb(0_0_0/0.45)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
                style={{ left: `clamp(22px, ${pos}%, calc(100% - 22px))` }}
              >
                <span className="flex">
                  <CaretLeft size={16} weight="bold" />
                  <CaretRight size={16} weight="bold" className="-ml-2" />
                </span>
              </div>
            </div>
          )}

          {mode === 'side' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  [before, flow.workbench.before],
                  [after, flow.workbench.after],
                ] as const
              ).map(([s, role]) => (
                <figure key={role} className="grid gap-2">
                  <div className={BOX} style={aspect}>
                    <div className="absolute inset-0">
                      <Photo slot={s} role={role} grid={grid} aoi={outline} marks={marks} />
                    </div>
                    <Chrome
                      grid={grid}
                      chips={[[flow.workbench.chip(role, fmtDate(s.date)), 'left']]}
                      tight
                    />
                  </div>
                  <figcaption>
                    <Caption slot={s} />
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {mode === 'diff' && (
            <figure className="grid gap-2">
              <div className={BOX} style={aspect}>
                <div className="absolute inset-0 opacity-50">
                  <Photo slot={before} role={flow.workbench.before} grid={grid} aoi={null} marks={null} />
                </div>
                {diff && (
                  <div className="absolute inset-0">
                    <FrameCanvas
                      rgba={diff}
                      width={grid.width}
                      height={grid.height}
                      label={flow.workbench.modes.diff}
                    />
                  </div>
                )}
                {outline && <Outline aoi={outline} grid={grid} marks={marks} />}
                <Chrome grid={grid} chips={[[flow.workbench.diffChip, 'left']]} />
              </div>
              <figcaption className="text-sm text-fg-2">{flow.workbench.diffCaption}</figcaption>
            </figure>
          )}

          {mode !== 'side' && (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-6">
              <Caption slot={before} />
              <Caption slot={after} right />
            </div>
          )}
          {/* Its place is kept before the photos are in, so nothing below it moves when they arrive. */}
          <p className="min-h-5 text-sm text-fg-2">
            {years.length > 0 && copy.attribution.sentinelYears(years)}
          </p>
        </>
      )}
    </div>
  )
}

/** Memoised: the timeline changes the date on show with every slider step, and nothing here depends on it. */
export const EvidenceViewer = memo(EvidenceViewerBody)
