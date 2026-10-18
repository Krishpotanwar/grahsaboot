import type { Map as MlMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dark from '../../tests/fixtures/styles/dark.json'
import positron from '../../tests/fixtures/styles/positron.json'
import type { ContextImage } from '../context/load.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { Theme } from '../ui/theme.ts'
import { removeContextLayer, setContextLayer } from './contextLayer.ts'
import { applyBaseLayers } from './createMap.ts'

// The two OpenFreeMap styles as they were on 2026-10-18 (vendored, see readable.test.ts).
interface StyleLayer {
  id: string
  type: string
  'source-layer'?: string
}
interface Style {
  sources: Record<string, unknown>
  layers: StyleLayer[]
}
const STYLES: Record<Theme, Style> = { dark, light: positron } as never

const grid = makeDisplayGrid([79.0832, 21.1408, 79.1032, 21.1508], 8, 0) // wider than tall: a swapped width and height shows
const picture = (fill: number): ContextImage => ({
  rgba: new Uint8ClampedArray(grid.width * grid.height * 4).fill(fill),
  grid,
  sceneId: 'S2B_43QBB_20251101_0_L2A',
  date: '2025-11-01',
  ageDays: 12,
  clearPct: 91,
  cloudy: false,
  widened: false,
})

// ImageData is a browser class: the fake map keeps what it is handed, so a plain class stands for it.
class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}
beforeEach(() => vi.stubGlobal('ImageData', FakeImageData))
afterEach(() => vi.unstubAllGlobals())

interface Update {
  image: FakeImageData
  coordinates: unknown
}
interface Spec {
  id: string
  type: string
  source?: string
  paint?: Record<string, unknown>
}

// A map that only remembers its layers, in order, and the sources it is given, so no WebGL is needed. It is complete enough to
// run the real applyBaseLayers on a vendored style, so the order checked below is the one the page has.
function fakeMap(style: { sources: Record<string, unknown>; layers: Array<{ id: string; type: string }> }) {
  const layers = style.layers.map(({ id, type }) => ({ id, type }))
  const specs = new Map<string, Spec>()
  const sources = new Map<string, { spec: unknown; updates: Update[]; updateImage(o: Update): void }>(
    Object.keys(style.sources).map((id) => [id, { spec: {}, updates: [], updateImage() {} }]),
  )
  const at = (id: string) => {
    const i = layers.findIndex((l) => l.id === id)
    if (i < 0) throw new Error(`no layer ${id}`)
    return i
  }
  const calls: string[] = []
  const map = {
    setProjection: () => {},
    setSky: () => {},
    setPaintProperty: () => {},
    setLayerZoomRange: () => {},
    getStyle: () => ({ layers: layers.map((l) => ({ ...l })) }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, spec: unknown) => {
      calls.push(`addSource ${id}`)
      const updates: Update[] = []
      sources.set(id, { spec, updates, updateImage: (o: Update) => void updates.push(o) })
    },
    addLayer: (layer: Spec, before?: string) => {
      calls.push(`addLayer ${layer.id}`)
      specs.set(layer.id, layer)
      layers.splice(before === undefined ? layers.length : at(before), 0, { id: layer.id, type: layer.type })
    },
    moveLayer: (id: string, before?: string) => {
      const [l] = layers.splice(at(id), 1)
      layers.splice(before === undefined ? layers.length : at(before), 0, l!)
    },
    removeLayer: (id: string) => layers.splice(at(id), 1),
    removeSource: (id: string) => {
      if ([...specs.values()].some((s) => s.source === id && layers.some((l) => l.id === s.id))) return // MapLibre refuses while a layer uses it
      sources.delete(id)
    },
  }
  return { map: map as unknown as MlMap, ids: () => layers.map((l) => l.id), specs, sources, calls }
}

// What the picture goes between, told apart by what each style layer draws (not by its name: the name rule is under test).
// Below it: the ground, that is land, water and buildings. Above it: roads, railways, boundaries and every label.
const OVER = new Set([
  'aeroway',
  'transportation',
  'transportation_name',
  'boundary',
  'place',
  'aerodrome_label',
])
const GROUND = ['water', 'waterway', 'landcover', 'landuse', 'park', 'building']
const isOver = (l: StyleLayer) => l.type === 'symbol' || OVER.has(l['source-layer'] ?? '')
const isGround = (l: StyleLayer) =>
  !isOver(l) && (l.type === 'background' || GROUND.includes(l['source-layer'] ?? ''))

