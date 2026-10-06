import type { FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl'
import type { Place } from '../search/nominatim.ts'
import type { SatPosition } from '../sats/useSatellites.ts'
import { placeLabel } from './camera.ts'

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

// GlobeScreen imports this file statically, so MapLibre's Marker class is fetched on demand (a map exists by then): a tier-0 device never downloads MapLibre.
const loadMarker = () => import('maplibre-gl').then((m) => m.Marker)

// Approved mockup (01-landing): dashed hairline tracks; the satellite with the next pass is drawn in accent, thicker.
// Colours are literal, not theme tokens: these lines sit on the Blue Marble imagery in both themes.
export function installSatLayers(map: MlMap) {
  if (!map.getSource('gs-sat-swath')) map.addSource('gs-sat-swath', { type: 'geojson', data: EMPTY })
  if (!map.getSource('gs-sat-track')) map.addSource('gs-sat-track', { type: 'geojson', data: EMPTY })
  if (!map.getLayer('gs-sat-swath'))
    map.addLayer({
      id: 'gs-sat-swath',
      type: 'fill',
      source: 'gs-sat-swath',
      paint: { 'fill-color': '#e48444', 'fill-opacity': 0.08 },
    })
  if (!map.getLayer('gs-sat-track'))
    map.addLayer({
      id: 'gs-sat-track',
      type: 'line',
      source: 'gs-sat-track',
      paint: {
        'line-color': ['case', ['get', 'hot'], '#e48444', 'rgba(244,244,245,0.6)'],
        'line-width': ['case', ['get', 'hot'], 1.6, 1.1],
        'line-dasharray': [3, 3],
      },
    })
}

export function uninstallSatLayers(map: MlMap) {
  for (const id of ['gs-sat-track', 'gs-sat-swath']) {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  }
}

/** `hot` is the NORAD id of the satellite with the next pass over the picked place, if any. */
export function updateSatLayers(
  map: MlMap,
  tracks: FeatureCollection | null,
  swaths: FeatureCollection | null,
  hot: number | null = null,
) {
  if (tracks)
    (map.getSource('gs-sat-track') as GeoJSONSource | undefined)?.setData({
      ...tracks,
      features: tracks.features.map((f) => ({
        ...f,
        properties: { ...f.properties, hot: f.properties?.norad === hot },
      })),
    })
  if (swaths) (map.getSource('gs-sat-swath') as GeoJSONSource | undefined)?.setData(swaths)
}

// Mockup glyph. The body is filled with a literal dark so it reads on imagery in both themes.
const GLYPH =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><g transform="rotate(-35 12 12)"><rect x="1.5" y="9.5" width="6.5" height="5" rx=".5" fill="currentColor" fill-opacity=".85"/><rect x="16" y="9.5" width="6.5" height="5" rx=".5" fill="currentColor" fill-opacity=".85"/><path d="M8 12h2M14 12h2"/><rect x="10" y="9" width="4" height="6" rx="1" fill="#09090b"/></g></svg>'

/**
 * DOM markers survive style reloads; one per satellite, glyph plus name. aria-hidden: the panel lists the same data as text.
 * opacityWhenCovered 0 hides a satellite while it is on the far side of the globe.
 */
export async function syncSatMarkers(map: MlMap, markers: Map<number, Marker>, sats: SatPosition[]) {
  const MarkerCtor = await loadMarker()
  for (const s of sats) {
    let m = markers.get(s.norad)
    if (!m) {
      const el = document.createElement('div')
      el.className = 'sat-marker'
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML = GLYPH
      const name = document.createElement('span')
      name.textContent = s.name
      el.append(name)
      m = new MarkerCtor({ element: el, anchor: 'left', offset: [-11, 0], opacityWhenCovered: '0' })
        .setLngLat([s.lon, s.lat])
        .addTo(map)
      markers.set(s.norad, m)
    } else m.setLngLat([s.lon, s.lat])
  }
}

/** Accent dot plus a dark name chip on the picked place. The name is Nominatim text, so it goes in as textContent. */
export async function addPlacePin(map: MlMap, place: Place): Promise<Marker> {
  const MarkerCtor = await loadMarker()
  const el = document.createElement('div')
  el.className = 'place-pin'
  el.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.textContent = placeLabel(place)
  el.append(document.createElement('i'), label)
  return new MarkerCtor({ element: el, anchor: 'left', offset: [-6, 0] })
    .setLngLat([place.lon, place.lat])
    .addTo(map)
}
