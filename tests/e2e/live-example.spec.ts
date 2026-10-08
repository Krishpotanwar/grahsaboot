import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'

// The real Earth Search and the real AWS COGs, no fixtures: runs only with LIVE=1 (`npm run e2e:live`, on the dev server).
// It is skipped in the hermetic `npm run e2e`, whose fixture server only holds 2025.
test.skip(process.env.LIVE !== '1', 'needs LIVE=1 and the real internet')

// The pair is saved with the example, so its two days are searched alone and its photos come before the rest of the passes.
test('the worked example shows both of its photos on real data within 25 s', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  await page.goto('/new?example=navi-mumbai-airport')
  await page.getByRole('button', { name: flow.review.open }).click()
  const opened = Date.now()
  await expect(page.getByRole('img', { name: /^Before photo, 22 Feb 2018/ })).toBeVisible({ timeout: 25_000 })
  await expect(page.getByRole('img', { name: /^After photo, 12 Dec 2025/ })).toBeVisible({ timeout: 25_000 })
  const took = Date.now() - opened
  console.log(`first photos ${(took / 1000).toFixed(1)} s after "${flow.review.open}"`)
  expect(took).toBeLessThan(25_000)
  expect(errors).toEqual([])
})
