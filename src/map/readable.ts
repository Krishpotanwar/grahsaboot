import type { Map as MlMap } from 'maplibre-gl'
import type { Theme } from '../ui/theme.ts'

// OpenFreeMap's dark style is near-black: roads are 1.1:1 against the background and building footprints are darker than it, so a
// person cannot find their place. This is a table of paint patches over the two styles (applied on every style load), checked by
// src/map/readable.test.ts against vendored copies of the styles in tests/fixtures/styles: a layer id the style no longer has
// fails there, and in the page it is skipped without a word. An upstream rename leaves today's map, never a broken one.
// The light style (positron) is readable already and gets only what its contrast check demands.

export type PaintPatch = Record<string, string | number | null>

/** The least contrast of a road line or a building outline against the background: the dark map is the unreadable one. */
export const MIN_LINE_CONTRAST: Record<Theme, number> = { dark: 3, light: 2 }

const DARK_LABEL = { 'text-halo-color': '#000000', 'text-halo-width': 1.5 }
const PLACE_DARK: PaintPatch = { 'text-color': '#d4d4d4', ...DARK_LABEL }
const ROAD_NAME_DARK: PaintPatch = { 'text-color': '#c9c9c9', ...DARK_LABEL }

export const READABLE: Record<Theme, Record<string, PaintPatch>> = {
  dark: {
    water: { 'fill-color': '#14293d' },
    waterway: { 'line-color': '#1f4566' },
    landuse_residential: { 'fill-color': '#1e1e1e', 'fill-opacity': 0.8 },
    landcover_wood: { 'fill-color': '#15251a', 'fill-pattern': null },
    landuse_park: { 'fill-color': '#16281c' },
    building: { 'fill-color': '#202020', 'fill-outline-color': '#8a8a8a' },
    'aeroway-taxiway': { 'line-color': '#6a6a6a' },
    'aeroway-runway-casing': { 'line-color': '#9a9a9a' },
    'aeroway-area': { 'fill-color': '#1d1d1d' },
    'aeroway-runway': { 'line-color': '#2e2e2e' },
    highway_path: { 'line-color': '#7d7d7d' },
    highway_minor: { 'line-color': '#686868' },
    highway_major_casing: { 'line-color': '#9a9a9a' },
    highway_major_inner: { 'line-color': '#2e2e2e' },
    highway_major_subtle: { 'line-color': '#6e6e6e' },
    highway_motorway_casing: { 'line-color': '#b0b0b0' },
    highway_motorway_subtle: { 'line-color': '#686868' },
    railway: { 'line-color': '#808080' },
    railway_minor: { 'line-color': '#808080' },
    railway_transit: { 'line-color': '#808080' },
    water_name: { 'text-color': '#8fb4d4', 'text-halo-color': '#0b1620', 'text-halo-width': 1.2 },
    highway_name_other: ROAD_NAME_DARK,
    highway_name_motorway: ROAD_NAME_DARK,
    place_other: PLACE_DARK,
    place_suburb: PLACE_DARK,
    place_village: PLACE_DARK,
    place_town: PLACE_DARK,
    place_city: PLACE_DARK,
    place_city_large: PLACE_DARK,
    place_state: PLACE_DARK,
    place_country_other: PLACE_DARK,
    place_country_minor: PLACE_DARK,
    place_country_major: PLACE_DARK,
  },
  light: {
    'aeroway-taxiway': { 'line-color': '#a8a8a8' },
    'aeroway-runway-casing': { 'line-color': '#9a9a9a' },
    highway_path: { 'line-color': '#a8a8a8' },
    highway_minor: { 'line-color': '#a8a8a8' },
    highway_major_casing: { 'line-color': '#8c8c8c' },
    highway_major_subtle: { 'line-color': '#a0a0a0' },
    highway_motorway_casing: { 'line-color': '#7a7a7a' },
    highway_motorway_subtle: { 'line-color': '#a0a0a0' },
    highway_motorway_bridge_casing: { 'line-color': '#7a7a7a' },
    tunnel_motorway_casing: { 'line-color': '#9a9a9a' },
    railway: { 'line-color': '#a0a0a0' },
    railway_service: { 'line-color': '#a0a0a0' },
    railway_transit: { 'line-color': '#a0a0a0' },
    waterway_line_label: { 'text-color': '#5d6d7d' },
    'highway-name-path': { 'text-color': '#6b6b6b' },
  },
}

/** The footprint line drawn over the building fills (the fills alone are as dark as the ground). */
export const BUILDING_OUTLINE: Record<Theme, string> = { dark: '#8a8a8a', light: '#9a9a9a' }
/** The 3D buildings of tier 3 (createMap adds them when the style has none): the same contrast rule as the outlines. */
export const EXTRUSION: Record<Theme, string> = { dark: '#666670', light: '#a9a9ae' }

/** Idempotent, silent on ids the style does not have. Called from every `style.load`, before our own layers are added. */
export function applyReadable(map: MlMap, theme: Theme): void {
  for (const [id, patch] of Object.entries(READABLE[theme])) {
    if (!map.getLayer(id)) continue
    for (const [prop, value] of Object.entries(patch)) map.setPaintProperty(id, prop as never, value as never)
  }
  const layers = map.getStyle().layers
  const hasExtrusion = layers.some((l) => l.type === 'fill-extrusion')
  if (!hasExtrusion && map.getSource('openmaptiles') && !map.getLayer('gs-building-outline')) {
    map.addLayer(
      {
        id: 'gs-building-outline',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'line-color': BUILDING_OUTLINE[theme],
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 1.4],
        },
      },
      layers.find((l) => l.type === 'symbol')?.id,
    )
  }
}
