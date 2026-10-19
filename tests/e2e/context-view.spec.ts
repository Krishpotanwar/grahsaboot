import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fmtDate } from '../../src/lib/format.ts'
import { COST_MB } from '../../src/new/contextState.ts'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { startAt } from './helpers.ts'

// The satellite view of the outline step (tier 2, fixture imagery): the Map | Satellite switch, the one line under it and the
// picture it puts behind the roads. `?now=` (test builds only) is the loader's today, so the fixture's 2025 scenes are recent:
// on 2025-12-31 the scene of 20 Dec (0.4 % cloud) is 10 days old, on 2026-03-31 it is 100 days old, and on 2027-01-01 nothing is.
const NAGPUR = 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur'
const MIDDLE: [number, number] = [79.0863, 21.148] // the middle of the fixture's picture
const LABEL = flow.context.on(fmtDate('2025-12-20'))

const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
const styleReady = (page: Page) => page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
const jump = (page: Page, zoom: number, center = MIDDLE) =>
  page.evaluate(([c, z]) => (window as any).__gs.map.jumpTo({ center: c, zoom: z, pitch: 0, bearing: 0 }), [
    center,
    zoom,
  ] as const)
/** The tier 2 outline step with its map ready and over the middle of the fixture's picture (1.1 km a side at zoom 16 on a laptop). */
async function open(page: Page, { now = '2025-12-31', zoom = 16 }: { now?: string; zoom?: number } = {}) {
  await startAt(page, `${NAGPUR}&now=${now}`)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await styleReady(page)
  await jump(page, zoom)
  // ready once the switch can be turned on, or, in a view too wide for it, once it says so
  if (zoom >= 13) await expect(satellite(page)).toBeEnabled({ timeout: 30_000 })
  else await expect(page.getByText(flow.context.tooWideOn)).toBeVisible({ timeout: 30_000 })
}

const group = (page: Page) => page.getByRole('group', { name: flow.context.legend })
const mapRadio = (page: Page) => page.getByRole('radio', { name: flow.context.map, exact: true })
const satellite = (page: Page) => page.getByRole('radio', { name: flow.context.satellite(COST_MB) })
const update = (page: Page) => page.getByRole('button', { name: flow.context.update })
const cancel = (page: Page) => page.getByRole('button', { name: copy.common.cancel })
const retry = (page: Page) => page.getByRole('button', { name: copy.common.retry })
const kindOfPlace = (page: Page) => page.getByRole('group', { name: flow.outline.kindLegend })
const theme = (page: Page) => page.getByRole('button', { name: copy.nav.themeToggle })
// A map that was just rebuilt has no style until its JSON arrives: no layers yet is an answer, not an error (expect.poll does not retry a throw).
const ids = (page: Page): Promise<string[]> =>
  page.evaluate(() => ((window as any).__gs.map.getStyle()?.layers ?? []).map((l: any) => l.id as string))
const hasPicture = async (page: Page) => (await ids(page)).includes('gs-context')
const credit = (page: Page) => page.locator('.maplibregl-ctrl-attrib-inner')

/** Turns the switch on and waits for the picture, whatever it is (clear or cloudy). */
async function showPicture(page: Page) {
  await satellite(page).check()
  await expect(page.getByText(/^Satellite view · Sentinel-2/)).toBeVisible({ timeout: 30_000 })
}

/** Every search and every picture request the page makes, and the imagery workers it starts and ends. */
function watch(page: Page) {
  const seen = { search: [] as Array<{ bbox?: number[] }>, scl: 0, tci: 0, created: 0, closed: 0 }
  page.on('request', (r) => {
    const url = r.url()
    if (url.endsWith('/stac/search')) seen.search.push(r.postDataJSON())
    else if (url.endsWith('/SCL.tif')) seen.scl++
    else if (url.endsWith('/TCI.tif')) seen.tci++
  })
  page.on('worker', (w) => {
    if (!/imagery/.test(w.url())) return // MapLibre has workers of its own
    seen.created++
    w.on('close', () => seen.closed++)
  })
  return seen
}

