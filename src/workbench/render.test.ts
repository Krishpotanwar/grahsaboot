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
import { barcodeHeight } from './barcode.ts'
import { Tick } from './Barcode.tsx'
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
    candidate: {
      date,
      item: { id: `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A` } as never,
      alternates: [],
      coversAoi: true,
    },
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
  it('renders ~1,100 passes quickly, with one slider and no extra tab stops in the barcode', () => {
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
    expect(html.match(/data-date=/g)).toHaveLength(1100) // a tick for every pass
    expect(html.match(/<input/g)).toHaveLength(1) // the slider is the barcode's only control
    expect(html).not.toContain('tabindex') // the ticks are decoration, never a tab stop
  })

  it('reads out the date and how clearly it sees the outline, and says the same in its sentence', () => {
    const html = timeline([entry('2025-01-10', 'CLEAR'), entry('2025-03-05', 'PARTIAL')], {
      current: '2025-03-05',
    })
    expect(html).toContain('aria-valuetext="5 Mar 2025, Partly clear"')
    expect(html).toContain(copy.quality.PARTIAL.help)
  })

  it('says Loading only while a check is on its way, and the failure when it failed', () => {
    const waiting = timeline([entry('2025-01-10', null, { status: 'checking' })])
    expect(waiting).toContain(`aria-valuetext="10 Jan 2025, ${copy.common.loading}"`)
    expect(waiting).toContain(`>${copy.common.loading}<`) // on its row, too
    expect(waiting).not.toContain(flow.workbench.checkFailed)
    expect(waiting).not.toContain(flow.workbench.checkFailedShort)

    // The slider says the sentence; the row says the short word; the sentence is in the row's own message, with Try again.
    const failed = timeline([entry('2025-01-10', null, { status: 'error' })])
    expect(failed).toContain(`aria-valuetext="10 Jan 2025, ${flow.workbench.checkFailed}"`)
    expect(failed).toContain(`${flow.workbench.checkFailedShort}</span>`)
    expect(failed).toContain(`<p>${flow.workbench.checkFailed}</p>`)
    expect(failed).toContain(copy.common.retry)
    expect(failed).not.toContain(`>${copy.common.loading}<`)
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

  it('lists the sections of a road for the date on show, each with its glyph and word, short when a check failed', () => {
    const sections = PARTS.slice(0, 2)
    const listed = (e: DateEntry) => {
      const html = timeline([e], { sections })
      return html.match(/<ul aria-label="Sections".*?<\/ul>/)?.[0].match(/<li\b.*?<\/li>/g) ?? []
    }
    const checked = listed(entry('2025-01-10', 'CLEAR', { parts: 2 }))
    expect(checked).toHaveLength(2)
    expect(checked[0]).toContain(flow.workbench.section(0, 2000))
    expect(checked[1]).toContain(flow.workbench.section(2000, 4000))
    for (const row of checked) expect(row).toContain(`>${copy.quality.CLEAR.word}<`)
    expect(timeline([entry('2025-01-10', 'CLEAR')])).not.toContain(
      `aria-label="${flow.workbench.sectionsLabel}"`,
    ) // a site
    // not checked yet, or failed: each row says so instead of showing a glyph
    for (const row of listed(entry('2025-01-10', null, { status: 'checking' }))) {
      expect(row).toContain(`>${copy.common.loading}<`)
      expect(row).not.toContain('<svg')
    }
    for (const row of listed(entry('2025-01-10', null, { status: 'error' })))
      expect(row).toContain(`>${flow.workbench.checkFailedShort}<`)
  })

  it('keeps a pin error next to the pin buttons', () => {
    const html = timeline([entry('2025-01-10', 'CLEAR')], { error: 'TOO_MANY_PINS' })
    expect(html).toMatch(/role="alert"[^>]*>You can pin up to 24 dates\./)
  })

  it('names itself in a flat section, with the passes and the pinned dates counted in mono', () => {
    const html = timeline([entry('2025-01-10', 'CLEAR'), entry('2025-03-05', 'PARTIAL')], {
      pinned: ['2025-01-10'],
    })
    expect(html).toContain(`<section aria-label="${flow.workbench.photoTimeline}"`)
    expect(html).toMatch(new RegExp(`<h2[^>]*>${flow.workbench.photoTimeline}</h2>`))
    expect(html).toContain('>2 passes · 1 pinned<')
    expect(timeline([entry('2025-01-10', 'CLEAR')])).toContain('>1 pass · 0 pinned<')
  })

  // The notes below the timeline must not move when a check lands: its sentence and Details hold their places, and its row has
  // a picture's place whatever the picture turns out to be.
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
    // Failed, or seen to be obscured: the same box, with stripes and the glyph, and nothing pulsing for what will not come.
    for (const e of [entry('2025-01-10', null, { status: 'error' }), entry('2025-01-10', 'OBSCURED')]) {
      const html = timeline([e], { thumbGrid })
      expect(pulses(html)).toBe(0)
      expect(html).toContain('repeating-linear-gradient')
    }
    // A preview that failed is the stripes too, and the row says so in words.
    const lost = { ...entry('2025-01-10', 'CLEAR'), thumbFailed: true }
    expect(pulses(timeline([lost], { thumbGrid }))).toBe(0)
    expect(timeline([lost], { thumbGrid })).toContain(flow.workbench.thumbFailed)
  })

  it('draws the preview of a row in a 52 px box, cropped to fill it, and hides it from a screen reader', () => {
    const thumbGrid = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
    const rgba = new Uint8ClampedArray(4)
    const e = { ...entry('2025-01-10', 'CLEAR'), thumb: { display: { rgba } } as never }
    const html = timeline([e], { thumbGrid })
    expect(html).toMatch(
      /<span aria-hidden="true" class="block h-\[52px\] w-\[52px\]"><canvas[^>]*object-cover/,
    )
  })

  it('has a placeholder that is only decoration, with a place for each year or the strip, each row and each section', () => {
    const site = renderToString(
      createElement(TimelineSkeleton, {
        from: '2018-01-01',
        to: '2025-12-31',
        road: false,
        sections: 0,
        rows: 2,
      }),
    )
    const road = renderToString(
      createElement(TimelineSkeleton, {
        from: '2018-01-01',
        to: '2025-12-31',
        road: true,
        sections: 3,
        rows: 2,
      }),
    )
    expect(site).toContain(`<section aria-label="${flow.workbench.photoTimeline}"`) // the title is there from the start
    expect(site).not.toMatch(/<(input|button|a|svg)\b/) // nothing to focus, nothing to read
    expect(site).toContain(`height:${barcodeHeight(false, 8)}px`) // 2018 to 2025: eight rows
    expect(road).toContain(`height:${barcodeHeight(true, 8)}px`) // one strip and its years
    expect(road).toContain('height:68px') // three sections of 20 px and their gaps
    expect(site).not.toContain('height:68px')
    expect(site.match(/height:70px/g)).toHaveLength(2) // two rows
    expect(renderToString(createElement(GridSkeleton, { rows: 4 })).match(/animate-pulse/g)).toHaveLength(8)
  })
})

