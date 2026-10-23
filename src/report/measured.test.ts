import { describe, expect, it } from 'vitest'
import { CHANGE_CONSTANTS, CHANGE_RECIPE, type ChangeResult } from '../evidence/change.ts'
import { daysApartInYear, measuredText, type MeasuredPicture } from './measured.ts'

const BEFORE: MeasuredPicture = { date: '2018-02-22', clearPct: 92, sunElevation: 41.2 }
const AFTER: MeasuredPicture = { date: '2025-02-20', clearPct: 88, sunElevation: 40.4 }
const GRID = { width: 1024, height: 803 }
const SHIFT = [0, 0, 0] as const
const rest = { recipe: CHANGE_RECIPE, constants: CHANGE_CONSTANTS, clearPixels: 143_491 }

const results: Record<ChangeResult['state'], ChangeResult> = {
  'not-enough-ground': { ...rest, state: 'not-enough-ground' },
  'outline-too-small': { ...rest, state: 'outline-too-small' },
  'most-differs': { ...rest, state: 'most-differs', shift: SHIFT },
  nothing: { ...rest, state: 'nothing', shift: SHIFT },
  changed: { ...rest, state: 'changed', shift: SHIFT, patches: 3, hectares: 12.3 },
}
const STATES = Object.keys(results) as ChangeResult['state'][]
const say = (change: ChangeResult, before = BEFORE, after = AFTER) =>
  measuredText({ change, before, after, grid: GRID })
const changed = (over: Partial<Extract<ChangeResult, { state: 'changed' }>>): ChangeResult => ({
  ...(results.changed as Extract<ChangeResult, { state: 'changed' }>),
  ...over,
})

describe('measuredText: what the rule found, in the order of the ledger (D23, D27)', () => {
  it('says there is not enough clear ground, in the one existing line', () => {
    expect(say(results['not-enough-ground']).findings).toEqual([
      'Not enough clear ground in both pictures to compare.',
    ])
  })
  it('says the outline is too small to hold a changed patch', () => {
    expect(say(results['outline-too-small']).findings).toEqual([
      'This outline holds no area of 0.3 ha that is 30 m across, so the change rule (change-v1) cannot report a changed patch inside it.',
    ])
  })
  it('says most of the area differs, states no area, and sends the reader to the pictures', () => {
    expect(say(results['most-differs']).findings).toEqual([
      'Most of the clear area differs between these two pictures, so the change rule (change-v1) cannot separate a change from a difference in overall brightness or colour. No changed area is stated. Compare the two pictures by eye.',
    ])
  })
  it('says no patch passes, and why a change that small cannot be told from seasons or noise', () => {
    expect(say(results.nothing).findings).toEqual([
      'The change rule (change-v1) found no changed patch of at least 0.3 ha and 30 m across between these two pictures. At 10 m a change this small cannot be told from seasons or noise.',
    ])
  })
  it('gives the figure with the pixels it rests on, ending with the caution, as one paragraph', () => {
    expect(say(results.changed).findings).toEqual([
      'Between 22 Feb 2018 and 20 Feb 2025, the change rule (change-v1) found 3 changed patches of at least 0.3 ha and 30 m across, 12.3 ha in all. It rests on 143,491 pixels that are clear in both pictures. It cannot tell a building from a crop or a season: compare the pictures by eye.',
    ])
  })
  it('reads one patch as "1 changed patch", and still ends with the caution', () => {
    const [one] = say(changed({ patches: 1, hectares: 0.34 })).findings
    expect(one).toContain('found 1 changed patch of at least')
    expect(one).toContain(', 0.3 ha in all.')
    expect(one!.endsWith('compare the pictures by eye.')).toBe(true)
  })
  it('never prints a patch count or a figure for a state that does not have one', () => {
    for (const s of STATES.filter((s) => s !== 'changed'))
      for (const t of say(results[s]).findings) {
        expect(t, s).not.toMatch(/ha in all|changed patches|rests on/)
        expect(t, s).not.toMatch(/\d ha\b[^.]*\bin all/)
      }
  })
  it('prints the caution only with a figure: a patch count never prints without it', () => {
    const caution = 'It cannot tell a building from a crop or a season: compare the pictures by eye.'
    for (const s of STATES)
      expect(say(results[s]).findings.join(' ').includes(caution), s).toBe(s === 'changed')
  })
  it('prints only the sentences of its own state: one paragraph for the rule, whatever the state', () => {
    for (const s of STATES) expect(say(results[s], BEFORE, AFTER).findings, s).toHaveLength(1)
  })
})

