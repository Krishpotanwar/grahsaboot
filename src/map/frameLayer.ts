import type { ImageSource, ImageSourceSpecification, Map as MlMap } from 'maplibre-gl'
import type { DisplayGrid } from '../evidence/types.ts'

// The "Sharper" viewing aid on the map is the layer's own contrast, the stretch of the viewer's filter (FrameCanvas.tsx), and no
// resampling key of either spelling. Not `nearest`: the display grid is 3 to 4 times the 10 m pixels, so it would draw 2 to 3 m
// stair-steps that look like pixels and are not (and MapLibre 6.12 refuses a raster layer that sets both `resampling` and
// `raster-resampling`). The map has no sharpen; the pixels themselves are the same.
const SHARPER_CONTRAST = 0.12

// The photo goes to the map as decoded pixels (`updateImage({ image })`, no network request): no PNG is encoded for it, no
// data: URL is fetched, and the page's content security policy has no `data:` in `connect-src` for it.
// shortcut: `sharper` is read when the layer is made; a layer that is already there keeps its paint, so a caller that changes it
// takes the layer off first (Workbench's effect does), until a second caller needs it changed in place.
export function setFrameLayer(map: MlMap, image: ImageData | null, grid: DisplayGrid, sharper = false): void {
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
    {
      id: 'gs-frame',
      type: 'raster',
      source: 'gs-frame',
      paint: { 'raster-fade-duration': 0, ...(sharper ? { 'raster-contrast': SHARPER_CONTRAST } : {}) },
    },
    map.getLayer('gs-aoi-fill') ? 'gs-aoi-fill' : undefined,
  )
}

export function removeFrameLayer(map: MlMap) {
  if (map.getLayer('gs-frame')) map.removeLayer('gs-frame')
  if (map.getSource('gs-frame')) map.removeSource('gs-frame')
}
