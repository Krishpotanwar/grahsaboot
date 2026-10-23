import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { tabKey } from './helpers.ts'

// The switch on the globe screen that hides the satellite information (the Live satellites panel, the markers, the tracks and
// the swaths) and shows it again. The panel has two places (inline under the buttons on a small screen and at tier 0, over the
// map on a desktop); the switch stays in the buttons' row in all of them.

const KEY = 'gs-sats-hidden'
const SIZE = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const
// Fixture orbits have epoch 2026-10-04. At this instant Sentinel-2A is the first to look at Nagpur (NORAD 40697).
const NOW = new Date('2026-10-05T05:40:00Z')

const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
// One name, two states: checked when the satellites show, not checked when they are hidden. hideSwitch is the switch while they show.
const hideSwitch = (page: Page) => page.getByRole('switch', { name: copy.sats.toggle, checked: true })
const showSwitch = (page: Page) => page.getByRole('switch', { name: copy.sats.toggle, checked: false })
const panel = (page: Page) => page.getByRole('region', { name: copy.sats.title })
// The row header: after a place is picked the panel's next look names the satellite again, so its name alone matches twice.
const firstSat = (page: Page) => panel(page).getByRole('rowheader', { name: 'Sentinel-2A' })
const markers = (page: Page) => page.locator('.sat-marker')
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY)

/** Console errors and uncaught errors of the page, for a test to say there were none. */
function watch(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  return errors
}