/** Holds back every request to `url` until `release()`. A request the page gave up on meanwhile is already gone. */
async function hold(page: Page, url: string | RegExp) {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const held = { arrived: 0, release: () => release() }
  await page.route(url, async (route) => {
    held.arrived++
    await gate
    await route.continue().catch(() => {})
  })
  return held
}
const SEARCH = '**/stac/search'
const SCL = /\/cog\/[^/]+\/SCL\.tif$/
const TCI = /\/cog\/[^/]+\/TCI\.tif$/

/** The scene's cloud check reads the cloudy day's file instead: nothing of it is clear. */
const cloudy = (page: Page) =>
  page.route('**/cog/2025-12-20/SCL.tif', async (route) =>
    route.fulfill({
      response: await route.fetch({ url: route.request().url().replace('2025-12-20', '2025-06-15') }),
    }),
  )

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const box = async (l: Locator) => (await l.boundingBox())!

test('starts on Map, says what the photo gives and what it costs, and loads nothing', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  await expect(group(page)).toBeVisible()
  await expect(mapRadio(page)).toBeChecked()
  await expect(satellite(page)).not.toBeChecked()
  await expect(satellite(page)).toHaveAccessibleName(`Satellite · about ${COST_MB} MB`)
  await expect(page.getByText(flow.context.off)).toBeVisible()
  await expect(page.getByRole('button', { name: flow.context.update })).toHaveCount(0)
  await page.waitForTimeout(1500)
  expect(await hasPicture(page)).toBe(false)
  expect(seen.search).toHaveLength(0)
  expect(seen.created).toBe(0) // not even a worker
})

test('says its three steps in order, then shows the picture with its date and that it is not evidence', async ({
  page,
}) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  const search = await hold(page, SEARCH)
  await satellite(page).check()
  await expect(satellite(page)).toBeChecked()
  const stage = (s: string) => page.getByRole('status').filter({ hasText: s })
  await expect(stage(flow.context.stages.searching)).toBeVisible()
  await expect(cancel(page)).toBeEnabled()
  await expect(update(page)).toBeDisabled()
  expect(search.arrived).toBe(1)
  const checks = await hold(page, SCL)
  search.release()
  await expect(stage(flow.context.stages.checking)).toBeVisible()
  const read = await hold(page, TCI)
  checks.release()
  await expect(stage(flow.context.stages.reading)).toBeVisible()
  expect(
    await page.getByRole('status').filter({ hasText: flow.context.stages.reading }).innerText(),
  ).not.toMatch(/\d/)
  expect(await hasPicture(page)).toBe(false)
  read.release()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('days old')).toHaveCount(0) // 10 days old: not worth saying
  await expect(update(page)).toBeEnabled()
  await expect(cancel(page)).toHaveCount(0)
  expect(await hasPicture(page)).toBe(true)
  // above the land, below the roads and the labels
  const order = await ids(page)
  expect(order.indexOf('gs-context')).toBeGreaterThan(order.indexOf('building'))
  expect(order.indexOf('gs-context')).toBeLessThan(order.indexOf('highway_minor'))
  expect(seen.search).toHaveLength(1)
  await expect.poll(() => seen.closed).toBe(1) // the worker goes as soon as the photo is read
  expect(seen.created).toBe(1)
})

test('gives the age of an old photo, still with its date and that it is not evidence', async ({ page }) => {
  await open(page, { now: '2026-03-31', zoom: 15 })
  await showPicture(page)
  await expect(page.getByText(LABEL)).toBeVisible()
  await expect(page.getByText(flow.context.age(100))).toBeVisible()
})

