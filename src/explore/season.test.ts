import { describe, expect, it } from 'vitest'
import type { LonLat } from '../evidence/types.ts'
import { selectPerDate } from '../stac/select.ts'
import type { AssetRef, DateCandidate, S2Item } from '../stac/types.ts'
import {
  ageDays,
  CLEAR_VIEW_MIN,
  LOOKBACK_DAYS,
  pickSeason,
  rankYear,
  settleYear,
  SPAN_YEARS,
  WINDOW_DAYS,
  yearWindows,
  type Checked,
} from './season.ts'

const DAY = 86_400_000
const ASSET: AssetRef = {
  href: 'https://example.test/a.tif',
  transform: [10, 0, 0, 0, -10, 0],
  shape: [1, 1],
}

/** `ymd` moved by `days` calendar days. */
const add = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
/** A scene as the catalogue lists it: 05:30 UTC on `date`, with the given cloud cover. */
const item = (date: string, cloudCover: number | null, over: Partial<S2Item> = {}): S2Item => ({
  id: `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`,
  collection: 'sentinel-2-l2a',
  datetime: `${date}T05:30:00Z`,
  date,
  epsg: 32644,
  cloudCover,
  baseline: '05.11',
  nodataPct: 0,
  footprint: [],
  visual: ASSET,
  scl: ASSET,
  ...over,
})
/** What `selectPerDate` hands over for one date. */
const scene = (date: string, cloud: number | null, coversAoi = true): DateCandidate => ({
  date,
  item: item(date, cloud),
  alternates: [],
  coversAoi,
})
/** Scenes from `from` to `to` (both included) every `step` days; `cloud` is one figure for all or one per scene. */
const every = (from: string, to: string, step: number, cloud: number | number[]): DateCandidate[] => {
  const out: DateCandidate[] = []
  for (let d = from, i = 0; d <= to; d = add(d, step), i++)
    out.push(scene(d, typeof cloud === 'number' ? cloud : cloud[i]!))
  return out
}
const dates = (xs: DateCandidate[]) => xs.map((x) => x.date)
/** A frozen input proves a function never changes what it is given (a change throws in strict mode). */
const frozen = <T>(x: T): T => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x)
    for (const v of Object.values(x)) frozen(v)
  }
  return x
}
/** The same list in a fixed scrambled order: sorted by its dates read backwards. */
const scrambled = <T extends { date: string }>(xs: T[]) => {
  const key = (x: T) => [...x.date].reverse().join('')
  return [...xs].sort((a, b) => key(a).localeCompare(key(b)))
}

// The grid of target days counts back from `now` in steps of 5 days, so 20 Aug 2026 puts 11 Feb 2026 on it (38 steps).
const NOW = new Date('2026-08-20T12:00:00Z')

describe('the numbers of the rule (review answer D29, plan F7)', () => {
  it('is the last 6 years, a window of 20 days each side, scenes of 20% cloud or less over 12 months, 80% clear', () => {
    expect(SPAN_YEARS).toBe(6)
    expect(WINDOW_DAYS).toBe(20)
    expect(LOOKBACK_DAYS).toBe(365)
    expect(CLEAR_VIEW_MIN).toBe(0.8)
  })
})