describe('measuredText: the numbers and the rule come from the result, never from the template', () => {
  it('prints the area minimum, the width and the pixel size from the constants the result was made with', () => {
    const other = { ...CHANGE_CONSTANTS, areaMinNative: 24, blockNative: 4, nativeM: 20 }
    const out = say({ ...results.nothing, constants: other as never }).findings[0]
    expect(out).toContain('at least 0.96 ha and 80 m across')
    expect(out).toContain('At 20 m a change this small')
    expect(say({ ...results['outline-too-small'], constants: other as never }).findings[0]).toContain(
      'no area of 0.96 ha that is 80 m across',
    )
  })
  it('derives today\'s "0.3 ha" and "30 m" from the constants object', () => {
    const k = CHANGE_CONSTANTS
    const ha = (k.areaMinNative * k.nativeM ** 2) / 10_000
    expect(say(results.nothing).findings[0]).toContain(
      `at least ${ha} ha and ${k.blockNative * k.nativeM} m across`,
    )
  })
  it('names the rule by the tag in the result', () => {
    const v2 = { ...results.nothing, recipe: 'change-v2' } as unknown as ChangeResult
    for (const s of STATES.filter((s) => s !== 'not-enough-ground')) {
      const t = say({ ...results[s], recipe: 'change-v2' } as unknown as ChangeResult).findings[0]
      expect(t, s).toContain('(change-v2)')
      expect(t, s).not.toContain('change-v1')
    }
    expect(say(v2).record).toContain('Rule change-v2,')
  })
  it('rounds the hectares to one decimal and groups the thousands of the pixel count', () => {
    expect(say(changed({ hectares: 12.26 })).findings[0]).toContain(', 12.3 ha in all.')
    expect(say(changed({ hectares: 12.24 })).findings[0]).toContain(', 12.2 ha in all.')
    expect(say(changed({ hectares: 7 })).findings[0]).toContain(', 7.0 ha in all.')
    expect(say(changed({ hectares: 1234.56 })).findings[0]).toContain(', 1,234.6 ha in all.')
    expect(say(changed({ clearPixels: 999 })).findings[0]).toContain('rests on 999 pixels')
    expect(say(changed({ clearPixels: 1_048_576 })).findings[0]).toContain('rests on 1,048,576 pixels')
  })
  it('writes the two dates the way the rest of the report does', () => {
    const [t] = say(
      results.changed,
      { ...BEFORE, date: '2025-01-09' },
      { ...AFTER, date: '2025-12-20' },
    ).findings
    expect(t).toContain('Between 9 Jan 2025 and 20 Dec 2025, the change rule')
  })
})

describe('measuredText: the dates are in different seasons', () => {
  const SEASONS = 'These dates are in different seasons; seasonal change is included.'
  const far = { ...AFTER, date: '2025-12-20' } // 22 Feb against 20 Dec

  it("adds the design's sentence after the figure when the dates are more than 20 days apart in the year", () => {
    const f = say(results.changed, BEFORE, far).findings
    expect(f).toHaveLength(2)
    expect(f[0]).toContain('found 3 changed patches')
    expect(f[1]).toBe(SEASONS)
  })
  it('adds it after the other two sentences of a comparison too: they compared the two pictures as they are', () => {
    for (const s of ['most-differs', 'nothing'] as const) {
      const f = say(results[s], BEFORE, far).findings
      expect(f, s).toHaveLength(2)
      expect(f[1], s).toBe(SEASONS)
    }
  })
  it('adds nothing when no comparison was made: there is nothing for seasonal change to be included in', () => {
    for (const s of ['not-enough-ground', 'outline-too-small'] as const)
      expect(say(results[s], BEFORE, far).findings, s).toHaveLength(1)
  })
  it('draws the line at more than 20 days: 20 days apart is the same season, 21 is not', () => {
    const at = (ymd: string) =>
      say(results.changed, { ...BEFORE, date: '2018-03-01' }, { ...AFTER, date: ymd }).findings
    expect(at('2025-03-21')).toHaveLength(1)
    expect(at('2025-02-09')).toHaveLength(1)
    expect(at('2025-03-22')).toHaveLength(2)
    expect(at('2025-02-08')).toHaveLength(2)
  })
  it('adds nothing for the same season, whichever year', () => {
    for (const s of STATES) expect(say(results[s]).findings.join(' ')).not.toContain('different seasons')
  })
})

describe('daysApartInYear', () => {
  it('is zero for one date in two years, and counts days of the year, not days between', () => {
    expect(daysApartInYear('2018-02-22', '2025-02-22')).toBe(0)
    expect(daysApartInYear('2018-02-22', '2025-02-20')).toBe(2)
    expect(daysApartInYear('2025-02-20', '2018-02-22')).toBe(2)
    expect(daysApartInYear('2025-01-01', '2025-04-01')).toBe(90)
  })
  it('is 20 for 20 days and 21 for 21 days, either side of the line the sentence draws', () => {
    expect(daysApartInYear('2025-03-01', '2025-03-21')).toBe(20)
    expect(daysApartInYear('2025-03-01', '2025-03-22')).toBe(21)
    expect(daysApartInYear('2025-03-01', '2025-02-09')).toBe(20)
    expect(daysApartInYear('2025-03-01', '2025-02-08')).toBe(21)
  })
  it('goes round the end of the year: 28 December and 10 January are 13 days apart', () => {
    expect(daysApartInYear('2024-12-28', '2025-01-10')).toBe(13)
    expect(daysApartInYear('2025-01-01', '2025-12-31')).toBe(1)
    expect(daysApartInYear('2025-12-20', '2025-01-05')).toBe(16)
  })
  it('is never more than half a year, 182 days', () => {
    expect(daysApartInYear('2025-01-01', '2025-07-02')).toBe(182)
    expect(daysApartInYear('2025-01-01', '2025-07-03')).toBe(182)
  })
  it('counts 29 February as 28 February, so a leap year does not move a date by a day', () => {
    expect(daysApartInYear('2024-02-29', '2025-02-28')).toBe(0)
    expect(daysApartInYear('2024-03-01', '2025-03-01')).toBe(0)
    expect(daysApartInYear('2024-12-31', '2025-12-31')).toBe(0)
  })
  it('is null when either text is not a real day, rather than a number from a rolled-over date', () => {
    for (const bad of ['2025-02-30', '2025-13-01', '2025-12-30junk', 'zzzz', '']) {
      expect(daysApartInYear(bad, '2025-03-01'), bad).toBeNull()
      expect(daysApartInYear('2025-03-01', bad), bad).toBeNull()
    }
  })
  it('adds no seasons sentence for a date it cannot read', () => {
    expect(say(results.changed, BEFORE, { ...AFTER, date: '2025-02-30' }).findings).toHaveLength(1)
  })
})

