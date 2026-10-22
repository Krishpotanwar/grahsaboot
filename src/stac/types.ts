import type { LonLat } from '../evidence/types.ts'

export type Collection = 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'
export interface AssetRef {
  href: string
  transform: number[]
  shape: [number, number]
}
export interface S2Item {
  id: string
  collection: Collection
  datetime: string
  date: string
  epsg: number
  cloudCover: number | null
  baseline: string | null
  nodataPct: number | null
  /**
   * Sun height above the horizon, degrees: `view:sun_elevation`, else 90 minus `s2:mean_solar_zenith` (the fallback catalogue); null
   * when the catalogue gives neither. Optional so that an item built by hand, without it, stays valid: read it as null.
   */
  sunElevation?: number | null
  footprint: LonLat[][]
  visual: AssetRef
  scl: AssetRef
}
export interface SearchResult {
  items: S2Item[]
  limited: boolean
  source: Collection
}
export interface DateCandidate {
  date: string
  item: S2Item
  alternates: S2Item[]
  coversAoi: boolean
}