it.each([
  ['dark', 2, ['building', 'gs-context', 'gs-building-outline', 'water_name', 'aeroway-taxiway']],
  [
    'dark',
    3,
    ['building', 'gs-context', 'gs-building-outline', 'gs-buildings', 'water_name', 'aeroway-taxiway'],
  ],
  ['light', 2, ['building', 'gs-context', 'tunnel_motorway_casing']],
  ['light', 3, ['building', 'gs-context', 'tunnel_motorway_casing']],
] as const)(
  'puts the picture and what is lifted over it in this exact order: %s, tier %i',
  (theme, tier, want) => {
    const m = fakeMap(STYLES[theme])
    applyBaseLayers(m.map, tier, theme)
    setContextLayer(m.map, picture(7))
    const ids = m.ids()
    const at = ids.indexOf('gs-context')
    expect(ids.slice(at - 1, at - 1 + want.length)).toEqual(want)
  },
)

for (const theme of ['dark', 'light'] as const) {
  for (const tier of [2, 3] as const) {
    describe(`the satellite picture's place in the ${theme} map, tier ${tier}`, () => {
      const style = STYLES[theme]
      const byId = new Map(style.layers.map((l) => [l.id, l]))
      // gs-gibs, the building outline and (tier 3) the 3D buildings are added the way the page adds them
      const built = () => {
        const m = fakeMap(style)
        applyBaseLayers(m.map, tier, theme)
        setContextLayer(m.map, picture(7))
        return m.ids()
      }

      it('classifies every layer of the vendored style, so the checks below leave none out', () => {
        for (const l of style.layers) expect(isOver(l) !== isGround(l), l.id).toBe(true)
      })

      it('sits above the land, water and building fills and below every road, railway and label', () => {
        const ids = built()
        const at = ids.indexOf('gs-context')
        expect(at).toBeGreaterThan(0)
        for (const id of ids.slice(0, at))
          expect(byId.has(id) && isGround(byId.get(id)!), `${id} is under the picture`).toBe(true)
        for (const id of ids.slice(at + 1).filter((i) => byId.has(i)))
          expect(isOver(byId.get(id)!), `${id} is over the picture`).toBe(true)
        for (const l of style.layers.filter(isGround)) expect(ids.indexOf(l.id), l.id).toBeLessThan(at)
      })

      it('leaves the footprint outlines, the 3D buildings and the Blue Marble drawn over it', () => {
        const ids = built()
        const at = ids.indexOf('gs-context')
        expect(ids.indexOf('gs-building-outline')).toBeGreaterThan(at)
        if (tier === 3) expect(ids.indexOf('gs-buildings')).toBeGreaterThan(at)
        // gs-gibs stays where applyBaseLayers put it, on top: it is transparent from z6 and the picture is for a view of at most 12 km
        expect(ids.at(-1)).toBe('gs-gibs')
      })

      it('moves nothing of the style but its labels: roads, fills and the rest keep their order', () => {
        const kept = built().filter((id) => byId.has(id) && byId.get(id)!.type !== 'symbol')
        expect(kept).toEqual(style.layers.filter((l) => l.type !== 'symbol').map((l) => l.id))
      })
    })
  }
}