/** Whether a satellite track or swath is in the style and not switched off: what a person can see of them on the map. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__gs.map
    return ['gs-sat-track', 'gs-sat-swath'].some(
      (id) => !!m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none',
    )
  })
const trackFeatures = (page: Page) =>
  page.evaluate(
    () => (window as any).__gs.map.getStyle()?.sources['gs-sat-track']?.data?.features?.length ?? 0,
  )
const hotNorads = (page: Page) =>
  page.evaluate(
    () =>
      ((window as any).__gs.map.getStyle()?.sources['gs-sat-track']?.data?.features ?? [])
        .filter((f: any) => f.properties.hot)
        .map((f: any) => f.properties.norad) as number[],
  )
const background = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__gs.map.getStyle()?.layers.find((l: any) => l.id === 'bg')?.paint?.[
        'background-color'
      ],
  )

async function hide(page: Page) {
  await hideSwitch(page).click()
  await expect(showSwitch(page)).toBeVisible()
}
async function show(page: Page) {
  await showSwitch(page).click()
  await expect(hideSwitch(page)).toBeVisible()
}

async function pickNagpur(page: Page) {
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
}

test('the switch is one real button with one name, 44 px, and the satellites show by default', async ({
  page,
}) => {
  await page.setViewportSize(SIZE.desktop)
  await page.goto('/?tier=0')
  const sw = hideSwitch(page)
  await expect(sw).toBeVisible()
  expect(await sw.evaluate((el) => el.tagName)).toBe('BUTTON')
  await expect(page.getByRole('switch')).toHaveCount(1)
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await expect(firstSat(page)).toBeVisible()
  expect(await stored(page)).toBeNull()
  const box = (await sw.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
})

// Beside the start button, on its line, at every width. A line of its own would make the left column 56 px taller, and the panel
// (anchored to the bottom of that column) sits that much lower: on a coarse tablet it then lands on the map's attribution.
for (const [tier, name, size] of [
  [0, 'desktop', SIZE.desktop],
  [0, 'phone', SIZE.phone],
  [2, 'desktop', SIZE.desktop],
  [2, 'tablet', { width: 1024, height: 768 }],
  [2, 'phone', SIZE.phone],
] as const) {
  test(`tier ${tier} on a ${name}: the switch sits beside the start button and adds no line to the row`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await page.goto(`/?tier=${tier}`)
    if (tier > 0) test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
    // The panel fills in while the page loads, and a column that is centred in its row (tier 0 on a desktop) moves with it: wait for it,
    // then read the three boxes together and read again until they agree.
    await expect(firstSat(page)).toBeVisible()
    await expect(async () => {
      const { start, example, sw } = await page.evaluate(() => {
        const box = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width }
        }
        return {
          start: box('main a[href="/new"]'),
          example: box('main a[href^="/new?example="]'),
          sw: box('main [role="switch"]'),
        }
      })
      expect(Math.abs(sw.y - start.y)).toBeLessThan(2)
      expect(sw.x).toBeGreaterThanOrEqual(start.x + start.width)
      // Whatever wraps below it is the example link, as before the switch was there.
      expect(example.y).toBeGreaterThanOrEqual(sw.y)
    }).toPass({ timeout: 10_000 })
  })
}

for (const [name, size] of Object.entries(SIZE)) {
  test(`tier 0 on a ${name}: hiding takes the text list out of the page, showing puts it back`, async ({
    page,
  }) => {
    const errors = watch(page)
    await page.clock.setFixedTime(NOW) // the fixture orbits are then 7 hours old: the panel says Live
    await page.setViewportSize(size)
    await page.goto('/?tier=0')
    await expect(firstSat(page)).toBeVisible()

    await hide(page)
    await expect(showSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await expect(hideSwitch(page)).toHaveCount(0)
    // Gone from the page, not only out of sight.
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByText(copy.sats.title)).toHaveCount(0)
    await expect(page.getByText('Sentinel-2A')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.textContent)).not.toContain(copy.sats.title)
    expect(await stored(page)).toBe('1')
    // The rest of the screen is as it was.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main').getByRole('link', { name: copy.nav.newInvestigation })).toBeVisible()

    await show(page)
    await expect(hideSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(firstSat(page)).toBeVisible()
    await expect(panel(page).getByText(copy.sats.live, { exact: true })).toBeVisible()
    expect(await stored(page)).toBeNull()
    expect(errors).toEqual([])
  })
}

test('the choice is kept for the browser: it survives a reload, hidden or shown', async ({ page }) => {
  await page.goto('/?tier=0')
  await hide(page)
  await page.reload()
  await expect(showSwitch(page)).toBeVisible()
  await expect(panel(page)).toHaveCount(0)
  await expect(page.getByText(copy.sats.title)).toHaveCount(0)
  expect(await stored(page)).toBe('1')

  await show(page)
  await page.reload()
  await expect(hideSwitch(page)).toBeVisible()
  await expect(firstSat(page)).toBeVisible()
})

test('a browser that blocks storage still gets a working switch, and forgets the choice', async ({
  page,
}) => {
  const errors = watch(page)
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const)
      Storage.prototype[method] = () => {
        throw new DOMException('blocked', 'SecurityError')
      }
  })
  await page.goto('/?tier=0')
  await expect(firstSat(page)).toBeVisible()
  await hide(page)
  await expect(panel(page)).toHaveCount(0)
  await page.reload()
  await expect(hideSwitch(page)).toBeVisible()
  await expect(firstSat(page)).toBeVisible()
  expect(errors).toEqual([])
})

test('the next look at a picked place comes back with the panel', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.setViewportSize(SIZE.desktop)
  await page.goto('/?tier=0')
  await pickNagpur(page)
  await expect(panel(page).getByText(/^Sentinel-2A · /)).toBeVisible()
  await hide(page)
  await expect(page.getByText(/^Next look at/)).toHaveCount(0)
  await show(page)
  await expect(panel(page).getByText(/^Next look at/)).toBeVisible()
  await expect(panel(page).getByText(/^Sentinel-2A · /)).toBeVisible()
  await expect(panel(page).getByText(copy.sats.estimated)).toBeVisible()
})

// The map: markers, tracks and swaths go with the panel and come back with it; the pin, the map and the globe stay.
for (const [tier, name] of [
  [2, 'desktop'],
  [3, 'desktop'],
  [2, 'phone'],
] as const) {
  test(`tier ${tier} on a ${name}: hiding removes the panel, the markers, the tracks and the swaths, showing restores them`, async ({
    page,
  }) => {
    const errors = watch(page)
    await page.clock.setFixedTime(NOW)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(SIZE[name])
    await page.goto(`/?tier=${tier}`)
    test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
    await page.waitForFunction(() => !!(window as any).__gs?.map?.getSource('gs-sat-track'))
    await expect(markers(page)).toHaveCount(5)
    await expect(firstSat(page)).toBeVisible()
    expect(await drawn(page)).toBe(true)
    await pickNagpur(page)
    await expect(page.locator('.place-pin')).toHaveText(copy.search.coordsResult(21.1458, 79.0882))
    await expect.poll(() => hotNorads(page)).toEqual([40697])

    await hide(page)
    await expect(markers(page)).toHaveCount(0)
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByText(copy.sats.title)).toHaveCount(0)
    expect(await drawn(page)).toBe(false)
    // The pin, the map and the globe stay.
    await expect(page.locator('.place-pin')).toBeVisible()
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    expect(await page.evaluate(() => (window as any).__gs.map.getProjection().type)).toBe('globe')
    // Nothing comes back by itself: the positions keep ticking underneath.
    await page.waitForTimeout(2500)
    await expect(markers(page)).toHaveCount(0)
    expect(await drawn(page)).toBe(false)
    await expect(panel(page)).toHaveCount(0)

    await show(page)
    await expect(markers(page)).toHaveCount(5)
    await expect(markers(page)).toHaveText([
      'Sentinel-2A',
      'Sentinel-2B',
      'Sentinel-2C',
      'Landsat 8',
      'Landsat 9',
    ])
    await expect(firstSat(page)).toBeVisible()
    await expect.poll(() => drawn(page)).toBe(true)
    await expect.poll(() => trackFeatures(page)).toBeGreaterThan(0)
    await expect.poll(() => hotNorads(page)).toEqual([40697])
    await expect(page.locator('.place-pin')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('the choice is kept on the map screen too: hidden after a reload, nothing drawn', async ({ page }) => {
  await page.setViewportSize(SIZE.desktop)
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getSource('gs-sat-track'))
  await hide(page)
  await page.reload()
  await expect(showSwitch(page)).toBeVisible()
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getStyle())
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await page.waitForTimeout(2500) // long enough for the first tick of positions and tracks
  await expect(markers(page)).toHaveCount(0)
  expect(await drawn(page)).toBe(false)
  await expect(panel(page)).toHaveCount(0)

  await show(page)
  await expect(markers(page)).toHaveCount(5)
  await expect.poll(() => drawn(page)).toBe(true)
})

// The installer of the layers re-applies them after a style reload; hidden, it must not, and shown again it must.
test('a theme switch while the satellites are hidden, then showing them, restores the layers', async ({
  page,
}) => {
  await page.setViewportSize(SIZE.desktop)
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getSource('gs-sat-track'))
  await expect(markers(page)).toHaveCount(5)
  const dark = await background(page)
  const theme = () => page.getByRole('button', { name: copy.nav.themeToggle }).click()
  const styleIs = (bg: string) =>
    page.waitForFunction(
      (want) =>
        (window as any).__gs.map.getStyle()?.layers.find((l: any) => l.id === 'bg')?.paint?.[
          'background-color'
        ] === want,
      bg,
    )

  await hide(page)
  await theme()
  await styleIs('#FFFFFF')
  await page.waitForFunction(() => (window as any).__gs.map.isStyleLoaded())
  expect(await drawn(page)).toBe(false)
  await expect(markers(page)).toHaveCount(0)

  await show(page)
  await expect(markers(page)).toHaveCount(5)
  await expect.poll(() => drawn(page)).toBe(true)
  await expect.poll(() => trackFeatures(page)).toBeGreaterThan(0)

  // Shown after a hide and a show, the layers still survive a style reload ...
  await theme()
  await styleIs(dark)
  await expect.poll(() => drawn(page)).toBe(true)
  await expect(markers(page)).toHaveCount(5)

  // ... and hidden again, the next reload does not bring them back.
  await hide(page)
  await theme()
  await styleIs('#FFFFFF')
  await page.waitForFunction(() => (window as any).__gs.map.isStyleLoaded())
  expect(await drawn(page)).toBe(false)
  await expect(markers(page)).toHaveCount(0)
})

for (const tier of [0, 2]) {
  test(`tier ${tier} passes axe in both themes with the switch on and off`, async ({ page }) => {
    await page.setViewportSize(SIZE.desktop)
    await page.goto(`/?tier=${tier}`)
    if (tier > 0) test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
    await expect(hideSwitch(page)).toBeVisible()
    await expect(firstSat(page)).toBeVisible()
    const axe = async (state: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations, `${state}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
    }
    const theme = () => page.getByRole('button', { name: copy.nav.themeToggle }).click()
    await axe('shown, first theme')
    await theme()
    await axe('shown, second theme')
    await hide(page)
    await axe('hidden, second theme')
    await theme()
    await axe('hidden, first theme')
  })
}

test('the switch is reached with Tab, shows a focus ring, and works with Space and Enter', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(SIZE.desktop)
  await page.goto('/?tier=0')
  const sw = hideSwitch(page)
  await expect(sw).toBeVisible()
  for (let i = 0; i < 40 && !(await sw.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press(tabKey(page))
  await expect(sw).toBeFocused()
  await expect(sw).toHaveCSS('outline-style', 'solid')
  await expect(sw).toHaveCSS('outline-width', '2px')
  // A person who asked for less motion gets none from it.
  expect(parseFloat(await sw.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.001)

  await page.keyboard.press('Space')
  await expect(showSwitch(page)).toBeFocused()
  await expect(panel(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(hideSwitch(page)).toBeFocused()
  await expect(firstSat(page)).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(showSwitch(page)).toBeFocused()
  await expect(panel(page)).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(hideSwitch(page)).toBeFocused()
  await expect(firstSat(page)).toBeVisible()
})
