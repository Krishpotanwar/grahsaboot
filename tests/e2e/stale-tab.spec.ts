import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

// A tab opened before a deploy asks for a page file the deploy deleted. The host answers a missing file with the home page,
// status 200 (wrangler.jsonc, single-page-application), so the file's import fails and Vite fires `vite:preloadError`. src/main.tsx
// reloads the tab once per session so it gets the new files. The home page is the lazy page here: its link is on screen at
// every width, and with no map (tier 0, from the override the app keeps in localStorage) it is only text.
const FLAG = 'gs-stale-reload'
const HOME_CHUNK = '**/assets/GlobeScreen-*.js'
const HOME_FILE = /GlobeScreen-[\w-]+\.js/g
const GONE = { status: 200, contentType: 'text/html', body: '<!doctype html><title>GrahSaboot</title>' }

/** How many times the tab has loaded its page: 1 after the first load, 2 after one reload. */
function pageLoads(page: Page) {
  const seen = { count: 0 }
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) seen.count++
  })
  return seen
}
const flag = (page: Page) => page.evaluate((k) => sessionStorage.getItem(k), FLAG)
const home = (page: Page) => page.getByRole('link', { name: copy.nav.home })

/** The home page's file is asked for and not answered until `release()`. A page that left meanwhile has dropped the request. */
async function holdHomeChunk(page: Page) {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  let ask!: () => void
  const asked = new Promise<void>((r) => (ask = r))
  await page.route(HOME_CHUNK, async (route) => {
    ask()
    await gate
    await route.continue().catch(() => {})
  })
  return { asked, release }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gs-tier-override', '0'))
})

test('a page file a deploy deleted opens after one reload the tab does by itself', async ({ page }) => {
  const loads = pageLoads(page)
  // A deploy changes the file's name. The page as it was loaded asks for the old name (its entry file is rewritten here to say so) and
  // is answered as for a deleted file; the reloaded page, as the new deploy gives it, asks for the name the files have. One name
  // answered "gone" and then "found" would not do: WebKit keeps the failed file in its memory cache and answers the reload from it.
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    await route.fulfill({
      response,
      body: loads.count < 2 ? body.replace(HOME_FILE, 'GlobeScreen-old.js') : body,
    })
  })
  await page.route('**/assets/GlobeScreen-old.js', (route) => route.fulfill(GONE))
  await page.goto('/limits')
  await expect(page.getByRole('heading', { level: 1, name: copy.pages.limits.title })).toBeVisible()
  expect(await flag(page)).toBeNull()

  await home(page).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.app.promise, { timeout: 30_000 })
  expect(loads.count).toBe(2)
  expect(await flag(page)).toBe('1')
})

test('reloads only once: a file that is still gone after the reload is left to fail', async ({ page }) => {
  const loads = pageLoads(page)
  const errors: number[] = [] // the load each uncaught error came in
  page.on('pageerror', () => errors.push(loads.count))
  await page.route(HOME_CHUNK, (route) => route.fulfill(GONE))
  await page.goto('/limits')
  await expect(page.getByRole('heading', { level: 1, name: copy.pages.limits.title })).toBeVisible()

  await home(page).click()
  await expect.poll(() => errors.includes(2), { timeout: 30_000 }).toBe(true) // the error of the second load got out
  await page.waitForTimeout(1_000) // a third load, if one were coming, starts well within this
  expect(loads.count).toBe(2)
  expect(await flag(page)).toBe('1')
})

// WebKit ends the files a page has asked for the moment a navigation away from it starts, and keeps running the page until the next one
// arrives, so Vite reports an ended file like one that will not load. The tab then reloaded the page being left, and that reload took
// the place of the navigation (a person's, or page.goto in a test: "interrupted by another navigation").
test('leaving while a page file is still loading is not turned into a reload', async ({ page }) => {
  const held = await holdHomeChunk(page)
  try {
    await page.goto('/limits')
    await expect(page.getByRole('heading', { level: 1, name: copy.pages.limits.title })).toBeVisible()
    await home(page).click()
    await held.asked // the home page's file is wanted and not answered
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: copy.pages.privacy.title })).toBeVisible()
    expect(await flag(page)).toBeNull() // the one reload is still there for a deploy
  } finally {
    held.release()
  }
})
