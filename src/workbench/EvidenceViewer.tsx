import { ArrowsLeftRight } from '@phosphor-icons/react'
import { animate } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { brightnessDiff } from '../evidence/diff.ts'
import type { DisplayGrid, QualityStats } from '../evidence/types.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, QualityTag, Skeleton } from '../ui/kit.tsx'
import type { FrameResult } from '../workers/imagery-core.ts'
import { FrameCanvas } from './FrameCanvas.tsx'
import { outlinePath } from './overlay.ts'

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

function Caption({ slot }: { slot: NonNullable<Slot> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.75rem] text-fg-2 num">
      <span>
        {flow.workbench.caption(fmtDate(slot.date), slot.stats ? pct(slot.stats.clearFraction) : undefined)}
      </span>
      {slot.stats && <QualityTag label={slot.stats.label} />}
      <span className="max-w-[24ch] truncate" title={slot.itemId}>
        {slot.itemId}
      </span>
      <span>{flow.workbench.notSaved}</span>
    </p>
  )
}

/** The user's outline over a photo: accent, dashed, a light fill, so it never hides the ground. */
function Outline({ aoi, grid }: { aoi: AoiInput; grid: DisplayGrid }) {
  return (
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
  )
}

function Photo({
  slot,
  role,
  grid,
  aoi,
}: {
  slot: NonNullable<Slot>
  role: string
  grid: DisplayGrid
  aoi: AoiInput | null
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
      {aoi && <Outline aoi={aoi} grid={grid} />}
    </div>
  )
}

export function EvidenceViewer({
  before,
  after,
  grid,
  invalid,
  aoi,
  onRetry,
}: {
  before: Slot
  after: Slot
  grid: DisplayGrid
  /** Pixels either photo cannot show clearly (clouds, shadow, no data); null until both masks have arrived. */
  invalid: Uint8Array | null
  aoi: AoiInput
  onRetry: (date: string) => void
}) {
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
  if (!before || !after) return <p className="border border-line p-6 text-fg-2">{flow.workbench.pickPair}</p>

  const aspect = { aspectRatio: `${grid.width} / ${grid.height}` }
  const box = 'relative overflow-hidden border border-line'
  const outline = showOutline ? aoi : null
  const years = [before, after].filter((s) => s.frame).map((s) => Number(s.date.slice(0, 4)))

  const snap = () => {
    const target = [0, 50, 100].find((t) => Math.abs(t - pos) < 4)
    if (target === undefined || target === pos) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPos(target)
    else
      spring.current = animate(pos, target, { type: 'spring', stiffness: 400, damping: 40, onUpdate: setPos })
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex w-fit overflow-hidden rounded-[6px] border border-control">
          <legend className="sr-only">{flow.workbench.view}</legend>
          {(['swipe', 'side', 'diff'] as const).map((m) => (
            <label key={m} className="relative">
              <input
                type="radio"
                name="view"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="peer absolute inset-0 cursor-pointer opacity-0"
              />
              <span className="inline-flex h-11 cursor-pointer items-center px-4 text-sm peer-checked:bg-fg peer-checked:text-bg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                {flow.workbench.modes[m]}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOutline}
            onChange={(e) => setShowOutline(e.target.checked)}
            className="h-6 w-6 cursor-pointer accent-accent"
          />
          {flow.workbench.outlineToggle}
        </label>
      </div>

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
              <Photo slot={before} role={flow.workbench.before} grid={grid} aoi={outline} />
            </div>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
              <Photo slot={after} role={flow.workbench.after} grid={grid} aoi={outline} />
            </div>
          </div>
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
            className="pointer-events-none absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-bg text-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
            style={{ left: `clamp(22px, ${pos}%, calc(100% - 22px))` }}
          >
            <ArrowsLeftRight size={20} weight="bold" />
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
              <div className={box} style={aspect}>
                <div className="absolute inset-0">
                  <Photo slot={s} role={role} grid={grid} aoi={outline} />
                </div>
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
          <div className={box} style={aspect}>
            <div className="absolute inset-0 opacity-50">
              <Photo slot={before} role={flow.workbench.before} grid={grid} aoi={null} />
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
            {outline && <Outline aoi={outline} grid={grid} />}
          </div>
          <figcaption className="text-sm text-fg-2">{flow.workbench.diffCaption}</figcaption>
        </figure>
      )}

      {mode !== 'side' && (
        <div className="grid gap-1 sm:grid-cols-2">
          <Caption slot={before} />
          <Caption slot={after} />
        </div>
      )}
      {years.length > 0 && <p className="text-sm text-fg-2">{copy.attribution.sentinelYears(years)}</p>}
    </div>
  )
}
