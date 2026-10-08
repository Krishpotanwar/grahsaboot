import type { ImageSource, Map as MlMap } from 'maplibre-gl'
import type { DisplayGrid } from '../evidence/types.ts'

// MapLibre 6.12 loads an image source with fetch(), data: URLs included, so the CSP's connect-src has to allow data: (C11).
export function setFrameLayer(map: MlMap, url: string | null, grid: DisplayGrid) {
  if (!url) return removeFrameLayer(map)
  const coordinates = grid.cornersLonLat
  const src = map.getSource('gs-frame') as ImageSource | undefined
  if (src) {
    src.updateImage({ url, coordinates })
    return
  }
  map.addSource('gs-frame', { type: 'image', url, coordinates })
  map.addLayer(
    { id: 'gs-frame', type: 'raster', source: 'gs-frame', paint: { 'raster-fade-duration': 0 } },
    map.getLayer('gs-aoi-fill') ? 'gs-aoi-fill' : undefined,
  )
}

export function removeFrameLayer(map: MlMap) {
  if (map.getLayer('gs-frame')) map.removeLayer('gs-frame')
  if (map.getSource('gs-frame')) map.removeSource('gs-frame')
}
