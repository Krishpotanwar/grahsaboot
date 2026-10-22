import { describe, expect, it } from 'vitest'
import { realDate } from '../lib/dates.ts'
import { SCENE_ID } from '../stac/search.ts'
import {
  decodeShare,
  encodeShare,
  MAX_FRAMES,
  SIDE,
  type Share,
  type ShareNotice,
  type ShareRead,
} from './share.ts'

// An address is text anyone can edit, so most of this file is bad text. `today` is fixed: no test depends on the day it runs.
const TODAY = new Date('2026-10-22T09:00:00Z')

const NAGPUR = { lat: 21.1458, lon: 79.0882, sideM: 2000 }
const sceneId = (date: string, n = 0, sat = 'B', tile = '44QKJ') =>
  `S2${sat}_${tile}_${date.replaceAll('-', '')}_${n}_L2A`
const F1 = { date: '2019-02-20', id: sceneId('2019-02-20') }
const F2 = { date: '2021-02-15', id: sceneId('2021-02-15', 1, 'A') }
const F3 = { date: '2025-02-20', id: sceneId('2025-02-20', 0, 'C') }
const SHARE: Share = { ...NAGPUR, frames: [F1, F2, F3] }
const LINK = `v=1&lat=21.1458&lon=79.0882&side=2000&d=${F1.date},${F2.date},${F3.date}&s=${F1.id},${F2.id},${F3.id}`
const PC = 'S2B_MSIL2A_20250307T053649_R005_T43QBB_20250307T082113' // an id of the other catalogue, as the plan gives one

/** The link above with some parameters replaced (a text) or left out (null); every value percent-encoded, as a browser sends it. */
const link = (over: Record<string, string | null> = {}): string =>
  Object.entries({
    v: '1',
    lat: '21.1458',
    lon: '79.0882',
    side: '2000',
    d: `${F1.date},${F2.date},${F3.date}`,
    s: `${F1.id},${F2.id},${F3.id}`,
    ...over,
  })
    .filter((e): e is [string, string] => e[1] !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
const unreadable = { share: null, notices: ['unreadable'] }
/** `n` real days, ten apart from 2017-01-01 on. */
const days = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2017, 0, 1 + 10 * i)).toISOString().slice(0, 10))
const deepFreeze = <T>(x: T): T => {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(deepFreeze)
    Object.freeze(x)
  }
  return x
}

describe('the limits it exports', () => {
  it("are the brief's: a size from 500 to 2900 and at most 8 frames", () => {
    expect(SIDE).toEqual({ min: 500, max: 2900 })
    expect(MAX_FRAMES).toBe(8)
  })

  it('are the ones decodeShare and encodeShare hold to', () => {
    for (const side of [SIDE.min, SIDE.max])
      expect(decodeShare(link({ side: String(side) }), TODAY).share?.sideM).toBe(side)
    for (const side of [SIDE.min - 1, SIDE.max + 1])
      expect(decodeShare(link({ side: String(side) }), TODAY)).toEqual(unreadable)
    const many = link({ d: days(MAX_FRAMES + 1).join(','), s: null })
    expect(decodeShare(many, TODAY).share?.frames).toHaveLength(MAX_FRAMES)
    const q = (sideM: number) => new URLSearchParams(encodeShare({ ...SHARE, sideM }, TODAY)!).get('side')
    expect([q(SIDE.min - 100), q(SIDE.max + 100)]).toEqual([String(SIDE.min), String(SIDE.max)])
    const all = days(MAX_FRAMES + 3).map((date) => ({ date, id: sceneId(date) }))
    const d = new URLSearchParams(encodeShare({ ...NAGPUR, frames: all }, TODAY)!).get('d')!
    expect(d.split(',')).toHaveLength(MAX_FRAMES)
  })
})

