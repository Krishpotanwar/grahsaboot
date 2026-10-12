import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { itemId } from '../fixtures/scene.ts'
import {
  openClaim,
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
  // Under each photo: its date, satellite (from the item id) and resolution, then its clear view and that it is not saved.
  await expect(page.getByText('10 Jan 2025 · Sentinel-2B · 10 m', { exact: true })).toBeVisible()
  await expect(page.getByText('20 Dec 2025 · Sentinel-2B · 10 m', { exact: true })).toBeVisible()
  await expect(page.getByText('100% clear view', { exact: true })).toHaveCount(2)
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
  // Said once, as a toast where the person is, not also in the header far above the notes.
  await expect(page.getByText(flow.workbench.errors.SAVE_FAILED!)).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByText(flow.workbench.errors.SAVE_FAILED!)).toBeInViewport()
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
  const claim = await openClaim(page)
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

const sitePage = async (page: Page, width = 1440, height = 900) => {
  await page.setViewportSize({ width, height })
  await openFixtureSite(page)
  await waitForPhotos(page)
}

test('the title block has the status beside the Report button, and stacks on a phone', async ({ page }) => {
  await sitePage(page)
  const head = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) })
  const title = head.getByRole('heading', { level: 1 })
  const status = head.getByText(flow.workbench.notSaved, { exact: true })
  const report = head.getByRole('link', { name: flow.workbench.report })
  const [t, s, r] = [title, status, report].map((l) => l.boundingBox())
  const [tb, sb, rb] = (await Promise.all([t, s, r])).map((b) => b!)
  expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('30px')
  expect(sb.x + sb.width).toBeLessThanOrEqual(rb.x) // left of the button, on its line
  expect(Math.abs(sb.y + sb.height / 2 - (rb.y + rb.height / 2))).toBeLessThan(6)
  expect(sb.x).toBeGreaterThan(tb.x + 300) // on the right, not above the title
  expect(rb.height).toBeGreaterThanOrEqual(44)
  // The primary button: filled with the text colour, in the page colour.
  expect(await report.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(244, 244, 245)')
  // The status is plain text, not a bracketed micro label.
  await expect(head).not.toContainText('[ ')

  await page.setViewportSize({ width: 390, height: 844 })
  const [phoneTitle, phoneMeta, phoneStatus, phoneReport] = (
    await Promise.all([
      title.boundingBox(),
      head.locator('p').boundingBox(),
      status.boundingBox(),
      report.boundingBox(),
    ])
  ).map((b) => b!)
  expect(phoneMeta.y).toBeGreaterThanOrEqual(phoneTitle.y + phoneTitle.height)
  expect(phoneStatus.y).toBeGreaterThanOrEqual(phoneMeta.y + phoneMeta.height)
  expect(phoneReport.y).toBeGreaterThanOrEqual(phoneMeta.y + phoneMeta.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('the three views are a row of tabs of real radios: 54 px tall, an icon each, arrow keys between them', async ({
  page,
}) => {
  await sitePage(page)
  const radios = page.getByRole('radio', { name: /^(Swipe|Side by side|Difference)$/ })
  await expect(radios).toHaveCount(3)
  for (const r of await radios.all()) {
    expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(54)
    await expect(r.locator('xpath=following-sibling::span').locator('svg')).toHaveCount(1)
  }
  const swipe = page.getByRole('radio', { name: flow.workbench.modes.swipe })
  await expect(swipe).toBeChecked()
  // The chosen tab is underlined with 2 px.
  const label = swipe.locator('xpath=following-sibling::span')
  expect(await label.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('2px')
  await swipe.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: flow.workbench.modes.side })).toBeChecked()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: flow.workbench.modes.diff })).toBeChecked()
  await expect(page.getByRole('group', { name: flow.workbench.view })).toBeVisible()
})

