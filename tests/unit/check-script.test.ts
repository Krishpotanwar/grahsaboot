import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// `npm run check` is what stands between a change and a deploy: its legs are part of the guarantees, so a leg that is dropped or
// pointed at the wrong folder must fail a test, not just stop running.
const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>
}

it('builds the satellite-free bundle into the folder its guard reads', () => {
  expect(scripts['build:nocontext']).toMatch(/^VITE_CONTEXT_IMAGERY=0 vite build --outDir dist-nocontext\b/)
})

it('runs the no-context guard, and the other build guards, in check', () => {
  expect(scripts.check).toContain('npm run build:nocontext && tsx scripts/check-bundle.ts --no-context')
  expect(scripts.check).toContain('npm run build:accounts && tsx scripts/check-bundle.ts --accounts')
  expect(scripts.check).toContain('npm run build && tsx scripts/check-bundle.ts && tsx scripts/check-csp.ts')
})
