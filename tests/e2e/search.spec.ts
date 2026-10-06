import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

test('search Nagpur, pick it, and start an investigation there', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('Nagpur')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.getByRole('button', { name: 'Nagpur, Maharashtra, India' }).click()
  await expect(page.getByRole('link', { name: copy.nav.startHere })).toHaveAttribute(
    'href',
    '/new?lat=21.145800&lon=79.088200&name=Nagpur',
  )
})

test('swapped Indian coordinates get a hint, a one-tap fix and a use-as-typed escape', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('79.0882, 21.1458')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect(page.getByText(copy.search.swapped(79.0882, 21.1458))).toBeVisible()
  await page.getByRole('button', { name: copy.search.useSwapped }).click()
  await expect(page.getByRole('link', { name: copy.nav.startHere })).toHaveAttribute(
    'href',
    `/new?lat=21.145800&lon=79.088200&name=${encodeURIComponent(copy.search.coordsResult(21.1458, 79.0882))}`,
  )
  // A real Arctic point must stay usable: the same input, taken exactly as typed.
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.getByRole('button', { name: copy.search.useAsTyped }).click()
  await expect(page.getByRole('link', { name: copy.nav.startHere })).toHaveAttribute(
    'href',
    `/new?lat=79.088200&lon=21.145800&name=${encodeURIComponent(copy.search.coordsResult(79.0882, 21.1458))}`,
  )
})

test('unknown places say so plainly', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('Zzzxq')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect(page.getByText(copy.search.none)).toBeVisible()
})

test('selecting a place flies the globe there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))),
    'no WebGL2',
  )
  await page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.waitForFunction(() => Math.abs((window as any).__gs.map.getCenter().lng - 79.0882) < 0.01)
})

// Pins a real failure: the globe's auto-rotation called setCenter every frame, which cancelled the fly-to on the next one.
test('a fly-to is not cancelled by the globe auto-rotation', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))),
    'no WebGL2',
  )
  await page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
  const lng = () => page.evaluate(() => (window as any).__gs.map.getCenter().lng as number)
  const start = await lng()
  await expect.poll(lng, { timeout: 15_000 }).not.toBe(start) // it is rotating
  await page.getByLabel(copy.search.label).fill('Nagpur')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.getByRole('button', { name: 'Nagpur, Maharashtra, India' }).click()
  await page.waitForFunction(() => {
    const m = (window as any).__gs.map
    return Math.abs(m.getCenter().lng - 79.0882) < 0.1 && m.getZoom() > 8
  })
})

test('the search panel passes axe in both themes, with results showing', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('Nagpur')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect(page.getByRole('button', { name: 'Nagpur, Maharashtra, India' })).toBeVisible()
  for (let i = 0; i < 2; i++) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
})
