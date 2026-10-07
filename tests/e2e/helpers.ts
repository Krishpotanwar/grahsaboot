import { expect, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'

export async function startAt(page: Page, query = 'tier=0&lat=21.1458&lon=79.0882&name=Nagpur') {
  await page.goto(`/new?${query}`)
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
}

async function openCoordsForm(page: Page) {
  const details = page.locator('details', { hasText: flow.outline.byCoords })
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click()
}

export async function outlineSiteByCoords(page: Page, side = 1000) {
  await openCoordsForm(page)
  await page.getByLabel(flow.outline.centre).fill('21.1458, 79.0882')
  await page.getByLabel(flow.outline.side).fill(String(side))
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
}

export async function outlineRoadByCoords(page: Page) {
  await page.getByRole('radio', { name: new RegExp(flow.outline.road) }).check()
  await page.getByLabel(flow.outline.width).fill('30')
  await openCoordsForm(page)
  await page.getByLabel(flow.outline.start).fill('21.138637, 79.07698')
  await page.getByLabel(flow.outline.end).fill('21.157819, 79.095988')
  await page.getByRole('button', { name: flow.outline.useLine }).click()
}

export async function finishDatesAndOpen(page: Page, from = '2025-01-01', to = '2025-12-31') {
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(flow.dates.from, { exact: true }).fill(from)
  await page.getByLabel(flow.dates.to, { exact: true }).fill(to)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: flow.review.open }).click()
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
}

export async function openFixtureSite(page: Page) {
  await startAt(page)
  await outlineSiteByCoords(page, 1000)
  await finishDatesAndOpen(page, '2025-01-01', '2025-12-31')
}

/** Both compared photos are on screen, so the before/after pair is chosen and loaded. */
export async function waitForPhotos(page: Page) {
  await expect(page.getByRole('img', { name: /^Before photo/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: /^After photo/ })).toBeVisible({ timeout: 30_000 })
}

export async function openFixtureRoad(page: Page) {
  await startAt(page)
  await outlineRoadByCoords(page)
  await finishDatesAndOpen(page, '2025-01-01', '2025-12-31')
}

/** The investigation this page's own IndexedDB holds. */
export const readStored = (page: Page, id: string) =>
  page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('gs-investigations')
      r.onsuccess = () => res(r.result)
    })
    return await new Promise<Record<string, unknown>>((res) => {
      const g = db.transaction('investigations').objectStore('investigations').get(key)
      g.onsuccess = () => res(g.result)
    })
  }, id)

/** Merges `patch` into the investigation this page's own IndexedDB holds. */
export const editStored = (page: Page, id: string, patch: Record<string, unknown>) =>
  page.evaluate(
    async ([key, changes]) => {
      const db = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open('gs-investigations')
        r.onsuccess = () => res(r.result)
      })
      const tx = db.transaction('investigations', 'readwrite')
      const st = tx.objectStore('investigations')
      const inv = await new Promise<Record<string, unknown>>((res) => {
        const g = st.get(key)
        g.onsuccess = () => res(g.result)
      })
      st.put({ ...inv, ...changes }, key)
      await new Promise((res) => (tx.oncomplete = res))
    },
    [id, patch] as [string, Record<string, unknown>],
  )

/** Opens a fixture investigation, then leaves it for the globe: a live workbench would write its default pick over an edit. */
export async function openThenEdit(
  page: Page,
  patch: Record<string, unknown>,
  open: (page: Page) => Promise<void> = openFixtureSite,
) {
  await open(page)
  const id = page.url().split('/i/')[1]!
  await page.goto('/?tier=0')
  await editStored(page, id, patch)
  return id
}
