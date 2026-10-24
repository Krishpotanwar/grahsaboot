import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { LOAD_MB } from '../../src/explore/cost.ts'
import { buildCsp, inlineScriptHashes } from '../../scripts/csp.ts'
import { copy } from '../../src/ui/copy.ts'
import { explore } from '../../src/ui/copy-explore.ts'
import { STILL } from '../../src/ui/figure/still.ts'
import { EXPLORE_PLACE } from '../fixtures/scene.ts'

// The prints figure on the start screen of the time-lapse, drawn in the hairline style: a tray of six prints, one for each year.
// It is a picture and nothing else: hidden from assistive technology, with no words, no focus and no verdict. It moves only under
// the pointer, never by itself and never for a person who asked for less motion; at tier 0 it is a still drawing with no engine.
const NAME = 'Test square'
const QUERY = `lat=${EXPLORE_PLACE.lat}&lon=${EXPLORE_PLACE.lon}&name=${encodeURIComponent(NAME)}&now=2032-03-10`
const open = (page: Page, extra = '') => page.goto(`/explore?${QUERY}${extra}`)
const figure = (page: Page) => page.locator('[data-hairline="prints"]')
const markup = (page: Page) =>
  figure(page)
    .locator('svg')
    .evaluate((s) => s.innerHTML)
const loadButton = (page: Page) => page.getByRole('button', { name: explore.load(LOAD_MB) })
const spoken = (page: Page) => page.locator('main p[role="status"]')
const live = (page: Page) => expect(figure(page)).toHaveAttribute('data-figure', 'live', { timeout: 15_000 })

/** Where the pointer must be to stand on print 4 (the card whose band holds the viewBox point 207, 115). */
async function overPrint(page: Page) {
  const box = (await figure(page).boundingBox())!
  return { x: box.x + (207 / 400) * box.width, y: box.y + (115 / 320) * box.height }
}

/** Page errors, console errors and policy violations; the policy is applied by `underPolicy`. */
async function watch(page: Page) {
  const seen: string[] = []
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && seen.push(`console: ${m.text()}`))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`policy: ${e.violatedDirective} ${e.blockedURI}`),
    )
  })
  return seen
}

/**
 * The site's real script, style, worker and font rules on the page (scripts/csp.ts), with the inline script's hash read from the
 * page as built. The preview server sends no headers, so without this a blocked script would pass here and fail on the live site.
 * Left out: the rules for the data hosts (default, connect, img), which name the real services and not this build's fixture host.
 */
async function underPolicy(page: Page) {
  await page.route(
    (u) => u.pathname === '/explore',
    async (route) => {
      const res = await route.fetch()
      const html = await res.text()
      const policy = buildCsp({ scriptHashes: inlineScriptHashes(html) })
        .split('; ')
        .filter((d) => !/^(default-src|connect-src|img-src)\s/.test(d))
        .join('; ')
      await route.fulfill({
        response: res,
        body: html,
        headers: { ...res.headers(), 'content-security-policy': policy },
      })
    },
  )
}

/** Every request that fetches the engine or the figure: the kernel script and the figure's chunk. */
const engineRequests = (page: Page) => {
  const urls: string[] = []
  page.on('request', (r) => /\/assets\/(kernel|prints)-[\w-]+\.js/.test(r.url()) && urls.push(r.url()))
  return urls
}

test('at tier 2 the engine and the figure load as scripts from our own origin under the real script and style rules', async ({
  page,
}) => {
  const seen = await watch(page)
  const engine = engineRequests(page)
  await underPolicy(page)
  await open(page, '&tier=2')
  await live(page)
  expect(engine.map((u) => u.match(/\/assets\/(kernel|prints)-/)![1]).sort()).toEqual(['kernel', 'prints'])
  expect(await markup(page)).toBe(STILL)
  // A document answered by a route has no address in Chromium's eyes, so it may not reach the fixture host: the map's style fetch
  // says so (twice). That is the page's map and not the figure; a blocked script or style would say something else, or "policy:".
  const mapNoise = [/dark\.json|light\.json/, /^console: Failed to load resource: net::ERR_FAILED$/]
  expect(seen.filter((m) => !mapNoise.some((re) => re.test(m)))).toEqual([])
})