test('Map takes the picture and its credit away, and the choice is remembered as Map', async ({ page }) => {
  await open(page, { zoom: 15 })
  await expect(credit(page)).not.toContainText('Copernicus')
  await showPicture(page)
  await expect(credit(page)).toContainText(copy.attribution.sentinel(2025))
  await mapRadio(page).check()
  await expect(page.getByText(flow.context.off)).toBeVisible()
  await expect.poll(() => hasPicture(page)).toBe(false)
  await expect(credit(page)).not.toContainText('Copernicus')
  await expect(update(page)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('gs-context-view'))).toBe('map')
})

test('a theme switch keeps the picture, still under the roads, and its credit', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  await showPicture(page)
  for (const bg of ['#FFFFFF', '#09090B']) {
    await theme(page).click()
    await page.waitForFunction(
      (c) =>
        (window as any).__gs.map.getStyle()?.layers.find((l: any) => l.id === 'bg')?.paint?.[
          'background-color'
        ] === c,
      bg,
    )
    await expect
      .poll(async () => {
        const order = await ids(page)
        return (
          order.indexOf('gs-context') > order.indexOf('building') &&
          order.indexOf('gs-context') < order.indexOf('highway_minor')
        )
      })
      .toBe(true)
    await expect(page.getByText(LABEL)).toBeVisible()
    await expect(credit(page)).toContainText(copy.attribution.sentinel(2025))
  }
  expect(seen.search).toHaveLength(1) // the picture came back with the style: no second load
  expect(seen.created).toBe(1)
})

test('a theme switch in the middle of a load ends that load, which starts again once the map is ready', async ({
  page,
}) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  const checks = await hold(page, SCL)
  await satellite(page).check()
  await expect.poll(() => checks.arrived).toBeGreaterThan(0)
  await theme(page).click()
  await expect.poll(() => seen.created).toBe(2) // the first load's worker is gone, a new load has its own
  checks.release()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
  expect(await ids(page)).toContain('gs-context')
  expect((await ids(page)).filter((id) => id === 'gs-context')).toHaveLength(1)
  await expect.poll(() => seen.closed).toBe(2)
})

test('a rebuilt map keeps the picture, its credit and its line', async ({ page }) => {
  await open(page, { zoom: 15 })
  await showPicture(page)
  await page.evaluate(() => {
    const w = window as any
    w.__before = w.__gs.map
    w.__gs.map.getCanvas().dispatchEvent(new Event('webglcontextlost'))
  })
  await page.waitForFunction(
    () => (window as any).__gs.map && (window as any).__gs.map !== (window as any).__before,
  )
  await expect.poll(() => hasPicture(page)).toBe(true)
  await expect(credit(page)).toContainText(copy.attribution.sentinel(2025))
  await expect(page.getByText(LABEL)).toBeVisible()
  await expect(satellite(page)).toBeChecked()
})

test('leaving the step takes the picture and the credit away, and starts nothing more', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  await showPicture(page)
  await page.getByRole('button', { name: copy.common.back }).click()
  await expect(page.getByRole('heading', { name: flow.place.title })).toBeVisible()
  expect(await hasPicture(page)).toBe(false)
  await expect(credit(page)).not.toContainText('Copernicus')
  const before = { search: seen.search.length, scl: seen.scl, tci: seen.tci }
  await page.waitForTimeout(1000)
  expect({ search: seen.search.length, scl: seen.scl, tci: seen.tci }).toEqual(before)
})

test('leaving in the middle of a load ends it: the worker goes and no photo is read', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  const checks = await hold(page, SCL)
  await satellite(page).check()
  await expect.poll(() => checks.arrived).toBeGreaterThan(0)
  await page.getByRole('button', { name: copy.common.back }).click()
  await expect(page.getByRole('heading', { name: flow.place.title })).toBeVisible()
  await expect.poll(() => seen.closed).toBe(1)
  checks.release()
  await page.waitForTimeout(1500)
  expect(seen.tci).toBe(0)
  expect(await hasPicture(page)).toBe(false)
})

