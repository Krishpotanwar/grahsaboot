import { useState } from 'react'
import type { DisplayGrid } from '../evidence/types.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, QualityGlyph, Section, Skeleton } from '../ui/kit.tsx'
import { Barcode } from './Barcode.tsx'
import { barcodeHeight, listDates, ROW_GAP, yearRows } from './barcode.ts'
import { isUsable } from './defaults.ts'
import { FrameCanvas } from './FrameCanvas.tsx'
import type { DateEntry } from './runner.ts'

/** What a date with no result is called: Loading while its check is on its way, the failure once it failed. */
export const waitingWord = (e: Pick<DateEntry, 'status'>) =>
  e.status === 'error' ? flow.workbench.checkFailed : copy.common.loading

/** `waitingWord` for a cell or a row of a list, where the sentence does not fit; the sentence stays in the selected row. */
export const shortWord = (e: Pick<DateEntry, 'status'>) =>
  e.status === 'error' ? flow.workbench.checkFailedShort : copy.common.loading

const wordOf = (e: DateEntry) => (e.quality ? copy.quality[e.quality.stats.label].word : waitingWord(e))

/** The 52 px preview of a row, always the same box: what arrives later (a check, a picture) moves nothing under it. */
const THUMB = 'h-[52px] w-[52px]'
const STRIPES = 'bg-[image:repeating-linear-gradient(135deg,var(--gs-line)_0_6px,var(--gs-panel)_6px_12px)]'
/** A row of the list: 9 px over and under its 52 px picture, and its 1 px rule. */
const ROW_PX = 71
/** The sentence under the date on show: one line, and two where the column is narrower than the sentence (a phone). */
const SENTENCE = 'h-5 max-[420px]:h-10'

function Thumb({ e, grid }: { e: DateEntry; grid: DisplayGrid | null }) {
  // The row says the same in words; the picture is for the eye.
  if (e.thumb && grid)
    return (
      <span aria-hidden className={`block ${THUMB}`}>
        <FrameCanvas
          rgba={e.thumb.display.rgba}
          width={grid.width}
          height={grid.height}
          label={flow.workbench.photoAlt(
            flow.workbench.timelineLabel,
            fmtDate(e.date),
            e.quality ? pct(e.quality.stats.clearFraction) : undefined,
          )}
          className={`${THUMB} object-cover`}
        />
      </span>
    )
  // A check or a preview on its way: a pulse. Anything else that has no picture (obscured, not covered, a failure): the stripes.
  if (e.status === 'queued' || e.status === 'checking' || (isUsable(e) && !e.thumbFailed))
    return <span aria-hidden className={`block animate-pulse bg-line ${THUMB}`} />
  return (
    <span aria-hidden className={`grid place-items-center text-fg-2 ${THUMB} ${STRIPES}`}>
      <QualityGlyph label={e.quality?.stats.label ?? 'NOT_COVERED'} size={18} />
    </span>
  )
}

interface Props {
  entries: DateEntry[]
  from: string
  to: string
  current: string | null
  before: string | null
  after: string | null
  pinned: string[]
  thumbGrid: DisplayGrid | null
  /** A road's sections: the date on show lists how clearly each one is seen. Undefined for a site. */
  sections?: Array<{ idx: number; fromM: number; toM: number }>
  /** More passes are still being found: the rows of pinned dates not found yet hold their places. */
  more?: boolean
  /** The code of a refused pin (`flow.workbench.errors`), shown next to the pin buttons. */
  error?: string | null
  onSelect(date: string): void
  onBefore(date: string): void
  onAfter(date: string): void
  onPin(date: string): void
  onRetry(date: string): void
}