describe('pickSeason: a monsoon year', () => {
  // Nagpur-like: last monsoon in September, thin clear scenes in the dry months, one dense clear stretch around 11 February,
  // this monsoon cloudy but for one clear scene on 2 August: the newest clear picture, in a season that is mostly cloud.
  const monsoonYear = (): DateCandidate[] => [
    ...every('2025-09-03', '2025-09-28', 5, 90),
    ...every('2025-10-08', '2026-01-17', 10, 14),
    ...every('2026-01-22', '2026-03-03', 5, [2, 4, 3, 1, 5, 2, 6, 4, 3]),
    ...every('2026-03-13', '2026-05-22', 10, 14),
    ...every('2026-06-01', '2026-08-20', 5, 80),
    scene('2026-08-02', 12),
  ]

  it('takes the season of the clearest stretch, not the season of the newest clear picture', () => {
    const season = pickSeason(monsoonYear(), NOW)
    expect(season?.monthDay).toBe('02-11') // the newest clear picture, 2 August, would have said 08-02
    expect(dates(season!.cluster)).toEqual([
      '2026-03-03',
      '2026-02-26',
      '2026-02-21',
      '2026-02-16',
      '2026-02-11',
      '2026-02-06',
      '2026-02-01',
      '2026-01-27',
      '2026-01-22',
    ])
    expect(dates(season!.cluster)).not.toContain('2026-08-02')
  })

  it('makes the newest clear picture of that cluster the last frame, labelled with its date and its age', () => {
    const last = pickSeason(monsoonYear(), NOW)!.cluster[0]!
    expect(last.date).toBe('2026-03-03')
    expect(ageDays(last.item, NOW)).toBe(170)
  })

  it('gives the 6 years of the same month and day, the newest year first', () => {
    const { windows } = pickSeason(monsoonYear(), NOW)!
    expect(windows.map((w) => w.year)).toEqual([2026, 2025, 2024, 2023, 2022, 2021])
    expect(windows[0]).toEqual({ year: 2026, middle: '2026-02-11', from: '2026-01-22', to: '2026-03-03' })
  })

  it('does not depend on the order of the scenes, and never changes what it is given', () => {
    const want = dates(pickSeason(monsoonYear(), NOW)!.cluster)
    expect(dates(pickSeason([...monsoonYear()].reverse(), NOW)!.cluster)).toEqual(want)
    expect(dates(pickSeason(scrambled(monsoonYear()), NOW)!.cluster)).toEqual(want)
    expect(dates(pickSeason(frozen(monsoonYear()), NOW)!.cluster)).toEqual(want)
  })
})

describe('pickSeason: the count, the tie-breaks and the grid', () => {
  it('takes the cluster with the most scenes, however cloudy they are, over one with fewer and clearer ones', () => {
    const more = every('2026-02-01', '2026-02-16', 5, 19) // 4 scenes
    const fewer = every('2026-05-02', '2026-05-12', 5, 0) // 3 scenes
    expect(dates(pickSeason([...fewer, ...more], NOW)!.cluster)).toEqual(dates(more).reverse())
  })

  it.each([
    ['earlier', '2026-02-06', '2026-05-02'],
    ['later', '2026-05-02', '2026-02-06'],
  ])(
    'on equal counts takes the lower mean of the two lowest clouds (the better stretch is the %s one), not the single clearest',
    (_when, better, worse) => {
      const trio = (mid: string, clouds: number[]) => [-5, 0, 5].map((d, i) => scene(add(mid, d), clouds[i]!))
      const a = trio(better, [6, 5, 19]) // two lowest 5 and 6: mean 5.5
      const b = trio(worse, [19, 1, 19]) // the clearest scene of all (1), but the two lowest are 1 and 19: mean 10
      expect(dates(pickSeason([...b, ...a], NOW)!.cluster)).toEqual(dates(a).reverse())
    },
  )

  it('takes the mean of the two lowest clouds, not of the three lowest or of every scene', () => {
    const x = [2, 2, 20, 20].map((c, i) => scene(add('2026-02-01', i * 5), c)) // two lowest: 2 and 2, mean 2 (three lowest: 8)
    const y = [5, 5, 5, 5].map((c, i) => scene(add('2026-04-27', i * 5), c)) // mean 5 however many are taken
    expect(dates(pickSeason([...y, ...x], NOW)!.cluster)).toEqual(dates(x).reverse())
  })

  it('on equal counts and means takes the latest target day, which is the late end of a plateau', () => {
    const early = every('2026-01-27', '2026-02-06', 5, 5)
    const late = every('2026-04-27', '2026-05-07', 5, 5)
    const season = pickSeason([...early, ...late], NOW)!
    expect(dates(season.cluster)).toEqual(['2026-05-07', '2026-05-02', '2026-04-27'])
    // all three fall inside the window of every target from 17 April to 17 May; 17 May is on the grid
    expect(season.monthDay).toBe('05-17')
  })

  it('counts a scene exactly 20 days from the target day, on either side', () => {
    // 22 Jan and 3 Mar are 20 days either side of 11 Feb; one step away, one of them is 25 days off and no longer counts
    const season = pickSeason([scene('2026-01-22', 5), scene('2026-03-03', 5)], NOW)!
    expect(season.monthDay).toBe('02-11')
    expect(season.cluster).toHaveLength(2)
  })

  it('only ever targets the 5-day grid that counts back from now', () => {
    // Nine scenes centred on 13 Feb, which is not on the grid: 11 Feb and 16 Feb each hold 8, and the later wins
    const centred = every('2026-01-24', '2026-03-05', 5, 5)
    expect(pickSeason(centred, NOW)?.monthDay).toBe('02-16')
  })
})

