import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { itemId } from '../fixtures/scene.ts'
import { openFixtureRoad, openFixtureSite, waitForPhotos } from './helpers.ts'

/** Merges `patch` into the investigation this page's own IndexedDB holds. */
const editStored = (page: Page, id: string, patch: Record<string, unknown>) =>
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

/** Opens a fixture site, then leaves it for the globe: a live workbench would write its default pick over an edit. */
async function openThenEdit(page: Page, patch: Record<string, unknown>) {
  await openFixtureSite(page)
  const id = page.url().split('/i/')[1]!
  await page.goto('/?tier=0')
  await editStored(page, id, patch)
  return id
}

test('defaults to the clearest early and late passes and shows both photos', async ({ page }) => {
  await openFixtureSite(page)
  await expect(page).toHaveTitle(`${copy.titles.investigation} · ${copy.app.name}`)
  await expect(page.getByRole('img', { name: /^Before photo, 10 Jan 2025/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: /^After photo, 20 Dec 2025/ })).toBeVisible()
  await expect(page.getByText(/10 Jan 2025 · Sentinel-2 · 10 m · 100% clear view/)).toBeVisible()
  // The header line and the credit follow the photos on screen.
  await expect(page.getByText(/^Site · 1\.00 km² · 10 Jan 2025 ↔ 20 Dec 2025$/)).toBeVisible()
  await expect(page.getByText(copy.attribution.sentinelYears([2025]))).toBeVisible()
})

test('swipe works from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFixtureSite(page)
  const slider = page.getByRole('slider', { name: flow.workbench.swipeLabel })
  await expect(slider).toBeVisible({ timeout: 30_000 })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('51')
})

test('difference view always carries its caption', async ({ page }) => {
  await openFixtureSite(page)
  await page.getByRole('radio', { name: flow.workbench.modes.diff }).check({ timeout: 30_000 })
  await expect(page.getByText(flow.workbench.diffCaption)).toBeVisible()
  await expect(page.getByRole('img', { name: flow.workbench.modes.diff })).toBeVisible() // the masks arrived and the difference was drawn
})

test('narrow screens default to side by side, and Swipe is still one tap away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixtureSite(page)
  await expect(page.getByRole('radio', { name: flow.workbench.modes.side })).toBeChecked({ timeout: 30_000 })
  await page.getByRole('radio', { name: flow.workbench.modes.swipe }).check()
  await expect(page.getByRole('slider', { name: flow.workbench.swipeLabel })).toBeVisible()
})

test('an all-cloudy range says so plainly and keeps the page usable', async ({ page }) => {
  const id = await openThenEdit(page, {
    dateFrom: '2025-06-01',
    dateTo: '2025-06-30',
    before: null,
    after: null,
    pinned: [],
  })
  await page.goto(`/i/${id}?tier=0`)
  await expect(page.getByText(flow.workbench.allCloudy)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(flow.workbench.pickPair)).toHaveCount(0)
  await expect(page.getByRole('link', { name: flow.workbench.report })).toBeVisible()
})

test('a range with one clear photo says it is not enough to compare', async ({ page }) => {
  const id = await openThenEdit(page, {
    dateFrom: '2025-03-01',
    dateTo: '2025-03-31',
    before: null,
    after: null,
    pinned: [],
  })
  await page.goto(`/i/${id}?tier=0`)
  await expect(page.getByText(flow.workbench.notEnoughClear)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(flow.workbench.pickPair)).toHaveCount(0)
})

test('an unknown investigation says the page is not found', async ({ page }) => {
  await page.goto('/i/does-not-exist?tier=0')
  await expect(page.getByRole('heading', { name: copy.notFound.title })).toBeVisible()
  await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
})

test('a store that cannot be read says so and links home, never a skeleton forever', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.get = () => {
      throw new DOMException('Storage is unavailable', 'UnknownError')
    }
  })
  await page.goto('/i/local-anything?tier=0')
  await expect(page.getByText(flow.workbench.errors.STORE_FAILED!)).toBeVisible()
  await expect(page.getByRole('link', { name: copy.notFound.home })).toBeVisible()
})

