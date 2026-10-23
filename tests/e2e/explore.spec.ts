import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { LOAD_MB } from '../../src/explore/cost.ts'
import { PACE_MS } from '../../src/explore/playback.ts'
import { copy } from '../../src/ui/copy.ts'
import { explore } from '../../src/ui/copy-explore.ts'
import { EXPLORE_PLACE } from '../fixtures/scene.ts'
import { tabKey } from './helpers.ts'

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

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
/** The page as it is, in both themes. */
async function axeInBothThemes(page: Page) {
  for (let i = 0; i < 2; i++) {
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
}

/** The cloud check of these years reads the cloudy day's file: nothing in them is clear, so each is a gap. */
const cloudyYears = (page: Page, years: number[]) =>
  page.route(new RegExp(`/cog/(${years.join('|')})-02-\\d\\d/SCL\\.tif$`), async (route) =>
    route.fulfill({
      response: await route.fetch({
        url: route
          .request()
          .url()
          .replace(/\/cog\/\d{4}-\d\d-\d\d\//, '/cog/2025-06-15/'),
      }),
    }),
  )

/** Loads the fixture square and waits until the load has ended. */
async function loadAll(page: Page, extra = '', n = YEARS.length) {
  await open(page, extra)
  await loadButton(page).click()
  await loaded(page, n)
}

test('Space, the arrows, Home and End work on the picture, each step is spoken, and the page never scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 520 }) // shorter than the page: a key that scrolls would show
  await loadAll(page)
  await stage(page).focus() // may scroll the picture into view: where the page stands now is what no key may change
  const top = await page.evaluate(() => scrollY)
  await page.keyboard.press('Space') // it is playing: Space pauses
  await expect(play(page)).toBeVisible()
  await expect(spoken(page)).toHaveText(/^Paused\. Frame [1-6] of 6, .+, 100% clear$/)
  const spokenAfter = async (key: string, year: number, text: string) => {
    await page.keyboard.press(key)
    await expect.poll(() => shownYear(page), { message: key }).toBe(year)
    await expect(spoken(page)).toHaveText(text)
  }
  await spokenAfter('Home', 2027, 'Frame 1 of 6, 11 Feb 2027, 100% clear')
  await spokenAfter('ArrowRight', 2028, 'Frame 2 of 6, 11 Feb 2028, 100% clear')
  await spokenAfter('ArrowDown', 2029, 'Frame 3 of 6, 11 Feb 2029, 100% clear')
  await spokenAfter('ArrowLeft', 2028, 'Frame 2 of 6, 11 Feb 2028, 100% clear')
  await spokenAfter('ArrowUp', 2027, 'Frame 1 of 6, 11 Feb 2027, 100% clear')
  await spokenAfter('ArrowLeft', 2032, 'Frame 6 of 6, 21 Feb 2032, 100% clear') // round to the last
  await spokenAfter('ArrowRight', 2027, 'Frame 1 of 6, 11 Feb 2027, 100% clear') // and round to the first
  await spokenAfter('End', 2032, 'Frame 6 of 6, 21 Feb 2032, 100% clear')
  await page.keyboard.press('Space') // paused: Space plays
  await expect(pause(page)).toBeVisible()
  const line = await spoken(page).innerText()
  const years = new Set<number>()
  await expect
    .poll(
      async () => {
        years.add(await shownYear(page))
        return years.size
      },
      { timeout: 15_000, intervals: [200] },
    )
    .toBeGreaterThanOrEqual(3)
  expect(await spoken(page).innerText()).toBe(line) // a loop that plays says nothing
  expect(await page.evaluate(() => scrollY)).toBe(top) // not one of the keys scrolled the page
})

test('a hidden tab pauses the loop and keeps it paused', async ({ page }) => {
  await loadAll(page)
  await expect(pause(page)).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(play(page)).toBeVisible()
  const was = await shownYear(page)
  await page.waitForTimeout(PACE_MS + 400)
  expect(await shownYear(page)).toBe(was)
})

test('a key typed anywhere but on the picture is the page’s, and a shortcut with a modifier is the browser’s', async ({
  page,
}) => {
  await loadAll(page)
  await pause(page).click()
  const was = await shownYear(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Space']) await page.keyboard.press(key)
  expect(await shownYear(page)).toBe(was)
  await expect(play(page)).toBeVisible() // Space did not play it either
  await stage(page).focus()
  await page.keyboard.press('Alt+ArrowRight') // history Forward: not a step
  await page.keyboard.press('Control+Home')
  expect(await shownYear(page)).toBe(was)
})

test('Play, Pause, Previous and Next, and a labelled slider, do what the keys do, and the slider stops a loop it is reached in', async ({
  page,
}) => {
  await loadAll(page)
  await pause(page).click()
  await expect(spoken(page)).toHaveText(/^Paused\. Frame [1-6] of 6, /)
  await play(page).click()
  await expect(pause(page)).toBeVisible()
  await pause(page).click()
  await page.getByRole('button', { name: explore.previous }).click()
  await expect(spoken(page)).toHaveText(/^Frame [1-6] of 6, .+, 100% clear$/)
  await page.getByRole('button', { name: explore.next }).click()
  await play(page).click()
  await slider(page).focus() // a slider that has focus is read out as it moves: the loop stops for it
  await expect(play(page)).toBeVisible()
  await slider(page).press('End')
  await expect.poll(() => shownYear(page)).toBe(2032)
  await expect(spoken(page)).toHaveText('Frame 6 of 6, 21 Feb 2032, 100% clear')
  await slider(page).press('Home')
  await expect.poll(() => shownYear(page)).toBe(2027)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '2027, 11 Feb 2027')
  await expect(slider(page)).toHaveAttribute('max', '5')
})

test('a person who asked for less motion gets no Play and no loop, and steps instead', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadAll(page)
  await expect(play(page)).toHaveCount(0)
  await expect(pause(page)).toHaveCount(0)
  expect(await shownYear(page)).toBe(2032) // the newest, where it stopped
  await page.waitForTimeout(PACE_MS * 2 + 500)
  expect(await shownYear(page)).toBe(2032) // nothing moved by itself
  await expect(page.getByText(explore.keysHintStill)).toBeAttached() // the keys line, without Space (hidden on a touch screen)
  await page.getByRole('button', { name: explore.next }).click() // round to the first
  await expect.poll(() => shownYear(page)).toBe(2027)
  await expect(spoken(page)).toHaveText('Frame 1 of 6, 11 Feb 2027, 100% clear')
  await stage(page).focus()
  await page.keyboard.press('Space') // nothing to play: not a key of the page's either
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => shownYear(page)).toBe(2028)
  await page.waitForTimeout(PACE_MS + 300)
  expect(await shownYear(page)).toBe(2028)
})

