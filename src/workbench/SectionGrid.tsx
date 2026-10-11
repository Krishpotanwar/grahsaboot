import { memo, useCallback, useRef, useState, type KeyboardEvent } from 'react'
import type { QualityStats } from '../evidence/types.ts'
import { fmtDate } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { QualityGlyph, SECTION, Section, Skeleton } from '../ui/kit.tsx'
import { moveFocusByDate } from './grid-nav.ts'
import type { DateEntry, EntryStatus } from './runner.ts'
import { shortWord } from './Timeline.tsx'

// One memoised cell per section and date: its props are primitives and `stats`, which keeps its identity until the check
// is redone, so a runner update re-renders only the cells of the date that changed.
const Cell = memo(function Cell({
  r,
  date,
  section,
  stats,
  status,
  isCurrent,
  isSel,
  isStop,
  at,
  pick,
  reg,
}: {
  r: number
  date: string
  section: string
  /** This section's result on this date. Absent while the date is being checked, or if the check failed. */
  stats: QualityStats | undefined
  status: EntryStatus
  /** The date on show: the whole column says so to a screen reader. */
  isCurrent: boolean
  /** The date on show in the row that has the focus: the one cell the detail below is about. */
  isSel: boolean
  isStop: boolean
  at(r: number, date: string): void
  pick(r: number, date: string): void
  reg(key: string, el: HTMLButtonElement | null): void
}) {
  const word = stats ? copy.quality[stats.label].word : shortWord({ status })
  return (
    <td className="border-b border-r border-line p-0">
      <button
        ref={(el) => reg(`${r}:${date}`, el)}
        tabIndex={isStop ? 0 : -1}
        aria-label={flow.workbench.cell(section, fmtDate(date), word)}
        aria-current={isCurrent ? 'date' : undefined}
        onFocus={() => at(r, date)}
        onClick={() => pick(r, date)}
        // The mark is an inset shadow: the focus ring (an outline) stays visible on a cell that has both.
        className={`flex min-h-11 w-full min-w-20 items-center gap-1.5 px-2 text-left font-mono text-[11px] uppercase tracking-[0.08em] text-fg focus-visible:-outline-offset-2 ${isSel ? 'shadow-[inset_0_0_0_1px_var(--gs-accent)]' : ''}`}
      >
        {stats && <QualityGlyph label={stats.label} />}
        <span className="whitespace-nowrap">{word}</span>
      </button>
    </td>
  )
})

