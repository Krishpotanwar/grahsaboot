import { AttributionControl, Map as MlMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { config } from '../config.ts'
import { copy } from '../ui/copy.ts'
import type { Theme } from '../ui/theme.ts'
import type { Tier } from './tier.ts'

setWorkerUrl(workerUrl)

export const styleUrl = (theme: Theme) => (theme === 'dark' ? config.styleDark : config.styleLight)

export interface Camera {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

/** `camera` is where a previous map left off (a tier change or context loss rebuilds the map); without one, the start view. */
export function createMap(
  container: HTMLElement,
  opts: { tier: Tier; getTheme: () => Theme; camera?: Camera | null },
): MlMap {
  // Globe fills ~88% of the stage's short side (approved mockup 01-landing); 0.5 floor while the container has no size yet.
  const fit = Math.max(
    0.5,
    Math.log2((0.44 * Math.min(container.clientWidth, container.clientHeight) * 2 * Math.PI) / 512) + 0.36,
  )
  const start = { center: [78.96, 21.5] as [number, number], zoom: opts.tier >= 2 ? fit : 3.6 }
  const map = new MlMap({
    container,
    style: styleUrl(opts.getTheme()),
    ...(opts.camera ?? start),
    maxPitch: opts.tier <= 1 ? 0 : 70, // T1 is a flat map (spec §7.6); a fly-to asks for 50-55 and is clamped
    attributionControl: false,
    pixelRatio: opts.tier <= 1 ? 1 : undefined,
    canvasContextAttributes: { antialias: opts.tier >= 3, failIfMajorPerformanceCaveat: false },
  })
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: [copy.attribution.osm, copy.attribution.openfreemap, copy.attribution.gibs],
    }),
    'bottom-right',
  )
  map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')
  map.on('style.load', () => applyBaseLayers(map, opts.tier, opts.getTheme()))
  if (opts.tier >= 3) {
    const updateTerrain = () => {
      if (!map.getSource('gs-terrain')) return
      const want = map.getZoom() >= 9
      if (want && !map.getTerrain()) map.setTerrain({ source: 'gs-terrain', exaggeration: 1.3 })
      if (!want && map.getTerrain()) map.setTerrain(null)
    }
    map.on('zoomend', updateTerrain)
    map.on('style.load', updateTerrain)
  }
  return map
}

/** Idempotent base layers on top of any OpenFreeMap style. Called on every style load. */
export function applyBaseLayers(map: MlMap, tier: Tier, theme: Theme) {
  map.setProjection({ type: tier >= 2 ? 'globe' : 'mercator' })
  if (tier >= 2) {
    map.setSky({
      'sky-color': theme === 'dark' ? '#09090b' : '#ffffff',
      'horizon-color': theme === 'dark' ? '#18181b' : '#e4e4e7',
      'fog-color': theme === 'dark' ? '#09090b' : '#ffffff',
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 5, 0.25, 7, 0],
    })
  }
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  if (!map.getSource('gs-gibs'))
    map.addSource('gs-gibs', { type: 'raster', tiles: [config.gibsTiles], tileSize: 256, maxzoom: 8 })
  // On top of the basemap, labels included: they would clutter the Blue Marble (approved mockup has none) until it fades out at z6. The satellite layers are added after this, so they stay above it.
  if (!map.getLayer('gs-gibs')) {
    map.addLayer({
      id: 'gs-gibs',
      type: 'raster',
      source: 'gs-gibs',
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 1, 6, 0],
        'raster-fade-duration': 0,
      },
    })
  }
  if (tier >= 3) {
    if (!map.getSource('gs-terrain'))
      map.addSource('gs-terrain', {
        type: 'raster-dem',
        tiles: [config.terrainTiles],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
      })
    const hasBuildings = map.getStyle().layers.some((l) => l.type === 'fill-extrusion')
    if (!hasBuildings && map.getSource('openmaptiles') && !map.getLayer('gs-buildings')) {
      map.addLayer(
        {
          id: 'gs-buildings',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': theme === 'dark' ? '#27272a' : '#e4e4e7',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.9,
          },
        },
        firstSymbol,
      )
    }
  }
}
