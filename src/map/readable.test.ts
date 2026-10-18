import type { Map as MlMap } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import positron from '../../tests/fixtures/styles/positron.json'
import dark from '../../tests/fixtures/styles/dark.json'
import type { Theme } from '../ui/theme.ts'
import { applyReadable, BUILDING_OUTLINE, EXTRUSION, MIN_LINE_CONTRAST, READABLE } from './readable.ts'

// The two OpenFreeMap styles as they were on 2026-10-18 (vendored: the check must not depend on the network). When the live styles
// move, `npx tsx scripts/probe-e/style-diff.mts` says so and these files are refreshed.
interface Layer {
  id: string
  type: string
  source?: string
  paint?: Record<string, unknown>
}
const STYLES: Record<Theme, { layers: Layer[] }> = { dark, light: positron } as never

// --- colours: only what the contrast checks need (hex, rgb(), rgba(), hsl(), hsla()) ---
type Rgba = [number, number, number, number]
function parse(c: string): Rgba {
  const s = c.trim()
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (m) {
    const h = m[1]!.length === 3 ? [...m[1]!].map((x) => x + x).join('') : m[1]!
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba
  }
  m = /^rgba?\(([^)]*)\)$/i.exec(s)
  if (m) {
    const p = m[1]!.split(',').map((x) => parseFloat(x))
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
  }
  m = /^hsla?\(([^)]*)\)$/i.exec(s)
  if (m) {
    const p = m[1]!.split(',').map((x) => parseFloat(x))
    const [h, sat, l] = [p[0]! / 360, p[1]! / 100, p[2]! / 100]
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
    const k = 2 * l - q
    const f = (t: number) => {
      const u = (t + 1) % 1
      return u < 1 / 6 ? k + (q - k) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? k + (q - k) * (2 / 3 - u) * 6 : k
    }
    return sat === 0
      ? [l * 255, l * 255, l * 255, p[3] ?? 1]
      : [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, p[3] ?? 1]
  }
  throw new Error(`cannot read the colour ${c}`)
}
const over = (c: Rgba, bg: Rgba): Rgba => [
  c[0] * c[3] + bg[0] * (1 - c[3]),
  c[1] * c[3] + bg[1] * (1 - c[3]),
  c[2] * c[3] + bg[2] * (1 - c[3]),
  1,
]
const lum = ([r, g, b]: Rgba) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** The style as the page has it once the patch is applied: layer paint, with our table laid over it. */
function patched(theme: Theme) {
  const layers = STYLES[theme].layers.map((l) => ({ ...l, paint: { ...l.paint, ...READABLE[theme][l.id] } }))
  const bg = parse(layers.find((l) => l.type === 'background')!.paint['background-color'] as string)
  return { layers, bg }
}
const str = (v: unknown): v is string => typeof v === 'string'

// Roads and railways whose line is what the eye follows (the `_inner` fills and `_dashline` gaps are the road's body, by design).
const ROAD_LINE =
  /^(highway_(path|minor|major_casing|major_subtle|motorway_casing|motorway_subtle|motorway_bridge_casing)|aeroway-(taxiway|runway-casing)|tunnel_motorway_casing|railway(_transit|_service|_minor)?)$/

