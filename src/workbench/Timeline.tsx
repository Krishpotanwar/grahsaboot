import { memo } from 'react'
import type { DisplayGrid, QualityLabel } from '../evidence/types.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Panel, QualityGlyph, QualityTag, Skeleton } from '../ui/kit.tsx'
import { isUsable } from './defaults.ts'
import { FrameCanvas } from './FrameCanvas.tsx'
import type { DateEntry } from './runner.ts'

/** What a date with no result is called: Loading while its check is on its way, the failure once it failed. */
export const waitingWord = (e: Pick<DateEntry, 'status'>) =>
  e.status === 'error' ? flow.workbench.checkFailed : copy.common.loading

const wordOf = (e: DateEntry) => (e.quality ? copy.quality[e.quality.stats.label].word : waitingWord(e))

/** 2 = the date on show, 1 = the before or after date, 0 = any other. Primitives, so a mark re-renders only when its own state changes. */
type MarkState = 0 | 1 | 2

// One memoised mark per pass: a runner update changes one entry, so only that mark renders again (real data has ~1,100).
const Mark = memo(function Mark({
  date,
  label,
  state,
  t0,
  span,
}: {
  date: string
  label: QualityLabel | null
  state: MarkState
  t0: number
  span: number
}) {
  const colour = state === 2 ? 'z-10 text-accent' : state === 1 ? 'z-10 text-fg' : 'text-fg-2'
  return (
    <span
      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${colour}`}
      style={{ left: `${((Date.parse(date) - t0) / span) * 100}%` }}
    >
      {label ? (
        <QualityGlyph label={label} size={state ? 14 : 10} />
      ) : (
        <span className={`block ${state === 2 ? 'h-5 w-0.5 bg-accent' : 'h-2 w-px bg-control'}`} />
      )}
    </span>
  )
})

interface Props {
  entries: DateEntry[]
  from: string
  to: string
  current: string | null
  before: string | null
  after: string | null
  pinned: string[]
  thumbGrid: DisplayGrid | null
  /** A road's sections: the current date lists how clearly each one is seen. Undefined for a site. */
  sections?: Array<{ idx: number; fromM: number; toM: number }>
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
  error,
  onSelect,
  onBefore,
  onAfter,
  onPin,
  onRetry,
}: Props) {
  if (entries.length === 0) return null
  const t0 = Date.parse(from)
  const span = Math.max(1, Date.parse(to) - t0)
  const idx = Math.max(
    0,
    entries.findIndex((e) => e.date === current),
  )
  const cur = entries[idx]!
  const q = cur.quality
  return (
    <Panel title={`${flow.workbench.timeline} · ${flow.workbench.passes(entries.length)}`}>
      <div className="relative isolate h-10 border-b border-line" aria-hidden>
        {entries.map((e) => (
          <Mark
            key={e.date}
            date={e.date}
            label={e.quality?.stats.label ?? null}
            state={e.date === cur.date ? 2 : e.date === before || e.date === after ? 1 : 0}
            t0={t0}
            span={span}
          />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={entries.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onSelect(entries[Number(e.target.value)]!.date)}
        aria-label={flow.workbench.timelineLabel}
        aria-valuetext={`${fmtDate(cur.date)}, ${wordOf(cur)}`}
        className="mt-3 h-11 w-full accent-[var(--gs-accent)]"
      />
      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono num">{fmtDate(cur.date)}</p>
          {q ? (
            <QualityTag label={q.stats.label} />
          ) : (
            cur.status !== 'error' && <span className="text-sm text-fg-2">{waitingWord(cur)}</span>
          )}
        </div>
        {q && (
          <p className="text-sm text-fg-2">
            {copy.quality[q.stats.label].help} {pct(q.stats.clearFraction)}%.
          </p>
        )}
        {cur.status === 'error' && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-bad">
            <p>{flow.workbench.checkFailed}</p>
            <Button size="sm" onClick={() => onRetry(cur.date)}>
              {copy.common.retry}
            </Button>
          </div>
        )}
        {sections && (
          <ul className="grid gap-1 text-sm">
            {sections.map((p) => {
              const st = q?.parts.find((x) => x.idx === p.idx)?.stats
              return (
                <li key={p.idx} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[0.75rem] num">
                    {flow.workbench.section(p.fromM, p.toM)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {st && <QualityGlyph label={st.label} />}
                    <span>{st ? copy.quality[st.label].word : waitingWord(cur)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {q && (
          <details>
            <summary className="cursor-pointer py-3 text-sm font-medium">{copy.common.details}</summary>
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
        )}
        {thumbGrid &&
          isUsable(cur) &&
          (cur.thumb ? (
            <FrameCanvas
              rgba={cur.thumb.display.rgba}
              width={thumbGrid.width}
              height={thumbGrid.height}
              label={flow.workbench.photoAlt(
                flow.workbench.timelineLabel,
                fmtDate(cur.date),
                pct(q!.stats.clearFraction),
              )}
            />
          ) : cur.thumbFailed ? (
            <p className="text-sm text-fg-2">{flow.workbench.thumbFailed}</p>
          ) : (
            <div style={{ aspectRatio: `${thumbGrid.width} / ${thumbGrid.height}` }}>
              <Skeleton className="h-full w-full" />
            </div>
          ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onBefore(cur.date)} disabled={!after || cur.date >= after}>
            {flow.workbench.useBefore}
          </Button>
          <Button size="sm" onClick={() => onAfter(cur.date)} disabled={!before || cur.date <= before}>
            {flow.workbench.useAfter}
          </Button>
          <Button
            size="sm"
            aria-pressed={pinned.includes(cur.date)}
            onClick={() => onPin(cur.date)}
            disabled={cur.date === before || cur.date === after}
          >
            {pinned.includes(cur.date) ? flow.workbench.unpin : flow.workbench.pin}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {flow.workbench.errors[error] ?? error}
          </p>
        )}
        <p className="text-xs text-fg-2">{flow.workbench.legend}</p>
      </div>
    </Panel>
  )
}
