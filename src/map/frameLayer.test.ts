import type { Map as MlMap } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'
import { removeFrameLayer, setFrameLayer } from './frameLayer.ts'

const grid = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
const url = 'data:image/png;base64,AA'

// A map that only remembers the sources and layers it is given, so no WebGL is needed.
function fakeMap(layers: string[] = []) {
  const sources = new Map<string, unknown>()
  const calls: string[] = []
  const map = {
    getSource: (id: string) =>
      sources.has(id)
        ? { updateImage: (o: unknown) => (calls.push('update'), sources.set(id, o)) }
        : undefined,
    addSource: (id: string, spec: unknown) => (calls.push('addSource'), sources.set(id, spec)),
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (layer: { id: string }, before?: string) => {
      calls.push('addLayer')
      layers.splice(before ? layers.indexOf(before) : layers.length, 0, layer.id)
    },
    removeLayer: (id: string) => layers.splice(layers.indexOf(id), 1),
    removeSource: (id: string) => sources.delete(id),
  }
  return { map: map as unknown as MlMap, layers, sources, calls }
}

describe('setFrameLayer', () => {
  it('puts the photo on the map at the grid corners, under the outline', () => {
    const m = fakeMap(['bg', 'gs-aoi-fill', 'gs-aoi-line'])
    setFrameLayer(m.map, url, grid)
    expect(m.layers).toEqual(['bg', 'gs-frame', 'gs-aoi-fill', 'gs-aoi-line'])
    expect(m.sources.get('gs-frame')).toEqual({ type: 'image', url, coordinates: grid.cornersLonLat })
  })

  it('goes on top while there is no outline yet', () => {
    const m = fakeMap(['bg'])
    setFrameLayer(m.map, url, grid)
    expect(m.layers).toEqual(['bg', 'gs-frame'])
  })

  it('changes the image of a photo that is already there, and adds nothing', () => {
    const m = fakeMap()
    setFrameLayer(m.map, url, grid)
    setFrameLayer(m.map, 'data:image/png;base64,BB', grid)
    expect(m.calls).toEqual(['addSource', 'addLayer', 'update'])
    expect(m.layers).toEqual(['gs-frame'])
  })

  it('takes the photo off for no url, and removing from a map without one is harmless', () => {
    const m = fakeMap(['bg'])
    setFrameLayer(m.map, url, grid)
    setFrameLayer(m.map, null, grid)
    expect(m.layers).toEqual(['bg'])
    expect(m.sources.has('gs-frame')).toBe(false)
    expect(() => removeFrameLayer(m.map)).not.toThrow()
  })
})
