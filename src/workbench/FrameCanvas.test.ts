// FrameCanvas rendered to a string (no DOM): the class of the "Sharper" viewing aid, and the filter that class points at.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FrameCanvas, SharperFilter } from './FrameCanvas.tsx'

const canvas = (over: Record<string, unknown> = {}) =>
  renderToString(
    createElement(FrameCanvas, {
      rgba: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
      label: 'Photo',
      ...over,
    }),
  )
const FILTER_CLASS = /\[filter:url\(#([\w-]+)\)\]/
const attr = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]!)

describe('FrameCanvas', () => {
  it('draws the picture as it is, with no filter, unless asked to', () => {
    expect(canvas()).not.toContain('filter')
    expect(canvas({ sharper: false })).not.toContain('filter')
  })

  it('adds the filter class when sharper, and keeps the classes it was given', () => {
    const html = canvas({ sharper: true, className: 'h-[52px] w-[52px] object-cover' })
    expect(html).toMatch(FILTER_CLASS)
    expect(html).toContain('block h-[52px] w-[52px] object-cover ')
    expect(canvas({ sharper: true })).toContain('block h-auto w-full ')
  })

  it('never turns on crisp squares: the display grid is 3 to 4 times the 10 m pixels, so they would be stair-steps', () => {
    expect(canvas({ sharper: true })).not.toContain('pixelated')
    expect(canvas({ sharper: true })).not.toContain('image-rendering')
  })
})

describe('SharperFilter', () => {
  const html = renderToString(createElement(SharperFilter))

  it('defines the filter that the class points at', () => {
    const id = FILTER_CLASS.exec(canvas({ sharper: true }))![1]!
    expect(html).toContain(`<filter id="${id}"`)
    expect(html.match(/<filter /g)).toHaveLength(1)
  })

  it('is hidden from assistive technology and takes no room', () => {
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
    expect(attr(html, 'width')).toEqual(['0'])
    expect(attr(html, 'height')).toEqual(['0'])
    expect(html).toMatch(/class="absolute"/)
  })

  it('is an unsharp mask and then one fixed stretch, worked in sRGB', () => {
    expect(html).toContain('color-interpolation-filters="sRGB"')
    expect(html).toContain('<feGaussianBlur')
    expect(html).toContain('operator="arithmetic"')
    expect(html).toContain('<feComponentTransfer')
  })

  it('keeps the average brightness of the unsharp mask and does not tint: its weights add up to 1 and the three channels agree', () => {
    const [k2, k3] = [attr(html, 'k2'), attr(html, 'k3')].map((v) => Number(v[0]))
    expect(k2! + k3!).toBeCloseTo(1, 10)
    expect(k2).toBeGreaterThan(1) // it does sharpen: the picture is added to its own contrast
    const slopes = attr(html, 'slope')
    const intercepts = attr(html, 'intercept')
    expect(slopes).toHaveLength(3)
    expect(new Set(slopes).size).toBe(1)
    expect(new Set(intercepts).size).toBe(1)
    expect(Number(slopes[0])).toBeGreaterThan(1) // a stretch, not a squeeze
    expect(Number(slopes[0])).toBeLessThanOrEqual(1.3) // a light one
  })

  it('has no number that depends on the picture: the same markup every time', () => {
    expect(renderToString(createElement(SharperFilter))).toBe(html)
  })
})
