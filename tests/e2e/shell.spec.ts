import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('navigates with history and links', async ({ page }) => {
  await page.goto('/limits')
  await expect(page.getByRole('heading', { level: 1, name: 'Limits' })).toBeVisible()
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/limits$/)
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

for (const path of ['/limits', '/privacy', '/dev/kit']) {
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
