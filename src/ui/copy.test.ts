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
  it('tells the privacy page that a click on a Look closer link sends the place to Google, and that nothing goes before one', () => {
    const privacy = copy.pages.privacy.items.join(' ')
    expect(privacy).toContain('Look closer links')
    expect(privacy).toContain('Nothing is sent to Google until you click one.')
    expect(privacy).toContain(
      'A click sends the middle of your outline, as latitude and longitude, to Google',
    )
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

describe('the satellite view words', () => {
  const all = () => {
    const c = flow.context
    return [
      c.legend,
      c.map,
      c.satellite(3),
      c.off,
      c.tooWideOn,
      c.tooWideUpdate,
      ...Object.values(c.stages),
      c.still,
      c.on('20 Dec 2025'),
      c.age(1),
      c.age(101),
      c.cloudy(12),
      c.cloudy(62),
      c.none,
      c.offline,
      c.failed,
      c.update,
    ]
  }
  it('never certify, prove or confirm anything: the picture is for finding a place', () => {
    for (const line of all()) expect(line, line).not.toMatch(/verif|proof|prove|confirm|certif|genuine/i)
  })
  it('says on the label what the picture is, how sharp it is and that it is not evidence', () => {
    expect(flow.context.on('20 Dec 2025')).toBe(
      'Satellite view · Sentinel-2 · 20 Dec 2025 · 10 m · for finding your place, not evidence',
    )
  })
  it('says the cost the way the person reads it, and the age in whole days', () => {
    expect(flow.context.satellite(3)).toBe('Satellite · about 3 MB')
    expect(flow.context.age(1)).toBe('1 day old.')
    expect(flow.context.age(101)).toBe('101 days old.')
  })
  it('says "Clouds cover most of it" only below half clear, and always gives the figure', () => {
    expect(flow.context.cloudy(0)).toContain('Clouds cover most of it.')
    expect(flow.context.cloudy(49)).toContain('Clouds cover most of it.')
    expect(flow.context.cloudy(50)).not.toContain('Clouds cover most of it')
    expect(flow.context.cloudy(79)).not.toContain('Clouds cover most of it')
    expect(flow.context.cloudy(62)).toContain('62% clear view')
  })
  it('keeps the failure lines apart: no connection says so, other failures neither say offline nor "no photo"', () => {
    expect(flow.context.offline).toContain('Could not reach the photo service.')
    expect(flow.context.failed).not.toMatch(/offline|no photo/i)
    expect(flow.context.failed).toContain('The map still works.')
    expect(flow.context.none).toBe('No recent photo covers this area. The map still works.')
  })
  it('puts the 10 m expectation, in the words of the design, on the off line', () => {
    expect(flow.context.off).toBe(
      'A recent 10 m photo behind the map: roads and large buildings show, houses do not.',
    )
  })
  it('keeps the other words the design fixed (the tests read the rest from flow.context itself)', () => {
    expect(flow.context.stages).toEqual({
      searching: 'Searching for recent photos',
      checking: 'Checking for clouds',
      reading: 'Reading the photo',
    })
    expect(flow.context.tooWideOn).toBe('Zoom in to your place to use the satellite view.')
    expect(flow.context.tooWideUpdate).toBe('Zoom in to your place to update the satellite view.')
    expect(flow.context.still).toBe('Still working. A slow connection can take up to a minute.')
    expect(flow.context.update).toBe('Update for this view')
    expect(flow.context.legend).toBe('Basemap')
    expect(flow.context.map).toBe('Map')
  })
  it('tells the limits page what the satellite view is, and the privacy page what it reads', () => {
    const own = copy.pages.limits.pageOnly.join(' ')
    expect(own).toContain('not evidence')
    expect(own).toContain('one to three pixels')
    expect(own).toContain('Runways and piers')
    expect(own).toContain('75 days')
    // a report prints `items` as its limits, and the view is never in a report: nothing about it may be in them
    expect(copy.pages.limits.items.join(' ')).not.toMatch(/satellite view/i)
    const privacy = copy.pages.privacy.items.join(' ')
    expect(privacy).toContain('Earth Search')
    expect(privacy).toContain('Planetary Computer')
    expect(privacy).toContain('by itself when you left it on last time') // a remembered choice starts it
  })
  it('calls a cloudy photo the clearest one checked, not the clearest of all recent photos (at most three are checked)', () => {
    expect(flow.context.cloudy(62)).toContain('the clearest photo we checked')
    expect(flow.context.cloudy(12)).not.toContain('clearest recent photo')
  })
})