describe('the pinned dates and the date on show', () => {
  const dates = ['2025-01-10', '2025-03-05', '2025-06-15', '2025-12-20']
  const four = () => [
    entry(dates[0]!, 'CLEAR'),
    entry(dates[1]!, 'PARTIAL'),
    entry(dates[2]!, 'OBSCURED'),
    entry(dates[3]!, 'CLEAR'),
  ]
  /** The rows of the list, each as its date. */
  const listed = (html: string) =>
    [...html.matchAll(/<button[^>]*type="button"[^>]*class="grid w-full[^>]*>.*?<\/button>/g)].map(
      (m) => m[0],
    )

  it('has a row for each pinned date and the one on show, once each, oldest first', () => {
    const html = timeline(four(), { pinned: [dates[3]!, dates[0]!], current: dates[1]! })
    const rows = listed(html)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('10 Jan 2025')
    expect(rows[1]).toContain('5 Mar 2025') // the date on show, not pinned
    expect(rows[2]).toContain('20 Dec 2025')
    // already pinned: no row of its own
    expect(listed(timeline(four(), { pinned: [dates[3]!, dates[0]!], current: dates[3]! }))).toHaveLength(2)
  })

  it('marks the date on show as the current one, and only its row holds the buttons', () => {
    const html = timeline(four(), {
      pinned: [dates[0]!, dates[3]!],
      before: dates[0]!,
      after: dates[3]!,
      current: dates[3]!,
    })
    expect(html.match(/aria-current="date"/g)).toHaveLength(1)
    expect(html).toMatch(/<button[^>]*aria-current="date"[^>]*>.*?20 Dec 2025/)
    for (const label of [flow.workbench.useBefore, flow.workbench.useAfter, flow.workbench.unpin])
      expect(html.match(new RegExp(`>${label}</button>`, 'g')), label).toHaveLength(1)
    // The pin button says what it does and is not also a toggle.
    expect(html).not.toContain('aria-pressed')
  })

  it('tags before, after and a pinned date, and a date that is only on show has no tag', () => {
    const html = timeline(four(), {
      pinned: [dates[0]!, dates[1]!, dates[3]!],
      before: dates[0]!,
      after: dates[3]!,
      current: dates[2]!,
    })
    const rows = listed(html)
    expect(rows).toHaveLength(4)
    const tag = (row: string) => row.match(/text-accent">([^<]*)<\/span>/)?.[1] ?? ''
    expect(tag(rows[0]!)).toBe(flow.workbench.before)
    expect(tag(rows[1]!)).toBe(flow.workbench.pinned)
    expect(tag(rows[2]!)).toBe('') // 15 Jun: on show only
    expect(tag(rows[3]!)).toBe(flow.workbench.after)
  })

  it('says the satellite, the resolution and the clear view under the date, once checked', () => {
    const rows = listed(timeline(four(), { pinned: [dates[0]!], current: dates[1]! }))
    expect(rows[0]).toContain('Sentinel-2B · 10 m · 100% clear view')
    expect(rows[1]).toContain('Sentinel-2B · 10 m · 60% clear view')
    const unchecked = listed(timeline([entry(dates[0]!, null, { status: 'queued' })]))
    expect(unchecked[0]).toContain('>Sentinel-2B · 10 m<')
    expect(unchecked[0]).not.toContain('clear view')
  })

  it('holds a row for each pinned date still being found, and only while more passes are on their way', () => {
    const some = four().slice(0, 2)
    const pinned = [dates[0]!, dates[2]!, dates[3]!] // two of them are not in the list yet
    const heldRows = (html: string) => html.match(/<li aria-hidden="true"/g)?.length ?? 0
    expect(heldRows(timeline(some, { pinned, more: true }))).toBe(2)
    expect(heldRows(timeline(some, { pinned, more: false }))).toBe(0)
    expect(heldRows(timeline(four(), { pinned, more: true }))).toBe(0)
  })
})

describe('the barcode', () => {
  const at = (html: string, date: string) =>
    new RegExp(`data-date="${date}" class="([^"]*)" style="left:([\\d.]+)%;height:(\\d+)px"`).exec(html)!

  it('is one row per year for a site: the year in a 34 px column, each tick at its day of the year', () => {
    const e = [entry('2024-07-01', 'CLEAR'), entry('2025-01-10', 'CLEAR'), entry('2025-12-31', 'CLEAR')]
    const html = timeline(e, { from: '2024-01-01', to: '2025-12-31', current: '2025-01-10' })
    expect(html.match(/h-\[17px\] border-b border-line/g)).toHaveLength(2) // 2024 and 2025
    expect(html).toContain('w-[34px]')
    expect(html).toContain('>2024<')
    expect(html).toContain('>2025<')
    expect(Number(at(html, '2024-07-01')[2])).toBeCloseTo((182 / 366) * 100, 1) // a leap year of 366 days
    expect(Number(at(html, '2025-12-31')[2])).toBeCloseTo((364 / 365) * 100, 1)
  })

  it('is memoised per pass, so one finished check renders one tick', () => {
    expect((Tick as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('keeps a pinned tick above the passes drawn after it, and the marks have colours of their own in forced-colors mode', () => {
    const e = [entry('2025-01-10', 'CLEAR'), entry('2025-01-11', 'CLEAR')]
    const html = timeline(e, { from: '2025-01-01', to: '2025-12-31', pinned: ['2025-01-10'] })
    expect(at(html, '2025-01-10')[1]).toContain('z-[1]')
    expect(at(html, '2025-01-11')[1]).not.toContain('z-[1]')
    expect(at(html, '2025-01-11')[1]).toContain('forced-colors:bg-[CanvasText]')
    expect(at(html, '2025-01-10')[1]).toContain('forced-colors:bg-[Highlight]')
  })

  it('holds two lines for its legend on a phone, where the fifth word wraps', () => {
    expect(timeline([entry('2025-01-10', 'CLEAR')])).toContain('max-[420px]:min-h-9')
    const sk = renderToString(
      createElement(TimelineSkeleton, {
        from: '2025-01-01',
        to: '2025-12-31',
        road: false,
        sections: 0,
        rows: 1,
      }),
    )
    expect(sk).toContain('max-[420px]:h-9')
    expect(sk).toContain('max-[389px]:h-[72px]') // the three buttons wrap below 390 px
  })

  it('is one strip for a road, with the years under it', () => {
    const e = [entry('2018-02-22', 'CLEAR', { parts: 2 }), entry('2025-12-12', 'CLEAR', { parts: 2 })]
    const html = timeline(e, { from: '2018-01-01', to: '2025-12-31', sections: PARTS.slice(0, 2) })
    expect(html.match(/h-\[17px\] border-b border-line/g)).toHaveLength(1)
    expect(html).not.toContain('w-[34px]')
    for (let y = 2018; y <= 2025; y++) expect(html).toContain(`>${y}</span>`)
  })

  it('draws a clear pass 16 px tall, partly clear 8, obscured or not covered 3, not checked yet 2, a failed check 3', () => {
    const e = [
      entry('2025-01-10', 'CLEAR'),
      entry('2025-02-10', 'PARTIAL'),
      entry('2025-03-10', 'OBSCURED'),
      entry('2025-04-10', 'NOT_COVERED'),
      entry('2025-05-10', null, { status: 'queued' }),
      entry('2025-06-10', null, { status: 'error' }),
    ]
    const html = timeline(e, { from: '2025-01-01', to: '2025-12-31' })
    expect(e.map((x) => Number(at(html, x.date)[3]))).toEqual([16, 8, 3, 3, 2, 3])
    // fainter as they see less: the weight carries it for those who see the page in one colour
    expect(at(html, '2025-01-10')[1]).toContain('opacity-85')
    expect(at(html, '2025-03-10')[1]).toContain('opacity-45')
    expect(at(html, '2025-05-10')[1]).toContain('opacity-25')
  })

  it('draws before, after and pinned dates in the accent, 3 px wide, and the date on show with a caret under it', () => {
    const e = [entry('2025-01-10', 'CLEAR'), entry('2025-03-05', 'PARTIAL'), entry('2025-06-15', 'OBSCURED')]
    const html = timeline(e, {
      from: '2025-01-01',
      to: '2025-12-31',
      before: '2025-01-10',
      pinned: ['2025-01-10', '2025-03-05'],
      current: '2025-06-15',
    })
    expect(at(html, '2025-01-10')[1]).toContain('bg-accent')
    expect(at(html, '2025-01-10')[1]).toContain('w-[3px]')
    expect(at(html, '2025-03-05')[1]).toContain('bg-accent') // pinned
    expect(at(html, '2025-06-15')[1]).not.toContain('bg-accent')
    // one caret, under the tick of the date on show
    const carets = [...html.matchAll(/class="absolute top-full[^"]*" style="left:([\d.]+)%"/g)]
    expect(carets).toHaveLength(1)
    expect(carets[0]![1]).toBe(at(html, '2025-06-15')[2])
  })

  it('leaves the barcode and its legend out of the reading order, and keeps the slider in it', () => {
    const html = timeline([entry('2025-01-10', 'CLEAR')])
    const input = html.indexOf('<input')
    expect(html.slice(input, html.indexOf('>', input))).not.toContain('aria-hidden')
    expect(html).toMatch(/<div aria-hidden="true" class="select-none/) // the ticks
    expect(html).toMatch(/<p aria-hidden="true"[^>]*>.*Pinned/) // the legend
    expect(html).toContain('peer-focus-visible:outline') // a ring around it while the slider has the focus
    expect(html).toContain('touch-pan-y') // a vertical swipe still scrolls the page
  })

  it('names the faintest tick in its legend only while a pass is not checked yet', () => {
    const word = flow.workbench.notCheckedYet
    const base = [entry('2025-01-10', 'CLEAR')]
    const legend = (e: DateEntry[]) => timeline(e).match(/<p aria-hidden="true"[^>]*>.*?<\/p>/)![0]
    for (const w of [
      copy.quality.CLEAR.word,
      copy.quality.PARTIAL.word,
      copy.quality.OBSCURED.word,
      flow.workbench.pinned,
    ])
      expect(legend(base)).toContain(w)
    expect(legend(base)).not.toContain(word)
    expect(legend([...base, entry('2025-02-10', null, { status: 'checking' })])).toContain(word)
    expect(legend([...base, entry('2025-02-10', null, { status: 'queued' })])).toContain(word)
    expect(legend([...base, entry('2025-02-10', null, { status: 'error' })])).not.toContain(word)
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

  it('gives each cell the glyph and its word on one line, and reads them out with the section and date', () => {
    const html = grid(
      [entry('2025-01-10', 'CLEAR', { parts: 2 }), entry('2025-03-05', 'PARTIAL', { parts: 2 })],
      { parts: PARTS.slice(0, 2) },
    )
    expect(html).toContain(`aria-label="${flow.workbench.cell('2.0–4.0 km', '5 Mar 2025', 'Partly clear')}"`)
    expect(html).toContain('>Partly clear<')
    expect(html).toContain('>Clear<')
    // mono 11 px capitals with a letter-space, on one line, 5 rem at least
    expect(html).toContain('font-mono text-[11px] uppercase tracking-[0.08em]')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('min-w-20')
  })

  it('lays the table out as in the mockup: two-line date headers, numbered row headers, a border on every cell', () => {
    const html = grid(
      [entry('2025-01-10', 'CLEAR', { parts: 2 }), entry('2025-03-05', 'PARTIAL', { parts: 2 })],
      { parts: PARTS.slice(0, 2) },
    )
    // "10 Jan" over "2025": a block of its own, never written sideways
    expect(html).toMatch(/10 Jan(<!-- -->)? (<!-- -->)?<span class="block[^>]*>2025<\/span>/)
    expect(html).not.toContain('vertical-rl')
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>01 · 0\.0–2\.0 km<\/th>/)
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>02 · 2\.0–4\.0 km<\/th>/)
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*>Section<\/th>/)
    expect(html.match(/<td class="border-b border-r border-line p-0">/g)).toHaveLength(4)
    expect(html).toContain('sticky left-0') // the section names stay while the dates scroll
    expect(html).toContain(`>${flow.workbench.gridHelp}<`) // under its title, in a flat section
  })

  it('outlines the date on show in the row that has the focus, and says what it is about below the table', () => {
    const e = [entry('2025-01-10', 'CLEAR', { parts: 2 }), entry('2025-03-05', 'PARTIAL', { parts: 2 })]
    const html = grid(e, { parts: PARTS.slice(0, 2), current: '2025-03-05' })
    expect(html.match(/shadow-\[inset_0_0_0_1px_var\(--gs-accent\)\]/g)).toHaveLength(1) // row 01 x 5 Mar
    expect(html).toMatch(/<h3[^>]*>Section 01 · 0\.0–2\.0 km<\/h3>/)
    expect(html).toContain('>5 Mar 2025 · Partly clear view<')
    expect(html).toContain(flow.workbench.gapNote.replaceAll('"', '&quot;'))
    // a date on show that is not a column is still what the detail is about
    const off = grid(e, {
      parts: PARTS.slice(0, 2),
      current: '2025-06-15',
      shown: entry('2025-06-15', 'OBSCURED', { parts: 2 }),
    })
    expect(off).toContain('>15 Jun 2025 · Obscured view<')
    expect(off).not.toContain('shadow-[inset')
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
    // The short word: the sentence is in the row of the date on show.
    expect(html).toContain(
      `aria-label="${flow.workbench.cell('0.0–2.0 km', '15 Jun 2025', flow.workbench.checkFailedShort)}"`,
    )
    expect(html).not.toContain(flow.workbench.checkFailed)
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
    // The e2e tests find the chips and the handle by these, not by their styling.
    expect(html.match(/data-chip=""/g)).toHaveLength(2)
    expect(html.match(/data-handle=""/g)).toHaveLength(1)
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

  describe("the server's check of a photo, in its caption", () => {
    const record = (over: Partial<NonNullable<NonNullable<Slot>['verification']>> = {}) => ({
      status: 'verified' as const,
      verifiedAt: '2026-10-05T10:00:00+00:00',
      frameId: 'f',
      serverSha256: 'a'.repeat(64),
      clientSha256: 'a'.repeat(64),
      itemId: 'S2B_44QKJ_20250110_0_L2A',
      ...over,
    })
    const second = (html: string) => html.slice(html.indexOf('20 Dec 2025 · Sentinel-2B'))

    it('says "Verified" with the date of the check, in place of "Not saved", for the photo it is for', () => {
      const html = viewer({ before: slot('2025-01-10', { verification: record() }) })
      const before = html.slice(0, html.indexOf('20 Dec 2025 · Sentinel-2B'))
      expect(before).toContain(flow.workbench.verifiedBadge('5 Oct 2026'))
      expect(before).not.toContain(flow.workbench.notSaved)
      expect(before).toContain('text-ok')
      // the other photo has no record: it still says what it said
      expect(second(html)).toContain(flow.workbench.notSaved)
      expect(second(html)).not.toContain('Verified ·')
    })

    it('says "Did not match the source" in words and with a mark, not by colour alone', () => {
      const html = viewer({ after: slot('2025-12-20', { verification: record({ status: 'mismatch' }) }) })
      const after = second(html)
      expect(after).toContain(flow.workbench.mismatchBadge)
      expect(after).toContain('text-warn')
      expect(after).not.toContain(flow.workbench.notSaved)
      // the mark: a hidden icon next to the words
      expect(after).toMatch(
        new RegExp(`<svg[^>]*aria-hidden="true"[^>]*>[\\s\\S]*?</svg>[^<]*${flow.workbench.mismatchBadge}`),
      )
    })

    it('shows nothing of it for a photo with no record, or with an explicit null', () => {
      for (const verification of [undefined, null]) {
        const html = viewer({ before: slot('2025-01-10', { verification }) })
        expect(html).not.toContain('Verified ·')
        expect(html).not.toContain(flow.workbench.mismatchBadge)
        expect(html.match(new RegExp(flow.workbench.notSaved, 'g'))).toHaveLength(2)
      }
    })
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

  it('has the map tool in the row only where there is a map, and says what pressing does in its label alone', () => {
    expect(viewer()).not.toContain(flow.workbench.showMap)
    const shut = viewer({ onToggleMap: noop })
    expect(shut).toMatch(new RegExp(`<button[^>]*>.*${flow.workbench.showMap}</button>`))
    const open = viewer({ onToggleMap: noop, mapOpen: true })
    expect(open).toMatch(new RegExp(`<button[^>]*>.*${flow.workbench.hideMap}</button>`))
    // The label changes, so a pressed state would be said twice.
    expect(shut).not.toContain('aria-pressed')
    expect(open).not.toContain('aria-pressed')
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