describe('pickSeason: which scenes count', () => {
  it('has nothing to pick from an empty list', () => {
    expect(pickSeason([], NOW)).toBeNull()
  })

  it('counts 20% cloud and no more, and never a scene without a cloud figure', () => {
    expect(pickSeason([scene('2026-03-01', 20)], NOW)?.cluster).toHaveLength(1)
    expect(pickSeason([scene('2026-03-01', 20.1)], NOW)).toBeNull()
    expect(pickSeason([scene('2026-03-01', null)], NOW)).toBeNull()
  })

  it('counts only a scene that covers the square', () => {
    expect(pickSeason([scene('2026-03-01', 0, false)], NOW)).toBeNull()
  })

  it('looks back 12 months, which is 365 days from the day of now: older and later scenes do not count', () => {
    expect(dates(pickSeason([scene('2025-08-20', 5)], NOW)!.cluster)).toEqual(['2025-08-20']) // 365 days
    expect(pickSeason([scene('2025-08-19', 5)], NOW)).toBeNull() // 366 days
    expect(pickSeason([scene('2026-08-21', 5)], NOW)).toBeNull() // after now
    const old = every('2025-01-10', '2025-02-19', 5, 0) // the clearest stretch, but 18 months ago
    expect(dates(pickSeason([...old, scene('2026-06-01', 15)], NOW)!.cluster)).toEqual(['2026-06-01'])
  })

  it('skips a scene whose date is not a real day instead of throwing', () => {
    expect(pickSeason([scene('2026-02-30', 5)], NOW)).toBeNull()
    expect(dates(pickSeason([scene('2026-02-30', 5), scene('2026-03-01', 5)], NOW)!.cluster)).toEqual([
      '2026-03-01',
    ])
  })

  it('takes what selectPerDate hands over: two tiles of one date count once, a date the square is not inside does not', () => {
    const box = (w: number, s: number, e: number, n: number): LonLat[][] => [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ]
    const AOI = box(79.08, 21.14, 79.09, 21.15)[0]!
    const wide = box(79, 21, 79.2, 21.2)
    const corner = box(79.085, 21, 79.3, 21.3) // starts inside the square, so it covers only part of it
    const tile = (id: string, date: string, cloud: number, footprint: LonLat[][]) =>
      item(date, cloud, { id, footprint })
    const found = selectPerDate(
      [
        tile('wide', '2026-03-03', 12, wide),
        tile('corner', '2026-03-03', 0, corner), // clearer, but it only covers part of the square
        tile('corner-only', '2026-02-26', 0, corner),
        tile('cloudy', '2026-02-21', 25, wide),
      ],
      AOI,
    )
    const season = pickSeason(found, NOW)!
    expect(season.cluster.map((c) => [c.date, c.item.id, c.item.cloudCover])).toEqual([
      ['2026-03-03', 'wide', 12],
    ])
  })
})