test('Cancel ends the load, puts focus on Map and starts nothing more', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  const checks = await hold(page, SCL)
  await satellite(page).check()
  await expect.poll(() => checks.arrived).toBeGreaterThan(0)
  await cancel(page).click()
  await expect(mapRadio(page)).toBeFocused()
  await expect(mapRadio(page)).toBeChecked()
  await expect(page.getByText(flow.context.off)).toBeVisible()
  await expect(cancel(page)).toHaveCount(0)
  await expect.poll(() => seen.closed).toBe(1)
  checks.release()
  await page.waitForTimeout(1500)
  expect(seen.tci).toBe(0)
  expect(await hasPicture(page)).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('gs-context-view'))).toBe('map')
})

test('works from the keyboard, and each option is a 44 px target', async ({ page }) => {
  await open(page, { zoom: 15 })
  for (const radio of [mapRadio(page), satellite(page)]) {
    const face = radio.locator('xpath=following-sibling::span')
    expect((await box(face)).height).toBeGreaterThanOrEqual(44)
  }
  await mapRadio(page).focus()
  await page.keyboard.press('ArrowRight') // the arrow keys move between the two radios of the group
  await expect(satellite(page)).toBeChecked()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('ArrowLeft')
  await expect(mapRadio(page)).toBeChecked()
  await expect(page.getByText(flow.context.off)).toBeVisible()
  // Cancel by key: Tab from the radios reaches the buttons, and focus goes back to Map
  const search = await hold(page, SEARCH)
  await page.keyboard.press('ArrowRight')
  await expect(cancel(page)).toBeVisible()
  await cancel(page).focus()
  await page.keyboard.press('Enter')
  await expect(mapRadio(page)).toBeFocused()
  search.release()
})

test('in forced colours the chosen option is still marked (underlined), not by its colours alone', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await open(page, { zoom: 15 })
  const line = (radio: Locator) =>
    radio.locator('xpath=following-sibling::span').evaluate((n) => getComputedStyle(n).textDecorationLine)
  expect(await line(mapRadio(page))).toBe('underline')
  expect(await line(satellite(page))).toBe('none')
})

test('Update for this view plans a new load from where the map is now', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 16 })
  await showPicture(page)
  // where the picture is: the middle of its four corners
  const middle = () =>
    page.evaluate(() => {
      const c: Array<[number, number]> | undefined = (window as any).__gs.map.getSource(
        'gs-context',
      )?.coordinates
      return c ? [c.reduce((s, p) => s + p[0], 0) / 4, c.reduce((s, p) => s + p[1], 0) / 4] : [0, 0] // none while it loads
    })
  const [x0, y0] = await middle()
  expect(x0).toBeCloseTo(MIDDLE[0], 3)
  expect(y0).toBeCloseTo(MIDDLE[1], 3)
  await jump(page, 16, [MIDDLE[0] + 0.004, MIDDLE[1]])
  await update(page).click()
  await expect.poll(async () => (await middle())[0]).toBeCloseTo(MIDDLE[0] + 0.004, 3)
  await expect(update(page)).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByText(LABEL)).toBeVisible()
  expect(seen.search).toHaveLength(2)
  expect(seen.created).toBe(2)
  expect((await ids(page)).filter((id) => id === 'gs-context')).toHaveLength(1)
})

test('a second press of Update, a second press of Satellite and a double toggle never start a second load', async ({
  page,
}) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  await showPicture(page)
  expect(seen.created).toBe(1)
  // Update twice, fast, with the search held back: one more load, not two
  const search = await hold(page, SEARCH)
  await update(page).dblclick()
  await expect.poll(() => search.arrived).toBe(1)
  await page.waitForTimeout(500)
  expect(seen.created).toBe(2)
  expect(seen.search).toHaveLength(2)
  search.release()
  await expect(update(page)).toBeEnabled({ timeout: 30_000 })
  // Satellite is already on: pressing it again is nothing
  await satellite(page).click()
  await page.waitForTimeout(500)
  expect(seen.created).toBe(2)
  // off, on, off, on in a row: the first of these loads was ended before the next began, and only the last one is shown
  await mapRadio(page).check()
  await satellite(page).check()
  await mapRadio(page).check()
  await satellite(page).check()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => seen.closed).toBe(seen.created)
  expect(seen.created).toBeLessThanOrEqual(4)
  expect((await ids(page)).filter((id) => id === 'gs-context')).toHaveLength(1)
})

