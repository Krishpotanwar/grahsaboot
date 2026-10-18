import type { ImageSource, ImageSourceSpecification, Map as MlMap } from 'maplibre-gl'
import type { ContextImage } from '../context/load.ts'

// The satellite picture (src/context/load.ts): a picture to find a place by, never evidence. One image source and one raster
// layer, both `gs-context`. The pixels go to the map as decoded pixels (`updateImage({ image })`, as frameLayer.ts does): no PNG
// is encoded, no data: URL is fetched, and the content security policy is untouched.
const ID = 'gs-context'

// It goes above the land, water and building fills and below the roads, railways and labels. In both OpenFreeMap styles the
// first road layer (aeroway, highway, railway, tunnel, bridge or road) comes right after the last fill; with no road layer the
// first label is the stop, and with neither the picture goes on top. gs-gibs is left where it is, on top: it is fully
// transparent from z6, and the picture is only made for a view of at most 12 km, far closer than that.
const ROAD = /^(?:aeroway|highway|railway|tunnel|bridge|road)/

// readable.ts adds the building line before the FIRST label, and in the dark style that label (water_name) comes before the
// opaque building fill the picture has to cover: so the line and that label would be left under it. What must stay drawn over
// the picture, whatever is below it, is lifted to just above it.
const stays = (l: { id: string; type: string }) => l.type === 'symbol' || l.id.startsWith('gs-building')

/** Idempotent: a second call with a picture changes the picture of the layer that is there. `null` takes it off the map. */
export function setContextLayer(map: MlMap, image: ContextImage | null): void {
  if (!image) return removeContextLayer(map)
  const { grid } = image
  const coordinates = grid.cornersLonLat
  const pixels = new ImageData(new Uint8ClampedArray(image.rgba), grid.width, grid.height)
  // A source with coordinates only: the pixels are handed over right after it exists.
  if (!map.getSource(ID))
    map.addSource(ID, { type: 'image', coordinates } as unknown as ImageSourceSpecification)
  ;(map.getSource(ID) as ImageSource).updateImage({ image: pixels, coordinates })
  if (map.getLayer(ID)) return
  const layers = map.getStyle().layers
  const before = (layers.find((l) => ROAD.test(l.id)) ?? layers.find((l) => l.type === 'symbol'))?.id
  // No fade, reduced motion or not: the picture must not fade in over the map. Linear resampling (the default), no enhancement.
  map.addLayer(
    { id: ID, type: 'raster', source: ID, paint: { 'raster-fade-duration': 0, 'raster-opacity': 1 } },
    before,
  )
  const below = before ? layers.findIndex((l) => l.id === before) : layers.length
  // They stay above the fill after the picture is removed, on purpose: the order does not depend on the picture being there.
  for (const l of layers.slice(0, below)) if (stays(l)) map.moveLayer(l.id, before)
}

export function removeContextLayer(map: MlMap): void {
  if (map.getLayer(ID)) map.removeLayer(ID)
  if (map.getSource(ID)) map.removeSource(ID)
}
