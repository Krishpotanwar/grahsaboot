import type { Map as MlMap } from 'maplibre-gl'
import { TerraDraw, TerraDrawLineStringMode, TerraDrawModeUndoRedo, TerraDrawPolygonMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { config } from '../config.ts'
import type { LonLat } from '../evidence/types.ts'

/** How many corners a finished outline needs: a polygon three, a line two. */
export const MIN_CORNERS = { site: 3, road: 2 } as const

export interface DrawSession {
  stop(): void
  /** Takes the last corner back. False when there is none. */
  undo(): boolean
  /** Finishes the outline from the corners placed so far (the button for what a double click or Enter does). False when it has too few. */
  finish(): boolean
}

export function startDrawing(
  map: MlMap,
  kind: 'site' | 'road',
  onFinish: (coords: LonLat[]) => void,
  /** The number of corners placed so far (0 when none is in progress), after every change. */
  onCorners?: (n: number) => void,
): DrawSession {
  // ponytail: terra-draw's default blue while drawing; the finished outline is our accent layer. Pass accentColor() as the modes' styles if the in-progress colour should match.
  const mode = kind === 'site' ? 'polygon' : 'linestring'
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [new TerraDrawPolygonMode(), new TerraDrawLineStringMode()],
    undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
  })
  if (config.testMode)
    (window as unknown as { __gs?: Record<string, unknown> }).__gs = {
      ...((window as unknown as { __gs?: object }).__gs ?? {}),
      draw,
    }
  draw.start()
  draw.setMode(mode)
  // The outline being drawn, with the corners that are placed (the line after them follows the cursor and is not one).
  const inProgress = () => {
    const f = draw.getSnapshot().find((x) => x.properties.currentlyDrawing === true)
    const g = f?.geometry
    if (!f || !g || (g.type !== 'Polygon' && g.type !== 'LineString')) return null
    const all = (g.type === 'Polygon' ? g.coordinates[0]! : g.coordinates) as LonLat[]
    // A polygon says how many corners are placed; a line is its corners and then the point that follows the cursor.
    const placed = g.type === 'Polygon' ? Number(f.properties.committedCoordinateCount) || 0 : all.length - 1
    return all.slice(0, placed)
  }
  const report = () => onCorners?.(inProgress()?.length ?? 0)
  draw.on('change', report)
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
    undo: () => {
      try {
        return draw.undo()
      } catch {
        return false
      }
    },
    finish: () => {
      const corners = inProgress()
      if (!corners || corners.length < MIN_CORNERS[kind]) return false
      onFinish(kind === 'site' ? [...corners, corners[0]!] : corners)
      draw.clear()
      draw.setMode(mode) // starts a fresh outline if the person clicks the map again
      onCorners?.(0)
      return true
    },
  }
}
