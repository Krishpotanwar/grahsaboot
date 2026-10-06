import type { Map as MlMap } from 'maplibre-gl'
import type { Place } from '../search/nominatim.ts'

export function flyToPlace(map: MlMap, p: Place, reducedMotion: boolean) {
  const duration = reducedMotion ? 0 : 4000
  if (p.bbox && p.bbox[2] - p.bbox[0] < 5) {
    map.fitBounds(
      [
        [p.bbox[0], p.bbox[1]],
        [p.bbox[2], p.bbox[3]],
      ],
      { padding: 48, maxZoom: 14, duration, pitch: 50, bearing: -12 },
    )
  } else {
    map.flyTo({
      center: [p.lon, p.lat],
      zoom: 13,
      pitch: 55,
      bearing: -12,
      duration,
      curve: 1.4,
      essential: true,
    })
  }
}

export const placeToQuery = (p: Place) =>
  `/new?lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}&name=${encodeURIComponent(p.name.split(',')[0]!)}`