test('every photo has its date chip, a scale bar to scale and a north arrow, all outside the pointer and the page reader', async ({
  page,
}) => {
  await sitePage(page)
  const chip = (text: string) => page.locator('[data-chip]', { hasText: text })
  // Swipe: BEFORE at the left corner, AFTER at the right.
  const before = chip(`${flow.workbench.before} · 10 Jan 2025`)
  const after = chip(`${flow.workbench.after} · 20 Dec 2025`)
  await expect(before).toBeVisible()
  await expect(after).toBeVisible()
  const photo = (await page.getByRole('slider', { name: flow.workbench.swipeLabel }).boundingBox())!
  const [bb, ab] = [(await before.boundingBox())!, (await after.boundingBox())!]
  expect(bb.x - photo.x).toBeLessThan(24)
  expect(photo.x + photo.width - (ab.x + ab.width)).toBeLessThan(24)
  expect(bb.y - photo.y).toBeLessThan(24)
  // Decoration: a chip does not take the pointer and is not read out (the caption and the photo's name say the same).
  for (const el of [before, after]) {
    expect(await el.evaluate((e) => getComputedStyle(e.parentElement!).pointerEvents)).toBe('none')
    expect(await el.evaluate((e) => !!e.closest('[aria-hidden="true"]'))).toBe(true)
    expect(await el.evaluate((e) => getComputedStyle(e).textTransform)).toBe('uppercase')
  }
  // The fixture is a 1 km square: with its margins a 1.2 km photo, whose scale bar is 200 m, a sixth of its width.
  const scale = page.locator('span', { hasText: /^200 m$/ }).first()
  await expect(scale).toBeVisible()
  const bar = (await scale.locator('span').boundingBox())!
  expect(bar.width / photo.width).toBeGreaterThan(0.15)
  expect(bar.width / photo.width).toBeLessThan(0.18)
  await expect(page.getByText(flow.workbench.north)).toBeVisible()
  // The handle stays whole inside the photo at both ends of the swipe.
  const handle = page.locator('[data-handle]')
  for (const v of ['0', '100']) {
    await page.getByRole('slider', { name: flow.workbench.swipeLabel }).fill(v)
    const h = (await handle.boundingBox())!
    expect(h.x).toBeGreaterThanOrEqual(photo.x)
    expect(h.x + h.width).toBeLessThanOrEqual(photo.x + photo.width + 0.5)
    expect(h.width).toBeGreaterThanOrEqual(38)
  }
  // Side by side: each photo its own chip, scale bar and north arrow.
  await page.getByRole('radio', { name: flow.workbench.modes.side }).check()
  await expect(chip(`${flow.workbench.before} · 10 Jan 2025`)).toBeVisible()
  await expect(chip(`${flow.workbench.after} · 20 Dec 2025`)).toBeVisible()
  await expect(page.getByText(flow.workbench.north)).toHaveCount(2)
  await expect(page.locator('span', { hasText: /^200 m$/ })).toHaveCount(2)
  // Difference: one chip, and the two dates stay in the captions.
  await page.getByRole('radio', { name: flow.workbench.modes.diff }).check()
  await expect(chip(flow.workbench.diffChip)).toBeVisible()
  await expect(page.getByText('10 Jan 2025 · Sentinel-2B · 10 m', { exact: true })).toBeVisible()
  await expect(page.getByText('20 Dec 2025 · Sentinel-2B · 10 m', { exact: true })).toBeVisible()
})

test('a road numbers its sections along the line on the photos, and the numbers go with the outline', async ({
  page,
}) => {
  await openFixtureRoad(page)
  await waitForPhotos(page)
  const numbers = page.locator('span', { hasText: /^0[12]$/ })
  // Swipe draws the outline on both photos: two sections, two photos.
  await expect(numbers).toHaveCount(4)
  expect(await numbers.first().evaluate((e) => !!e.closest('[aria-hidden="true"]'))).toBe(true)
  await page.getByRole('checkbox', { name: flow.workbench.outlineToggle }).uncheck()
  await expect(numbers).toHaveCount(0)
})

test('a site has no section numbers', async ({ page }) => {
  await sitePage(page)
  await expect(page.locator('span', { hasText: /^0[12]$/ })).toHaveCount(0)
})

