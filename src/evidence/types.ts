export type LonLat = [number, number]
export type XY = [number, number]
/** x0, y0, x1, y1 in pixels of one pyramid level; x1/y1 exclusive. */
export type Window = [number, number, number, number]

export interface LevelInfo {
  level: number
  width: number
  height: number
  /** Top-left corner of pixel (0,0) in the scene CRS (metres). */
  originX: number
  originY: number
  /** Positive pixel sizes in metres. */
  resX: number
  resY: number
}

export type AoiGeometry =
  { kind: 'site'; rings: LonLat[][] } | { kind: 'road'; line: LonLat[]; widthM: number }

export interface AoiPart {
  idx: number
  fromM: number
  toM: number
  geometry: AoiGeometry
}

export type QualityLabel = 'CLEAR' | 'PARTIAL' | 'OBSCURED' | 'NOT_COVERED'

export interface QualityStats {
  policy: 'scl-v2'
  /** Sub-pixel counts per SCL class 0..11 (outside-scene area counted as class 0). */
  counts: number[]
  total: number
  /** Ground visible from above: validFraction + uncertainFraction. Labels and "clear view %" use this. */
  clearFraction: number
  validFraction: number
  uncertainFraction: number
  obstructedFraction: number
  nodataFraction: number
  label: QualityLabel
}

/** Shared EPSG:3857 output grid; corners are TL, TR, BR, BL in lon/lat. */
export interface DisplayGrid {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  cornersLonLat: [LonLat, LonLat, LonLat, LonLat]
}

export const RECIPES = { frame: 'frame-v1', scl: 'scl-v2', display: 'display-v1', diff: 'diff-v1' } as const