/** Road sections (rows) against the pinned dates (columns). One Tab stop; the arrow keys, Home and End move inside it. */
export function SectionGrid({
  entries,
  parts,
  current,
  shown,
  onSelect,
}: {
  entries: DateEntry[]
  parts: Array<{ idx: number; fromM: number; toM: number }>
  current: string | null
  /** The date on show, which need not be a column (the detail below the table is about it). Else the column of `current`. */
  shown?: DateEntry
  onSelect(date: string): void
}) {
  // The roving cell is a row and a date, not a column number: pinning a date adds a column anywhere in the row.
  const [pos, setPos] = useState<{ r: number; date: string | null }>({ r: 0, date: null })
  const cells = useRef(new Map<string, HTMLButtonElement>())
  const reg = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) cells.current.set(key, el)
    else cells.current.delete(key)
  }, [])
  // The roving stop follows the focus, however it got there (Tab, arrow keys, a click, assistive technology).
  const at = useCallback(
    (r: number, date: string) => setPos((p) => (p.r === r && p.date === date ? p : { r, date })),
    [],
  )
  const pick = useCallback(
    (r: number, date: string) => {
      at(r, date)
      onSelect(date)
    },
    [at, onSelect],
  )
  if (parts.length < 2 || entries.length === 0) return null
  const dates = entries.map((e) => e.date)
  const stop = {
    r: Math.min(pos.r, parts.length - 1),
    date: pos.date !== null && dates.includes(pos.date) ? pos.date : dates[0]!,
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return // browser and system shortcuts keep their meaning
    const next = moveFocusByDate(stop, e.key, parts.length, dates)
    if (next === stop) return
    e.preventDefault()
    cells.current.get(`${next.r}:${next.date}`)?.focus() // its focus event moves the roving stop
  }
  const part = parts[stop.r]!
  const on = shown ?? entries.find((e) => e.date === current)
  const stats = on?.quality?.parts.find((x) => x.idx === part.idx)?.stats
  return (
    <>
      <Section title={flow.workbench.grid} help={flow.workbench.gridHelp}>
        <div className="overflow-x-auto">
          {/* Separate borders (not collapsed), so the sticky first column keeps its own while the dates scroll under it. */}
          <table
            role="grid"
            aria-label={flow.workbench.grid}
            className="w-full border-separate border-spacing-0 border-l border-t border-line"
            onKeyDown={onKey}
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-[1] border-b border-r border-line bg-bg px-2 py-2 text-left font-mono text-xs font-medium leading-[15px] text-fg"
                >
                  {flow.workbench.sectionCol}
                </th>
                {entries.map((e) => {
                  // "22 Feb" over "2018"; the space keeps the whole date one phrase for a screen reader.
                  const d = fmtDate(e.date)
                  const cut = d.lastIndexOf(' ')
                  return (
                    <th
                      key={e.date}
                      scope="col"
                      className="border-b border-r border-line px-2 py-2 text-left font-mono text-xs font-medium leading-[15px] text-fg"
                    >
                      {d.slice(0, cut)}{' '}
                      <span className="block text-[11px] font-normal leading-[14px] text-fg-2">
                        {d.slice(cut + 1)}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {parts.map((p, r) => {
                const section = flow.workbench.section(p.fromM, p.toM)
                return (
                  <tr key={p.idx}>
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] whitespace-nowrap border-b border-r border-line bg-bg px-2 text-left font-mono text-xs font-medium num"
                    >
                      {flow.workbench.sectionHead(p.idx, p.fromM, p.toM)}
                    </th>
                    {entries.map((e) => (
                      <Cell
                        key={e.date}
                        r={r}
                        date={e.date}
                        section={section}
                        stats={e.quality?.parts.find((x) => x.idx === p.idx)?.stats}
                        status={e.status}
                        isCurrent={e.date === current}
                        isSel={e.date === current && r === stop.r}
                        isStop={r === stop.r && e.date === stop.date}
                        at={at}
                        pick={pick}
                        reg={reg}
                      />
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
      {/* The picked cell: the section with the focus, on the date on show. A gap in the evidence is never "no change". */}
      <div className={SECTION}>
        <h3 className="text-[1.375rem] font-semibold leading-7 tracking-[-0.02em]">
          {flow.workbench.sectionTitle(part.idx, part.fromM, part.toM)}
        </h3>
        {on && (
          <p className="mt-1.5 font-mono text-[0.8125rem] uppercase leading-[18px] text-fg-2 num">
            {flow.workbench.sectionView(
              fmtDate(on.date),
              stats ? copy.quality[stats.label].word : shortWord(on),
              !!stats,
            )}
          </p>
        )}
        <p className="mt-2.5 text-[0.8125rem] leading-[1.45] text-fg-2">{flow.workbench.gapNote}</p>
      </div>
    </>
  )
}

/**
 * The grid's place while the pair is not chosen (no date is pinned before it): its section and one row per section, then the
 * detail block under it. As tall as the grid will be, so the notes below do not move when it arrives (see `TimelineSkeleton`).
 */
export function GridSkeleton({ rows }: { rows: number }) {
  return (
    <>
      <Section title={flow.workbench.grid} help={flow.workbench.gridHelp}>
        <div aria-hidden className="grid gap-px pt-px">
          <Skeleton className="h-[46px]" />
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </Section>
      <div aria-hidden className={SECTION}>
        <Skeleton className="h-7 w-3/5" />
        <Skeleton className="mt-1.5 h-[18px] w-2/5" />
        <Skeleton className="mt-2.5 h-[38px] min-[432px]:max-[1023px]:h-[19px]" />
      </div>
    </>
  )
}
