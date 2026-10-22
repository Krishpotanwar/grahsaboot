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
/** Every opening tag of one element, so the one that matters can be read by its own attributes. */
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
const num = (tag: string, name: string) => Number(attr(tag, name)[0])

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

  it('works in sRGB: an unsharp mask that counts only inside the picture, mixed over the bare picture, then one fixed stretch', () => {
    expect(html).toContain('color-interpolation-filters="sRGB"')
    // A transparent neighbour counts as black in a premultiplied blur, so the outermost pixels of the picture and of every no-data
    // hole were lifted by up to 57 of 255 levels over their first device pixels (measured at pixel ratio 2). The unsharp mask is
    // therefore weighed by how much of the blur's neighbourhood is picture (the blur's own opacity, read through a table): zero at an
    // edge or a hole, one inside, and mixed over the bare picture. Measured, nothing moves by more than 2 levels.
    const steps = [
      '<feGaussianBlur',
      'operator="arithmetic"',
      'type="table"',
      'operator="in"',
      'operator="over"',
      'type="linear"',
    ]
    const at = steps.map((step) => html.indexOf(step))
    expect(at.every((i) => i > -1)).toBe(true)
    expect(at).toEqual([...at].sort((a, b) => a - b))
    expect(html).not.toContain('<feMorphology') // a dilate fixes it too, at 4 to 10 times the cost on a machine without a GPU
    expect(tags(html, 'feGaussianBlur')[0]).toContain('in="SourceGraphic"')
    const [sharp, sharpInside, over] = tags(html, 'feComposite')
    expect(sharp).toContain('in2="soft"')
    expect(sharpInside).toContain('in="sharp"')
    expect(sharpInside).toContain('in2="inside"') // the table's output, made from the blur's opacity
    expect(over).toContain('in="sharpInside"')
    expect(over).toContain('in2="SourceGraphic"') // over the bare picture
    expect(tags(html, 'feComponentTransfer')[0]).toContain('in="soft"')
  })

  it('pins the numbers that were measured: change one and the clipping and the edges have to be measured again', () => {
    expect(num(tags(html, 'feGaussianBlur')[0]!, 'stdDeviation')).toBe(1.1)
    expect(num(tags(html, 'feComposite')[0]!, 'k2')).toBe(1.7)
    expect(num(tags(html, 'feComposite')[0]!, 'k3')).toBe(-0.7)
    expect(attr(html, 'tableValues')).toEqual([`${'0 '.repeat(20)}1`]) // 21 knots 0.05 apart: 0 up to an opacity of 0.95, 1 at 1
    expect(attr(html, 'slope')).toEqual(['1.1', '1.1', '1.1'])
    expect(attr(html, 'intercept')).toEqual(['-0.045', '-0.045', '-0.045'])
  })

  it('is a light sharpen that keeps the average brightness and saturates only the extreme tones', () => {
    const mix = tags(html, 'feComposite')[0]!
    const [k2, k3] = [num(mix, 'k2'), num(mix, 'k3')]
    const sigma = num(tags(html, 'feGaussianBlur')[0]!, 'stdDeviation')
    const [slope, intercept] = [Number(attr(html, 'slope')[0]), Number(attr(html, 'intercept')[0])]
    expect(k2 + k3).toBeCloseTo(1, 10) // the two weights add up to 1: a flat area is left as it is
    expect(k2 - 1).toBeLessThanOrEqual(0.7) // the picture plus at most 0.7 of what it has over its blur
    expect(sigma).toBeLessThanOrEqual(1.5) // a blur of about a pixel, not of four
    // Only tones at or above 0.95 (242 of 255) and at or below 0.041 (10 of 255) reach white or black. On the worked example that
    // clips at most 0.74% of the picture's pixels with the aid on (0.05 to 0.08% without); with 0.858 it was 1.9%.
    expect(slope).toBeGreaterThan(1)
    expect((1 - intercept) / slope).toBeGreaterThanOrEqual(0.95 - 1e-9)
    expect(-intercept / slope).toBeLessThanOrEqual(0.0411)
  })

  it('lifts no edge by more than 4 of 255 levels, whatever the tone', () => {
    // Beside a transparent neighbour the blur's opacity is w < 1 and the premultiplied mix lifts the tone by (k2 - 1) * (1 - w) of
    // itself; the table weighs that by t(w). The worst tone is white, then the stretch's slope.
    const knots = attr(html, 'tableValues')[0]!.split(' ').map(Number)
    const t = (w: number) => {
      const x = w * (knots.length - 1)
      const i = Math.min(Math.floor(x), knots.length - 2)
      return knots[i]! + (knots[i + 1]! - knots[i]!) * (x - i)
    }
    const k2 = num(tags(html, 'feComposite')[0]!, 'k2')
    const slope = Number(attr(html, 'slope')[0])
    let worst = 0
    for (let w = 0; w <= 1; w += 0.001) worst = Math.max(worst, (k2 - 1) * t(w) * (1 - w) * slope)
    expect(worst * 255).toBeLessThanOrEqual(4)
    expect(t(1)).toBe(1) // and inside the picture the unsharp mask counts in full
    expect(t(0.5)).toBe(0) // and at an edge (an opacity of about a half) not at all
  })

  it('does not tint: the three channels get the same stretch', () => {
    expect(new Set(attr(html, 'slope')).size).toBe(1)
    expect(new Set(attr(html, 'intercept')).size).toBe(1)
    expect(attr(html, 'slope')).toHaveLength(3)
  })

  it('has no number that depends on the picture: the same markup every time', () => {
    expect(renderToString(createElement(SharperFilter))).toBe(html)
  })
})
