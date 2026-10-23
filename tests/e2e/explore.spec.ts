import { expect, test, type Page } from '@playwright/test'
import { LOAD_MB } from '../../src/explore/cost.ts'
import { copy } from '../../src/ui/copy.ts'
import { explore } from '../../src/ui/copy-explore.ts'
import { EXPLORE_PLACE } from '../fixtures/scene.ts'

// The time-lapse page ("Watch it change") on the fixture server: six Februaries of one square, 2027 to 2032 (tests/fixtures/scene.ts).
// `?now=2032-03-10` (test builds only) is the day the loader counts back from, so the last frame is the scene of 21 Feb 2032 and
// each earlier year is its 11 February, the clearest scene of its window. The roof is in the pictures from 2030 on.
const NAME = 'Test square'
const QUERY = `lat=${EXPLORE_PLACE.lat}&lon=${EXPLORE_PLACE.lon}&name=${encodeURIComponent(NAME)}&now=2032-03-10`
const YEARS = [2027, 2028, 2029, 2030, 2031, 2032]
const DATE: Record<number, string> = {
  2027: '11 Feb 2027',
  2028: '11 Feb 2028',
  2029: '11 Feb 2029',
  2030: '11 Feb 2030',
  2031: '11 Feb 2031',
  2032: '21 Feb 2032',
}

const open = (page: Page, extra = '') => page.goto(`/explore?${QUERY}${extra}`)
const loadButton = (page: Page) => page.getByRole('button', { name: explore.load(LOAD_MB) })
const strip = (page: Page) => page.getByRole('list', { name: explore.stripLabel })
const stage = (page: Page) => page.getByRole('group', { name: explore.stageLabel })
const slider = (page: Page) => page.getByRole('slider', { name: explore.slider })
const play = (page: Page) => page.getByRole('button', { name: explore.play, exact: true })
const pause = (page: Page) => page.getByRole('button', { name: explore.pause, exact: true })
const picture = (page: Page) => page.getByRole('img', { name: new RegExp(`^Satellite picture of ${NAME}`) })
/** The one polite line of the page: what is spoken, and nothing else. */
const spoken = (page: Page) => page.locator('main p[role="status"]')
/** The year on show, read from the slider (its text is "2029, 11 Feb 2029"). */
const shownYear = async (page: Page) =>
  Number((await slider(page).getAttribute('aria-valuetext'))!.slice(0, 4))
/** What is drawn on the canvas, as text, to tell one picture from another. */
const drawn = (page: Page) => picture(page).evaluate((c: HTMLCanvasElement) => c.toDataURL())

/** Loaded: the load has ended and said so (the player has started its loop by itself unless it was asked for less motion). */
const loaded = (page: Page, n = YEARS.length) =>
  expect(spoken(page)).toHaveText(explore.loaded(n, YEARS.length), { timeout: 30_000 })

/** Every search and every picture request the page makes, and the imagery workers it starts and ends. */
function watch(page: Page) {
  const seen = { search: 0, tif: 0, files: new Set<string>(), created: 0, closed: 0 }
  page.on('request', (r) => {
    const url = r.url()
    if (url.endsWith('/stac/search')) seen.search++
    else if (/\/(SCL|TCI)\.tif$/.test(url)) {
      seen.tif++
      seen.files.add(new URL(url).pathname) // a file is read by several range requests
    }
  })
  page.on('worker', (w) => {
    if (!/imagery/.test(w.url())) return // MapLibre has workers of its own
    seen.created++
    w.on('close', () => seen.closed++)
  })
  return seen
}

