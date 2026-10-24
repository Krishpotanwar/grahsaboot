import { describe, expect, it, vi } from 'vitest'
import { figureMode, runFigure, type FigureDef } from './run.ts'

const handle = () => ({ set: vi.fn(), destroy: vi.fn() })
const def = (h = handle()) =>
  ({ name: 'x', range: [0, 40, 90], mount: vi.fn(() => h) }) as const satisfies FigureDef
const place = () => {
  const calls: string[] = []
  const svg = { replaceChildren: vi.fn(() => calls.push('clear')) } as unknown as SVGSVGElement
  return { stage: {} as Element, svg, calls }
}
const later = () => {
  let resolve!: (f: FigureDef) => void
  let reject!: (e: unknown) => void
  const load = vi.fn(() => new Promise<FigureDef>((res, rej) => ((resolve = res), (reject = rej))))
  return { load, resolve: (f: FigureDef) => resolve(f), reject: (e: unknown) => reject(e) }
}
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('figureMode', () => {
  it('is a still drawing at tier 0, where no engine is wanted', () => {
    expect(figureMode({ engine: false, reduced: false })).toBe('still')
  })
  it('is a still drawing for a person who asked for less motion, whatever the tier', () => {
    expect(figureMode({ engine: true, reduced: true })).toBe('still')
    expect(figureMode({ engine: false, reduced: true })).toBe('still')
  })
  it('is live only when the device can run the engine and motion is welcome', () => {
    expect(figureMode({ engine: true, reduced: false })).toBe('live')
  })
})

describe('runFigure', () => {
  it('clears the still drawing, then mounts the loaded figure at the middle of its range, with a read-out that holds no page element', async () => {
    const { stage, svg, calls } = place()
    const f = def()
    f.mount.mockImplementation(() => (calls.push('mount'), handle()))
    runFigure({ stage, svg, load: async () => f, onLive: () => calls.push('live'), onError: vi.fn() })
    await settle()
    expect(calls).toEqual(['clear', 'mount', 'live'])
    const [env, value] = f.mount.mock.calls[0] as unknown as [
      { stage: Element; svg: SVGSVGElement; read: { textContent: string | null } },
      number,
    ]
    expect(env.stage).toBe(stage)
    expect(env.svg).toBe(svg)
    expect(value).toBe(40)
    env.read.textContent = '03' // the figure writes its read-out; nothing shows it
    expect(env.read.textContent).toBe('03')
  })

  it('ends the figure when the page ends it, once, however often the end is called', async () => {
    const h = handle()
    const end = runFigure({ ...place(), load: async () => def(h), onError: vi.fn() })
    await settle()
    expect(h.destroy).not.toHaveBeenCalled()
    end()
    end()
    expect(h.destroy).toHaveBeenCalledTimes(1)
  })

  it('never mounts a figure that arrives after the page has gone', async () => {
    const { stage, svg } = place()
    const l = later()
    const f = def()
    const end = runFigure({ stage, svg, load: l.load, onError: vi.fn() })
    end() // the page left before the chunk came
    l.resolve(f)
    await settle()
    expect(f.mount).not.toHaveBeenCalled()
    expect(svg.replaceChildren).not.toHaveBeenCalled() // the still drawing was never touched
  })

  it('leaves the still drawing alone and says so once when the figure cannot be loaded', async () => {
    const { stage, svg } = place()
    const onError = vi.fn()
    const boom = new Error('chunk failed')
    const end = runFigure({ stage, svg, load: async () => Promise.reject(boom), onError })
    await settle()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(svg.replaceChildren).not.toHaveBeenCalled()
    expect(end).not.toThrow()
  })

  it('says so, and ends nothing it never started, when the figure fails to mount', async () => {
    const onError = vi.fn()
    const f = def()
    const boom = new Error('mount failed')
    f.mount.mockImplementation(() => {
      throw boom
    })
    const end = runFigure({ ...place(), load: async () => f, onError })
    await settle()
    expect(onError).toHaveBeenCalledWith(boom)
    expect(end).not.toThrow()
  })
})
