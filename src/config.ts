const env = (import.meta.env ?? {}) as Record<string, string | undefined>
const pick = (k: string, d: string) => env[k] || d

export const config = {
  stacUrl: pick('VITE_STAC_URL', 'https://earth-search.aws.element84.com/v1'),
  pcStacUrl: pick('VITE_PC_STAC_URL', 'https://planetarycomputer.microsoft.com/api/stac/v1'),
  pcSasUrl: pick(
    'VITE_PC_SAS_URL',
    'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a',
  ),
  nominatimUrl: pick('VITE_NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
  // `vite dev` has no Worker, so it reads the bundled snapshot; `wrangler dev` and production serve the real route.
  tleUrl: pick('VITE_TLE_URL', env.MODE === 'development' ? '/tle-snapshot.json' : '/api/tle'),
  styleDark: pick('VITE_STYLE_DARK', 'https://tiles.openfreemap.org/styles/dark'),
  styleLight: pick('VITE_STYLE_LIGHT', 'https://tiles.openfreemap.org/styles/positron'),
  gibsTiles: pick(
    'VITE_GIBS_TILES',
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
  ),
  terrainTiles: pick(
    'VITE_TERRAIN_TILES',
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ),
  /** Test hooks and localhost data hosts are allowed outside production builds or when explicitly enabled for e2e. */
  testMode: env.MODE !== 'production' || env.VITE_TEST_HOOKS === '1',
  /**
   * The satellite view (src/map/contextLayer.ts) is on unless the build says VITE_CONTEXT_IMAGERY=0. A MEMBER read of
   * `import.meta.env`, which Vite replaces with a literal, so the off build can drop the switch (a read through `env` above is
   * not replaced). The `?.` is for the scripts that import this file under tsx (scripts/csp.ts): they have no `import.meta.env`.
   */
  contextImagery: import.meta.env?.VITE_CONTEXT_IMAGERY !== '0',
} as const

export const ASSET_HOSTS = [
  'sentinel-cogs.s3.us-west-2.amazonaws.com',
  'e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com',
  'sentinel2l2a01.blob.core.windows.net',
]

export function isAllowedAssetUrl(href: string): boolean {
  try {
    const u = new URL(href)
    if (u.protocol === 'https:' && ASSET_HOSTS.includes(u.hostname)) return true
    return (
      config.testMode && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
    )
  } catch {
    return false
  }
}
