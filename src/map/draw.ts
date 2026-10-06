import type { Map as MlMap } from 'maplibre-gl'
import { TerraDraw, TerraDrawLineStringMode, TerraDrawPolygonMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { LonLat } from '../evidence/types.ts'

export function startDrawing(
  map: MlMap,
  kind: 'site' | 'road',
  onFinish: (coords: LonLat[]) => void,
): { stop(): void } {
  // ponytail: terra-draw's default blue while drawing; the finished outline is our accent layer. Pass accentColor() as the modes' styles if the in-progress colour should match.
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [new TerraDrawPolygonMode(), new TerraDrawLineStringMode()],
  })
  draw.start()
  draw.setMode(kind === 'site' ? 'polygon' : 'linestring')
  draw.on('finish', (id) => {
    const f = draw.getSnapshot().find((x) => x.id === id)
    if (!f) return
    const g = f.geometry
    if (g.type === 'Polygon') onFinish(g.coordinates[0] as LonLat[])
    else if (g.type === 'LineString') onFinish(g.coordinates as LonLat[])
    draw.clear() // our own gs-aoi layer shows the result
  })
  return {
    stop: () => {
      try {
        draw.stop()
      } catch {
        // The map was removed (tier change, lost WebGL context) or is swapping its style: its draw layers went with it, and the listeners are already off.
      }
    },
  }
}
