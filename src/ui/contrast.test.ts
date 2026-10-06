import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, readThemeTokens } from './contrast.ts'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const tokens = readThemeTokens(css)

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#f4f4f5', '#09090b')).toBeCloseTo(18.1, 1)
  })
})

describe('readThemeTokens', () => {
  it('reads the theme blocks, not the @media print override that reuses their selectors', () => {
    expect(tokens.light.panel).toBe('#fafafa')
    expect(tokens.light['fg-3']).toBe('#71717a')
  })
})

describe.each(['dark', 'light'] as const)('%s theme tokens', (theme) => {
  const t = tokens[theme]
  it('defines every token', () => {
    for (const k of [
      'bg',
      'panel',
      'line',
      'control',
      'fg',
      'fg-2',
      'fg-3',
      'accent',
      'on-accent',
      'bad',
      'ok',
      'warn',
      'info',
    ])
      expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it.each([
    ['fg', 'bg', 4.5],
    ['fg', 'panel', 4.5],
    ['fg-2', 'bg', 4.5],
    ['fg-2', 'panel', 4.5],
    ['fg-3', 'bg', 4.5],
    ['fg-3', 'panel', 4.5],
    ['accent', 'bg', 4.5],
    ['accent', 'panel', 4.5],
    ['on-accent', 'accent', 4.5],
    ['bad', 'bg', 4.5],
    ['ok', 'bg', 4.5],
    ['warn', 'bg', 4.5],
    ['info', 'bg', 4.5],
    ['control', 'bg', 3],
    ['control', 'panel', 3],
  ] as const)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrastRatio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min)
  })
})
