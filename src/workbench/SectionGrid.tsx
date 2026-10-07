import { memo, useCallback, useRef, useState, type KeyboardEvent } from 'react'
import type { QualityStats } from '../evidence/types.ts'
import { fmtDate } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Panel, QualityGlyph } from '../ui/kit.tsx'
import { moveFocusByDate } from './grid-nav.ts'
import type { DateEntry, EntryStatus } from './runner.ts'
import { waitingWord } from './Timeline.tsx'

// One memoised cell per section and date: its props are primitives and `stats`, which keeps its identity until the check
// is redone, so a runner update re-renders only the cells of the date that changed.
const Cell = memo(function Cell({
  r,
  date,
  section,
  stats,
  status,
  isCurrent,
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
  isCurrent: boolean
  isStop: boolean
  at(r: number, date: string): void
  pick(r: number, date: string): void
  reg(key: string, el: HTMLButtonElement | null): void
}) {
  const word = stats ? copy.quality[stats.label].word : waitingWord({ status })
  return (
    <td className="p-0">
      <button
        ref={(el) => reg(`${r}:${date}`, el)}
        tabIndex={isStop ? 0 : -1}
        aria-label={flow.workbench.cell(section, fmtDate(date), word)}
        aria-current={isCurrent ? 'date' : undefined}
        onFocus={() => at(r, date)}
        onClick={() => pick(r, date)}
        className={`grid min-h-11 min-w-[3.5rem] place-items-center content-center gap-0.5 px-1 text-fg focus-visible:-outline-offset-2 ${isCurrent ? 'bg-line' : ''}`}
      >
        {stats && <QualityGlyph label={stats.label} />}
        <span className="text-[0.6875rem] leading-tight text-fg-2">{word}</span>
      </button>
    </td>
  )
})

/** Road sections (rows) against the pinned dates (columns). One Tab stop; the arrow keys, Home and End move inside it. */
export function SectionGrid({
  entries,
  parts,
  current,
  onSelect,
}: {
  entries: DateEntry[]
  parts: Array<{ idx: number; fromM: number; toM: number }>
  current: string | null
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
  return (
    <Panel title={flow.workbench.grid} className="min-w-0">
      <div className="overflow-x-auto">
        <table
          role="grid"
          aria-label={flow.workbench.grid}
          className="border-collapse text-sm"
          onKeyDown={onKey}
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 bg-panel px-2 py-1 text-left font-mono text-[0.75rem] font-medium text-fg-2"
              >
                {flow.workbench.sectionCol}
              </th>
              {entries.map((e) => (
                <th
                  key={e.date}
                  scope="col"
                  className="px-1 py-1 font-mono text-[0.75rem] font-medium text-fg-2 [writing-mode:vertical-rl]"
                >
                  {fmtDate(e.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parts.map((p, r) => {
              const section = flow.workbench.section(p.fromM, p.toM)
              return (
                <tr key={p.idx}>
                  <th
                    scope="row"
                    className="sticky left-0 whitespace-nowrap bg-panel px-2 py-1 text-left font-mono text-[0.75rem] font-medium num"
                  >
                    {section}
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
    </Panel>
  )
}
