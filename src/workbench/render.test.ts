// Timeline and SectionGrid rendered to a string (no DOM): the states they show, and the sizes real data brings.
// The featured worked example yields ~1,100 passes; a pinned-date grid holds at most 24 columns (26 here, for margin).
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { QualityLabel, QualityStats } from '../evidence/types.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import type { QualityResult } from '../workers/imagery-core.ts'
import type { DateEntry, EntryStatus } from './runner.ts'
import { SectionGrid } from './SectionGrid.tsx'
import { Timeline } from './Timeline.tsx'

const stats = (label: QualityLabel, over: Partial<QualityStats> = {}): QualityStats => {
  const clear = label === 'CLEAR' ? 1 : label === 'PARTIAL' ? 0.6 : 0
  return {
    policy: 'scl-v2',
    counts: [],
    total: 100,
    clearFraction: clear,
    validFraction: clear,
    uncertainFraction: 0,
    obstructedFraction: label === 'NOT_COVERED' ? 0 : 1 - clear,
    nodataFraction: label === 'NOT_COVERED' ? 1 : 0,
    label,
    ...over,
  }
}
const PARTS = [0, 1, 2, 3, 4].map((idx) => ({ idx, fromM: idx * 2000, toM: (idx + 1) * 2000 }))
const quality = (label: QualityLabel, parts: number, over?: Partial<QualityStats>): QualityResult => ({
  window: [0, 0, 1, 1],
  level: 0,
  sha256: 'x',
  stats: stats(label, over),
  parts: PARTS.slice(0, parts).map((p) => ({ ...p, stats: stats(label) })),
})
function entry(
  date: string,
  label: QualityLabel | null,
  {
    status = label ? 'checked' : 'queued',
    parts = 0,
    over,
  }: { status?: EntryStatus; parts?: number; over?: Partial<QualityStats> } = {},
): DateEntry {
  return {
    date,
    candidate: { date, item: { id: `S2_${date}` } as never, alternates: [], coversAoi: true },
    quality: label ? quality(label, parts, over) : null,
    thumb: null,
    full: null,
    invalid: null,
    status,
    error: status === 'error' ? 'SCL_500' : null,
    thumbFailed: false,
  }
}
const day = (i: number) => new Date(Date.UTC(2018, 0, 1) + i * 2 * 86_400_000).toISOString().slice(0, 10)
const noop = () => {}
const handlers = { onSelect: noop, onBefore: noop, onAfter: noop, onPin: noop, onRetry: noop }
const timeline = (entries: DateEntry[], over: Record<string, unknown> = {}) =>
  renderToString(
    createElement(Timeline, {
      entries,
      from: entries[0]!.date,
      to: entries.at(-1)!.date,
      current: entries[0]!.date,
      before: null,
      after: null,
      pinned: [],
      thumbGrid: null,
      ...handlers,
      ...over,
    }),
  )
const grid = (entries: DateEntry[], over: Record<string, unknown> = {}) =>
  renderToString(
    createElement(SectionGrid, {
      entries,
      parts: PARTS,
      current: entries[0]?.date ?? null,
      onSelect: noop,
      ...over,
    }),
  )

