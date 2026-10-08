import type { Map as MlMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { Bbox } from '../geo/aoi.ts'
import { fitAoi } from './aoiLayer.ts'
import { flyToPlace } from './camera.ts'

const bbox: Bbox = [79.0832, 21.1408, 79.0932, 21.1508]
const boom = () => {
  throw new Error('Invalid LngLat object: (NaN, NaN)')
}
// A map whose camera has gone NaN: every move it is asked for throws.
const brokenMap = (over: Record<string, unknown> = {}) => {
  const map = { fitBounds: vi.fn(boom), flyTo: vi.fn(boom), stop: vi.fn(), jumpTo: vi.fn(), ...over }
  return { map: map as unknown as MlMap, calls: map }
}

describe('camera moves that MapLibre cannot make', () => {
  it('fitAoi puts the camera on the outline centre when the fit throws, and does not throw', () => {
    const { map, calls } = brokenMap()
    expect(() => fitAoi(map, bbox, false)).not.toThrow()
    expect(calls.stop).toHaveBeenCalled()
    expect(calls.jumpTo).toHaveBeenCalledWith({
      center: [(79.0832 + 79.0932) / 2, (21.1408 + 21.1508) / 2],
      zoom: 14,
      pitch: 0,
      bearing: 0,
    })
  })

  it('fitAoi leaves the map alone when even the fallback throws', () => {
    const { map } = brokenMap({ jumpTo: vi.fn(boom) })
    expect(() => fitAoi(map, bbox, true)).not.toThrow()
  })

  it('fitAoi fits normally when nothing is wrong, with no animation under reduced motion', () => {
    const fitBounds = vi.fn()
    const { map, calls } = brokenMap({ fitBounds })
    fitAoi(map, bbox, true)
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [79.0832, 21.1408],
        [79.0932, 21.1508],
      ],
      { padding: 48, maxZoom: 16, duration: 0 },
    )
    expect(calls.jumpTo).not.toHaveBeenCalled()
  })

  it('flyToPlace does not throw for a place with or without a box', () => {
    const { map } = brokenMap()
    const place = { name: 'Nagpur', lat: 21.1458, lon: 79.0882 }
    expect(() => flyToPlace(map, { ...place, bbox: null }, false)).not.toThrow()
    expect(() => flyToPlace(map, { ...place, bbox: [79, 21, 79.2, 21.3] }, false)).not.toThrow()
  })
})
