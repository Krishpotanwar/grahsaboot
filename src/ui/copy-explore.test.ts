import { describe, expect, it } from 'vitest'
import { copy } from './copy.ts'
import { explore } from './copy-explore.ts'

/** Every string of the time-lapse screen, the functions called with plain values. */
function everyLine(): string[] {
  const lines: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') lines.push(v)
    else if (typeof v === 'function') {
      const out = (v as (...a: unknown[]) => unknown)('Navi Mumbai airport', 5, '22 Feb 2018', 92, 6, 2018, [
        'a',
      ])
      if (typeof out === 'string') lines.push(out)
      else walk(out)
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(explore)
  return lines
}

describe('the words of the time-lapse screen', () => {
  const lines = everyLine()

  it('has lines to check', () => {
    expect(lines.length).toBeGreaterThan(30)
    expect(lines.every((l) => l.length > 0)).toBe(true)
  })

  it('has no dash used as punctuation: no em dash, no en dash, no spaced hyphen', () => {
    for (const l of lines) {
      expect(l, l).not.toMatch(/[‒-―−]/)
      expect(l, l).not.toMatch(/ - /)
    }
  })

  it('says the plain line for fewer than 3 clear pictures, word for word', () => {
    expect(explore.tooFew).toBe('Not enough clear pictures from the same season to play a time-lapse here.')
  })

  it('says a frame the way the plan words it, and what a pause says', () => {
    expect(explore.frameStatus(3, 5, '15 Oct 2024', 92)).toBe('Frame 3 of 5, 15 Oct 2024, 92% clear')
    expect(explore.paused('Frame 3 of 5, 15 Oct 2024, 92% clear')).toBe(
      'Paused. Frame 3 of 5, 15 Oct 2024, 92% clear',
    )
  })

  it('captions a picture with its date, its satellite read from the scene id, and how clear it is', () => {
    expect(explore.caption('22 Feb 2018', 'S2B_43QBB_20180222_0_L2A', 92)).toBe(
      '22 Feb 2018 · Sentinel-2B · 10 m · 92% clear',
    )
    expect(explore.caption('7 Mar 2025', 'S2A_MSIL2A_20250307T053649_R005_T43QBB_20250307T082113', 100)).toBe(
      '7 Mar 2025 · Sentinel-2A · 10 m · 100% clear',
    )
    expect(explore.caption('1 Jan 2025', 'LC09_L2SP_144047_20250101', 80)).toBe(
      '1 Jan 2025 · Sentinel-2 · 10 m · 80% clear',
    )
    expect(explore.age(1)).toBe('1 day old.')
    expect(explore.age(101)).toBe('101 days old.')
  })

  it('says the size the way the satellite switch does, as a least figure, and the same on every button', () => {
    expect(explore.watch(13)).toBe('Watch it change · about 13 MB or more')
    expect(explore.load(13)).toBe('Load the pictures · about 13 MB or more')
  })

  it('says only what is true before a tap: no satellite pictures are downloaded (the map library may be)', () => {
    expect(explore.waitsForTap).toBe('No satellite pictures are downloaded until you tap Load.')
  })

  it('says what the pictures are for: looking, not evidence, and that a report fingerprints the exact pixels', () => {
    expect(explore.notEvidence).toContain('for looking, not evidence')
    expect(explore.notEvidence).toContain('fingerprints the exact pixels')
  })

  it('credits Sentinel data for the years shown, and names the catalogue', () => {
    expect(explore.credit([2025, 2018])).toBe(
      `${copy.attribution.sentinelYears([2025, 2018])}. Scenes found through the Earth Search catalogue, with Planetary Computer as the fallback.`,
    )
  })

  it('gives every reason a year can be missing, and every way a load can fail, its own words', () => {
    expect(Object.keys(explore.gap).sort()).toEqual(['no-clear-picture', 'offline', 'timed-out'])
    expect(Object.keys(explore.failed).sort()).toEqual(['ALL_CLOUDY', 'FAILED', 'NO_SCENES', 'OFFLINE'])
    expect(new Set(Object.values(explore.gap)).size).toBe(3)
    expect(new Set(Object.values(explore.failed)).size).toBe(4)
    expect(explore.gap['timed-out']).toBe('Could not be loaded in time')
  })

  it('claims nothing of the kind of a verdict: no proof, no certainty, no "nothing changed"', () => {
    for (const l of lines)
      expect(l, l).not.toMatch(/\bproof\b|\bprove|certain|guarantee|confirm|nothing changed|no change/i)
  })
})
