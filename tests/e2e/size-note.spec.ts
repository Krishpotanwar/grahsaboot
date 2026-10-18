import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { outlineRoadByCoords, outlineSiteByCoords, startAt } from './helpers.ts'

// What 10 m can show of the outline: said under the summary, never a block, and repeated on the Review step only when it warns.
const next = (page: Page) => page.getByRole('button', { name: copy.common.next })

test('a big site says it will show, and nothing is said on the Review step', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page, 1000) // 1 km square: 1 km², 10,000 pixels
  await expect(page.getByText(flow.outline.sizeShows('10,000'))).toBeVisible()
  await expect(next(page)).toBeEnabled()
  await next(page).click()
  await page.getByRole('button', { name: copy.common.next }).click() // the dates step
  await expect(page.getByText(flow.outline.sizeShows('10,000'))).toHaveCount(0)
})

test('a small site warns, still lets the person continue, and says so again on Review', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page, 100) // 100 m square: 1 ha, 100 pixels
  const warn = page.getByText(flow.outline.sizeSmall('100'))
  await expect(warn).toBeVisible()
  await expect(warn).toHaveClass(/text-warn/)
  await expect(next(page)).toBeEnabled()
  await next(page).click()
  await next(page).click()
  await expect(page.getByText(flow.outline.sizeSmall('100'))).toBeVisible() // on the Review step, under the size line
})

test('a site under the floor gets the refusal, not the note', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page, 20) // 400 m²: under the 1,000 m² floor
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText(/pixels at 10 m/)).toHaveCount(0)
  await expect(next(page)).toBeDisabled()
})

test('a narrow road warns, a wide one does not, and the width decides', async ({ page }) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  const width = page.getByLabel(flow.outline.width)
  await width.fill('12')
  await expect(page.getByText(flow.outline.roadNarrow(12, 1))).toBeVisible()
  await expect(next(page)).toBeEnabled()
  await width.fill('40')
  await expect(page.getByText(flow.outline.roadShows(40, 4))).toBeVisible()
  await expect(page.getByText(flow.outline.roadNarrow(12, 1))).toHaveCount(0)
})

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the note passes axe in both themes, warning and not (${size.width} px)`, async ({ page }) => {
    await page.setViewportSize(size)
    await startAt(page)
    await outlineSiteByCoords(page, 100)
    for (let i = 0; i < 2; i++) {
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(r.violations).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  })
}