/** Holds back every request to `url` until `release()`. A request the page gave up on meanwhile is already gone. */
async function hold(page: Page, url: string) {
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

test('a link opens the start screen with the size and a Load button, and loads nothing until the tap', async ({
  page,
}) => {
  const seen = watch(page)
  await open(page)
  await expect(page).toHaveTitle(`${copy.titles.explore} · ${copy.app.name}`)
  await expect(page.getByRole('heading', { level: 1, name: explore.title })).toBeVisible()
  await expect(page.getByText(explore.squareAround(NAME))).toBeVisible()
  await expect(loadButton(page)).toBeVisible()
  await expect(loadButton(page)).toHaveText(`Load the pictures · about ${LOAD_MB} MB`)
  await expect(page.getByText(explore.waitsForTap)).toBeVisible()
  await page.waitForTimeout(1500)
  expect([seen.search, seen.tif, seen.created, seen.closed]).toEqual([0, 0, 0, 0]) // not a search, not a picture, not a worker
  await expect(picture(page)).toHaveCount(0)
})

test('Load fills the year strip as the pictures arrive, then shows all six with their credit and the hand-over link', async ({
  page,
}) => {
  const seen = watch(page)
  await open(page)
  await loadButton(page).click()
  await expect(loadButton(page)).toHaveCount(0)
  // The six slots appear before the first picture, then fill: each year with its date and how clear it is.
  await loaded(page)
  const years = strip(page).getByRole('listitem')
  await expect(years).toHaveCount(YEARS.length)
  for (const [k, y] of YEARS.entries()) {
    await expect(years.nth(k)).toContainText(String(y))
    await expect(years.nth(k)).toContainText(DATE[y]!)
    await expect(years.nth(k)).toContainText('100% clear')
  }
  await expect(picture(page)).toBeVisible()
  await expect(stage(page)).toBeVisible()
  // the pictures are for looking, and credited
  await expect(page.getByText(explore.notEvidence)).toBeVisible()
  await expect(page.getByText(explore.credit(YEARS))).toBeVisible()
  // a way on to the investigation, with the place
  await expect(page.getByRole('link', { name: explore.handOver })).toHaveAttribute(
    'href',
    `/new?lat=${EXPLORE_PLACE.lat.toFixed(6)}&lon=${EXPLORE_PLACE.lon.toFixed(6)}&name=${encodeURIComponent(NAME)}`,
  )
  // one search of the last 12 months, five of the earlier years, and a worker that ends with the load
  expect(seen.search).toBe(6)
  expect(seen.created).toBe(1)
  await expect.poll(() => seen.closed).toBe(1)
  // only the six winners are read as pictures, and no year is checked on a third scene (the third of an earlier year is its 21 Feb)
  const files = [...seen.files]
  expect(files.filter((f) => f.endsWith('/TCI.tif')).sort()).toEqual(
    [...YEARS.slice(0, 5).map((y) => `/cog/${y}-02-11/TCI.tif`), '/cog/2032-02-21/TCI.tif'].sort(),
  )
  expect(files.filter((f) => f.endsWith('/SCL.tif')).length).toBeLessThanOrEqual(12)
  for (const y of YEARS.slice(0, 5)) expect(files).not.toContain(`/cog/${y}-02-21/SCL.tif`)
})

test('draws each frame on the canvas: the same picture for the years without the roof, another once it is there', async ({
  page,
}) => {
  await open(page)
  await loadButton(page).click()
  await loaded(page)
  await stage(page).focus()
  await page.keyboard.press('Home') // stops the loop and goes to the first year
  await expect.poll(() => shownYear(page)).toBe(2027)
  const first = await drawn(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => shownYear(page)).toBe(2028)
  expect(await drawn(page)).toBe(first) // no roof in either
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => shownYear(page)).toBe(2029)
  const before = await drawn(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => shownYear(page)).toBe(2030)
  expect(await drawn(page)).not.toBe(before) // the roof
})

test('plays by itself when the load ends, one year after another, and says nothing for each frame', async ({
  page,
}) => {
  await open(page)
  await loadButton(page).click()
  await loaded(page)
  await expect(pause(page)).toBeVisible() // it is playing
  const seen = new Set<number>()
  await expect
    .poll(
      async () => {
        seen.add(await shownYear(page))
        return seen.size
      },
      { timeout: 15_000, intervals: [200] },
    )
    .toBeGreaterThanOrEqual(4)
  expect(await spoken(page).innerText()).toBe(explore.loaded(6, 6)) // still only the load line after several frames
})

test('leaving the page ends the load: no call after it, and the imagery worker is closed', async ({
  page,
}) => {
  const seen = watch(page)
  const search = await hold(page, '**/stac/search')
  await open(page)
  await loadButton(page).click()
  await expect.poll(() => search.arrived).toBe(1)
  expect(seen.created).toBe(1)
  await page.getByRole('link', { name: copy.nav.home }).click()
  await expect(page).toHaveURL(/\/$|\/\?/)
  await expect.poll(() => seen.closed).toBe(1)
  search.release()
  await page.waitForTimeout(800)
  expect(seen.search).toBe(1) // the one that was in flight; the years never started
  expect(seen.tif).toBe(0)
})

test('an address with no usable place shows one plain message and a link home', async ({ page }) => {
  for (const bad of ['lat=abc&lon=10', 'lat=0x10&lon=10', 'lat=95&lon=10', 'lat=10', '']) {
    await page.goto(`/explore?${bad}`)
    await expect(page.getByRole('heading', { level: 1, name: explore.title })).toBeVisible()
    await expect(page.getByText(explore.bad)).toBeVisible()
    await expect(loadButton(page)).toHaveCount(0)
  }
  await page.getByRole('link', { name: explore.home }).click()
  await expect(page).toHaveURL(/\/$/)
})