describe('measuredText: the two pictures (dates, clear view, sun height)', () => {
  it('gives one sentence per picture: the date, the clear view and the sun height', () => {
    expect(say(results.changed).pictures).toEqual([
      'Before, 22 Feb 2018: 92% clear view, sun 41° above the horizon.',
      'After, 20 Feb 2025: 88% clear view, sun 40° above the horizon.',
    ])
  })
  it('leaves the sun out when the catalogue has none, and says no more than it knows', () => {
    expect(say(results.changed, { ...BEFORE, sunElevation: null }).pictures[0]).toBe(
      'Before, 22 Feb 2018: 92% clear view.',
    )
  })
  it('never prints a clear view for a picture with no check result (no 0%)', () => {
    const [, second] = say(results.changed, BEFORE, { ...AFTER, clearPct: null }).pictures
    expect(second).toBe('After, 20 Feb 2025: sun 40° above the horizon.')
    expect(second).not.toMatch(/%/)
  })
  it('gives the date alone when it has neither', () => {
    expect(say(results.changed, BEFORE, { ...AFTER, clearPct: null, sunElevation: null }).pictures[1]).toBe(
      'After, 20 Feb 2025.',
    )
  })
  it('rounds the sun to a whole degree, and keeps a sun at the horizon', () => {
    const sun = (e: number) => say(results.changed, { ...BEFORE, sunElevation: e }).pictures[0]
    expect(sun(41.4)).toContain('sun 41° above')
    expect(sun(41.5)).toContain('sun 42° above')
    expect(sun(0)).toContain('sun 0° above')
  })
  it('is the same for every state: what was compared does not depend on what was found', () => {
    for (const s of STATES) expect(say(results[s]).pictures).toEqual(say(results.changed).pictures)
  })
})

describe('measuredText: it says it is computed, not seen, and records how to run it again', () => {
  it('leads with where the figures come from', () => {
    const { lead } = say(results.changed)
    expect(lead).toBe(
      'Computed from the pixels of the two pinned pictures by a fixed rule, not seen by a person. The rule, the grid and its settings are recorded below, so it can be run again from the hashed source pixels.',
    )
  })
  it('records the rule, the grid recipe and size, and every setting, beside the number', () => {
    expect(say(results.changed).record).toBe(
      'Rule change-v1, grid display-v1, 1024 × 803 pixels. Settings: bandThreshold 38, shiftLimit 38, passes 3, areaMinNative 30, blockNative 3, nativeM 10, clearShare 0.5, flaggedShare 0.5, rawShare 0.5.',
    )
  })
  it('lists every constant of the object it was handed, with its value, whatever the object holds', () => {
    const more = { ...CHANGE_CONSTANTS, newSetting: 7 }
    const { record } = say({ ...results.nothing, constants: more as never })
    for (const [k, v] of Object.entries(more)) expect(record).toContain(`${k} ${v}`)
  })
  it('leaves the size out when the grid is not known, and still names the grid recipe', () => {
    // not through `say`, which always passes the grid
    const { record } = measuredText({ change: results.changed, before: BEFORE, after: AFTER })
    expect(record).toContain('Rule change-v1, grid display-v1. Settings:')
  })
  it('records the rule in every state: the rule ran in all five', () => {
    for (const s of STATES) expect(say(results[s]).record, s).toContain('Rule change-v1, grid display-v1')
  })
})

describe('measuredText: no verdict', () => {
  const all = (s: ChangeResult['state']) => {
    const m = say(results[s], BEFORE, { ...AFTER, date: '2025-12-20' })
    return [m.lead, ...m.pictures, ...m.findings, m.record].join('\n')
  }
  it('never prints "Nothing you can claim here." nor the whole words "no change", in any state', () => {
    for (const s of STATES) {
      expect(all(s), s).not.toContain('Nothing you can claim')
      expect(all(s), s).not.toMatch(/\bno change\b/i)
    }
  })
  it('keeps "no changed patch", which is a different word, for the state that has no patch', () => {
    expect(all('nothing')).toContain('found no changed patch')
  })
})
