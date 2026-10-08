import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { itemId } from '../fixtures/scene.ts'
import {
  openFixtureRoad,
  openFixtureSite,
  openThenEdit,
  readStored,
  waitForPhotos,
  waitForSettled,
} from './helpers.ts'

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

/** Holds every search of the whole range until the returned `release()`; a search for a single day is answered at once. */
async function holdRange(page: Page) {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/stac/search', async (route) => {
    const [from = '', to = ''] = ((route.request().postDataJSON()?.datetime as string) ?? '').split('/')
    if (from.slice(0, 10) !== to.slice(0, 10)) await held
    await route.continue()
  })
  return release
}
const timelineSlider = (page: Page) => page.getByRole('slider', { name: flow.workbench.timelineLabel })

// The pair is saved, so its two days are searched alone: the photos come while the whole range is still being searched.
test('a saved pair shows its photos while the other passes are still being found', async ({ page }) => {
  const id = await openThenEdit(page, {
    before: '2025-01-10',
    after: '2025-12-20',
    pinned: ['2025-01-10', '2025-12-20'],
  })
  const release = await holdRange(page)
  await page.goto(`/i/${id}?tier=0`)
  try {
    await waitForPhotos(page)
    await expect(page.getByText(flow.workbench.searchingMore)).toBeVisible()
    await expect(page.getByText(flow.workbench.searching, { exact: true })).toHaveCount(0)
    await expect(timelineSlider(page)).toHaveAttribute('max', '1') // the pair alone
  } finally {
    release()
  }
  await expect(page.getByText(flow.workbench.searchingMore)).toHaveCount(0)
  await expect(timelineSlider(page)).toHaveAttribute('max', '3') // all four passes
  await waitForPhotos(page)
})

// With no pair yet, the first passes found are only the pinned ones: they must not decide the pair, nor settle the page.
test('the first passes found pick no pair; the whole list does', async ({ page }) => {
  const id = await openThenEdit(page, { before: null, after: null, pinned: ['2025-03-05', '2025-12-20'] })
  const release = await holdRange(page)
  await page.goto(`/i/${id}?tier=0`)
  const slider = timelineSlider(page)
  try {
    await expect(slider).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
    await slider.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(slider).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear') // both are checked: a pair could be picked
    await page.waitForTimeout(300)
    await expect(page.getByText(flow.workbench.searchingMore)).toBeVisible()
    await expect(page.getByText('1 Jan 2025 to 31 Dec 2025')).toBeVisible() // no pair in the header line
  } finally {
    release()
  }
  // The clearest early and late passes of the whole list, not the 5 Mar that was pinned.
  await expect(page.getByText(/^Site · 1\.00 km² · 10 Jan 2025 ↔ 20 Dec 2025$/)).toBeVisible()
  await waitForPhotos(page)
})

// A failed search leaves only the passes found first (here the pins). They are not the whole list: no pair is picked from them.
test('a failed search picks no pair from the first passes found; Try again picks it from the whole list', async ({
  page,
}) => {
  const id = await openThenEdit(page, { before: null, after: null, pinned: ['2025-03-05', '2025-12-20'] })
  const search = '**/stac/search'
  await page.route(search, async (route) => {
    const [from = '', to = ''] = ((route.request().postDataJSON()?.datetime as string) ?? '').split('/')
    if (from.slice(0, 10) !== to.slice(0, 10)) return route.abort() // the whole range fails, a single day is answered
    await route.continue()
  })
  await page.goto(`/i/${id}?tier=0`)
  const slider = timelineSlider(page)
  await expect(page.getByText(flow.workbench.searchFailed)).toBeVisible({ timeout: 30_000 })
  await expect(slider).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/)
  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear') // both are checked: a pair could be picked
  await page.waitForTimeout(300)
  expect((await readStored(page, id)).before).toBeNull()
  await page.unroute(search)
  await page.getByRole('button', { name: copy.common.retry }).click()
  await expect(page.getByText(/^Site · 1\.00 km² · 10 Jan 2025 ↔ 20 Dec 2025$/)).toBeVisible()
})

test('the first passes found do not say every photo is obscured', async ({ page }) => {
  const id = await openThenEdit(page, { before: null, after: null, pinned: ['2025-06-15'] })
  const release = await holdRange(page)
  await page.goto(`/i/${id}?tier=0`)
  try {
    await expect(timelineSlider(page)).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured', {
      timeout: 30_000,
    })
    await page.waitForTimeout(300)
    await expect(page.getByText(flow.workbench.searchingMore)).toBeVisible()
    await expect(page.getByText(flow.workbench.allCloudy)).toHaveCount(0)
  } finally {
    release()
  }
  await waitForPhotos(page) // the whole list holds a clear pair
  await expect(page.getByText(flow.workbench.allCloudy)).toHaveCount(0)
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
  await waitForSettled(page, { photos: false }) // the After photo is the one that fails
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

test('the workbench passes axe in every view, in both themes, with a note and a claim on the page', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const notes = page.getByRole('region', { name: flow.notes.title })
  await notes.getByLabel(flow.notes.what).fill('Roof visible from March')
  await notes.getByRole('button', { name: flow.notes.add }).click()
  await expect(notes.getByText('Roof visible from March')).toBeVisible()
  const claim = page.getByRole('region', { name: flow.claim.title })
  await claim.getByLabel(flow.claim.text, { exact: true }).fill('Roof finished by March')
  await claim.getByRole('button', { name: flow.claim.save }).click()
  await expect(claim.getByRole('button', { name: flow.claim.remove })).toBeVisible()
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
  // The inline note editor too.
  await notes.getByRole('button', { name: flow.notes.edit }).click()
  await expect(notes.getByLabel(flow.notes.edit)).toBeVisible()
  const editing = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(editing.violations, `editing: ${JSON.stringify(editing.violations, null, 2)}`).toEqual([])
})

test('the road workbench, with its section grid and the Details open, passes axe in both themes', async ({
  page,
}) => {
  await openFixtureRoad(page)
  await waitForPhotos(page)
  await expect(page.getByRole('grid', { name: flow.workbench.grid })).toBeVisible()
  await page.locator('summary', { hasText: copy.common.details }).click()
  // A road note names its section: the section picker and the section on the note are covered too.
  const notes = page.getByRole('region', { name: flow.notes.title })
  await notes.getByLabel(flow.notes.what).fill('Surface patched here')
  await notes.getByLabel(flow.notes.forSection).selectOption({ label: '2.0–2.9 km' })
  await notes.getByRole('button', { name: flow.notes.add }).click()
  await expect(notes.getByRole('listitem')).toContainText('2.0–2.9 km')
  for (let i = 0; i < 2; i++) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
})
