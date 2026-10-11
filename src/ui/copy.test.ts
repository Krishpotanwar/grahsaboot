import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy, issueMessage } from './copy.ts'
import { flow } from './copy-flow.ts'

const dir = new URL('./', import.meta.url)
const SOURCE = readdirSync(dir)
  .filter((f) => /^copy.*\.ts$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(new URL(f, dir), 'utf8'))
  .join('\n')
const BANNED = [
  /\bconstructed\b/i,
  /\bcomplete(d)?\b/i,
  /\bverified project\b/i,
  /\bfraud\b/i,
  /\babandon(ed)?\b/i,
  /%\s*complete/i,
  /\bconfidence\b/i,
]

describe('copy', () => {
  it('never uses verdict words (spec §2.2) in any copy file', () => {
    for (const re of BANNED) expect(re.test(SOURCE), String(re)).toBe(false)
  })
  it('tells visitors which tile hosts see their IP address and the area they view', () => {
    const text = copy.pages.privacy.items.join(' ')
    for (const host of ['OpenFreeMap', 'NASA GIBS', 'AWS']) expect(text, host).toContain(host)
    expect(text).toContain('IP address')
  })
  it('credits Sentinel data once per year shown, oldest first', () => {
    expect(copy.attribution.sentinelYears([2025])).toBe('Contains modified Copernicus Sentinel data 2025')
    expect(copy.attribution.sentinelYears([2025, 2018, 2025])).toBe(
      'Contains modified Copernicus Sentinel data 2018, 2025',
    )
  })
  it('captions a photo without a clear-view figure until the check has one', () => {
    expect(flow.workbench.caption('10 Jan 2025', 100)).toBe(
      '10 Jan 2025 · Sentinel-2 · 10 m · 100% clear view',
    )
    expect(flow.workbench.caption('10 Jan 2025')).toBe('10 Jan 2025 · Sentinel-2 · 10 m')
  })
  it('captions a photo with its satellite, read from the item id', () => {
    const line = (id: string) => flow.workbench.captionLine1('22 Feb 2018', id)
    expect(line('S2B_43QBB_20180222_0_L2A')).toBe('22 Feb 2018 · Sentinel-2B · 10 m')
    expect(line('S2A_MSIL2A_20180222T053939_R005_T43QBB_20201014T123052')).toBe(
      '22 Feb 2018 · Sentinel-2A · 10 m',
    )
    expect(line('S2C_43QBB_20250101_0_L2A')).toBe('22 Feb 2018 · Sentinel-2C · 10 m')
    // an id that names no unit says no more than what is known
    expect(line('LC09_L2SP_144047_20250101')).toBe('22 Feb 2018 · Sentinel-2 · 10 m')
    expect(flow.workbench.clearView(41)).toBe('41% clear view')
  })
  it('writes a scale bar in metres below a kilometre and in kilometres from it, and numbers sections from 01', () => {
    expect(flow.workbench.scale(50)).toBe('50 m')
    expect(flow.workbench.scale(500)).toBe('500 m')
    expect(flow.workbench.scale(1000)).toBe('1 km')
    expect(flow.workbench.scale(10000)).toBe('10 km')
    expect([0, 1, 9, 10].map(flow.workbench.sectionNo)).toEqual(['01', '02', '10', '11'])
  })
  it('words a row of the photo timeline, the grid headers and the detail under the grid', () => {
    const id = 'S2B_43QBB_20180222_0_L2A'
    expect(flow.workbench.rowMeta(id, 100)).toBe('Sentinel-2B · 10 m · 100% clear view')
    expect(flow.workbench.rowMeta(id)).toBe('Sentinel-2B · 10 m') // not checked yet: no figure to give
    expect(flow.workbench.rowMeta('LC09_L2SP_144047_20250101', 41)).toBe('Sentinel-2 · 10 m · 41% clear view')
    expect(flow.workbench.sectionHead(1, 2000, 4000)).toBe('02 · 2.0–4.0 km')
    expect(flow.workbench.sectionTitle(1, 2000, 4000)).toBe('Section 02 · 2.0–4.0 km')
    expect(flow.workbench.sectionView('12 Dec 2025', 'Clear', true)).toBe('12 Dec 2025 · Clear view')
    expect(flow.workbench.sectionView('12 Dec 2025', 'Loading', false)).toBe('12 Dec 2025 · Loading')
    expect(flow.workbench.passes(1076)).toBe('1076 passes')
    expect(flow.workbench.pinnedCount(2)).toBe('2 pinned')
    expect(flow.workbench.checkFailedShort.length).toBeLessThan(flow.workbench.checkFailed.length)
    expect(flow.workbench.gridHelp).toBe('How clearly each section is visible on each date.')
  })
  it('says some passes are not shown when a window is cut, without a number the search no longer has', () => {
    expect(flow.workbench.limited).toBe('Some passes are not shown. Narrow the dates to see them all.')
  })
  it('names the four class shares shown under Details', () => {
    expect(flow.workbench.shares).toEqual({
      valid: 'Visible ground',
      uncertain: 'Uncertain (shadow or unclassified)',
      obstructed: 'Obscured (cloud, shadow, snow)',
      nodata: 'No data',
    })
  })
  it('has a word and help line for every quality label', () => {
    for (const l of ['CLEAR', 'PARTIAL', 'OBSCURED', 'NOT_COVERED'] as const) {
      expect(copy.quality[l].word.length).toBeGreaterThan(2)
      expect(copy.quality[l].help.length).toBeGreaterThan(10)
    }
  })
  it('explains every AOI issue in plain words', () => {
    expect(issueMessage({ code: 'too_large', value: 12.345, limit: 9 })).toBe(
      'This outline covers 12.3 km². The limit is 9 km².',
    )
    expect(issueMessage({ code: 'bad_width' })).toContain('5 to 200 metres')
    for (const code of [
      'not_closed',
      'too_few_points',
      'too_many_vertices',
      'self_intersects',
      'too_small',
      'too_wide',
      'too_short',
      'too_long',
      'out_of_range',
    ] as const) {
      expect(issueMessage({ code, value: 1, limit: 2 }).length).toBeGreaterThan(10)
    }
  })
})
