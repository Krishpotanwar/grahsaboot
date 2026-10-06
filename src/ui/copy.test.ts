import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy, issueMessage } from './copy.ts'

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
