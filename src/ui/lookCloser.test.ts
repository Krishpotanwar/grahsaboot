import { afterEach, describe, expect, it, vi } from 'vitest'
import { addNote, newInvestigation } from '../data/investigation.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
import { flow } from './copy-flow.ts'
import { earthUrl, lookCloserLinks, satelliteMapUrl, streetViewUrl, withGroundNote } from './lookCloser.ts'

/** The latitude and the longitude of a link, as written in it. */
const numbersIn = (url: string): string[] => /(?:viewpoint=|center=|@)([^,&@]+),([^,&]+)/.exec(url)!.slice(1)

describe('the Look-closer links', () => {
  it('builds the Street View link in the official Maps URL form, with no key', () => {
    expect(streetViewUrl(21.1458, 79.0882)).toBe(
      'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=21.145800,79.088200',
    )
  })

  it('builds the Google Earth link in the form the design fixed (Google does not document it: it is checked by hand)', () => {
    expect(earthUrl(21.1458, 79.0882)).toBe(
      'https://earth.google.com/web/@21.145800,79.088200,0a,2000d,35y,0h,0t,0r',
    )
  })

  it('keeps the documented Maps satellite link, the fallback for the Earth link', () => {
    expect(satelliteMapUrl(21.1458, 79.0882)).toBe(
      'https://www.google.com/maps/@?api=1&map_action=map&center=21.145800,79.088200&zoom=16&basemap=satellite',
    )
  })

  it('writes the sign of a negative number, in all three links', () => {
    expect(streetViewUrl(-33.8688, -70.65)).toContain('viewpoint=-33.868800,-70.650000')
    expect(earthUrl(-33.8688, -70.65)).toContain('@-33.868800,-70.650000,0a')
    expect(satelliteMapUrl(-33.8688, -70.65)).toContain('center=-33.868800,-70.650000&')
  })

  it('writes six decimals, about 0.1 m, rounded and not cut', () => {
    expect(streetViewUrl(21.1234564, 79.1234566)).toContain('viewpoint=21.123456,79.123457')
    expect(streetViewUrl(1, -2)).toContain('viewpoint=1.000000,-2.000000')
  })

  it('never writes a number in exponent form, however small, and keeps a tiny one a plain decimal', () => {
    for (const v of [1e-7, -1e-7, 4e-7, 5e-7, 1e-12, 1e-300, -1e-300, 0, -0, 89.9999999, -179.99999999]) {
      for (const url of [streetViewUrl(v, -v), earthUrl(v, -v), satelliteMapUrl(v, -v)]) {
        const [lat, lon] = numbersIn(url)
        expect(lat, `${v} in ${url}`).toMatch(/^-?\d+\.\d{6}$/)
        expect(lon, `${v} in ${url}`).toMatch(/^-?\d+\.\d{6}$/)
        // and the same number as the value given, to the six decimals
        expect(Math.abs(Number(lat) - v)).toBeLessThanOrEqual(5.0001e-7)
        expect(Math.abs(Number(lon) + v)).toBeLessThanOrEqual(5.0001e-7)
      }
    }
    expect(streetViewUrl(1e-7, 4e-7)).toContain('viewpoint=0.000000,0.000000')
    expect(streetViewUrl(0.0000006, 0)).toContain('viewpoint=0.000001,0.000000')
  })

  it('sends the person to the middle of the outline box', () => {
    const links = lookCloserLinks([79.0832, 21.1408, 79.0932, 21.1508])
    expect(links?.streetView).toBe(streetViewUrl(21.1458, 79.0882))
    expect(links?.earth).toBe(earthUrl(21.1458, 79.0882))
  })

  it("for a road, the box is the line's box widened evenly, so its middle is the road's middle", () => {
    const road = summarizeAoi({
      kind: 'road',
      geometry: {
        type: 'LineString',
        coordinates: [
          [79.07698, 21.138637],
          [79.095988, 21.157819],
        ],
      },
      widthM: 30,
    })
    if (!road.ok) throw new Error('the fixture road is valid')
    expect(lookCloserLinks(road.summary.bbox)?.streetView).toContain('viewpoint=21.148228,79.086484')
  })

  it('gives no links for a box whose middle is not a place on Earth', () => {
    for (const box of [
      [NaN, 21, 79, 22],
      [79, 21, Infinity, 22],
      [79, 91, 80, 92],
      [-181, 21, -180.5, 22],
      [79, -92, 80, -91],
    ] as const)
      expect(lookCloserLinks([...box]), box.join()).toBeNull()
    // the edges of the globe are places
    expect(lookCloserLinks([-180, -90, -180, -90])).not.toBeNull()
    expect(lookCloserLinks([180, 90, 180, 90])).not.toBeNull()
  })

  it('says, in the words of the design, that Google owns the pages and the product checks none of it', () => {
    expect(flow.lookCloser.note).toBe("Opens Google's own pages. Not checked by GrahSaboot.")
  })
})