describe('yearWindows', () => {
  it('gives one window per year of the span, newest first, 41 days around the same month and day', () => {
    const w = yearWindows('03-15', 2026)
    expect(w).toHaveLength(SPAN_YEARS)
    expect(w.map((x) => x.year)).toEqual([2026, 2025, 2024, 2023, 2022, 2021])
    expect(w[1]).toEqual({ year: 2025, middle: '2025-03-15', from: '2025-02-23', to: '2025-04-04' })
  })

  it('keeps the month and day after February in a leap year, with no drift of a day in the day of the year', () => {
    expect(yearWindows('03-15', 2025).map((x) => x.middle)).toEqual([
      '2025-03-15',
      '2024-03-15',
      '2023-03-15',
      '2022-03-15',
      '2021-03-15',
      '2020-03-15',
    ])
  })

  it('counts 29 February as 28 February in the years that have no 29 February', () => {
    const w = yearWindows('02-29', 2024)
    expect(w.map((x) => x.middle)).toEqual([
      '2024-02-29',
      '2023-02-28',
      '2022-02-28',
      '2021-02-28',
      '2020-02-29', // a leap year again
      '2019-02-28',
    ])
    expect(w[0]).toEqual({ year: 2024, middle: '2024-02-29', from: '2024-02-09', to: '2024-03-20' })
    expect(w[1]).toEqual({ year: 2023, middle: '2023-02-28', from: '2023-02-08', to: '2023-03-20' })
  })

  it('keeps 28 February as 28 February in a leap year', () => {
    expect(yearWindows('02-28', 2025).map((x) => x.middle)).toContain('2024-02-28')
  })

  it('gives a window that crosses 1 January to the year of its middle day', () => {
    const w = yearWindows('12-31', 2025)
    expect(w[0]).toEqual({ year: 2025, middle: '2025-12-31', from: '2025-12-11', to: '2026-01-20' })
    expect(w[1]).toEqual({ year: 2024, middle: '2024-12-31', from: '2024-12-11', to: '2025-01-20' })
    expect(w.every((x) => x.to.startsWith(String(x.year + 1)))).toBe(true)
    // a middle day just after 1 January: the window starts in the year before and still belongs to the later year
    expect(yearWindows('01-05', 2026)[0]).toEqual({
      year: 2026,
      middle: '2026-01-05',
      from: '2025-12-16',
      to: '2026-01-25',
    })
  })

  it('never lets two windows overlap, so a picture belongs to one year only', () => {
    for (const md of ['12-31', '01-05', '02-29', '06-15']) {
      const w = yearWindows(md, 2026)
      for (let i = 1; i < w.length; i++) expect(w[i]!.to < w[i - 1]!.from).toBe(true)
    }
  })

  it('has no window for a month and day that is not one', () => {
    expect(yearWindows('13-45', 2026)).toEqual([])
    expect(yearWindows('02-30', 2026)).toEqual([])
    expect(yearWindows('nonsense', 2026)).toEqual([])
  })

  it('follows a leap day picked by pickSeason, and a pick across New Year', () => {
    // 29 February 2024 is 5 days before this now, so it is on the grid, and it is the latest target day that holds all 6 scenes
    const leap = pickSeason(every('2024-02-09', '2024-03-05', 5, 4), new Date('2024-03-05T12:00:00Z'))!
    expect(leap.monthDay).toBe('02-29')
    expect(leap.windows.map((w) => w.middle)).toEqual([
      '2024-02-29',
      '2023-02-28',
      '2022-02-28',
      '2021-02-28',
      '2020-02-29',
      '2019-02-28',
    ])
    // nine scenes from 11 December to 20 January: the picture of 20 January 2026 sits in the slot of 2025
    const newYear = pickSeason(every('2025-12-11', '2026-01-20', 5, 4), new Date('2026-01-30T12:00:00Z'))!
    expect(newYear.monthDay).toBe('12-31')
    expect(newYear.windows.map((w) => w.year)).toEqual([2025, 2024, 2023, 2022, 2021, 2020])
    expect(newYear.windows[0]).toMatchObject({ from: '2025-12-11', to: '2026-01-20' })
    expect(newYear.cluster[0]!.date).toBe('2026-01-20')
  })
})

