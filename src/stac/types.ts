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
