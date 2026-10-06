export interface SatDef {
  norad: number
  name: string
  swathKm: number
}

export const SATELLITES: SatDef[] = [
  { norad: 40697, name: 'Sentinel-2A', swathKm: 290 },
  { norad: 42063, name: 'Sentinel-2B', swathKm: 290 },
  { norad: 60989, name: 'Sentinel-2C', swathKm: 290 },
  { norad: 39084, name: 'Landsat 8', swathKm: 185 },
  { norad: 49260, name: 'Landsat 9', swathKm: 185 },
]