describe('encodeShare', () => {
  it('writes the version, the centre, the size, the dates and the scene ids, in that order', () => {
    expect(encodeShare(SHARE, TODAY)).toBe(LINK)
  })

  it('rounds the centre to 4 decimals and writes no more of it', () => {
    expect(encodeShare({ ...SHARE, lat: 21.14584, lon: 79.08826 }, TODAY)).toContain(
      '&lat=21.1458&lon=79.0883&',
    )
    expect(encodeShare({ ...SHARE, lat: -33.86881, lon: 151.209299 }, TODAY)).toContain(
      '&lat=-33.8688&lon=151.2093&',
    )
    expect(encodeShare({ ...SHARE, lat: 21, lon: -79 }, TODAY)).toContain('&lat=21&lon=-79&')
    expect(encodeShare({ ...SHARE, lat: 0.00004, lon: -0.00004 }, TODAY)).toContain('&lat=0&lon=0&') // never 4e-5
  })

  it.each([
    ['below the least', 499, 500],
    ['the least', 500, 500],
    ['a fraction', 1999.6, 2000],
    ['the most', 2900, 2900],
    ['above the most', 3000, 2900],
    ['far above', 99999, 2900],
    ['below zero', -5, 500],
    ['zero', 0, 500],
  ])('writes a square of %s (%d m) as %d', (_why, sideM, written) => {
    expect(new URLSearchParams(encodeShare({ ...SHARE, sideM }, TODAY)!).get('side')).toBe(String(written))
  })

  it('clamps a centre that is out of range', () => {
    const q = new URLSearchParams(encodeShare({ ...SHARE, lat: 91, lon: -181 }, TODAY)!)
    expect([q.get('lat'), q.get('lon')]).toEqual(['90', '-180'])
  })

  it.each([
    ['a latitude that is not a number', { ...SHARE, lat: NaN }],
    ['a longitude that is infinite', { ...SHARE, lon: Infinity }],
    ['a size that is not a number', { ...SHARE, sideM: NaN }],
    ['no frame', { ...SHARE, frames: [] }],
    ['no frame a reader would take', { ...SHARE, frames: [{ date: '2025-02-30', id: F1.id }] }],
  ])('gives no link for %s: there is nothing a reader could open', (_why, share) => {
    expect(encodeShare(share, TODAY)).toBeNull()
  })

  it('sorts the frames, keeps the first of a day, and leaves out a day a reader would refuse', () => {
    const second = { date: F1.date, id: sceneId(F1.date, 1) }
    const frames = [
      F3,
      F1,
      second,
      { date: '2025-02-30', id: sceneId('2025-02-28') }, // not a real day
      { date: '2026-10-23', id: sceneId('2026-10-23') }, // tomorrow
      { date: '2016-12-31', id: sceneId('2016-12-31') }, // before the first Sentinel-2 L2A day the app takes
      { date: 'junk', id: null },
      F2,
    ]
    expect(encodeShare({ ...NAGPUR, frames }, TODAY)).toBe(LINK)
  })

  it('takes a day that is today and one that is the first allowed day', () => {
    const q = new URLSearchParams(
      encodeShare(
        {
          ...NAGPUR,
          frames: [
            { date: '2026-10-22', id: null },
            { date: '2017-01-01', id: null },
          ],
        },
        TODAY,
      )!,
    )
    expect(q.get('d')).toBe('2017-01-01,2026-10-22')
  })

  it('keeps at most 8 frames, the earliest', () => {
    const all = days(12).map((date) => ({ date, id: sceneId(date) }))
    const q = new URLSearchParams(encodeShare({ ...NAGPUR, frames: all }, TODAY)!)
    expect(q.get('d')).toBe(days(8).join(','))
    expect(q.get('s')!.split(',')).toEqual(days(8).map((d) => sceneId(d)))
    expect(encodeShare({ ...NAGPUR, frames: all.slice(0, 8) }, TODAY)).toBe(
      encodeShare({ ...NAGPUR, frames: all.slice(0, 9) }, TODAY),
    )
  })

  it('writes a scene id only when it has the strict shape: the other catalogue and junk leave the date alone', () => {
    const frames = [F1, { date: F2.date, id: PC }, { date: F3.date, id: 'junk' }]
    expect(encodeShare({ ...NAGPUR, frames }, TODAY)).toBe(
      `v=1&lat=21.1458&lon=79.0882&side=2000&d=${F1.date},${F2.date},${F3.date}&s=${F1.id},,`,
    )
    const none = encodeShare(
      {
        ...NAGPUR,
        frames: [
          { date: F1.date, id: PC },
          { date: F2.date, id: null },
        ],
      },
      TODAY,
    )!
    expect(none).toBe(`v=1&lat=21.1458&lon=79.0882&side=2000&d=${F1.date},${F2.date}`) // no ids at all: no `s`
  })

  it('writes only the known fields: never notes, a claim, a name or anything of an account', () => {
    const dirty = {
      ...SHARE,
      name: 'Ravi Kumar house',
      notes: 'my private note',
      claim: 'built after 2020',
      account: 'ravi@example.com',
      token: 'sb-secret-token',
      frames: [{ ...F1, note: 'the old roof' }, F2, F3],
    }
    const out = encodeShare(dirty, TODAY)!
    expect(out).toBe(LINK)
    expect([...new URLSearchParams(out).keys()]).toEqual(['v', 'lat', 'lon', 'side', 'd', 's'])
    for (const secret of ['Ravi', 'private', 'built after', 'example.com', 'secret', 'old roof'])
      expect(out).not.toContain(secret)
  })

  it('does not change what it is given', () => {
    const frozen = deepFreeze({ ...NAGPUR, frames: [F3, F1, F2].map((f) => ({ ...f })) })
    expect(encodeShare(frozen, TODAY)).toBe(LINK)
    expect(frozen.frames.map((f) => f.date)).toEqual([F3.date, F1.date, F2.date])
  })
})

