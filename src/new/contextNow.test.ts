import { expect, it, vi } from 'vitest'

// config.testMode is the only thing that lets a URL set the loader's "today": a production build must ignore `?now=`. This file
// is the production case, with the default argument of nowFromUrl (contextState.test.ts passes the flag itself).
vi.mock('../config.ts', () => ({ config: { testMode: false } }))

it('ignores ?now= when the build is not a test build (the default argument)', async () => {
  const { nowFromUrl } = await import('./contextState.ts')
  expect(nowFromUrl('?now=2025-12-31')).toBeUndefined()
})
