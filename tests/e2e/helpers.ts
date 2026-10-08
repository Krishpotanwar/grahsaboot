import { expect, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { itemId } from '../fixtures/scene.ts'

export const CORS = { 'access-control-allow-origin': '*' }

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

/**
 * The fixture's search answers with `extra` more clear passes from 11 Jan on: copies of 10 Jan whose files are served under
 * their own dates, so every date has its own URL. `log` lists each picture request in the order it arrives. With `hold`, each
 * copy's first check request waits in `held` until `open()`, so the sweep stalls and the other dates stay queued.
 */
export async function manyPasses(page: Page, extra: number, hold = false) {
  const log: Array<{ date: string; file: 'TCI' | 'SCL' }> = []
  const held: Array<() => void> = []
  const seen = new Set<string>()
  const last = `2025-01-${10 + extra}`
  await page.route('**/stac/search', async (route) => {
    const body = await (await route.fetch()).json()
    const src = body.features.find((f: { id: string }) => f.id === itemId('2025-01-10'))
    for (let i = 0; i < extra; i++) {
      const date = `2025-01-${String(11 + i).padStart(2, '0')}`
      const f = structuredClone(src)
      f.id = itemId(date)
      f.properties.datetime = `${date}T05:30:00.000000Z`
      for (const a of Object.values(f.assets) as Array<{ href: string }>)
        a.href = a.href.replace('2025-01-10', date)
      body.features.push(f)
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/geo+json' },
      json: body,
    })
  })
  await page.route(/\/cog\/2025-\d\d-\d\d\/(TCI|SCL)\.tif$/, async (route) => {
    const url = route.request().url()
    const m = /\/cog\/(2025-\d\d-\d\d)\/(TCI|SCL)\.tif$/.exec(url)!
    const date = m[1]!
    const file = m[2] as 'TCI' | 'SCL'
    log.push({ date, file })
    if (date <= '2025-01-10' || date > last) return route.continue()
    if (hold && file === 'SCL' && !seen.has(date)) {
      seen.add(date)
      await new Promise<void>((release) => held.push(release))
    }
    await route.fulfill({ response: await route.fetch({ url: url.replace(date, '2025-01-10') }) })
  })
  return {
    log,
    held,
    open: () => {
      hold = false
      for (const release of held) release()
    },
    dates: [
      '2025-01-10',
      ...Array.from({ length: extra }, (_, i) => `2025-01-${String(11 + i).padStart(2, '0')}`),
      '2025-03-05',
      '2025-06-15',
      '2025-12-20',
    ],
  }
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