test('at tier 2 it is a decorative drawing that answers the pointer, and says nothing to the console', async ({
  page,
}) => {
  const seen = await watch(page)
  await open(page, '&tier=2')
  await expect(page.getByRole('heading', { level: 1, name: explore.title })).toBeVisible()
  await live(page)

  // a picture and nothing else
  await expect(figure(page)).toHaveAttribute('aria-hidden', 'true')
  await expect(figure(page).locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(figure(page).locator('[tabindex], a, button, input, select, textarea, [role]')).toHaveCount(0)
  expect(((await figure(page).textContent()) ?? '').trim()).toBe('')
  expect(await figure(page).locator('svg path').count()).toBeGreaterThan(20)

  // small, and inside the page's own width: the drawing itself, not the empty margin of its box, which the page pulls into its gutter
  const ink = (await figure(page).locator('svg > g').boundingBox())!
  expect(ink.width).toBeGreaterThan(100)
  expect(ink.width).toBeLessThanOrEqual(260)
  expect(ink.x).toBeGreaterThanOrEqual(0)
  expect(ink.x + ink.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true) // no sideways scroll

  // the pointer on a print stands it up, in the one bright stroke; leaving puts the tray back as it was
  const rest = await markup(page)
  const { x, y } = await overPrint(page)
  await page.mouse.move(x, y)
  await expect(figure(page).locator('svg .hi')).toHaveCount(2) // the print's face and its caption line
  expect(await markup(page)).not.toBe(rest)
  await page.mouse.move(2, 2)
  await expect.poll(() => markup(page), { timeout: 5_000 }).toBe(rest)
  await expect(figure(page).locator('svg .hi')).toHaveCount(0)

  expect(seen).toEqual([])
})

test('with no pointer on it, it never moves: no loop runs while someone reads', async ({ page }) => {
  await open(page, '&tier=2')
  await live(page)
  const rest = await markup(page)
  await page.waitForTimeout(2_500)
  expect(await markup(page)).toBe(rest)
})

test('at tier 0 it is a still drawing with no engine: nothing is fetched for it and nothing answers the pointer', async ({
  page,
}) => {
  const seen = await watch(page)
  const engine = engineRequests(page)
  await underPolicy(page)
  await open(page, '&tier=0')
  await expect(figure(page)).toHaveAttribute('data-figure', 'still')
  await expect(figure(page)).toHaveAttribute('aria-hidden', 'true')
  expect(await markup(page)).toBe(STILL)
  const { x, y } = await overPrint(page)
  await page.mouse.move(x, y)
  await page.waitForTimeout(1_000)
  expect(await markup(page)).toBe(STILL)
  await expect(figure(page).locator('svg .hi')).toHaveCount(0)
  expect(await page.evaluate(() => 'HL' in window)).toBe(false)
  expect(engine).toEqual([])
  expect(seen).toEqual([])
})

test('for a person who asked for less motion it is the same still drawing at every tier, and it does not move', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const engine = engineRequests(page)
  await open(page, '&tier=2')
  await expect(figure(page)).toHaveAttribute('data-figure', 'still')
  expect(await markup(page)).toBe(STILL)
  const { x, y } = await overPrint(page)
  await page.mouse.move(x, y)
  await page.waitForTimeout(1_000)
  expect(await markup(page)).toBe(STILL)
  expect(await page.evaluate(() => 'HL' in window)).toBe(false)
  expect(engine).toEqual([])
})

test('the engine draws the still drawing at rest, markup for markup, so a changed figure fails here until the still is made again', async ({
  page,
}) => {
  await open(page, '&tier=2')
  await live(page)
  expect(await markup(page)).toBe(STILL)
})

test('it is there while the pictures load and gone once the first picture shows', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  await page.route('**/stac/search', async (route) => {
    await gate
    await route.continue().catch(() => {})
  })
  await open(page, '&tier=0')
  await expect(figure(page)).toBeVisible() // the start screen
  await loadButton(page).click()
  await expect(page.getByText(explore.searching)).toBeVisible()
  await expect(figure(page)).toBeVisible() // the load has begun and nothing is drawn yet
  release()
  await expect(spoken(page)).toHaveText(explore.loaded(6, 6), { timeout: 30_000 })
  await expect(figure(page)).toHaveCount(0) // the pictures are for looking at: nothing else beside them
})

test('it is nowhere else, and the engine is not fetched by any other page', async ({ page }) => {
  const engine = engineRequests(page)
  for (const path of ['/?tier=0', '/limits?tier=0', '/privacy?tier=0', '/explore?lat=abc&lon=10&tier=0']) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await expect(figure(page)).toHaveCount(0)
  }
  expect(engine).toEqual([])
})

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
for (const [what, query] of [
  ['live', '&tier=2'],
  ['still', '&tier=0'],
] as const)
  test(`the start screen passes axe in both themes with the figure ${what}`, async ({ page }) => {
    await open(page, query)
    if (what === 'live') await live(page)
    else await expect(figure(page)).toHaveAttribute('data-figure', 'still')
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  })
