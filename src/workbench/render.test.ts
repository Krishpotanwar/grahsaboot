// Timeline, SectionGrid, NotesPanel, ClaimPanel and EvidenceViewer rendered to a string (no DOM): the states they show, and the sizes real data brings.
// The featured worked example yields ~1,100 passes; a pinned-date grid holds at most 24 columns (26 here, for margin); notes go up to 200.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { addNote, newInvestigation, setClaim, type Investigation, type Note } from '../data/investigation.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { QualityLabel, QualityStats } from '../evidence/types.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import type { QualityResult } from '../workers/imagery-core.ts'
import { ClaimPanel } from './ClaimPanel.tsx'
import { EvidenceViewer, type Slot } from './EvidenceViewer.tsx'
import { NotesPanel } from './NotesPanel.tsx'
import type { DateEntry, EntryStatus } from './runner.ts'
import { GridSkeleton, SectionGrid } from './SectionGrid.tsx'
import { Timeline, TimelineSkeleton } from './Timeline.tsx'

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

  // The notes below the timeline must not move when a check lands: its sentence, Details and preview hold their places.
  it('holds the places of the sentence, Details and the preview while the date on show is being checked', () => {
    const thumbGrid = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
    const pulses = (html: string) => html.match(/animate-pulse/g)?.length ?? 0
    const waiting = timeline([entry('2025-01-10', null, { status: 'checking' })], { thumbGrid })
    expect(pulses(waiting)).toBe(3)
    expect(waiting).not.toContain('<details')
    // Checked and usable: the result is in, only the preview is still to come.
    const checked = timeline([entry('2025-01-10', 'CLEAR')], { thumbGrid })
    expect(pulses(checked)).toBe(1)
    expect(checked).toContain('<details')
    // Failed, or seen to be obscured: nothing is held for what will not come.
    expect(pulses(timeline([entry('2025-01-10', null, { status: 'error' })], { thumbGrid }))).toBe(0)
    expect(pulses(timeline([entry('2025-01-10', 'OBSCURED')], { thumbGrid }))).toBe(0)
  })

  it('has a placeholder that is only decoration, with a place for each section of a road', () => {
    const thumbGrid = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
    const site = renderToString(createElement(TimelineSkeleton, { thumbGrid, sections: 0 }))
    const road = renderToString(createElement(TimelineSkeleton, { thumbGrid, sections: 3 }))
    expect(site).toMatch(/^<div aria-hidden="true"/)
    expect(site).not.toMatch(/<(input|button|a|svg)\b/) // nothing to focus, nothing to read
    expect(road.length).toBeGreaterThan(site.length)
    expect(renderToString(createElement(GridSkeleton, { rows: 4 })).match(/animate-pulse/g)).toHaveLength(5)
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
    // A wall-clock bound only catches an accidental O(n^2); it sits well above the ~30 ms this takes alone, because the
    // database tests run beside it in `npm run check` (the real-browser budget is the notes e2e).
    expect(performance.now() - t0).toBeLessThan(500)
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

/** What React prints for text: the quotes of a sentence are entities. */
const esc = (text: string) => text.replaceAll('"', '&quot;')

describe('EvidenceViewer', () => {
  const grid = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 512)
  const slot = (date: string, over: Partial<NonNullable<Slot>> = {}): Slot => ({
    date,
    frame: { display: { rgba: new Uint8ClampedArray(4) } } as never,
    stats: stats('CLEAR'),
    itemId: `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`,
    failed: false,
    ...over,
  })
  const viewer = (over: Record<string, unknown> = {}, narrow = false) => {
    vi.stubGlobal('matchMedia', () => ({ matches: narrow }))
    try {
      return renderToString(
        createElement(EvidenceViewer, {
          before: slot('2025-01-10'),
          after: slot('2025-12-20'),
          grid,
          invalid: null,
          aoi: SITE,
          searching: false,
          mapOpen: false,
          onRetry: noop,
          ...over,
        }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it('is memoised: a slider step on the timeline renders it not at all', () => {
    expect((EvidenceViewer as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('lays the three views out as tabs of real radios in one group, the legend for screen readers', () => {
    const html = viewer()
    expect(html.match(/<input[^>]*type="radio"[^>]*name="view"/g)).toHaveLength(3)
    expect(html).toContain(`<legend class="sr-only">${flow.workbench.view}</legend>`)
    expect(html.match(/h-\[54px\]/g)).toHaveLength(3)
    expect(html).toMatch(/<input[^>]*name="view"[^>]*checked=""[^>]*value="swipe"/) // Swipe is the view of a wide screen
  })

  it('draws a date chip at each corner of the swipe, a scale bar and a north arrow, none of it reachable', () => {
    const html = viewer()
    expect(html).toContain(flow.workbench.chip(flow.workbench.before, '10 Jan 2025'))
    expect(html).toContain(flow.workbench.chip(flow.workbench.after, '20 Dec 2025'))
    expect(html).toContain('>200 m<') // a 1 km square with its margins is 1.2 km wide
    expect(html).toContain(`>${flow.workbench.north}<`)
    expect(html).toMatch(
      /aria-hidden="true" class="pointer-events-none absolute inset-0 \[container-type:inline-size\]"/,
    )
  })

  it('captions each photo in three lines: date and satellite, clear view and "Not saved", the item id', () => {
    const html = viewer()
    expect(html).toContain('10 Jan 2025 · Sentinel-2B · 10 m')
    expect(html).toContain(flow.workbench.clearView(100))
    expect(html).toContain(flow.workbench.notSaved)
    expect(html).toContain('title="S2B_44QKJ_20250110_0_L2A"')
    expect(html).toContain(copy.quality.CLEAR.word)
    // in that order: the first photo's lines, each searched for after the one before it
    const date = html.indexOf('10 Jan 2025 · Sentinel-2B')
    const clear = html.indexOf(flow.workbench.clearView(100), date)
    const id = html.indexOf('title="S2B_44QKJ_20250110_0_L2A"', clear)
    expect(date).toBeGreaterThan(-1)
    expect(clear).toBeGreaterThan(date)
    expect(id).toBeGreaterThan(clear)
  })

  it("numbers a road's sections along its line, on the outline only", () => {
    const road: AoiInput = {
      kind: 'road',
      geometry: {
        type: 'LineString',
        coordinates: [
          [79.07698, 21.138637],
          [79.095988, 21.157819],
        ],
      },
      widthM: 30,
    }
    const parts = [
      { idx: 0, fromM: 0, toM: 2000 },
      { idx: 1, fromM: 2000, toM: 2900 },
    ]
    const numbered = (html: string) => [...html.matchAll(/>(0[1-9])<\/span>/g)].map((m) => m[1])
    // Two photos in the swipe, each with its outline.
    expect(numbered(viewer({ aoi: road, sections: parts }))).toEqual(['01', '02', '01', '02'])
    expect(numbered(viewer({ aoi: road, sections: parts.slice(0, 1) }))).toEqual([]) // one section: nothing to tell apart
    expect(numbered(viewer())).toEqual([]) // a site
  })

  it('says what the photos wait for, holds their place, and leaves the controls that need photos off', () => {
    const none = { before: null, after: null }
    const searching = viewer({ ...none, searching: true })
    expect(searching).toContain(flow.workbench.searching)
    expect(searching).not.toContain(esc(flow.workbench.pickPair))
    expect(searching).not.toContain('type="range"') // nothing to swipe
    expect(searching).toMatch(/<fieldset[^>]*disabled/)
    expect(searching).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/) // the outline has no photo to be drawn on
    expect(searching).toContain('>200 m<') // scale bar and north arrow need no photo
    const waiting = viewer(none)
    expect(waiting).toContain(esc(flow.workbench.pickPair))
    expect(waiting).not.toContain(flow.workbench.searching)
    // On a phone the two photos are one above the other: the place held is two photos tall.
    const photos = (html: string) => html.match(/aspect-ratio:\s*\d+ \/ \d+/g)?.length ?? 0
    expect(photos(viewer(none, true))).toBe(2)
    expect(photos(viewer(none))).toBe(1)
  })

  it('has the map tool in the row only where there is a map, and reads its state from its label', () => {
    expect(viewer()).not.toContain(flow.workbench.showMap)
    expect(viewer({ onToggleMap: noop })).toMatch(
      new RegExp(`<button[^>]*aria-pressed="false"[^>]*>.*${flow.workbench.showMap}</button>`),
    )
    expect(viewer({ onToggleMap: noop, mapOpen: true })).toMatch(
      new RegExp(`<button[^>]*aria-pressed="true"[^>]*>.*${flow.workbench.hideMap}</button>`),
    )
  })
})

describe('the side sections', () => {
  it('give Notes and Claim their regions, with the title as a heading and a rule under them', () => {
    const inv = withNotes(0)
    const notesHtml = notes(inv)
    expect(notesHtml).toContain(`<section aria-label="${flow.notes.title}"`)
    expect(notesHtml).toMatch(new RegExp(`<h2[^>]*>${flow.notes.title}</h2>`))
    expect(notesHtml).not.toContain('[ ') // no bracketed micro label
    const claimHtml = renderToString(createElement(ClaimPanel, { inv, update: () => true, error: null }))
    expect(claimHtml).toContain(`<section aria-label="${flow.claim.title}"`)
    expect(claimHtml).toMatch(new RegExp(`<h2[^>]*>${flow.claim.title.replace(/[()]/g, '\\$&')}</h2>`))
  })

  it('make the reading kinds three chips in one group, with the date and Add note in one footer row', () => {
    const html = notes(withNotes(0))
    expect(html).toContain(`<legend class="sr-only">${flow.notes.kindLegend}</legend>`)
    expect(html.match(/<input[^>]*type="radio"[^>]*name="note-kind"/g)).toHaveLength(3)
    // the dot is decoration: a screen reader says "Your note" and not "middle dot"
    expect(html).toContain(`${flow.notes.yourNote}<span aria-hidden="true"> ·</span>`)
    expect(html.indexOf(flow.notes.forDate)).toBeLessThan(html.indexOf(flow.notes.add))
  })

  it('fold the claim up until there is one: closed and open, with its help line once', () => {
    const claim = (inv: Investigation) =>
      renderToString(createElement(ClaimPanel, { inv, update: () => true, error: null }))
    const closed = claim(withNotes(0))
    expect(closed).toMatch(/<details class="group">/)
    expect(closed).not.toMatch(/<details[^>]*\sopen/)
    expect(closed.split(esc(flow.claim.help))).toHaveLength(2) // the one line of help, not also a paragraph
    const saved = claim(setClaim(withNotes(0), { text: 'Roof done', date: null, criterion: '' }))
    expect(saved).toMatch(/<details[^>]*\sopen=""/)
  })
})
