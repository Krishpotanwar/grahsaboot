import type { FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { AoiInput, Bbox } from '../geo/aoi.ts'

export const accentColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--gs-accent').trim() || '#e48444'

function collection(aoi: AoiInput | null): FeatureCollection {
  return aoi
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { kind: aoi.kind }, geometry: aoi.geometry }],
      }
    : { type: 'FeatureCollection', features: [] }
}

/** Road corridors are drawn at their true width: pixels per metre doubles with each zoom level. */
function roadWidth(widthM: number, lat: number) {
  const px0 = widthM / ((40075016.686 * Math.cos((lat * Math.PI) / 180)) / 512)
  return ['interpolate', ['exponential', 2], ['zoom'], 0, Math.max(1, px0), 22, Math.max(1, px0 * 2 ** 22)]
}

export function setAoiLayer(map: MlMap, aoi: AoiInput | null, accent: string) {
  const data = collection(aoi)
  const src = map.getSource('gs-aoi') as GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource('gs-aoi', { type: 'geojson', data })
  if (!map.getLayer('gs-aoi-fill'))
    map.addLayer({
      id: 'gs-aoi-fill',
      type: 'fill',
      source: 'gs-aoi',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': accent, 'fill-opacity': 0.12 },
    })
  if (!map.getLayer('gs-aoi-line'))
    map.addLayer({
      id: 'gs-aoi-line',
      type: 'line',
      source: 'gs-aoi',
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': accent, 'line-width': 2 },
    })
  map.setPaintProperty('gs-aoi-fill', 'fill-color', accent)
  map.setPaintProperty('gs-aoi-line', 'line-color', accent)
  map.setPaintProperty(
    'gs-aoi-line',
    'line-width',
    aoi?.kind === 'road' ? (roadWidth(aoi.widthM, aoi.geometry.coordinates[0]![1]) as never) : 2,
  )
  map.setPaintProperty('gs-aoi-line', 'line-opacity', aoi?.kind === 'road' ? 0.55 : 1)
}

export function removeAoiLayer(map: MlMap) {
  for (const id of ['gs-aoi-line', 'gs-aoi-fill']) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource('gs-aoi')) map.removeSource('gs-aoi')
}

export function fitAoi(map: MlMap, bbox: Bbox, reducedMotion: boolean) {
  map.fitBounds(
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ],
    { padding: 48, maxZoom: 16, duration: reducedMotion ? 0 : 2500 },
  )
}
