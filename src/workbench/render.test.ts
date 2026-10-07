// Timeline, SectionGrid, NotesPanel and ClaimPanel rendered to a string (no DOM): the states they show, and the sizes real data brings.
// The featured worked example yields ~1,100 passes; a pinned-date grid holds at most 24 columns (26 here, for margin); notes go up to 200.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addNote, newInvestigation, setClaim, type Investigation, type Note } from '../data/investigation.ts'
import type { QualityLabel, QualityStats } from '../evidence/types.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import type { QualityResult } from '../workers/imagery-core.ts'
import { ClaimPanel } from './ClaimPanel.tsx'
import { NotesPanel } from './NotesPanel.tsx'
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

const SITE: AoiInput = {
  kind: 'site',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [79.08, 21.14],
        [79.09, 21.14],
        [79.09, 21.15],
        [79.08, 21.14],
      ],
    ],
  },
}
const KINDS = ['change', 'no_clear_change', 'unsure'] as const
/** An investigation holding `n` notes; `over` sets a note's text, date or section. */
const withNotes = (
  n: number,
  over: (i: number) => Partial<Pick<Note, 'body' | 'date' | 'sectionIdx'>> = () => ({}),
) =>
  Array.from({ length: n }).reduce<Investigation>(
    (inv, _, i) =>
      addNote(
        inv,
        { kind: KINDS[i % 3]!, body: `Note ${i}`, date: null, sectionIdx: null, ...over(i) },
        new Date(Date.UTC(2025, 0, 1, 0, 0, i)),
        `n${i}`,
      ),
    newInvestigation({ name: 'Test', aoi: SITE, dateFrom: '2018-01-01', dateTo: '2025-12-31' }),
  )
const notes = (inv: Investigation, over: Record<string, unknown> = {}) =>
  renderToString(
    createElement(NotesPanel, {
      inv,
      parts: [],
      current: '2025-12-20',
      update: () => true,
      error: null,
      ...over,
    }),
  )
const list = (html: string) => html.slice(html.indexOf('<ul'), html.indexOf('</ul>'))
const optionsOf = (html: string) => [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1])

describe('NotesPanel', () => {
  it('renders 200 notes quickly, with one tab stop per control and none in the list but its buttons', () => {
    const inv = withNotes(200, (i) => ({ date: i % 2 ? day(i) : null }))
    const t0 = performance.now()
    const html = notes(inv)
    expect(performance.now() - t0).toBeLessThan(100)
    const ul = list(html)
    expect(ul.match(/<li\b/g)).toHaveLength(200)
    expect(ul.match(/<button\b/g)).toHaveLength(400) // Edit and Delete on each note
    expect(ul).not.toMatch(/<(input|textarea|select|a)\b/)
    expect(html).not.toContain('tabindex') // nothing is a roving stop: every control is reached once, in page order
    expect(html.match(/type="radio"/g)).toHaveLength(3) // one group
    expect(html.match(/<(textarea|select)\b/g)).toHaveLength(2) // the text and the photo date; a site has no section
  })

  it('offers exactly two photo dates: the one on show and "no specific date"', () => {
    const inv = withNotes(0)
    expect(optionsOf(notes(inv))).toEqual(['20 Dec 2025', flow.notes.anyDate])
    expect(notes(inv)).toMatch(/<option[^>]*value="2025-12-20"[^>]*selected/)
    expect(optionsOf(notes(inv, { current: null }))).toEqual([flow.notes.anyDate])
    expect(optionsOf(notes(inv, { current: '2018-01-05' }))).toEqual(['5 Jan 2018', flow.notes.anyDate])
  })

  it('lets a road note pick its section, and shows the section on the note', () => {
    const parts = PARTS.slice(0, 3)
    const inv = withNotes(3, (i) => ({ sectionIdx: i === 1 ? 1 : i === 2 ? 9 : null })) // 9: no such section
    const html = notes(inv, { parts })
    expect(optionsOf(html)).toEqual([
      '20 Dec 2025',
      flow.notes.anyDate,
      flow.notes.anySection,
      '0.0–2.0 km',
      '2.0–4.0 km',
      '4.0–6.0 km',
    ])
    const rows = list(html).match(/<li\b.*?<\/li>/g)!
    expect(rows[1]).toContain('2.0–4.0 km')
    expect(rows[0]).not.toContain('km')
    expect(rows[2]).not.toContain('km') // a section that is not there is left out, never mislabelled
    expect(notes(inv, { parts: PARTS.slice(0, 1) }).match(/<select\b/g)).toHaveLength(1) // a site has one part: nothing to pick
  })

  it('shows what was written as text', () => {
    const html = notes(withNotes(1, () => ({ body: '<img src=x onerror=alert(1)> New roof' })))
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; New roof')
    expect(html).not.toContain('<img')
  })

  it('is memoised with ClaimPanel, so a runner update that changes none of their props renders neither', () => {
    for (const c of [NotesPanel, ClaimPanel])
      expect((c as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('shows a refusal only beside the control that was refused: a code left over from elsewhere shows nothing', () => {
    // A fresh panel has refused nothing, so an error code it was handed (an old one, another panel's) is not printed here.
    expect(notes(withNotes(1), { error: 'NOTE_EMPTY' })).not.toContain('role="alert"')
  })
})

describe('ClaimPanel', () => {
  const claim = (inv: Investigation, error: string | null = null) =>
    renderToString(createElement(ClaimPanel, { inv, update: () => true, error }))

  it('says why Save was refused, in the panel', () => {
    expect(claim(withNotes(0))).not.toContain('role="alert"')
    const html = claim(withNotes(0), 'CLAIM_TOO_LONG')
    expect(html).toMatch(new RegExp(`<p role="alert"[^>]*>${flow.workbench.errors.CLAIM_TOO_LONG}</p>`))
  })

  it('starts from the saved claim, and offers Remove and Save only when they can do something', () => {
    const empty = claim(withNotes(0))
    expect(empty).not.toContain(flow.claim.remove)
    expect(empty).toMatch(new RegExp(`<button[^>]*\\sdisabled=""[^>]*>${flow.claim.save}`))
    const saved = claim(
      setClaim(withNotes(0), { text: 'Roof done by June', date: '2025-06-30', criterion: 'A bright roof' }),
    )
    expect(saved).toContain('>Roof done by June</textarea>')
    expect(saved).toContain('value="2025-06-30"')
    expect(saved).toContain('value="A bright roof"')
    expect(saved).toContain(flow.claim.remove)
    expect(saved).not.toContain('disabled=""')
  })
})