describe('the Street View note helper', () => {
  afterEach(() => vi.useRealTimers())
  const START = 'Street View, '

  it('fills an empty note with "Street View, " and leaves the date for the person to type', () => {
    expect(withGroundNote('')).toBe(START)
    expect(START).toBe(flow.lookCloser.groundNoteStart)
    expect(START).toHaveLength(13)
    // nothing typed but spaces and new lines is an empty note
    expect(withGroundNote('  \n ')).toBe(START)
  })

  it("never writes a date: the picture's date is on Google's page, and today's date is not it", () => {
    vi.useFakeTimers()
    for (const day of ['2026-10-22', '2031-02-03', '2019-12-31']) {
      vi.setSystemTime(new Date(`${day}T12:00:00Z`))
      expect(withGroundNote('')).toBe(START)
      expect(withGroundNote('Roof is new')).toBe(`Roof is new\n${START}`)
    }
    expect(withGroundNote('')).not.toMatch(/\d/)
  })

  it('keeps what is already typed and adds the phrase on a new line', () => {
    expect(withGroundNote('Roof is new')).toBe('Roof is new\nStreet View, ')
    expect(withGroundNote('  Roof is new  ')).toBe('  Roof is new  \nStreet View, ')
    // a second press gives a second line, so two dates can be compared
    expect(withGroundNote(withGroundNote('Roof is new')!)).toBe('Roof is new\nStreet View, \nStreet View, ')
  })

  it('does not leave a blank line when the text already ends on a new line', () => {
    expect(withGroundNote('Roof is new\n')).toBe('Roof is new\nStreet View, ')
  })

  it('keeps the 2000-character cap: it fits to the last character, and gives nothing when it does not', () => {
    const cap = LIMITS.notes.maxChars
    expect(cap).toBe(2000)
    const fits = withGroundNote('x'.repeat(cap - START.length - 1))
    expect(fits).toHaveLength(cap)
    expect(fits?.endsWith(`\n${START}`)).toBe(true)
    expect(withGroundNote('x'.repeat(cap - START.length))).toBeNull()
    expect(withGroundNote('x'.repeat(cap))).toBeNull()
    // an existing new line is not paid for twice
    expect(withGroundNote(`${'x'.repeat(cap - START.length - 1)}\n`)).toHaveLength(cap)
    expect(withGroundNote(`${'x'.repeat(cap - START.length)}\n`)).toBeNull()
  })

  it('writes an ordinary note: the person finishes it, and the kind, the date and the schema are the existing ones', () => {
    const inv = newInvestigation({
      name: 'Yard',
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
    })
    const typed = `${withGroundNote('')}March 2023: a new wall`
    const noted = addNote(inv, { kind: 'unsure', body: typed, date: null, sectionIdx: null })
    expect(noted.notes[0]).toMatchObject({
      kind: 'unsure',
      body: 'Street View, March 2023: a new wall',
      date: null,
      sectionIdx: null,
    })
    expect(Object.keys(noted.notes[0]!).sort()).toEqual(
      ['body', 'createdAt', 'date', 'id', 'kind', 'sectionIdx', 'updatedAt'].sort(),
    )
  })
})