test('a year with no clear picture is a labelled gap, and the other five still play', async ({ page }) => {
  await cloudyYears(page, [2028])
  await loadAll(page, '', 5)
  const years = strip(page).getByRole('listitem')
  await expect(years.nth(1)).toContainText('2028')
  await expect(years.nth(1)).toContainText(explore.gap['no-clear-picture'])
  await expect(years.nth(1)).not.toContainText('Feb 2028')
  await expect(slider(page)).toHaveAttribute('max', '4')
  await expect(pause(page)).toBeVisible() // five are enough to play
  await expect(page.getByText(explore.tooFew)).toHaveCount(0)
  await expect(page.getByText(explore.credit([2027, 2029, 2030, 2031, 2032]))).toBeVisible()
})

test('fewer than 3 clear years show the plain line, the gaps and the pictures there are, and no Play', async ({
  page,
}) => {
  await cloudyYears(page, [2027, 2028, 2029, 2030])
  await loadAll(page, '', 2)
  await expect(page.getByText(explore.tooFew)).toBeVisible()
  await expect(strip(page).getByText(explore.gap['no-clear-picture'])).toHaveCount(4)
  await expect(play(page)).toHaveCount(0)
  await expect(pause(page)).toHaveCount(0)
  expect(await shownYear(page)).toBe(2032)
  await page.getByRole('button', { name: explore.previous }).click() // two pictures can still be stepped
  await expect.poll(() => shownYear(page)).toBe(2031)
  await expect(page.getByText(explore.credit([2031, 2032]))).toBeVisible()
  await axeInBothThemes(page)
})

test('a place no scene holds says so, with no Try again', async ({ page }) => {
  await page.goto('/explore?lat=18.99135&lon=73.06575&name=Navi%20Mumbai%20airport&now=2032-03-10')
  await loadButton(page).click()
  await expect(page.getByRole('alert')).toHaveText(explore.failed.NO_SCENES, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: copy.common.retry })).toHaveCount(0)
  await expect(picture(page)).toHaveCount(0)
})

test('a catalogue that cannot be reached says so, and Try again loads once it can', async ({ page }) => {
  await page.route('**/stac/search', (route) => route.abort())
  await open(page)
  await loadButton(page).click()
  await expect(page.getByRole('alert')).toHaveText(explore.failed.OFFLINE, { timeout: 60_000 })
  await page.unroute('**/stac/search')
  await page.getByRole('button', { name: copy.common.retry }).click()
  await loaded(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(picture(page)).toBeVisible()
})

for (const tier of [0, 3]) {
  test(`the player is one plain canvas at tier ${tier}: the pictures play and no map is on the page`, async ({
    page,
  }) => {
    await loadAll(page, `&tier=${tier}`)
    await expect(picture(page)).toBeVisible()
    await expect(page.locator('canvas.maplibregl-canvas')).toBeHidden()
    await expect(pause(page)).toBeVisible()
    await expect.poll(() => shownYear(page), { timeout: 15_000 }).not.toBe(2027)
  })
}

test('the pictures come from the one data host of the build: no request leaves 127.0.0.1', async ({
  page,
}) => {
  const hosts = new Set<string>()
  page.on('request', (r) => hosts.add(new URL(r.url()).hostname))
  await loadAll(page)
  await page.getByRole('link', { name: explore.handOver }).hover()
  expect([...hosts]).toEqual(['127.0.0.1'])
})

test('the picture shows a ring when it has the keyboard, and the page passes axe in both themes at every stage', async ({
  page,
}) => {
  await open(page)
  await axeInBothThemes(page) // the start screen
  await loadButton(page).click()
  await loaded(page)
  await pause(page).click()
  await axeInBothThemes(page) // the player with its six years
  for (let i = 0; i < 20 && !(await stage(page).evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press(tabKey(page)) // WebKit on macOS reaches links and buttons with Option+Tab
  await expect(stage(page)).toBeFocused()
  const ring = await stage(page).evaluate((e) => {
    const s = getComputedStyle(e)
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
  })
  expect(ring.style).not.toBe('none')
  expect(ring.width).toBeGreaterThanOrEqual(2)
  await page.goto('/explore?lat=abc&lon=10')
  await expect(page.getByText(explore.bad)).toBeVisible()
  await axeInBothThemes(page) // the plain message
})