test('the choice is remembered, and takes effect once the view fits', async ({ page }) => {
  const seen = watch(page)
  await open(page, { zoom: 15 })
  await showPicture(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
  await styleReady(page)
  // too wide: Satellite stays chosen and waits, nothing is asked for
  await jump(page, 9)
  await expect(satellite(page)).toBeChecked()
  await expect(satellite(page)).toBeDisabled()
  await expect(page.getByText(flow.context.tooWideOn)).toBeVisible()
  const before = seen.search.length
  await page.waitForTimeout(1500)
  expect(seen.search).toHaveLength(before)
  expect(await hasPicture(page)).toBe(false)
  // a view that fits: it loads
  await jump(page, 15)
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
  expect(await hasPicture(page)).toBe(true)
  // and Map is remembered just the same
  await mapRadio(page).check()
  await page.reload()
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
  await styleReady(page)
  await jump(page, 15)
  await expect(mapRadio(page)).toBeChecked()
  await page.waitForTimeout(1000)
  expect(await hasPicture(page)).toBe(false)
})

test('works without storage: the choice just is not remembered', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
  })
  await open(page, { zoom: 15 })
  await showPicture(page)
  await expect(page.getByText(LABEL)).toBeVisible()
})

test('cannot be turned on while the view is wider than 12 km, and says how to', async ({ page }) => {
  await open(page, { zoom: 9 })
  await expect(satellite(page)).toBeDisabled()
  await expect(mapRadio(page)).toBeEnabled()
  await expect(page.getByText(flow.context.tooWideOn)).toBeVisible()
  await jump(page, 15)
  await expect(satellite(page)).toBeEnabled()
  await expect(page.getByText(flow.context.off)).toBeVisible()
})

test('zooming out with the picture on keeps it and its label, keeps both radios, and turns only Update off', async ({
  page,
}) => {
  await open(page, { zoom: 15 })
  await showPicture(page)
  await jump(page, 9)
  await expect(update(page)).toBeDisabled()
  await expect(page.getByText(flow.context.tooWideUpdate)).toBeVisible()
  await expect(page.getByText(LABEL)).toBeVisible()
  await expect(satellite(page)).toBeEnabled()
  await expect(mapRadio(page)).toBeEnabled()
  expect(await hasPicture(page)).toBe(true)
  await jump(page, 15)
  await expect(update(page)).toBeEnabled()
  await expect(page.getByText(flow.context.tooWideUpdate)).toHaveCount(0)
})

test('a window made wider makes the view too wide without the map moving: the picture stays, Update goes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, { zoom: 13 })
  await jump(page, 12) // 7 km across on a phone, 14 km on a laptop
  await expect(satellite(page)).toBeEnabled()
  await showPicture(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByText(flow.context.tooWideUpdate)).toBeVisible()
  await expect(update(page)).toBeDisabled()
  expect(await hasPicture(page)).toBe(true)
})

test('shows the clearest photo when every one is cloudy, with its figure and that clouds cover most of it', async ({
  page,
}) => {
  await open(page, { zoom: 15 })
  await cloudy(page)
  await showPicture(page)
  await expect(page.getByText(flow.context.cloudy(0), { exact: false })).toBeVisible()
  await expect(page.getByText('Clouds cover most of it.')).toBeVisible()
  await expect(page.getByText(LABEL)).toBeVisible() // still dated and still not evidence
  expect(await hasPicture(page)).toBe(true)
})

