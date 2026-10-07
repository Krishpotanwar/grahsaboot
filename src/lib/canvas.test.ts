import { describe, expect, it } from 'vitest'
import { rgbToRgba } from './canvas.ts'

describe('rgbToRgba', () => {
  it('keeps the colour of every pixel and makes only the all-zero no-data pixels transparent', () => {
    const rgb = new Uint8Array([10, 20, 30, 0, 0, 0, 0, 0, 1])
    expect(Array.from(rgbToRgba(rgb, 3, 1))).toEqual([10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 1, 255])
  })
})
