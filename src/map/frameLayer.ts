import type { ImageSource, ImageSourceSpecification, Map as MlMap } from 'maplibre-gl'
import type { DisplayGrid } from '../evidence/types.ts'

// The photo goes to the map as decoded pixels (`updateImage({ image })`, no network request): no PNG is encoded for it, no
// data: URL is fetched, and the page's content security policy has no `data:` in `connect-src` for it.
export function setFrameLayer(map: MlMap, image: ImageData | null, grid: DisplayGrid) {
  if (!image) return removeFrameLayer(map)
  const coordinates = grid.cornersLonLat
  const src = map.getSource('gs-frame') as ImageSource | undefined
  if (src) {
    src.updateImage({ image, coordinates })
    return
  }
  // A source with coordinates only: the image is handed over right after it exists.
  map.addSource('gs-frame', { type: 'image', coordinates } as unknown as ImageSourceSpecification)
  ;(map.getSource('gs-frame') as ImageSource).updateImage({ image, coordinates })
  map.addLayer(
    { id: 'gs-frame', type: 'raster', source: 'gs-frame', paint: { 'raster-fade-duration': 0 } },
    map.getLayer('gs-aoi-fill') ? 'gs-aoi-fill' : undefined,
  )
}

export function removeFrameLayer(map: MlMap) {
  if (map.getLayer('gs-frame')) map.removeLayer('gs-frame')
  if (map.getSource('gs-frame')) map.removeSource('gs-frame')
}