test('says when no photo covers the area, as information, and Try again looks again', async ({ page }) => {
  const seen = watch(page)
  await open(page, { now: '2027-01-01', zoom: 15 })
  await satellite(page).check()
  await expect(page.getByText(flow.context.none)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await hasPicture(page)).toBe(false)
  await expect(retry(page)).toBeEnabled()
  await retry(page).click()
  await expect.poll(() => seen.search.length).toBe(2)
  await expect(page.getByText(flow.context.none)).toBeVisible()
})

test('says in an alert that it could not reach the photo service, and Try again works once it can', async ({
  page,
}) => {
  await open(page, { zoom: 15 })
  await page.route(SEARCH, (route) => route.abort())
  await satellite(page).check()
  const line = await page.getByText(flow.context.stages.searching).elementHandle()
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText(flow.context.offline, { timeout: 30_000 })
  await expect(alert).toHaveClass(/text-bad/)
  // the alert is a node of its own, which a screen reader says at once; the polite line stays mounted (and empty), so what it says
  // after Try again is a change inside a live region, not a region inserted with its text
  expect(await line!.evaluate((n) => n.isConnected)).toBe(true)
  expect(await line!.evaluate((n) => n.getAttribute('role'))).toBe('status')
  expect(await line!.evaluate((n) => n.textContent)).toBe('')
  await expect(page.getByText('Searching')).toHaveCount(0)
  expect(await hasPicture(page)).toBe(false)
  await page.unroute(SEARCH)
  await retry(page).click()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('says one calm line when the photo cannot be read, without calling it offline, and Try again works', async ({
  page,
}) => {
  await open(page, { zoom: 15 })
  await page.route(TCI, (route) => route.abort())
  await satellite(page).check()
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText(flow.context.failed, { timeout: 45_000 })
  await expect(alert).not.toContainText(/offline|no photo/i)
  expect(await hasPicture(page)).toBe(false)
  await page.unroute(TCI)
  await retry(page).click()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
})

test('says it is still working after a while, inside the same line, and has no figure', async ({ page }) => {
  await page.clock.install()
  await open(page, { zoom: 15 })
  const search = await hold(page, SEARCH)
  await satellite(page).check()
  await expect(page.getByText(flow.context.stages.searching)).toBeVisible()
  await expect(page.getByText(flow.context.still)).toHaveCount(0)
  await page.clock.fastForward(19_000)
  await expect(page.getByText(flow.context.still)).toHaveCount(0) // not before about 20 s
  await page.clock.fastForward(2_000)
  await expect(page.getByText(flow.context.still)).toBeVisible()
  await expect(cancel(page)).toBeEnabled()
  expect(search.arrived).toBe(1)
  search.release()
})

test('a switch whose code cannot be loaded leaves the outline step working, not blank', async ({ page }) => {
  await page.route('**/assets/ContextToggle-*.js', (route) => route.abort())
  await startAt(page, NAGPUR)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
  await expect(group(page)).toHaveCount(0)
  await expect(kindOfPlace(page)).toBeVisible()
  await expect(page.getByRole('button', { name: flow.outline.finish })).toBeVisible()
})

test('is not there without a map: no switch at tier 0, none when the map cannot load', async ({ page }) => {
  await startAt(page) // tier 0: the coordinate form is the only way
  await expect(group(page)).toHaveCount(0)
  await expect(page.getByText(flow.context.off)).toHaveCount(0)
  await page.route('**/style/*.json', (route) => route.abort())
  await page.goto(`/new?${NAGPUR}`)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await expect(page.getByRole('alert')).toHaveText(flow.outline.mapFailed, { timeout: 30_000 })
  await expect(group(page)).toHaveCount(0)
})

test('pressing Update from the keyboard leaves focus in the toolbar, not on the page', async ({ page }) => {
  await open(page, { zoom: 15 })
  await showPicture(page)
  const search = await hold(page, SEARCH)
  await update(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(flow.context.stages.searching)).toBeVisible()
  // a focused control that becomes disabled loses focus at the next rendering step: look two frames later
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  expect(
    await page.evaluate(() => document.activeElement === document.body || document.activeElement === null),
  ).toBe(false)
  await expect(update(page)).toBeFocused()
  search.release()
})

test('pressing Try again from the keyboard leaves focus in the toolbar too', async ({ page }) => {
  await open(page, { now: '2027-01-01', zoom: 15 })
  await satellite(page).check()
  await expect(page.getByText(flow.context.none)).toBeVisible({ timeout: 30_000 })
  const search = await hold(page, SEARCH)
  await retry(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(flow.context.stages.searching)).toBeVisible()
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await expect(update(page)).toBeFocused() // the same button, now saying Update while it loads
  search.release()
})

test('sits between the title and Kind of place', async ({ page }) => {
  await open(page, { zoom: 15 })
  const h1 = await box(page.getByRole('heading', { name: flow.outline.title }))
  const sw = await box(group(page))
  const kind = await box(kindOfPlace(page))
  expect(sw.y).toBeGreaterThan(h1.y + h1.height)
  expect(sw.y + sw.height).toBeLessThan(kind.y)
})

test('is there on a tier 1 device too (a flat map)', async ({ page }) => {
  await startAt(page, 'tier=1&lat=21.1458&lon=79.0882&name=Nagpur&now=2025-12-31')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await expect(group(page)).toBeVisible()
})

test('says one calm line when the imagery worker cannot be started, and Try again works once it can', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const W = window.Worker
    let refuse = true
    ;(window as any).__allowWorker = () => (refuse = false)
    window.Worker = class extends W {
      constructor(u: string | URL, o?: WorkerOptions) {
        if (refuse && /imagery/.test(String(u))) throw new DOMException('refused', 'SecurityError')
        super(u, o)
      }
    } as typeof Worker
  })
  await open(page, { zoom: 15 })
  await satellite(page).check()
  await expect(page.getByRole('alert')).toHaveText(flow.context.failed)
  await page.evaluate(() => (window as any).__allowWorker())
  await retry(page).click()
  await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
})

