import type { Map as MlMap } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'
import { removeFrameLayer, setFrameLayer } from './frameLayer.ts'

const grid = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
// ImageData is a browser class: the fake map only keeps what it is handed, so any object stands for the pixels.
const image = { width: 2, height: 2 } as unknown as ImageData
const other = { width: 2, height: 2, other: true } as unknown as ImageData

// A map that only remembers the sources and layers it is given, so no WebGL is needed.
function fakeMap(layers: string[] = []) {
  const sources = new Map<string, unknown>()
  const calls: string[] = []
  const specs: Array<{ id: string; paint?: Record<string, unknown> }> = []
  const map = {
    getSource: (id: string) =>
      sources.has(id)
        ? { updateImage: (o: unknown) => (calls.push('update'), sources.set(id, o)) }
        : undefined,
    addSource: (id: string, spec: unknown) => (calls.push('addSource'), sources.set(id, spec)),
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (layer: { id: string; paint?: Record<string, unknown> }, before?: string) => {
      calls.push('addLayer')
      specs.push(layer)
      layers.splice(before ? layers.indexOf(before) : layers.length, 0, layer.id)
    },
    removeLayer: (id: string) => layers.splice(layers.indexOf(id), 1),
    removeSource: (id: string) => sources.delete(id),
  }
  return { map: map as unknown as MlMap, layers, sources, calls, specs }
}

describe('setFrameLayer', () => {
  it('puts the photo on the map at the grid corners, under the outline', () => {
    const m = fakeMap(['bg', 'gs-aoi-fill', 'gs-aoi-line'])
    setFrameLayer(m.map, image, grid)
    expect(m.layers).toEqual(['bg', 'gs-frame', 'gs-aoi-fill', 'gs-aoi-line'])
    // no url: the pixels are handed over with the corners, and nothing is fetched
    expect(m.sources.get('gs-frame')).toEqual({ image, coordinates: grid.cornersLonLat })
  })

  it('goes on top while there is no outline yet', () => {
    const m = fakeMap(['bg'])
    setFrameLayer(m.map, image, grid)
    expect(m.layers).toEqual(['bg', 'gs-frame'])
  })

  it('changes the image of a photo that is already there, and adds nothing', () => {
    const m = fakeMap()
    setFrameLayer(m.map, image, grid)
    setFrameLayer(m.map, other, grid)
    expect(m.calls).toEqual(['addSource', 'update', 'addLayer', 'update'])
    expect(m.layers).toEqual(['gs-frame'])
  })

  it('takes the photo off for no url, and removing from a map without one is harmless', () => {
    const m = fakeMap(['bg'])
    setFrameLayer(m.map, image, grid)
    setFrameLayer(m.map, null, grid)
    expect(m.layers).toEqual(['bg'])
    expect(m.sources.has('gs-frame')).toBe(false)
    expect(() => removeFrameLayer(m.map)).not.toThrow()
  })

  it('draws the photo plain by default: no fade, and nothing that changes its colours or how it is resampled', () => {
    const m = fakeMap()
    setFrameLayer(m.map, image, grid)
    setFrameLayer(m.map, null, grid)
    setFrameLayer(m.map, image, grid, false)
    expect(m.specs.map((s) => s.paint)).toEqual([
      { 'raster-fade-duration': 0 },
      { 'raster-fade-duration': 0 },
    ])
  })

  it('with the viewing aid on, stretches the photo with a contrast on the layer, and sets no resampling key', () => {
    const m = fakeMap(['bg', 'gs-aoi-fill'])
    setFrameLayer(m.map, image, grid, true)
    const paint = m.specs[0]!.paint!
    expect(paint['raster-fade-duration']).toBe(0)
    expect(paint['raster-contrast']).toBeGreaterThan(0)
    expect(paint['raster-contrast']).toBeLessThanOrEqual(1) // the range MapLibre allows for the key
    // No crisp squares: the display grid is 3 to 4 times the 10 m pixels, so nearest would draw 2 to 3 m stair-steps. And MapLibre
    // 6.12 refuses a raster layer that sets both `resampling` and `raster-resampling`, so no key of that kind is set at all.
    expect(Object.keys(paint).filter((k) => /resampling/.test(k))).toEqual([])
    // the same layer, in the same place, under the outline
    expect(m.layers).toEqual(['bg', 'gs-frame', 'gs-aoi-fill'])
  })

  it('follows the viewing aid each time the layer is put up (Workbench puts it up again when the switch changes)', () => {
    const m = fakeMap()
    setFrameLayer(m.map, image, grid, true)
    removeFrameLayer(m.map)
    setFrameLayer(m.map, image, grid, false)
    expect(m.specs.map((s) => s.paint?.['raster-contrast'] !== undefined)).toEqual([true, false])
  })
})