describe('setContextLayer, the layer', () => {
  it.each(['aeroway', 'highway', 'railway', 'tunnel', 'bridge', 'road'])(
    'stops under the first layer whose id starts with %s',
    (family) => {
      const m = fakeMap({
        sources: {},
        layers: [
          { id: 'bg', type: 'background' },
          { id: 'water', type: 'fill' },
          { id: 'waterway', type: 'line' },
          { id: `x_${family}`, type: 'line' }, // the word inside a name is not a road
          { id: 'building', type: 'fill' },
          { id: `${family}_one`, type: 'line' },
          { id: 'highway_two', type: 'line' },
          { id: 'names', type: 'symbol' },
        ],
      })
      setContextLayer(m.map, picture(1))
      expect(m.ids().indexOf('gs-context')).toBe(m.ids().indexOf(`${family}_one`) - 1)
      expect(m.ids().indexOf('building')).toBeLessThan(m.ids().indexOf('gs-context'))
    },
  )

  it('goes before the first label when the style has no road, and on top when it has neither', () => {
    const labelled = fakeMap({
      sources: {},
      layers: [
        { id: 'bg', type: 'background' },
        { id: 'water', type: 'fill' },
        { id: 'gs-building-outline', type: 'line' },
        { id: 'names', type: 'symbol' },
        { id: 'boundary', type: 'line' },
      ],
    })
    setContextLayer(labelled.map, picture(1))
    expect(labelled.ids()).toEqual(['bg', 'water', 'gs-context', 'gs-building-outline', 'names', 'boundary'])
    const bare = fakeMap({
      sources: {},
      layers: [
        { id: 'bg', type: 'background' },
        { id: 'gs-building-outline', type: 'line' },
      ],
    })
    setContextLayer(bare.map, picture(1))
    expect(bare.ids()).toEqual(['bg', 'gs-context', 'gs-building-outline'])
  })

  it('draws a plain raster: no fade (reduced motion or not), full opacity, linear resampling, no colour change', () => {
    const m = fakeMap(STYLES.light)
    setContextLayer(m.map, picture(1))
    expect(m.specs.get('gs-context')).toEqual({
      id: 'gs-context',
      type: 'raster',
      source: 'gs-context',
      paint: { 'raster-fade-duration': 0, 'raster-opacity': 1 },
    })
  })

  it('updates a picture that is already there and adds nothing', () => {
    const m = fakeMap(STYLES.dark)
    setContextLayer(m.map, picture(1))
    const before = m.ids()
    setContextLayer(m.map, picture(2))
    expect(m.ids()).toEqual(before)
    expect(m.calls.filter((c) => c.endsWith(' gs-context'))).toEqual([
      'addSource gs-context',
      'addLayer gs-context',
    ])
  })

  it('takes the picture off for null, leaves nothing of it, and removing from a map without one is harmless', () => {
    const m = fakeMap(STYLES.light)
    const start = m.ids()
    setContextLayer(m.map, picture(1))
    setContextLayer(m.map, null)
    expect(m.ids()).toEqual(start)
    expect(m.map.getLayer('gs-context')).toBeUndefined()
    expect(m.map.getSource('gs-context')).toBeUndefined()
    expect(() => removeContextLayer(m.map)).not.toThrow()
    expect(() => setContextLayer(m.map, null)).not.toThrow()
    setContextLayer(m.map, picture(3)) // and it can come back
    expect(m.ids().filter((id) => id === 'gs-context')).toHaveLength(1)
  })

  it('removeContextLayer takes out the layer and the source', () => {
    const m = fakeMap(STYLES.dark)
    setContextLayer(m.map, picture(1))
    removeContextLayer(m.map)
    expect(m.ids()).not.toContain('gs-context')
    expect(m.sources.has('gs-context')).toBe(false)
  })
})

describe('setContextLayer, the pixels', () => {
  it('hands the decoded pixels and the grid corners to the map: an image, never a url', () => {
    const m = fakeMap(STYLES.light)
    const image = picture(9)
    setContextLayer(m.map, image)
    const src = m.sources.get('gs-context')!
    // the source is made with the corners only (no url, no data: address); the pixels follow through updateImage
    expect(src.spec).toEqual({ type: 'image', coordinates: grid.cornersLonLat })
    expect(JSON.stringify(src.spec)).not.toContain('data:')
    expect(src.updates).toHaveLength(1)
    const u = src.updates[0]!
    expect(u.image).toBeInstanceOf(FakeImageData)
    expect(grid.width).not.toBe(grid.height)
    expect([u.image.width, u.image.height]).toEqual([grid.width, grid.height])
    expect([...u.image.data]).toEqual([...image.rgba])
    expect(u.image.data).not.toBe(image.rgba) // a copy: the map's pixels are not the loader's array
    expect(u.coordinates).toEqual(grid.cornersLonLat)
    expect(Object.keys(u).sort()).toEqual(['coordinates', 'image'])
  })

  it('gives a later picture to the same source', () => {
    const m = fakeMap(STYLES.light)
    setContextLayer(m.map, picture(1))
    setContextLayer(m.map, picture(2))
    expect(m.sources.get('gs-context')!.updates.map((u) => u.image.data[0])).toEqual([1, 2])
  })
})
