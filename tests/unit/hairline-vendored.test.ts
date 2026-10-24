import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STILL } from '../../src/ui/figure/still.ts'

// The figure engine is another author's MIT code, kept as it came and loaded as a lazy script: these tests hold that line.
// The kernel is never edited (a change is a new copy with its new hash), its licence stays beside it, and the still drawing
// that stands in for the engine at tier 0 and under reduced motion holds nothing but plain line art.
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url))
const KERNEL_SHA256 = '47ebec7647174e04e4f59c0305277c2a1dab83a763676946b17fa1694e7952fe'

describe('the vendored hairline kernel', () => {
  it('is byte for byte the kernel that was licence checked', () => {
    expect(createHash('sha256').update(read('src/lib/hairline/kernel.js')).digest('hex')).toBe(KERNEL_SHA256)
  })

  it('keeps the MIT licence text beside it, with its copyright line', () => {
    const text = read('src/lib/hairline/LICENSE').toString('utf8')
    expect(text.startsWith('MIT License')).toBe(true)
    expect(text).toContain('Copyright (c) 2026 Lucas Marques')
    expect(text).toContain('The above copyright notice and this permission notice shall be included in all')
  })
})

describe('the still drawing', () => {
  const tags = [...STILL.matchAll(/<\/?([a-z][a-z0-9]*)/gi)].map((m) => m[1]!.toLowerCase())

  it('is a drawing: groups, paths and dots, and plenty of them', () => {
    expect(tags.length).toBeGreaterThan(40)
    expect(new Set(tags)).toEqual(new Set(['g', 'path', 'circle']))
  })

  it('holds no words, no script, no link and no style of its own', () => {
    expect(STILL).not.toMatch(/<text|<tspan|<script|<style|<a\b|<image|<use|<foreignObject/i)
    expect(STILL).not.toMatch(/\son[a-z]+=|href=|style=|fill=|stroke=|opacity=|filter=|mask=/i)
  })

  it('is plain data: every attribute is a path, a class or a dot', () => {
    const names = new Set([...STILL.matchAll(/\s([a-z-]+)="/gi)].map((m) => m[1]))
    expect([...names].sort()).toEqual(['class', 'cx', 'cy', 'd', 'r'].filter((n) => names.has(n)))
    expect(names.has('d')).toBe(true)
  })
})
