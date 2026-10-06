export interface SatDef {
  norad: number
  name: string
  short: string
  swathKm: number
  family: 'sentinel-2' | 'landsat'
}

export const SATELLITES: SatDef[] = [
  { norad: 40697, name: 'Sentinel-2A', short: 'S2A', swathKm: 290, family: 'sentinel-2' },
  { norad: 42063, name: 'Sentinel-2B', short: 'S2B', swathKm: 290, family: 'sentinel-2' },
  { norad: 60989, name: 'Sentinel-2C', short: 'S2C', swathKm: 290, family: 'sentinel-2' },
  { norad: 39084, name: 'Landsat 8', short: 'L8', swathKm: 185, family: 'landsat' },
  { norad: 49260, name: 'Landsat 9', short: 'L9', swathKm: 185, family: 'landsat' },
]
