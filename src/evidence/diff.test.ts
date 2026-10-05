import { describe, expect, it } from 'vitest'
import { brightnessDiff } from './diff.ts'

const px = (...v: number[]) => Uint8ClampedArray.from(v)

describe('brightnessDiff', () => {
  it('is transparent for identical frames', () => {
    const a = px(10, 20, 30, 255, 200, 200, 200, 255)
    expect([...brightnessDiff(a, a)].filter((_, i) => i % 4 === 3)).toEqual([0, 0])
  })
  it('is opaque accent for black vs white', () => {
    const out = brightnessDiff(px(0, 0, 0, 255), px(255, 255, 255, 255))
    expect([...out]).toEqual([228, 132, 68, 255])
  })
  it('masks invalid pixels and transparent inputs', () => {
    const a = px(0, 0, 0, 255, 0, 0, 0, 0)
    const b = px(255, 255, 255, 255, 255, 255, 255, 255)
    expect(brightnessDiff(a, b, Uint8Array.from([1, 0]))[3]).toBe(0)
    expect(brightnessDiff(a, b)[7]).toBe(0)
  })
})
