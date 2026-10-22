import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

// A tab opened before a deploy asks for a page file the deploy deleted. The host answers a missing file with the home page,
// status 200 (wrangler.jsonc, single-page-application), so the file's import fails and Vite fires `vite:preloadError`. src/main.tsx
// reloads the tab once per session so it gets the new files. The home page is the lazy page here: its link is on screen at
// every width, and with no map (tier 0, from the override the app keeps in localStorage) it is only text.
const FLAG = 'gs-stale-reload'
const HOME_CHUNK = '**/assets/GlobeScreen-*.js'
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gs-tier-override', '0'))
})

test('a page file a deploy deleted opens after one reload the tab does by itself', async ({ page }) => {
  const loads = pageLoads(page)
  // Gone for the page as it was loaded; the reloaded page, as a new deploy would give it, finds the file.
  await page.route(HOME_CHUNK, (route) => (loads.count < 2 ? route.fulfill(GONE) : route.continue()))
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
