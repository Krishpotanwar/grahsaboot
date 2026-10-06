import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'

test('navigates with history and links', async ({ page }) => {
  await page.goto('/limits')
  await expect(page.getByRole('heading', { level: 1, name: 'Limits' })).toBeVisible()
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/limits$/)
})

// WCAG 2.4.2 and 2.4.3: the router swaps pages without a load, so it has to retitle the page and move focus itself.
test('a route change sets the page title and focuses the main region', async ({ page }) => {
  await page.goto('/limits')
  await expect(page).toHaveTitle('Limits · GrahSaboot')
  await expect(page.locator('main')).not.toBeFocused() // a fresh load keeps the browser's own focus start
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveTitle('Privacy · GrahSaboot')
  await expect(page.locator('main')).toBeFocused()
  await page.goBack()
  await expect(page).toHaveTitle('Limits · GrahSaboot')
  await page.getByRole('link', { name: 'GrahSaboot home' }).click()
  await expect(page).toHaveTitle('GrahSaboot · Satellite proof for any place')
  await expect(page.locator('main')).toBeFocused()
})

test('dark by default, light toggle persists across reloads', async ({ page }) => {
  await page.goto('/limits')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('unknown routes render not found', async ({ page }) => {
  await page.goto('/definitely/not/here')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

// The Review step itself arrives in C3; until then step 4 shows the stepper at "Review" under the new page title.
test('/new?example=navi-mumbai-airport opens the review step', async ({ page }) => {
  await page.goto('/new?example=navi-mumbai-airport')
  await expect(page).toHaveTitle(`${copy.titles.new} · ${copy.app.name}`)
  await expect(page.getByText(flow.stepOf(4), { exact: true })).toBeVisible()
  await expect(page.locator('[aria-current="step"]')).toHaveText(flow.steps[3]!)
})

for (const path of ['/limits', '/privacy', '/dev/kit', '/new']) {
  test(`${path} passes axe in both themes`, async ({ page }) => {
    await page.goto(path)
    // Lazy screens render after the load event; axe must not run on the Suspense fallback.
    await expect(page.locator('h1')).toBeVisible()
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
      await page.getByRole('button', { name: 'Switch theme' }).click()
    }
  })
}