describe('decodeShare', () => {
  it('reads what encodeShare wrote, with nothing to say', () => {
    expect(decodeShare(LINK, TODAY)).toEqual({ share: SHARE, notices: [] })
  })

  it('reads a search string with its question mark, and a URLSearchParams it leaves as it was', () => {
    expect(decodeShare(`?${LINK}`, TODAY)).toEqual({ share: SHARE, notices: [] })
    const params = new URLSearchParams(LINK)
    expect(decodeShare(params, TODAY)).toEqual({ share: SHARE, notices: [] })
    expect(params.toString()).toBe(new URLSearchParams(LINK).toString())
  })

  it('reads the commas a chat app wrote as %2C', () => {
    expect(decodeShare(LINK.replaceAll(',', '%2C'), TODAY)).toEqual({ share: SHARE, notices: [] })
  })

  it('reads back what encodeShare wrote, for shares of every shape', () => {
    const shares: Share[] = [
      SHARE,
      { lat: -33.8688, lon: 151.2093, sideM: 500, frames: [{ date: '2017-01-01', id: null }] },
      { lat: 90, lon: -180, sideM: 2900, frames: days(8).map((date) => ({ date, id: sceneId(date) })) },
      { lat: 0, lon: 0, sideM: 1234, frames: [F1, { date: F2.date, id: null }, F3] },
    ]
    for (const share of shares) {
      const text = encodeShare(share, TODAY)!
      const { share: back, notices } = decodeShare(text, TODAY)
      expect(back, text).toEqual(share)
      expect(notices, text).toEqual([]) // a frame with no scene id is for the lookups to judge, not for the reader
    }
  })

  it.each([
    ['nothing', ''],
    ['only a question mark', '?'],
    ['a place with no version', 'lat=21.1458&lon=79.0882&side=2000&d=2019-02-20'],
    ['other parameters', 'utm_source=chat&ref=x'],
    ['a version key in another case', 'V=1&lat=21.1458&lon=79.0882&side=2000&d=2019-02-20'],
  ])(
    'is not a share link when the address holds %s (no version): nothing to open, nothing to say',
    (_why, text) => {
      expect(decodeShare(text, TODAY)).toEqual({ share: null, notices: [] })
    },
  )

  it.each(['2', '0', '', '1.0', '01', '1 ', ' 1', 'one', '1,2', '10', '-1', '٢', '１'])(
    'says the version is unknown for v=%j, whatever else the link holds',
    (v) => {
      expect(decodeShare(link({ v }), TODAY)).toEqual({ share: null, notices: ['unknown-version'] })
      expect(decodeShare(`v=${encodeURIComponent(v)}&lat=junk&d=zzzz`, TODAY)).toEqual({
        share: null,
        notices: ['unknown-version'],
      })
    },
  )

  describe('the centre and the size', () => {
    const NOT_A_NUMBER = [
      '',
      ' 21.1458',
      '21.1458 ',
      '21.1458\n',
      '0x15',
      '1e1',
      '1E1',
      '+21.1458',
      '.5',
      '5.',
      'NaN',
      'Infinity',
      '-Infinity',
      '--5',
      '5-',
      '1,5',
      '1_0',
      'abc',
      '٢١',
      '２１',
      '1'.repeat(400),
    ]
    it.each([...NOT_A_NUMBER, '91', '-91', '90.0001', '-90.0001', '1000'])(
      'refuses a latitude of %j',
      (lat) => {
        expect(decodeShare(link({ lat }), TODAY)).toEqual(unreadable)
      },
    )
    it.each([...NOT_A_NUMBER, '181', '-181', '180.0001', '-180.0001', '1000'])(
      'refuses a longitude of %j',
      (lon) => {
        expect(decodeShare(link({ lon }), TODAY)).toEqual(unreadable)
      },
    )
    it.each([
      ...NOT_A_NUMBER,
      '499',
      '2901',
      '3000',
      '99999',
      '0',
      '-2000',
      '-500',
      '2000.5',
      '1999.99',
      '500.0001',
      '0x7d0',
      '2e3',
      '2E3',
    ])('refuses a square size of %j (an integer from 500 to 2900 only)', (side) => {
      expect(decodeShare(link({ side }), TODAY)).toEqual(unreadable)
    })
    it.each(['lat', 'lon', 'side'])('refuses a link with no %s', (key) => {
      expect(decodeShare(link({ [key]: null }), TODAY)).toEqual(unreadable)
    })

    it.each([
      ['90', '180', '500'],
      ['-90', '-180', '2900'],
      ['0', '0', '2000'],
      ['-0.0001', '0.0001', '501'],
      ['007', '079', '0750'], // digits only: leading zeros are digits
    ])('takes the edges: latitude %s, longitude %s, size %s', (lat, lon, side) => {
      const read = decodeShare(link({ lat, lon, side }), TODAY)
      expect(read.share).toMatchObject({ lat: Number(lat), lon: Number(lon), sideM: Number(side) })
      expect(read.notices).toEqual([])
    })

    it('keeps a centre written with more than 4 decimals to 4, so that what is read is what would be written', () => {
      const read = decodeShare(link({ lat: '21.14581234', lon: '79.08826789' }), TODAY)
      expect(read.share).toMatchObject({ lat: 21.1458, lon: 79.0883 })
      expect(encodeShare(read.share!, TODAY)).toContain('&lat=21.1458&lon=79.0883&')
      expect(decodeShare(link({ lat: '89.99999', lon: '-179.99999' }), TODAY).share).toMatchObject({
        lat: 90,
        lon: -180,
      })
      expect(decodeShare(link({ lat: '90.00001' }), TODAY)).toEqual(unreadable) // range first, rounding after: no coming back in
    })
  })

  describe('the dates', () => {
    it.each([
      ['a month that does not exist', '2025-13-01'],
      ['month 00', '2025-00-10'],
      ['day 00', '2025-01-00'],
      ['30 February', '2025-02-30'],
      ['29 February of a year with none', '2025-02-29'],
      ['31 April', '2025-04-31'],
      ['text after the day', '2025-12-30junk'],
      ['text before the day', 'junk2025-12-30'],
      ['a space after', '2025-12-30 '],
      ['a new line after', '2025-12-30\n'],
      ['a time of day', '2025-12-30T00:00:00Z'],
      ['one-digit parts', '2025-1-1'],
      ['no dashes', '20251230'],
      ['slashes', '2025/12/30'],
      ['Arabic-Indic digits', '٢٠٢٥-١٢-٣٠'],
      ['words', 'zzzz'],
      ['an empty entry', ''],
      ['the day before the first allowed day', '2016-12-31'],
      ['a day long ago', '1999-12-31'],
      ['tomorrow', '2026-10-23'],
      ['a day far ahead', '9999-12-31'],
    ])('drops a date that is %s (%j), says so, and keeps the others with their own scenes', (_why, bad) => {
      const read = decodeShare(link({ d: `${F1.date},${bad},${F3.date}` }), TODAY) // F2's scene goes with the dropped date
      expect(read).toEqual({ share: { ...NAGPUR, frames: [F1, F3] }, notices: ['missing-frame'] })
    })

    it('takes the first allowed day and today', () => {
      const read = decodeShare(link({ d: '2017-01-01,2026-10-22', s: null }), TODAY)
      expect(read.share?.frames).toEqual([
        { date: '2017-01-01', id: null },
        { date: '2026-10-22', id: null },
      ])
    })

    it('refuses a link whose dates are all bad, or that has none', () => {
      expect(decodeShare(link({ d: '2025-13-01,zzzz,2016-12-31' }), TODAY)).toEqual(unreadable)
      expect(decodeShare(link({ d: '' }), TODAY)).toEqual(unreadable)
      expect(decodeShare(link({ d: null }), TODAY)).toEqual(unreadable)
      expect(decodeShare(link({ d: ',,' }), TODAY)).toEqual(unreadable)
    })

    it('drops a date that is not later than the one before it, with the scene that went with it', () => {
      const out = decodeShare(
        link({ d: `${F2.date},${F1.date},${F3.date}`, s: `${F2.id},${F1.id},${F3.id}` }),
        TODAY,
      )
      expect(out).toEqual({ share: { ...NAGPUR, frames: [F2, F3] }, notices: ['missing-frame'] })
      const twice = decodeShare(
        link({ d: `${F1.date},${F1.date},${F2.date}`, s: `${F1.id},${F3.id},${F2.id}` }),
        TODAY,
      )
      expect(twice).toEqual({ share: { ...NAGPUR, frames: [F1, F2] }, notices: ['missing-frame'] }) // the first of a day wins
    })

    it.each([
      [8, []],
      [9, ['missing-frame']],
      [100, ['missing-frame']],
    ])('keeps at most 8 frames, the earliest: %d dates', (n, notices) => {
      const d = days(n)
      const read = decodeShare(link({ d: d.join(','), s: d.map((x) => sceneId(x)).join(',') }), TODAY)
      expect(read.share?.frames).toEqual(days(8).map((date) => ({ date, id: sceneId(date) })))
      expect(read.notices).toEqual(notices)
    })

    it('does not count a surplus of ids as a missing frame, and ignores it', () => {
      const read = decodeShare(link({ d: F1.date, s: `${F1.id},${F2.id},${F3.id}` }), TODAY)
      expect(read).toEqual({ share: { ...NAGPUR, frames: [F1] }, notices: [] })
    })
  })

  describe('the scene ids', () => {
    it.each([
      ['an id of the other catalogue (Planetary Computer)', PC],
      ['an id in lower case', F1.id.toLowerCase()],
      ['a satellite that is not A, B or C', 'S2D_44QKJ_20190220_0_L2A'],
      ['a level 1C id', 'S2B_44QKJ_20190220_0_L1C'],
      ['a path', '../..'],
      ['an id with a query', `${F1.id}?fields=id`],
      ['an id with a path', `${F1.id}/..`],
      ['an id with a new line', `${F1.id}\n`],
      ['an id with a space', ` ${F1.id}`],
      ['two ids glued together', `${F1.id}${F1.id}`],
      ['an empty entry', ''],
      ['words', 'junk'],
    ])(
      'keeps the date of a frame whose scene id is %s (%j), with no scene to ask for, and says nothing yet',
      (_why, bad) => {
        const read = decodeShare(link({ s: `${bad},${F2.id},${F3.id}` }), TODAY)
        expect(read).toEqual({
          share: { ...NAGPUR, frames: [{ date: F1.date, id: null }, F2, F3] },
          notices: [], // whether a frame falls back to its day is for rebuildFrames to say, once the lookups have answered
        })
      },
    )

    it('opens an old link that names dates only: every frame keeps its date, with no scene to ask for', () => {
      const old = 'v=1&lat=21.1458&lon=79.0882&side=2000&d=2019-02-20,2021-02-15'
      expect(decodeShare(old, TODAY)).toEqual({
        share: {
          ...NAGPUR,
          frames: [
            { date: '2019-02-20', id: null },
            { date: '2021-02-15', id: null },
          ],
        },
        notices: [],
      })
    })

    it('pairs the ids with the dates by place: fewer ids, an empty place or none', () => {
      const dates = `${F1.date},${F2.date},${F3.date}`
      expect(decodeShare(link({ d: dates, s: F1.id }), TODAY).share?.frames).toEqual([
        F1,
        { date: F2.date, id: null },
        { date: F3.date, id: null },
      ])
      expect(decodeShare(link({ d: dates, s: `${F1.id},,${F3.id}` }), TODAY)).toEqual({
        share: { ...NAGPUR, frames: [F1, { date: F2.date, id: null }, F3] },
        notices: [],
      })
      expect(decodeShare(link({ d: dates, s: '' }), TODAY).share?.frames.map((f) => f.id)).toEqual([
        null,
        null,
        null,
      ])
    })

    it('says only that a day was dropped when another frame has no scene: whether that one falls back is for the lookups', () => {
      const read = decodeShare(link({ d: `${F1.date},zzzz,${F3.date}`, s: `${F1.id},${F2.id},` }), TODAY)
      expect(read).toEqual({
        share: { ...NAGPUR, frames: [F1, { date: F3.date, id: null }] },
        notices: ['missing-frame'],
      })
    })
  })

  it('ignores every parameter it does not know, and carries none into what it returns: never notes, a claim, a name or an account', () => {
    const extra =
      '&name=Ravi%20Kumar%20house&notes=my%20private%20note&claim=built%20after%202020&account=ravi%40example.com' +
      '&token=sb-secret-token&utm_source=chat&__proto__=1&constructor=2&toString=3&d2=2019-02-20&S=x&V=2'
    const read = decodeShare(`${LINK}${extra}`, TODAY)
    expect(read).toEqual({ share: SHARE, notices: [] })
    expect(Object.keys(read.share!).sort()).toEqual(['frames', 'lat', 'lon', 'sideM'])
    for (const f of read.share!.frames) expect(Object.keys(f).sort()).toEqual(['date', 'id'])
    for (const secret of ['Ravi', 'private', 'built after', 'example.com', 'secret', 'chat'])
      expect(JSON.stringify(read)).not.toContain(secret)
  })

  it('takes the first of a parameter that is given twice', () => {
    expect(decodeShare(`${LINK}&lat=1&side=999999&v=2`, TODAY)).toEqual({ share: SHARE, notices: [] })
  })

  it('stays quick and keeps its limits on very long texts', () => {
    const huge = 'x'.repeat(5_000_000)
    const texts = {
      unknownKey: `${LINK}&name=${huge}`,
      dates: link({ d: huge }),
      latitude: link({ lat: huge }),
      commas: link({ d: `${F1.date}${','.repeat(2_000_000)}`, s: F1.id }),
      manyDates: link({ d: days(100).join(','), s: huge }),
      longId: link({ s: `${F1.id},${huge}` }),
    }
    const started = Date.now()
    const got = Object.fromEntries(Object.entries(texts).map(([k, t]) => [k, decodeShare(t, TODAY)]))
    const elapsed = Date.now() - started
    expect(got.unknownKey).toEqual({ share: SHARE, notices: [] })
    expect(got.dates).toEqual(unreadable)
    expect(got.latitude).toEqual(unreadable)
    expect(got.commas).toEqual({ share: { ...NAGPUR, frames: [F1] }, notices: ['missing-frame'] })
    expect(got.manyDates!.share?.frames).toHaveLength(8)
    expect(got.longId!.notices).toEqual([])
    expect(elapsed).toBeLessThan(5000)
  })
})