test('a save that fails is shown, and the photos still load', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    let puts = 0
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      // The first put creates the investigation; the second is the workbench saving its default pick.
      if (++puts === 2) throw new DOMException('Storage is full', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await openFixtureSite(page)
  await expect(page.getByText(flow.workbench.errors.SAVE_FAILED!)).toBeVisible({ timeout: 30_000 })
  await waitForPhotos(page)
})

test('an outline that can no longer be read says so and never sticks on searching', async ({ page }) => {
  const id = await openThenEdit(page, {
    aoi: {
      kind: 'site',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [79.08, 21.14],
            [79.09, 21.15],
          ],
        ],
      },
    },
  })
  await page.goto(`/i/${id}?tier=0`)
  await expect(page.getByText(flow.workbench.badOutline)).toBeVisible()
  await expect(page.getByText(flow.workbench.searching)).toHaveCount(0)
})

test('each photo caption names its source item and says it is not saved', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  for (const date of ['2025-01-10', '2025-12-20']) {
    const id = page.getByText(itemId(date), { exact: true })
    await expect(id).toHaveAttribute('title', itemId(date))
    await expect(page.locator('p', { has: id })).toContainText(flow.workbench.notSaved)
  }
})

test('the outline is drawn dashed on the photos and can be switched off', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const outline = page.locator('svg[aria-hidden="true"] path[stroke-dasharray]')
  const toggle = page.getByRole('checkbox', { name: flow.workbench.outlineToggle })
  await expect(toggle).toBeChecked()
  await expect(outline.first()).toBeVisible()
  await expect(outline.first()).toHaveAttribute('vector-effect', 'non-scaling-stroke')
  await toggle.uncheck()
  await expect(outline).toHaveCount(0)
  await toggle.check()
  await expect(outline.first()).toBeVisible()
})

test('a road shows its length and width in the header line', async ({ page }) => {
  await openFixtureRoad(page)
  await expect(page.getByText(/^Road · 2\.9 km · 30 m wide · 10 Jan 2025 ↔ 20 Dec 2025$/)).toBeVisible({
    timeout: 30_000,
  })
})

test('a failed search says so, and Try again finds the passes', async ({ page }) => {
  const search = '**/stac/search'
  await page.route(search, (r) => r.abort())
  await openFixtureSite(page)
  await expect(page.getByText(flow.workbench.searchFailed)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(flow.workbench.searching)).toHaveCount(0)
  await page.unroute(search)
  await page.getByRole('button', { name: copy.common.retry }).click()
  await waitForPhotos(page)
})

test('a photo that fails to load says so, and Try again loads it', async ({ page }) => {
  const id = await openThenEdit(page, {
    before: '2025-01-10',
    after: '2025-12-20',
    pinned: ['2025-01-10', '2025-12-20'],
  })
  const tci = '**/cog/2025-12-20/TCI.tif'
  await page.route(tci, (r) => r.abort())
  await page.goto(`/i/${id}?tier=0`)
  await expect(page.getByText(flow.workbench.checkFailed)).toBeVisible({ timeout: 30_000 })
  await page.unroute(tci)
  await page.getByRole('button', { name: copy.common.retry }).click()
  await waitForPhotos(page)
  await expect(page.getByText(flow.workbench.checkFailed)).toHaveCount(0)
})

// The grid is sized once, when the page opens: a resize or a rotation must not restart the search and the checks.
test('resizing the window does not search again', async ({ page }) => {
  let searches = 0
  page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/stac/search') && searches++)
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFixtureSite(page)
  await waitForPhotos(page)
  expect(searches).toBe(1)
  await page.setViewportSize({ width: 800, height: 900 })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.waitForTimeout(500) // a restart would send its search within a few milliseconds
  expect(searches).toBe(1)
  await waitForPhotos(page)
})

test('the workbench passes axe in every view, in both themes', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  for (const view of ['swipe', 'side', 'diff'] as const) {
    await page.getByRole('radio', { name: flow.workbench.modes[view] }).check()
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations, `${view}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  }
})