test('keeps the outline step on screen while the switch is still loading', async ({ page }) => {
  const chunk = await hold(page, '**/assets/ContextToggle-*.js')
  await page.goto(`/new?${NAGPUR}`)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
  await expect(kindOfPlace(page)).toBeVisible()
  await expect(group(page)).toHaveCount(0) // its code is still on the way
  chunk.release()
  await expect(group(page)).toBeVisible({ timeout: 30_000 })
})

// The room kept for the switch is chosen by the width of the column it sits in (container queries), in four bands and a narrowest one:
// the loop below holds the form still in every state at several widths, and these pin each band, so a band that is cut or never
// switches is seen at the widths the loop does not use.
for (const [vw, rem] of [
  [320, 13.5],
  [360, 12.25],
  [440, 10.9],
  [1440, 9.7],
  [2560, 8.4],
] as const)
  test(`reserves ${rem} rem for the switch at ${vw} px`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 })
    await open(page, { zoom: 15 })
    const px = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.querySelector('[class~="@container"]')!.firstElementChild!).minHeight,
      ),
    )
    expect(px).toBeCloseTo(rem * 16, 0)
  })

for (const size of [
  { width: 1440, height: 900 },
  { width: 1100, height: 800 },
  { width: 1024, height: 800 },
  { width: 520, height: 900 },
  { width: 412, height: 915 },
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 320, height: 700 },
]) {
  test(`nothing below the switch moves in any state, and the switch stays clear of the map (${size.width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await open(page, { zoom: 15 })
    const y = async () => Math.round((await box(kindOfPlace(page))).y)
    const home = await y()
    const clear = async (what: string) => {
      await page.evaluate(() => window.scrollTo(0, 0))
      expect(await y(), what).toBe(home)
      const stage = await box(page.locator('.map-stage canvas'))
      for (const part of [
        group(page),
        page.getByRole('status').last(),
        page.getByRole('alert'),
        update(page),
      ])
        if (await part.count())
          expect(overlaps(await box(part.first()), stage), `${what}: the controls over the map`).toBe(false)
    }
    await clear('off')
    // too wide to turn on
    await jump(page, 9)
    await expect(page.getByText(flow.context.tooWideOn)).toBeVisible()
    await clear('too wide to turn on')
    await jump(page, 15)
    // loading, then loaded
    const search = await hold(page, SEARCH)
    await satellite(page).check()
    await expect(page.getByText(flow.context.stages.searching)).toBeVisible()
    await clear('searching')
    search.release()
    await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
    await clear('loaded')
    // loaded and zoomed out
    await jump(page, 9)
    await expect(page.getByText(flow.context.tooWideUpdate)).toBeVisible()
    await clear('loaded and too wide')
    await jump(page, 15)
    // old and cloudy, and too wide: the longest line there is
    await page.evaluate(() =>
      history.replaceState(
        null,
        '',
        `${location.pathname}${location.search.replace(/now=[^&]+/, 'now=2026-03-31')}`,
      ),
    )
    await cloudy(page)
    await jump(page, 14.8) // another window of the scene, or the worker's cache answers with the clear check it already has
    await update(page).click()
    await expect(page.getByText(flow.context.age(100))).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Clouds cover most of it.')).toBeVisible()
    await clear('old and cloudy')
    await jump(page, 9)
    await expect(page.getByText(flow.context.tooWideUpdate)).toBeVisible()
    await clear('old, cloudy and too wide')
    await jump(page, 15)
    await expect(update(page)).toBeEnabled()
    // nothing covers the area, then a failure
    await page.evaluate(() =>
      history.replaceState(
        null,
        '',
        `${location.pathname}${location.search.replace(/now=[^&]+/, 'now=2027-01-01')}`,
      ),
    )
    await update(page).click()
    await expect(page.getByText(flow.context.none)).toBeVisible({ timeout: 30_000 })
    await clear('nothing covers it')
    await page.route(SEARCH, (route) => route.abort())
    await retry(page).click()
    await expect(page.getByRole('alert')).toHaveText(flow.context.offline, { timeout: 30_000 })
    await clear('could not reach the service')
    // and back to Map
    await mapRadio(page).check()
    await expect(page.getByText(flow.context.off)).toBeVisible()
    await clear('off again')
  })
}

for (const width of [1440, 390]) {
  test(`passes axe in both themes with the view off, loading and on (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, { zoom: 15 })
    const axe = async (what: string) => {
      for (let i = 0; i < 2; i++) {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .exclude('.maplibregl-canvas')
          .analyze()
        expect(results.violations, `${what}, ${width}px`).toEqual([])
        await theme(page).click()
      }
    }
    await axe('off')
    await jump(page, 9)
    await expect(satellite(page)).toBeDisabled()
    await axe('too wide to turn on') // a disabled option is still read
    await jump(page, 15)
    const search = await hold(page, SEARCH)
    await satellite(page).check()
    await expect(page.getByText(flow.context.stages.searching)).toBeVisible()
    await axe('loading')
    search.release()
    await expect(page.getByText(LABEL)).toBeVisible({ timeout: 30_000 })
    await axe('on')
    await jump(page, 9)
    await expect(update(page)).toBeDisabled()
    await axe('on and too wide')
  })
}

test('the outline can still be drawn on the picture', async ({ page }) => {
  await open(page, { zoom: 16 })
  await showPicture(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  const stage = await box(page.locator('.map-stage canvas'))
  for (const [dx, dy] of [
    [-60, -60],
    [60, -60],
    [60, 60],
    [-60, 60],
    [-60, -60],
  ])
    await page.mouse.click(stage.x + stage.width / 2 + dx!, stage.y + stage.height / 2 + dy!)
  await expect(page.getByText(/^Area \d+\.\d\d km²/)).toBeVisible()
  expect(await hasPicture(page)).toBe(true)
})