describe('Timeline', () => {
  it('renders ~1,100 passes quickly, with one slider and no extra tab stops', () => {
    const labels = ['CLEAR', 'PARTIAL', 'OBSCURED', null] as const
    const entries = Array.from({ length: 1100 }, (_, i) => entry(day(i), labels[i % 4]!))
    const t0 = performance.now()
    const html = timeline(entries, {
      current: entries[550]!.date,
      before: entries[0]!.date,
      after: entries[1099]!.date,
      pinned: [entries[0]!.date, entries[1099]!.date],
    })
    expect(performance.now() - t0).toBeLessThan(400)
    expect(html).toContain('max="1099"')
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).not.toContain('tabindex') // the marks are decoration; the slider carries the keyboard
  })

  it('reads out the date and how clearly it sees the outline', () => {
    const html = timeline([entry('2025-01-10', 'CLEAR'), entry('2025-03-05', 'PARTIAL')], {
      current: '2025-03-05',
    })
    expect(html).toContain('aria-valuetext="5 Mar 2025, Partly clear"')
    expect(html).toContain(copy.quality.PARTIAL.help)
  })

  it('says Loading only while a check is on its way, and the failure when it failed', () => {
    const waiting = timeline([entry('2025-01-10', null, { status: 'checking' })])
    expect(waiting).toContain(`aria-valuetext="10 Jan 2025, ${copy.common.loading}"`)
    expect(waiting).not.toContain(flow.workbench.checkFailed)

    const failed = timeline([entry('2025-01-10', null, { status: 'error' })])
    expect(failed).toContain(`aria-valuetext="10 Jan 2025, ${flow.workbench.checkFailed}"`)
    expect(failed).toContain(copy.common.retry)
    expect(failed).not.toContain(`, ${copy.common.loading}"`)
  })

  it('lists the four shares of the checked outline under Details', () => {
    const html = timeline([
      entry('2025-01-10', 'PARTIAL', {
        over: { validFraction: 0.5, uncertainFraction: 0.1, obstructedFraction: 0.3, nodataFraction: 0.1 },
      }),
    ])
    expect(html).toContain(`>${copy.common.details}</summary>`)
    for (const [label, share] of [
      [flow.workbench.shares.valid, '50%'],
      [flow.workbench.shares.uncertain, '10%'],
      [flow.workbench.shares.obstructed, '30%'],
      [flow.workbench.shares.nodata, '10%'],
    ])
      expect(html).toMatch(
        new RegExp(`<dt[^>]*>${label.replace(/[()]/g, '\\$&')}</dt><dd[^>]*>${share}</dd>`),
      )
  })

  it('lists the sections of a road for the current date, each with its glyph and word', () => {
    const sections = PARTS.slice(0, 2)
    const rows = (e: DateEntry) => timeline([e], { sections }).match(/<li\b.*?<\/li>/g) ?? []
    const checked = rows(entry('2025-01-10', 'CLEAR', { parts: 2 }))
    expect(checked).toHaveLength(2)
    expect(checked[0]).toContain(flow.workbench.section(0, 2000))
    expect(checked[1]).toContain(flow.workbench.section(2000, 4000))
    for (const row of checked) expect(row).toContain(`>${copy.quality.CLEAR.word}<`)
    expect(timeline([entry('2025-01-10', 'CLEAR')])).not.toContain('<ul') // a site has no sections
    // not checked yet, or failed: each row says so instead of showing a glyph
    for (const row of rows(entry('2025-01-10', null, { status: 'checking' }))) {
      expect(row).toContain(`>${copy.common.loading}<`)
      expect(row).not.toContain('<svg')
    }
    for (const row of rows(entry('2025-01-10', null, { status: 'error' })))
      expect(row).toContain(`>${flow.workbench.checkFailed}<`)
  })

  it('keeps a pin error next to the pin buttons', () => {
    const html = timeline([entry('2025-01-10', 'CLEAR')], { error: 'TOO_MANY_PINS' })
    expect(html).toMatch(/role="alert"[^>]*>You can pin up to 24 dates\./)
  })
})

describe('SectionGrid', () => {
  it('renders 5 sections x 26 pinned dates quickly, with exactly one tab stop', () => {
    const labels = ['CLEAR', 'PARTIAL', 'OBSCURED', 'NOT_COVERED'] as const
    const entries = Array.from({ length: 26 }, (_, i) => entry(day(i * 40), labels[i % 4]!, { parts: 5 }))
    const t0 = performance.now()
    const html = grid(entries, { current: entries[3]!.date })
    expect(performance.now() - t0).toBeLessThan(400)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(5 * 26 - 1)
    expect(html.match(/aria-current="date"/g)).toHaveLength(5)
    expect(html.match(/<th[^>]*scope="row"/g)).toHaveLength(5)
  })

  it('gives each cell the glyph and its word, and reads them out with the section and date', () => {
    const html = grid(
      [entry('2025-01-10', 'CLEAR', { parts: 2 }), entry('2025-03-05', 'PARTIAL', { parts: 2 })],
      { parts: PARTS.slice(0, 2) },
    )
    expect(html).toContain(`aria-label="${flow.workbench.cell('2.0–4.0 km', '5 Mar 2025', 'Partly clear')}"`)
    expect(html).toContain('>Partly clear<')
    expect(html).toContain('>Clear<')
  })

  it('keeps a pinned date that is not checked yet, or failed, as a column with its word and no glyph', () => {
    const e = [
      entry('2025-01-10', 'CLEAR', { parts: 2 }),
      entry('2025-03-05', null, { status: 'checking' }),
      entry('2025-06-15', null, { status: 'error' }),
    ]
    const html = grid(e, { parts: PARTS.slice(0, 2) })
    expect(html).toContain(
      `aria-label="${flow.workbench.cell('0.0–2.0 km', '5 Mar 2025', copy.common.loading)}"`,
    )
    expect(html).toContain(
      `aria-label="${flow.workbench.cell('0.0–2.0 km', '15 Jun 2025', flow.workbench.checkFailed)}"`,
    )
    expect(html.match(/<svg/g)).toHaveLength(2) // the two cells of the checked date; the other columns have none
  })

  it('shows nothing for a single section or without pinned dates', () => {
    expect(grid([entry('2025-01-10', 'CLEAR', { parts: 1 })], { parts: PARTS.slice(0, 1) })).toBe('')
    expect(grid([])).toBe('')
  })
})