// A seeded generator, so a failure names the link that caused it and the next run makes the same links.
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('decodeShare on random text', () => {
  const GOOD = {
    lat: ['21.1458', '-33.8688', '0', '90', '-90', '45.5', '-33.868812', '0.00001', '89.99999'],
    lon: ['79.0882', '151.2093', '0', '180', '-180', '-45.5', '12.34567890123', '-179.99999'],
    side: ['2000', '500', '2900', '1234'],
  }
  const BAD = [
    '91',
    '-181',
    '3000',
    '499',
    '2000.5',
    '',
    ' 5',
    '5 ',
    '0x10',
    '1e3',
    'NaN',
    'Infinity',
    '+1',
    '.5',
    '5.',
    '٢٠٠٠',
    '１２',
    '--1',
    '1,5',
    '1'.repeat(400),
  ]
  const DATES = [
    F1.date,
    F2.date,
    F3.date,
    '2017-01-01',
    '2026-10-22',
    '2026-10-23',
    '2016-12-31',
    '2025-02-30',
    '2025-13-01',
    'zzzz',
    '',
    '2019-2-20',
    '20190220',
    '2019-02-20 ',
    '٢٠١٩-٠٢-٢٠',
  ]
  const IDS = [
    F1.id,
    F2.id,
    F3.id,
    PC,
    '',
    'junk',
    F1.id.toLowerCase(),
    `${F1.id}\n`,
    '../..',
    'S2D_44QKJ_20190220_0_L2A',
  ]
  const KEYS = ['name', 'notes', 'claim', 'token', '__proto__', 'constructor', 'x', 'v', 'lat', 'd', 's', '']

  const codes: ShareNotice[] = ['unknown-version', 'unreadable', 'missing-frame'] // never date-fallback: only rebuildFrames says it
  /** What a read must always satisfy, whatever the text was. */
  function check(read: ShareRead, text: string): void {
    for (const n of read.notices) expect(codes, text).toContain(n)
    if (!read.share) {
      expect(read.notices.length, text).toBeLessThanOrEqual(1)
      return
    }
    const { lat, lon, sideM, frames } = read.share
    expect(Number.isFinite(lat) && Math.abs(lat) <= 90, text).toBe(true)
    expect(Number.isFinite(lon) && Math.abs(lon) <= 180, text).toBe(true)
    expect(Number.isInteger(sideM) && sideM >= 500 && sideM <= 2900, text).toBe(true)
    expect(frames.length >= 1 && frames.length <= 8, text).toBe(true)
    frames.forEach((f, i) => {
      expect(realDate(f.date), text).toBeDefined()
      expect(f.date >= '2017-01-01' && f.date <= '2026-10-22', text).toBe(true)
      if (i > 0) expect(f.date > frames[i - 1]!.date, text).toBe(true)
      expect(f.id === null || SCENE_ID.test(f.id), text).toBe(true)
    })
    // What it read, it can write: the link is a fixed point of both.
    const again = encodeShare(read.share, TODAY)
    expect(again, text).not.toBeNull()
    expect(decodeShare(again!, TODAY).share, text).toEqual(read.share)
  }

  function read(text: string): ShareRead {
    try {
      return decodeShare(text, TODAY)
    } catch (e) {
      throw new Error(`threw on ${JSON.stringify(text)}: ${String(e)}`)
    }
  }

  it('never throws and never returns what it should have refused, for 5000 links made of good and bad parts', () => {
    const r = rng(20261022)
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
    const number = (good: string[]) => pick(r() < 0.85 ? good : BAD)
    const list = (xs: readonly string[]) =>
      Array.from({ length: Math.floor(r() * 13) }, () => pick(xs)).join(
        pick([',', ',', ',', '%2C', ';', ' ']),
      )
    let opened = 0
    for (let i = 0; i < 5000; i++) {
      const rising = days(1 + Math.floor(r() * 10)) // a rising run of good days, so the accepting side is reached often
      const parts: string[] = []
      if (r() < 0.97) parts.push(`v=${pick(r() < 0.9 ? ['1'] : ['2', '', '1.0', '01'])}`)
      if (r() < 0.97) parts.push(`lat=${number(GOOD.lat)}`)
      if (r() < 0.97) parts.push(`lon=${number(GOOD.lon)}`)
      if (r() < 0.97) parts.push(`side=${number(GOOD.side)}`)
      if (r() < 0.95) parts.push(`d=${r() < 0.6 ? rising.join(',') : list(DATES)}`)
      if (r() < 0.8) parts.push(`s=${r() < 0.6 ? rising.map((x) => sceneId(x)).join(',') : list(IDS)}`)
      for (let k = Math.floor(r() * 4); k > 0; k--)
        parts.push(`${pick(KEYS)}=${pick([...DATES, ...IDS, ...BAD])}`)
      const text = parts.sort(() => r() - 0.5).join(pick(['&', '&', '&&', '&amp;']))
      const out = read(text)
      check(out, text)
      if (out.share) opened++
    }
    expect(opened).toBeGreaterThan(500) // the generator reaches the accepting side too, or the checks above prove little
  })

  it('never throws on random characters, lone surrogates and control characters included', () => {
    const r = rng(7)
    for (let i = 0; i < 2000; i++) {
      const text = Array.from({ length: Math.floor(r() * 300) }, () =>
        String.fromCharCode(r() < 0.5 ? Math.floor(r() * 128) : Math.floor(r() * 0x10000)),
      ).join('')
      check(read(text), text)
      check(read(`v=1&lat=1&lon=1&side=2000&d=${text}&s=${text}`), text)
    }
  })
})