describe('rankYear', () => {
  const W = yearWindows('02-11', 2025)[0]! // 22 Jan to 3 Mar 2025, middle 11 Feb
  const ranked = (...xs: DateCandidate[]) => dates(rankYear(xs, W))

  it('puts the least cloud first, then the nearest the target day, then the later date', () => {
    expect(
      ranked(
        scene('2025-02-01', 10), // 10 days off
        scene('2025-02-20', 10), // 9 days off
        scene('2025-02-10', 30),
        scene('2025-01-30', 3),
        scene('2025-02-12', 10), // 1 day off
        scene('2025-02-09', 10), // 2 days off, before
        scene('2025-02-13', 10), // 2 days off, after: the later one first
      ),
    ).toEqual([
      '2025-01-30',
      '2025-02-12',
      '2025-02-13',
      '2025-02-09',
      '2025-02-20',
      '2025-02-01',
      '2025-02-10',
    ])
  })

  it('leaves out a scene that does not cover the square, however clear it is', () => {
    expect(ranked(scene('2025-02-10', 0, false), scene('2025-02-11', 40))).toEqual(['2025-02-11'])
  })

  it('never returns a scene from another season or another year, however clear it is', () => {
    expect(
      ranked(
        scene('2025-01-21', 0), // the day before the window
        scene('2025-03-04', 0), // the day after it
        scene('2024-02-11', 0), // the same season of the year before
        scene('2025-08-11', 0), // another season
        scene('2025-01-22', 50), // the first day of the window
        scene('2025-03-03', 60), // the last day of it
      ),
    ).toEqual(['2025-01-22', '2025-03-03'])
  })

  it('sorts a scene without a cloud figure after every scene that has one', () => {
    expect(ranked(scene('2025-02-11', null), scene('2025-02-01', 99))).toEqual(['2025-02-01', '2025-02-11'])
  })

  it('is empty when nothing qualifies, and skips a date that is not a real day', () => {
    expect(ranked()).toEqual([])
    expect(ranked(scene('2025-02-30', 0))).toEqual([])
  })

  it('does not depend on the order it is given, and never changes it', () => {
    const xs = [
      scene('2025-02-01', 10),
      scene('2025-02-20', 10),
      scene('2025-02-10', 30),
      scene('2025-01-30', 3),
    ]
    const want = ranked(...xs)
    expect(ranked(...[...xs].reverse())).toEqual(want)
    expect(dates(rankYear(frozen(xs), W))).toEqual(want)
  })
})

describe('settleYear', () => {
  const a = scene('2025-02-10', 5)
  const b = scene('2025-02-12', 8)
  const checked = (s: DateCandidate, clear: number): Checked => ({ scene: s, clear })

  it('takes the first scene, in the order it is given, that is clear over 80% of the square or more', () => {
    expect(settleYear([checked(a, 0.85), checked(b, 0.99)])).toEqual({ frame: checked(a, 0.85) })
  })

  it('takes the next scene when the first is not clear enough', () => {
    expect(settleYear([checked(a, 0.4), checked(b, 0.9)])).toEqual({ frame: checked(b, 0.9) })
  })

  it('counts exactly 80% as clear and 79% as not', () => {
    expect(settleYear([checked(a, 0.8)])).toEqual({ frame: checked(a, 0.8) })
    expect(settleYear([checked(a, 0.79)])).toEqual({ gap: 'no-clear-picture' })
  })

  it('is a gap labelled no clear picture when no scene is clear enough, and never another scene or season', () => {
    expect(settleYear([checked(a, 0.2), checked(b, 0.7)])).toEqual({ gap: 'no-clear-picture' })
    expect(settleYear([])).toEqual({ gap: 'no-clear-picture' })
  })

  it.each(['timed-out', 'offline'] as const)(
    'keeps the reason %s for a year that was stopped, never "no clear picture"',
    (cut) => {
      expect(settleYear([], cut)).toEqual({ gap: cut })
      expect(settleYear([checked(a, 0.3)], cut)).toEqual({ gap: cut })
    },
  )

  it('keeps a clear frame found before the year was stopped', () => {
    expect(settleYear([checked(a, 0.9)], 'timed-out')).toEqual({ frame: checked(a, 0.9) })
  })

  it('never changes what it is given', () => {
    expect(settleYear(frozen([checked(a, 0.9)]))).toEqual({ frame: checked(a, 0.9) })
  })
})

describe('ageDays', () => {
  it('gives the age in whole days at now, rounded down', () => {
    const s = item('2026-03-03', 5) // 05:30 UTC
    expect(ageDays(s, new Date('2026-08-20T12:00:00Z'))).toBe(170)
    expect(ageDays(s, new Date('2026-08-20T05:29:00Z'))).toBe(169)
  })

  it('is 0 for a scene of the same day, and never negative for one dated after now', () => {
    expect(ageDays(item('2026-08-20', 5), new Date('2026-08-20T12:00:00Z'))).toBe(0)
    expect(ageDays(item('2026-08-22', 5), new Date('2026-08-20T12:00:00Z'))).toBe(0)
  })
})