// The timeline (and on a phone the viewer too) used to arrive 20-30 s after the page opened and push the notes down by their
// own height. Their places are held while the search runs, so the notes are where they will stay. The timeline's own size changes
// when it is redrawn (P1b): this is the test that fails when its placeholder is not made to match.
for (const [name, width, height, limit, open] of [
  ['a site on a desktop', 1440, 900, 120, openFixtureSite],
  ['a road on a desktop', 1440, 900, 120, openFixtureRoad],
  ['a site on a phone', 390, 844, 200, openFixtureSite],
  ['a road on a phone', 390, 844, 200, openFixtureRoad],
] as const) {
  test(`the notes do not move when the passes arrive: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const release = await holdRange(page)
    try {
      await open(page)
      const add = page
        .getByRole('region', { name: flow.notes.title })
        .getByRole('button', { name: flow.notes.add })
      await expect(add).toBeVisible()
      await expect(page.getByText(flow.workbench.searching)).toBeVisible()
      await page.waitForTimeout(300) // the places are laid out
      const held = (await add.boundingBox())!.y
      release()
      // The moment the timeline is there, and again once its date is checked and the photos are in.
      await expect(timelineSlider(page)).toBeVisible({ timeout: 30_000 })
      const first = (await add.boundingBox())!.y
      expect(Math.abs(first - held), `when the timeline arrived: ${first} against ${held}`).toBeLessThan(
        limit,
      )
      await waitForSettled(page)
      const settled = (await add.boundingBox())!.y
      expect(Math.abs(settled - held), `settled: ${settled} against ${held}`).toBeLessThan(limit)
    } finally {
      release()
    }
  })
}

// "Finding the other passes." is said above the viewer while the whole range is searched, on a phone the whole page's worth of
// content below it: its line is held from the first moment, so it comes in without moving the viewer, the timeline or the notes.
test('the line that says the other passes are being found comes in without moving anything below it', async ({
  page,
}) => {
  const id = await openThenEdit(page, {
    before: '2025-01-10',
    after: '2025-12-20',
    pinned: ['2025-01-10', '2025-12-20'],
  })
  await page.setViewportSize({ width: 390, height: 844 })
  // Two gates: the search of each known day (the pair, answered first) and the search of the whole range.
  let openDays!: () => void
  let openRange!: () => void
  const days = new Promise<void>((r) => (openDays = r))
  const range = new Promise<void>((r) => (openRange = r))
  await page.route('**/stac/search', async (route) => {
    const [from = '', to = ''] = ((route.request().postDataJSON()?.datetime as string) ?? '').split('/')
    await (from.slice(0, 10) === to.slice(0, 10) ? days : range)
    await route.continue()
  })
  try {
    await page.goto(`/i/${id}?tier=0`)
    const add = page
      .getByRole('region', { name: flow.notes.title })
      .getByRole('button', { name: flow.notes.add })
    await expect(page.getByText(flow.workbench.searching)).toBeVisible()
    await page.waitForTimeout(300)
    const held = (await add.boundingBox())!.y
    openDays()
    await waitForPhotos(page)
    await expect(page.getByText(flow.workbench.searchingMore)).toBeVisible()
    await page.waitForTimeout(300)
    const moved = (await add.boundingBox())!.y
    expect(Math.abs(moved - held), `the notes moved from ${held} to ${moved}`).toBeLessThan(12)
  } finally {
    openDays()
    openRange()
  }
  await expect(page.getByText(flow.workbench.searchingMore)).toHaveCount(0)
})

test('while the search runs the viewer says so in its own box, and nothing is left saying it afterwards', async ({
  page,
}) => {
  const release = await holdRange(page)
  try {
    await openFixtureSite(page)
    await expect(page.getByText(flow.workbench.searching)).toBeVisible()
    // Its place is held: the tabs are there but not usable, the photo box is a placeholder with no photo in it.
    await expect(page.getByRole('radio', { name: flow.workbench.modes.swipe })).toBeDisabled()
    await expect(page.getByRole('checkbox', { name: flow.workbench.outlineToggle })).toBeDisabled()
    await expect(page.getByRole('img', { name: /photo/ })).toHaveCount(0)
    await expect(timelineSlider(page)).toHaveCount(0)
  } finally {
    release()
  }
  await waitForPhotos(page)
  await expect(page.getByText(flow.workbench.searching)).toHaveCount(0)
  await expect(page.getByRole('radio', { name: flow.workbench.modes.swipe })).toBeEnabled()
})

test('the swipe date chips do not run into each other on a phone', async ({ page }) => {
  await sitePage(page, 390, 844)
  await page.getByRole('radio', { name: flow.workbench.modes.swipe }).check()
  const chip = (t: string) => page.locator('[data-chip]', { hasText: t })
  const b = (await chip(`${flow.workbench.before} · 10 Jan 2025`).boundingBox())!
  const a = (await chip(`${flow.workbench.after} · 20 Dec 2025`).boundingBox())!
  expect(b.x + b.width).toBeLessThanOrEqual(a.x)
})

test('each view tab stays on one line at 360 px', async ({ page }) => {
  await sitePage(page, 360, 740)
  for (const m of ['swipe', 'side', 'diff'] as const) {
    const tab = page
      .getByRole('radio', { name: flow.workbench.modes[m] })
      .locator('xpath=following-sibling::span')
    const lines = await tab.evaluate((el) => {
      const r = document.createRange()
      r.selectNodeContents(el.lastChild!) // the label text; the icon (hidden on a phone) comes first
      return new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size
    })
    expect(lines, flow.workbench.modes[m]).toBe(1)
  }
})

test('only the chosen view tab has the accent underline', async ({ page }) => {
  await sitePage(page)
  const under = (m: 'swipe' | 'side') =>
    page
      .getByRole('radio', { name: flow.workbench.modes[m] })
      .locator('xpath=following-sibling::span')
      .evaluate((el) => getComputedStyle(el).borderBottomColor)
  expect(await under('swipe')).not.toBe('rgba(0, 0, 0, 0)')
  expect(await under('side')).toBe('rgba(0, 0, 0, 0)')
})

test('the held places pass axe in both themes while the search runs', async ({ page }) => {
  const release = await holdRange(page)
  try {
    await openFixtureRoad(page)
    await expect(page.getByText(flow.workbench.searching)).toBeVisible()
    for (let i = 0; i < 2; i++) {
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  } finally {
    release()
  }
})
