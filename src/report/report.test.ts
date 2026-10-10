import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape.ts'
import { buildProvenance } from './provenance.ts'
import { buildReportHtml, type ReportImage } from './html.ts'
import { addNote, newInvestigation, setBeforeAfter, setClaim } from '../data/investigation.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { flow } from '../ui/copy-flow.ts'
import type { QualityResult } from '../workers/imagery-core.ts'
import { outlinePath } from '../workbench/overlay.ts'
import type { DateEntry } from '../workbench/runner.ts'

const T = new Date('2026-10-05T10:00:00Z')
let inv = newInvestigation(
  {
    name: 'Yard <b>x</b>',
    aoi: {
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
    },
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
  },
  T,
  '00000000-0000-4000-8000-000000000001',
)
inv = setBeforeAfter(inv, '2025-01-10', '2025-12-20', T)
inv = addNote(
  inv,
  { kind: 'change', body: '<script>alert(1)</script> roof', date: '2025-12-20', sectionIdx: null },
  T,
  'n1',
)
inv = setClaim(inv, { text: 'Done "by" Dec & <ok>', date: '2025-12-01', criterion: 'Roof' }, T)
const summary = {
  kind: 'site',
  areaKm2: 1.15,
  extentKm: 1.52,
  lengthKm: null,
  bbox: [79.08, 21.14, 79.09, 21.15],
  parts: [{ idx: 0, fromM: 0, toM: 0, geometry: { kind: 'site', rings: [] } }],
} as AoiSummary
const stats = (label: string, v: number) =>
  ({
    policy: 'scl-v2',
    counts: [],
    total: 10,
    clearFraction: v,
    validFraction: v,
    uncertainFraction: 0,
    obstructedFraction: 1 - v,
    nodataFraction: 0,
    label,
  }) as never
const entry = (date: string, label: string, v: number, parts: QualityResult['parts'] = []): DateEntry => ({
  date,
  status: 'checked',
  error: null,
  thumb: null,
  invalid: null,
  thumbFailed: false,
  candidate: {
    date,
    coversAoi: true,
    alternates: [],
    item: {
      id: `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`,
      collection: 'sentinel-2-l2a',
      datetime: `${date}T05:30:00Z`,
      date,
      epsg: 32644,
      cloudCover: 1,
      baseline: '05.11',
      nodataPct: 0,
      footprint: [],
      visual: {
        href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/TCI.tif',
        transform: [10, 0, 300000, 0, -10, 2341000],
        shape: [256, 256],
      },
      scl: {
        href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/SCL.tif',
        transform: [20, 0, 300000, 0, -20, 2341000],
        shape: [128, 128],
      },
    },
  },
  quality: { window: [45, 46, 103, 107], level: 0, sha256: 'a'.repeat(64), stats: stats(label, v), parts },
  full: {
    window: [92, 94, 203, 211],
    level: 0,
    sha256: 'b'.repeat(64),
    native: { width: 111, height: 117, rgb: new Uint8Array() },
    display: { width: 1, height: 1, rgba: new Uint8ClampedArray(4) },
  },
})
const entries = [entry('2025-01-10', 'CLEAR', 1), entry('2025-12-20', 'CLEAR', 0.98)]

// A road of two sections, checked on its two pinned dates.
const road = setBeforeAfter(
  newInvestigation(
    {
      name: 'Ring road',
      aoi: {
        kind: 'road',
        geometry: {
          type: 'LineString',
          coordinates: [
            [79.07698, 21.138637],
            [79.095988, 21.157819],
          ],
        },
        widthM: 30,
      },
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    },
    T,
    '00000000-0000-4000-8000-000000000002',
  ),
  '2025-01-10',
  '2025-12-20',
  T,
)
const roadSummary = {
  kind: 'road',
  areaKm2: 0,
  extentKm: 2.9,
  lengthKm: 2.9,
  bbox: [79.07698, 21.138637, 79.095988, 21.157819],
  parts: [
    { idx: 0, fromM: 0, toM: 2000, geometry: { kind: 'road', line: [], widthM: 30 } },
    { idx: 1, fromM: 2000, toM: 2900, geometry: { kind: 'road', line: [], widthM: 30 } },
  ],
} as AoiSummary
const part = (idx: number, fromM: number, toM: number, label: string, v: number) => ({
  idx,
  fromM,
  toM,
  stats: stats(label, v),
})
const roadRows = [
  entry('2025-01-10', 'CLEAR', 1, [part(0, 0, 2000, 'CLEAR', 1), part(1, 2000, 2900, 'OBSCURED', 0.1)]),
  entry('2025-12-20', 'CLEAR', 1, [part(0, 0, 2000, 'PARTIAL', 0.7), part(1, 2000, 2900, 'CLEAR', 1)]),
]