export function Timeline({
  entries,
  from,
  to,
  current,
  before,
  after,
  pinned,
  thumbGrid,
  sections,
  more = false,
  error,
  onSelect,
  onBefore,
  onAfter,
  onPin,
  onRetry,
}: Props) {
  // The detail block is a different row's each time the date on show changes: Details keeps its state here.
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  const idx = Math.max(
    0,
    entries.findIndex((e) => e.date === current),
  )
  const cur = entries[idx]!
  const q = cur.quality
  // Its check is on its way: hold the places of what the result brings (a sentence, Details), so the notes below do not move.
  const pending = !q && cur.status !== 'error'
  // The pinned dates and the date on show: one pass over the passes, no more than 25 rows.
  const want = new Set(listDates(pinned, cur.date))
  const rows = entries.filter((e) => want.has(e.date))
  const held = more ? want.size - rows.length : 0
  const isPinned = pinned.includes(cur.date)
  return (
    <Section
      title={flow.workbench.photoTimeline}
      count={`${flow.workbench.passes(entries.length)} · ${flow.workbench.pinnedCount(pinned.length)}`}
    >
      <Barcode
        entries={entries}
        from={from}
        to={to}
        idx={idx}
        label={flow.workbench.timelineLabel}
        valueText={`${fmtDate(cur.date)}, ${wordOf(cur)}`}
        before={before}
        after={after}
        pinned={pinned}
        road={!!sections}
        onSelect={onSelect}
      />
      <ul className="mt-3.5 border-t border-line">
        {rows.map((e) => {
          const selected = e.date === cur.date
          const label = e.quality?.stats.label
          const tag =
            e.date === before
              ? flow.workbench.before
              : e.date === after
                ? flow.workbench.after
                : pinned.includes(e.date)
                  ? flow.workbench.pinned
                  : null
          return (
            <li
              key={e.date}
              className={`border-b border-line ${selected ? 'outline outline-1 -outline-offset-1 outline-accent' : ''}`}
            >
              <button
                type="button"
                aria-current={selected ? 'date' : undefined}
                onClick={() => onSelect(e.date)}
                className="grid w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-3 px-2 py-[9px] text-left hover:bg-panel"
              >
                <Thumb e={e} grid={thumbGrid} />
                <span className="grid min-w-0 gap-1">
                  {/* The tag is on this line, not beside both: the line under keeps the whole width and stays one line at 440 px. */}
                  <span className="flex items-center justify-between gap-x-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="font-mono text-sm font-medium num">{fmtDate(e.date)}</span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
                        {label && <QualityGlyph label={label} />}
                        {label ? copy.quality[label].word : shortWord(e)}
                      </span>
                    </span>
                    {tag && (
                      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
                        {tag}
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-fg-2 num">
                    {flow.workbench.rowMeta(
                      e.candidate.item.id,
                      e.quality ? pct(e.quality.stats.clearFraction) : undefined,
                    )}
                  </span>
                </span>
              </button>
              {selected && (
                <div className="grid gap-3 px-2 pb-3">
                  {q ? (
                    <p className="text-sm text-fg-2">
                      {copy.quality[q.stats.label].help} {pct(q.stats.clearFraction)}%.
                    </p>
                  ) : (
                    pending && <Skeleton className={SENTENCE} />
                  )}
                  {q ? (
                    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
                      <summary className="cursor-pointer py-3 text-sm font-medium">
                        {copy.common.details}
                      </summary>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                        {(
                          [
                            ['valid', q.stats.validFraction],
                            ['uncertain', q.stats.uncertainFraction],
                            ['obstructed', q.stats.obstructedFraction],
                            ['nodata', q.stats.nodataFraction],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="text-fg-2">{flow.workbench.shares[k]}</dt>
                            <dd className="font-mono num">{`${pct(v)}%`}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : (
                    pending && <Skeleton className="h-11" />
                  )}
                  {isUsable(cur) && cur.thumbFailed && (
                    <p className="text-sm text-fg-2">{flow.workbench.thumbFailed}</p>
                  )}
                  {sections && (
                    <ul aria-label={flow.workbench.sectionsLabel} className="grid gap-1 text-sm">
                      {sections.map((p) => {
                        const st = q?.parts.find((x) => x.idx === p.idx)?.stats
                        return (
                          <li key={p.idx} className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[0.75rem] num">
                              {flow.workbench.section(p.fromM, p.toM)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              {st && <QualityGlyph label={st.label} />}
                              <span>{st ? copy.quality[st.label].word : shortWord(cur)}</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {cur.status === 'error' && (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-bad">
                      <p>{flow.workbench.checkFailed}</p>
                      <Button size="sm" onClick={() => onRetry(cur.date)}>
                        {copy.common.retry}
                      </Button>
                    </div>
                  )}
                  {/* One row that takes one more control: nothing here is a fixed width. */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => onBefore(cur.date)}
                      disabled={!after || cur.date >= after}
                    >
                      {flow.workbench.useBefore}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAfter(cur.date)}
                      disabled={!before || cur.date <= before}
                    >
                      {flow.workbench.useAfter}
                    </Button>
                    {/* The label says what pressing does, so it is not also a toggle button. */}
                    <Button
                      size="sm"
                      onClick={() => onPin(cur.date)}
                      disabled={cur.date === before || cur.date === after}
                    >
                      {isPinned ? flow.workbench.unpin : flow.workbench.pin}
                    </Button>
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-bad">
                      {flow.workbench.errors[error] ?? error}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {Array.from({ length: held }, (_, i) => (
          <li key={i} aria-hidden className="border-b border-line" style={{ height: ROW_PX }}>
            <div className="px-2 py-[9px]">
              <Skeleton className={THUMB} />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/**
 * What the side column holds while the search for passes is on: the size the Timeline will have (a row per year or the strip,
 * the legend, the rows of the pinned dates with the sentence, Details, the sections of a road and the buttons under the one on
 * show), so the notes below it do not move when it arrives. The no-jump e2e test fails when the two drift apart: change this
 * with the Timeline.
 */
export function TimelineSkeleton({
  from,
  to,
  road,
  sections,
  rows,
}: {
  from: string
  to: string
  road: boolean
  /** How many sections a road has (a site: 0). */
  sections: number
  /** The rows of the list: the pinned dates, or the pinned dates and the date on show. */
  rows: number
}) {
  const years = yearRows([], from, to).length
  return (
    <Section title={flow.workbench.photoTimeline}>
      <div aria-hidden>
        <div className="grid" style={{ height: barcodeHeight(road, years) }}>
          {road ? (
            <Skeleton className="h-[17px]" />
          ) : (
            <div className="grid" style={{ gap: ROW_GAP }}>
              {Array.from({ length: years }, (_, i) => (
                <Skeleton key={i} className="h-[17px]" />
              ))}
            </div>
          )}
        </div>
        <div className="mt-2.5 h-4 max-[420px]:h-9">
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="mt-3.5 border-t border-line">
          {Array.from({ length: Math.max(1, rows) }, (_, i) => (
            <div key={i} className="border-b border-line">
              <div style={{ height: ROW_PX - 1 }} className="px-2 py-[9px]">
                <Skeleton className={THUMB} />
              </div>
              {i === 0 && (
                <div className="grid gap-3 px-2 pb-3">
                  <Skeleton className={SENTENCE} />
                  <Skeleton className="h-11" />
                  {sections > 0 && <div style={{ height: sections * 24 - 4 }} />}
                  <div className="h-8 max-[389px]:h-[72px]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
