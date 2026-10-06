import { expect, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'

export async function startAt(page: Page, query = 'tier=0&lat=21.1458&lon=79.0882&name=Nagpur') {
  await page.goto(`/new?${query}`)
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
}

export async function outlineSiteByCoords(page: Page, side = 1000) {
  const details = page.locator('details', { hasText: flow.outline.byCoords })
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click()
  await page.getByLabel(flow.outline.centre).fill('21.1458, 79.0882')
  await page.getByLabel(flow.outline.side).fill(String(side))
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
}

export async function outlineRoadByCoords(page: Page) {
  await page.getByRole('radio', { name: new RegExp(flow.outline.road) }).check()
  await page.getByLabel(flow.outline.width).fill('30')
  const details = page.locator('details', { hasText: flow.outline.byCoords })
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click()
  await page.getByLabel(flow.outline.start).fill('21.138637, 79.07698')
  await page.getByLabel(flow.outline.end).fill('21.157819, 79.095988')
  await page.getByRole('button', { name: flow.outline.useLine }).click()
}