const build = (over: Partial<Parameters<typeof buildReportHtml>[0]> = {}) =>
  buildReportHtml({
    inv,
    summary,
    entries,
    images: [],
    provenance: buildProvenance(inv, summary, entries, '0.1.0', T),
    theme: 'dark',
    preparedBy: 'A <tester>',
    generatedAt: T,
    ...over,
  })
const buildRoad = (over: Partial<Parameters<typeof buildReportHtml>[0]> = {}) =>
  build({
    inv: road,
    summary: roadSummary,
    entries: roadRows,
    provenance: buildProvenance(road, roadSummary, roadRows, '0.1.0', T),
    theme: 'light',
    preparedBy: '',
    ...over,
  })
const numbers = (html: string) =>
  [...html.matchAll(/<span class="n" aria-hidden="true">(\d\d)<\/span>/g)].map((m) => m[1])
const headings = (html: string) => [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1])
const stripOf = (html: string) => html.slice(html.indexOf('<div class="strip">'), html.indexOf('<section'))
const tableOf = (html: string, cls: string) =>
  new RegExp(`<table class="${cls}">[\\s\\S]*?</table>`).exec(html)?.[0] ?? ''

describe('escapeHtml', () => {
  it('escapes the five HTML specials', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})

describe('buildProvenance', () => {
  it('records both frames per pinned date with recipes, windows, transforms and hashes', () => {
    const p = buildProvenance(inv, summary, entries, '0.1.0', T)
    expect(p.schema).toBe('grahsaboot.provenance/1')
    expect(p.frames).toHaveLength(4)
    expect(p.frames[0]).toMatchObject({
      date: '2025-01-10',
      asset: 'scl',
      level: 0,
      recipe: 'scl-v2',
      window: [45, 46, 103, 107],
      sha256: 'a'.repeat(64),
      crs: 'EPSG:32644',
      verification: null,
    })
    expect(p.frames[1]).toMatchObject({
      asset: 'visual',
      recipe: 'frame-v1',
      window: [92, 94, 203, 211],
      transform: [10, 0, 300000, 0, -10, 2341000],
    })
    expect(p.notes[0]!.body).toBe('<script>alert(1)</script> roof')
    expect(p.attribution).toContain('Contains modified Copernicus Sentinel data 2025')
  })

  it('lists the level-1 preview of a pinned date that has no full frame, and nothing for a date that is not pinned', () => {
    const preview = {
      ...entry('2025-03-05', 'PARTIAL', 0.6),
      full: null,
      thumb: {
        window: [46, 47, 102, 106],
        level: 1,
        sha256: 'c'.repeat(64),
        native: { width: 56, height: 59, rgb: new Uint8Array() },
        display: { width: 1, height: 1, rgba: new Uint8ClampedArray(4) },
      },
    } as DateEntry
    const pinned = { ...inv, pinned: [...inv.pinned, '2025-03-05'].sort() }
    const rows = [entries[0]!, preview, entry('2025-06-15', 'OBSCURED', 0.1), entries[1]!]
    const p = buildProvenance(pinned, summary, rows, '0.1.0', T)
    expect(p.frames.map((f) => `${f.date}:${f.asset}:${f.level}`)).toEqual([
      '2025-01-10:scl:0',
      '2025-01-10:visual:0',
      '2025-03-05:scl:0',
      '2025-03-05:visual:1',
      '2025-12-20:scl:0',
      '2025-12-20:visual:0',
    ])
    expect(p.frames[3]).toMatchObject({ sha256: 'c'.repeat(64), transform: [20, 0, 300000, 0, -20, 2341000] })
  })

  it('credits Sentinel data once, for the years of the pinned dates, oldest first', () => {
    const early = { ...inv, pinned: ['2018-02-22', '2025-12-20'] }
    const p = buildProvenance(early, summary, [entry('2018-02-22', 'CLEAR', 1), entries[1]!], '0.1.0', T)
    expect(p.attribution[0]).toBe('Contains modified Copernicus Sentinel data 2018, 2025')
  })
})

describe('buildReportHtml', () => {
  const html = build()
  it('escapes every piece of user text and never includes a raw script tag from notes', () => {
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; roof')
    expect(html).toContain('Yard &lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('Done &quot;by&quot; Dec &amp; &lt;ok&gt;')
    expect(html).toContain('A &lt;tester&gt;')
  })
  it('is self-contained, attributed and print-ready', () => {
    expect(html).not.toMatch(/<(img|link|script)[^>]+(src|href)="https?:/i)
    expect(html).toContain('Contains modified Copernicus Sentinel data 2025')
    expect(html).toContain('@media print')
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('<script type="application/json" id="provenance">')
  })
  it('keeps the provenance JSON inert inside the page', () => {
    expect(html).not.toMatch(/<\/script>[^<]*roof/)
    expect(html).toContain('\\u003cscript\\u003e')
  })

  it('escapes HTML in the name, notes, claim and Prepared by, and the data block parses back to the provenance', () => {
    const evil = '</script><img src=x onerror=alert(1)>'
    const bad = setClaim(
      addNote(
        { ...inv, name: evil, notes: [] },
        { kind: 'unsure', body: evil, date: null, sectionIdx: null },
        T,
        'n2',
      ),
      { text: evil, date: null, criterion: evil },
      T,
    )
    const provenance = buildProvenance(bad, summary, entries, '0.1.0', T)
    const out = build({ inv: bad, provenance, preparedBy: evil })
    expect(out).not.toContain('<img src=x')
    expect(out.match(/<script/g)).toHaveLength(1) // the data block, nothing else
    expect(out.match(/<\/script>/g)).toHaveLength(1)
    const block = /<script type="application\/json" id="provenance">([\s\S]*?)<\/script>/.exec(out)![1]!
    expect(JSON.parse(block)).toEqual(JSON.parse(JSON.stringify(provenance)))
    expect(JSON.parse(block).investigation.name).toBe(evil)
  })

  it('has the Server check column ("Not checked" for every row) and the SHA-256 (source pixels) column', () => {
    const table = tableOf(html, 'dates')
    const L = flow.report.labels
    expect([...table.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1])).toEqual([
      L.date,
      L.view,
      L.clear,
      L.serverCheck,
      L.source,
      L.sha256,
    ])
    expect(table.match(new RegExp(`<td>${flow.report.values.notChecked}</td>`, 'g'))).toHaveLength(2)
    expect(table).toContain('S2B_44QKJ_20250110_0_L2A')
    // The hash of the 10 m frame that is shown, not the quality window's.
    expect(table).toContain('b'.repeat(64))
    expect(table).not.toContain('a'.repeat(64))
  })

  it('takes the hash from the quality window when there is no full frame, and prints a dash when there is neither', () => {
    const quick = { ...entry('2025-01-10', 'CLEAR', 1), full: null }
    const none = { ...entry('2025-12-20', 'CLEAR', 1), full: null, quality: null, status: 'error' as const }
    const [first, second] = tableOf(build({ entries: [quick, none] }), 'dates')
      .split('<tr>')
      .slice(2)
    expect(first).toContain('a'.repeat(64))
    expect(second).toContain(`${flow.report.values.none}</td></tr>`)
  })

  it('prints dashes, never 0%, for a date with no check result, and says how many could not be checked', () => {
    const waiting = { ...entry('2025-12-20', 'CLEAR', 1), quality: null, status: 'queued' as const }
    const out = build({ entries: [entries[0]!, waiting] })
    const row = tableOf(out, 'dates').split('<tr>')[3]!
    expect(row).toContain('20 Dec 2025')
    expect(row).toContain(`<td>${flow.report.values.none}</td><td>${flow.report.values.none}</td>`)
    expect(row).not.toMatch(/(^|\D)0%/)
    expect(out).toContain(flow.report.unchecked(1))
    expect(out).toContain(flow.report.obscured(0, 2)) // a date without a result is not counted as obscured
    expect(html).not.toContain(flow.report.unchecked(1))
  })

  it('numbers the sections in the order of the spec; a road adds the sections x dates grid as 04', () => {
    const s = flow.report.sections
    expect(numbers(html)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08'])
    expect(headings(html)).toEqual([
      s.looked,
      s.evidence,
      s.timeline,
      s.notes,
      s.claim,
      s.gaps,
      s.provenance,
      s.attribution,
    ])
    const out = buildRoad()
    expect(numbers(out)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09'])
    expect(headings(out)[3]).toBe(s.grid)
    const grid = tableOf(out, 'sections')
    expect(grid).toContain('<th scope="row">0.0–2.0 km</th>')
    expect(grid).toContain('<th scope="row">2.0–2.9 km</th>')
    expect(grid).toContain('Partly clear') // 20 Dec, first section
    expect(grid).toContain('Obscured') // 10 Jan, second section
    expect(out).toContain('30 m wide')
  })

  it('shows the section of a note on a road, and none for a note on the whole road', () => {
    const withNotes = addNote(
      addNote(road, { kind: 'change', body: 'Patched here', date: null, sectionIdx: 1 }, T, 'a'),
      { kind: 'unsure', body: 'All along', date: null, sectionIdx: null },
      T,
      'b',
    )
    const out = buildRoad({ inv: withNotes })
    const [patched, along] = out
      .slice(
        out.indexOf(`<h2>${flow.report.sections.notes}</h2>`),
        out.indexOf(`<h2>${flow.report.sections.claim}</h2>`),
      )
      .split('<article')
      .slice(1)
    expect(patched).toContain('Patched here')
    expect(patched).toContain('2.0–2.9 km')
    expect(along).toContain('All along')
    expect(along).not.toContain('km')
  })

  it('shows area, dates, source and resolution in a strip, and Prepared by only when given', () => {
    const strip = stripOf(html)
    expect(strip).toContain('1.15 km²')
    expect(strip).toContain('10 Jan 2025 ↔ 20 Dec 2025')
    expect(strip).toContain('Sentinel-2 L2A')
    expect(strip).toContain('10 m')
    expect(strip).toContain('Prepared by: A &lt;tester&gt;')
    expect(build({ preparedBy: '  ' })).not.toContain(`${flow.report.preparedByLabel}:`)
    expect(stripOf(buildRoad())).toContain('2.90 km')
  })

  const img = (role: 'before' | 'after', date: string, withStats = true): ReportImage => ({
    date,
    role,
    displayUrl: 'data:image/png;base64,AAAA',
    nativeUrl: 'data:image/png;base64,BBBB',
    stats: withStats ? entries[0]!.quality!.stats : null,
    sha256: 'b'.repeat(64),
  })
  it('draws the outline over both photos, and every image has alt text', () => {
    const grid = makeDisplayGrid(summary.bbox, 64)
    const out = build({ grid, images: [img('before', '2025-01-10'), img('after', '2025-12-20')] })
    expect(out.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(2)
    expect(out.match(new RegExp(`d="${outlinePath(inv.aoi, grid)}"`, 'g'))).toHaveLength(2)
    expect(out).toContain(`viewBox="0 0 ${grid.width} ${grid.height}"`)
    expect(out.match(/<img /g)).toHaveLength(4)
    expect(out).not.toMatch(/alt=""/)
    const alt = 'Before photo, 10 Jan 2025, Sentinel-2 true colour · 100% clear view'
    expect(out).toContain(`alt="${alt}"`)
    expect(out).toContain(`alt="${alt} · ${flow.report.nativeAlt}"`)
    expect(out).toContain(`${flow.report.labels.sha256}: ${'b'.repeat(64)}`)
  })
  it('does not draw an outline without the grid, and never states a clear view for a photo with no check result', () => {
    const out = build({ images: [img('before', '2025-01-10', false)] })
    expect(out).not.toContain('<svg')
    expect(out).toContain('alt="Before photo, 10 Jan 2025, Sentinel-2 true colour"')
    expect(out).not.toMatch(/% clear view/)
    expect(/<figcaption[\s\S]*?<\/figcaption>/.exec(out)![0]).not.toContain('badge')
  })
})