for (const theme of ['dark', 'light'] as const) {
  describe(`the readable map, ${theme}`, () => {
    it('only patches layers the vendored style has (an upstream rename fails here, loudly)', () => {
      const ids = new Set(STYLES[theme].layers.map((l) => l.id))
      for (const id of Object.keys(READABLE[theme])) expect(ids.has(id), id).toBe(true)
    })

    it(`draws every road and railway line at ${MIN_LINE_CONTRAST[theme]}:1 or more against the background`, () => {
      const { layers, bg } = patched(theme)
      const roads = layers.filter((l) => l.type === 'line' && ROAD_LINE.test(l.id))
      expect(roads.length).toBeGreaterThan(5)
      for (const l of roads) {
        const c = l.paint['line-color']
        if (!str(c)) continue // an expression (motorway fills by zoom): not a line the table patches
        expect(contrast(over(parse(c), bg), bg), l.id).toBeGreaterThanOrEqual(MIN_LINE_CONTRAST[theme])
      }
    })

    it('outlines buildings at the same contrast, and the 3D buildings of tier 3 too', () => {
      const { bg } = patched(theme)
      expect(contrast(parse(BUILDING_OUTLINE[theme]), bg)).toBeGreaterThanOrEqual(MIN_LINE_CONTRAST[theme])
      expect(contrast(parse(EXTRUSION[theme]), bg)).toBeGreaterThanOrEqual(MIN_LINE_CONTRAST[theme])
      const fill = patched(theme).layers.find((l) => l.id === 'building')!.paint['fill-outline-color']
      if (theme === 'dark') expect(contrast(parse(fill as string), bg)).toBeGreaterThanOrEqual(3)
    })

    it('reads every label at 4.5:1 or more against its halo (or against the ground when it has none)', () => {
      const { layers, bg } = patched(theme)
      const labels = layers.filter((l) => l.type === 'symbol' && str(l.paint['text-color']))
      expect(labels.length).toBeGreaterThan(8)
      for (const l of labels) {
        const halo = l.paint['text-halo-color']
        const behind = str(halo) ? over(parse(halo), bg) : bg
        const text = over(parse(l.paint['text-color'] as string), behind)
        expect(contrast(text, behind), l.id).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('leaves a layer that is not in the table as the style has it', () => {
      const own = STYLES[theme].layers.find((l) => l.type === 'line' && !(l.id in READABLE[theme]))!
      const { layers } = patched(theme)
      expect(layers.find((l) => l.id === own.id)!.paint).toEqual({ ...own.paint })
    })
  })
}

describe('the dark map separates its ground from the background', () => {
  it('shows water, woods, parks and built-up land as different from the background', () => {
    const { layers, bg } = patched('dark')
    for (const id of ['water', 'landcover_wood', 'landuse_park', 'landuse_residential']) {
      const c = layers.find((l) => l.id === id)!.paint['fill-color']
      expect(contrast(parse(c as string), bg), id).toBeGreaterThanOrEqual(1.1)
    }
  })
})

// --- applyReadable on a map that only remembers what it is asked ---
function fakeMap(layerIds: string[], opts: { extrusion?: boolean; openmaptiles?: boolean } = {}) {
  const painted: Array<[string, string, unknown]> = []
  const added: Array<{ id: string; before?: string }> = []
  const layers: Array<{ id: string; type: string }> = layerIds.map((id) => ({
    id,
    type: id.startsWith('label') ? 'symbol' : opts.extrusion && id === 'x' ? 'fill-extrusion' : 'line',
  }))
  const map = {
    getLayer: (id: string) => (layers.some((l) => l.id === id) ? { id } : undefined),
    setPaintProperty: (id: string, p: string, v: unknown) => void painted.push([id, p, v]),
    getStyle: () => ({ layers }),
    getSource: (id: string) => (id === 'openmaptiles' && opts.openmaptiles !== false ? {} : undefined),
    addLayer: (l: { id: string; type: string }, before?: string) => {
      added.push({ id: l.id, before })
      layers.push({ id: l.id, type: l.type })
    },
  }
  return { map: map as unknown as MlMap, painted, added }
}

describe('applyReadable', () => {
  it('patches the layers the style has, skips the others without a word, and applies twice to the same effect', () => {
    const m = fakeMap(['highway_minor', 'something_new', 'label_a'])
    applyReadable(m.map, 'dark')
    expect(m.painted).toEqual([['highway_minor', 'line-color', '#686868']])
    const again = fakeMap(['highway_minor'])
    applyReadable(again.map, 'dark')
    applyReadable(again.map, 'dark')
    expect(again.painted).toEqual([
      ['highway_minor', 'line-color', '#686868'],
      ['highway_minor', 'line-color', '#686868'],
    ])
    expect(again.added.map((a) => a.id)).toEqual(['gs-building-outline']) // once, not twice
  })

  it('adds the building outline under the first label, once, and not where the style has 3D buildings', () => {
    const m = fakeMap(['highway_minor', 'label_a'])
    applyReadable(m.map, 'dark')
    expect(m.added).toEqual([{ id: 'gs-building-outline', before: 'label_a' }])
    const solid = fakeMap(['x', 'label_a'], { extrusion: true })
    applyReadable(solid.map, 'dark')
    expect(solid.added).toEqual([])
    const none = fakeMap(['highway_minor'], { openmaptiles: false })
    applyReadable(none.map, 'dark')
    expect(none.added).toEqual([])
  })
})
