import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, isAllowedAssetUrl } from './config.ts'

// config is a plain object at runtime; flip testMode to see how the allowlist behaves in a production build.
const flags = config as { testMode: boolean }
const original = flags.testMode
afterEach(() => {
  flags.testMode = original
  vi.unstubAllEnvs()
})

describe('tleUrl', () => {
  it('reads the bundled snapshot in `vite dev`, which has no Worker, and the Worker route everywhere else', async () => {
    for (const [mode, url] of [
      ['development', '/tle-snapshot.json'],
      ['production', '/api/tle'],
    ] as const) {
      vi.stubEnv('MODE', mode)
      vi.resetModules()
      expect((await import('./config.ts')).config.tleUrl, mode).toBe(url)
    }
  })
})

describe('isAllowedAssetUrl', () => {
  it('allows only the Sentinel buckets and the one Planetary Computer account over https', () => {
    const ok = isAllowedAssetUrl
    expect(ok('https://sentinel-cogs.s3.us-west-2.amazonaws.com/a/TCI.tif')).toBe(true)
    expect(ok('https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/a/TCI.tif')).toBe(true)
    expect(ok('https://sentinel2l2a01.blob.core.windows.net/a/TCI.tif')).toBe(true)
    expect(ok('https://other.blob.core.windows.net/a/TCI.tif')).toBe(false)
    expect(ok('http://sentinel-cogs.s3.us-west-2.amazonaws.com/a/TCI.tif')).toBe(false)
    expect(ok('https://evil.example.com/a.tif')).toBe(false)
    expect(ok('not a url')).toBe(false)
  })
  it('allows http localhost in test mode only', () => {
    expect(isAllowedAssetUrl('http://127.0.0.1:4300/cog/TCI.tif')).toBe(true)
    flags.testMode = false
    expect(isAllowedAssetUrl('http://127.0.0.1:4300/cog/TCI.tif')).toBe(false)
    expect(isAllowedAssetUrl('http://localhost:4300/cog/TCI.tif')).toBe(false)
  })
})
