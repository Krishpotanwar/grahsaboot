import { memo, useMemo, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { dateAt, nearestPass, stripYears, tickKind, TICK_PX, yearRows, type TickKind } from './barcode.ts'
import type { DateEntry } from './runner.ts'

/** A place along a year or the range as a percentage, to 2 decimals: the same number for the same pass at every render. */
const place = (f: number) => Math.round(f * 10_000) / 100

/** Background-only marks vanish in forced-colors mode (the canvas colour replaces them): there they take the system colours. */
const FC = 'forced-colors:[forced-color-adjust:none]'
const FC_TEXT = `${FC} forced-colors:bg-[CanvasText]`
const FC_ACCENT = `${FC} forced-colors:bg-[Highlight]`

/** Plain ticks: how clearly that pass sees the outline, by height first, then by weight. */
const LOOK: Record<TickKind, string> = {
  clear: `w-0.5 bg-fg opacity-85 ${FC_TEXT}`,
  partial: `w-0.5 bg-fg opacity-70 ${FC_TEXT}`,
  obscured: `w-0.5 bg-fg-2 opacity-45 ${FC_TEXT}`,
  unchecked: `w-0.5 bg-fg-2 opacity-25 ${FC_TEXT}`,
}

// One memoised tick per pass: a runner update changes one entry, so one finished check renders one tick (real data has ~1,100).
// Every prop is a primitive. `accent`: the before, the after, or a pinned date (3 px wide, the height of its kind).
export const Tick = memo(function Tick({
  date,
  x,
  kind,
  accent,
}: {
  date: string
  x: number
  kind: TickKind
  accent: boolean
}) {
  return (
    <span
      data-date={date}
      className={`absolute bottom-0 -ml-px ${accent ? `z-[1] w-[3px] bg-accent ${FC_ACCENT}` : LOOK[kind]}`}
      style={{ left: `${x}%`, height: TICK_PX[kind] }}
    />
  )
})

/** What marks the pass on show: a short accent bar under its tick, in the gap under the year's rule. */
function Caret({ x }: { x: number }) {
  return (
    <span
      className={`absolute top-full mt-[2px] h-[2px] w-[7px] -translate-x-1/2 bg-accent ${FC_ACCENT}`}
      style={{ left: `${x}%` }}
    />
  )
}

function Key({
  h,
  w = 2,
  look,
  className = '',
  children,
}: {
  h: number
  w?: number
  look: string
  className?: string
  children: ReactNode
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={`shrink-0 ${look}`} style={{ width: w, height: h }} />
      {children}
    </span>
  )
}

interface Props {
  entries: DateEntry[]
  from: string
  to: string
  /** The index of the pass on show. */
  idx: number
  /** The slider's name and its spoken value (the date and how clearly it sees the outline). */
  label: string
  valueText: string
  before: string | null
  after: string | null
  pinned: string[]
  /** A road: one strip over the whole range with its years under it. A site: a row per year. */
  road: boolean
  onSelect(date: string): void
}

/**
 * The passes as ticks: tall for a clear view, short for an obscured one. Decoration for the pointer (a press or a drag
 * selects the pass nearest in date); the keyboard and screen readers get the native range under it, which moves by pass.
 */
export function Barcode({
  entries,
  from,
  to,
  idx,
  label,
  valueText,
  before,
  after,
  pinned,
  road,
  onSelect,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const rowsBox = useRef<HTMLDivElement>(null)
  const last = useRef(-1)
  const moved = useRef(false)
  const drift = useRef(false)
  const origin = useRef({ x: 0, y: 0 })
  const dates = useMemo(() => entries.map((e) => e.date), [entries])
  const pins = new Set(pinned)
  const t0 = Date.parse(from)
  const span = Math.max(1, Date.parse(to) - t0)
  const rows = road ? [] : yearRows(dates, from, to)
  const years = road ? stripYears(from, to) : []
  // The legend names the faintest tick only while there is one: a sweep that is still running.
  const unchecked = entries.some((e) => !e.quality && (e.status === 'queued' || e.status === 'checking'))

  const tick = (i: number, f: number) => {
    const e = entries[i]!
    return (
      <Tick
        key={e.date}
        date={e.date}
        x={place(f)}
        kind={tickKind(e.quality?.stats.label, e.status)}
        accent={e.date === before || e.date === after || pins.has(e.date)}
      />
    )
  }
  const strip = road
    ? entries.flatMap((e, i) => {
        const f = (Date.parse(e.date) - t0) / span
        return f < 0 || f > 1 ? [] : [tick(i, f)]
      })
    : null
  const caretAt = road ? (Date.parse(entries[idx]!.date) - t0) / span : -1

  // The date a press is at, then its nearest pass. A site: the row under the pointer is the year, its width the days of it.
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    let t = dateAt(f, null, t0, span)
    if (!road) {
      // The nearest row, so the gaps between rows and the hit area above and below belong to a row too.
      let best = Infinity
      Array.from(rowsBox.current?.children ?? []).forEach((el, r) => {
        const b = el.getBoundingClientRect()
        const d = e.clientY < b.top ? b.top - e.clientY : e.clientY > b.bottom ? e.clientY - b.bottom : 0
        if (d < best) {
          best = d
          t = dateAt(f, rows[r]!, t0, span)
        }
      })
    }
    const i = nearestPass(dates, t)
    if (i >= 0 && i !== last.current) {
      last.current = i
      onSelect(dates[i]!)
    }
  }
  const pointer = {
    // The press moves the keyboard to the slider (below); the mouse event after it must not take it away again.
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      // What the user was doing with the keyboard goes on from here.
      input.current?.focus({ preventScroll: true })
      last.current = idx
      moved.current = false
      drift.current = false
      origin.current = { x: e.clientX, y: e.clientY }
      // A finger may be starting to scroll the page (`touch-action` lets it, and then cancels this press): it selects when it
      // moves ALONG the barcode or lifts without having moved, not as it lands and not while it goes up or down.
      if (e.pointerType !== 'touch') pick(e)
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      if (e.pointerType === 'touch' && !moved.current) {
        const dx = Math.abs(e.clientX - origin.current.x)
        const dy = Math.abs(e.clientY - origin.current.y)
        if (dx <= 4 || dx <= dy) {
          if (dy > 10) drift.current = true // a vertical swipe: the page's, not a tap
          return
        }
      }
      moved.current = true
      pick(e)
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch' && !moved.current && !drift.current) pick(e) // a tap
    },
  }
  // A hit area of 44 px at least on a one-year site, without moving anything: the padding is taken back with a margin.
  const HIT = '-my-3.5 cursor-pointer touch-pan-y touch-pinch-zoom py-3.5'

  return (
    <div className="relative">
      <input
        ref={input}
        type="range"
        min={0}
        max={entries.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onSelect(entries[Number(e.target.value)]!.date)}
        aria-label={label}
        aria-valuetext={valueText}
        className="peer sr-only"
      />
      <div
        aria-hidden
        className="select-none rounded-[2px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent"
      >
        {road ? (
          <>
            <div className={HIT} {...pointer}>
              <div className="relative h-[17px] border-b border-line">
                {strip}
                {caretAt >= 0 && caretAt <= 1 && <Caret x={place(caretAt)} />}
              </div>
            </div>
            <div className="relative h-[18px] font-mono text-[11px] leading-none text-fg-2">
              {years.map((y) => (
                <span key={y.year} className="absolute top-[5px]" style={{ left: `${y.f * 100}%` }}>
                  {y.year}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <div className="grid w-[34px] shrink-0 gap-[5px]">
              {rows.map((r) => (
                <span
                  key={r.year}
                  className="flex h-[17px] items-end pb-px font-mono text-[11px] leading-none text-fg-2"
                >
                  {r.year}
                </span>
              ))}
            </div>
            <div className={`min-w-0 flex-1 ${HIT}`} {...pointer}>
              <div ref={rowsBox} className="grid gap-[5px]">
                {rows.map((r) => {
                  const shown = r.ticks.find((t) => t.i === idx)
                  return (
                    <div key={r.year} className="relative h-[17px] border-b border-line">
                      {r.ticks.map((t) => tick(t.i, t.f))}
                      {shown && <Caret x={place(shown.f)} />}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Five words (while a sweep runs) take 385 px: one line from 421 px up, two on a phone, where the place for both is kept. */}
      <p
        aria-hidden
        className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[11px] leading-4 text-fg-2 max-[420px]:min-h-9"
      >
        <Key h={12} look={`bg-fg opacity-85 ${FC_TEXT}`}>
          {copy.quality.CLEAR.word}
        </Key>
        <Key h={6} look={`bg-fg opacity-70 ${FC_TEXT}`}>
          {copy.quality.PARTIAL.word}
        </Key>
        <Key h={3} look={`bg-fg-2 opacity-45 ${FC_TEXT}`}>
          {copy.quality.OBSCURED.word}
        </Key>
        {unchecked && (
          <Key h={2} look={`bg-fg-2 opacity-25 ${FC_TEXT}`}>
            {flow.workbench.notCheckedYet}
          </Key>
        )}
        <Key h={12} w={3} look={`bg-accent ${FC_ACCENT}`} className="text-accent">
          {flow.workbench.pinned}
        </Key>
      </p>
    </div>
  )
}
