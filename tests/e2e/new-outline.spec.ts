import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { outlineRoadByCoords, outlineSiteByCoords, startAt } from './helpers.ts'

test('site by coordinates shows area and enables Continue', async ({ page }) => {
  await startAt(page)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await outlineSiteByCoords(page, 1000)
  await expect(page.getByText(/^Area 1\.00 km² · 1\.41 km across$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test('a 3 km square (exactly 9 km²) is accepted at the limit', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page, 3000)
  await expect(page.getByText('This outline covers 9.0 km². The limit is 9 km².')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test('road by coordinates shows length and two sections', async ({ page }) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  await expect(page.getByText(/^Length 2\.90 km · 2 sections of up to 2 km$/)).toBeVisible()
})

test('road width outside 5–200 is refused with a plain message', async ({ page }) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  await page.getByLabel(flow.outline.width).fill('4')
  await expect(page.getByText('Road width must be a whole number from 5 to 200 metres.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

// Index Review Focus 2: a pair that looks reversed is a question, never a silent wrong place.
test('swapped coordinates in the square form are asked about, not applied', async ({ page }) => {
  await startAt(page)
  await page.getByLabel(flow.outline.centre).fill('79.0882, 21.1458')
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
  await expect(page.getByText(copy.search.swapped(79.0882, 21.1458))).toBeVisible()
  await expect(page.getByText(flow.outline.none)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByRole('button', { name: copy.search.useSwapped }).click()
  await expect(page.getByLabel(flow.outline.centre)).toHaveValue('21.1458, 79.0882')
  await expect(page.getByText(/^Area 0\.25 km²/)).toBeVisible()
  await expect(page.getByText(copy.search.swapped(79.0882, 21.1458))).toBeHidden()
  // A real Arctic point must stay usable: the same text, taken exactly as typed.
  await page.getByLabel(flow.outline.centre).fill('79.0882, 21.1458')
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
  await page.getByRole('button', { name: copy.search.useAsTyped }).click()
  await expect(page.getByLabel(flow.outline.centre)).toHaveValue('79.0882, 21.1458')
  await expect(page.getByText(/^Area 0\.25 km²/)).toBeVisible()
})

test('swapped coordinates in the road form are asked about, not applied', async ({ page }) => {
  await startAt(page)
  await page.getByRole('radio', { name: new RegExp(flow.outline.road) }).check()
  await page.getByLabel(flow.outline.start).fill('79.07698, 21.138637')
  await page.getByLabel(flow.outline.end).fill('79.095988, 21.157819')
  await page.getByRole('button', { name: flow.outline.useLine }).click()
  await expect(page.getByText(copy.search.swapped(79.07698, 21.138637))).toBeVisible()
  await expect(page.getByText(flow.outline.none)).toBeVisible()
  await page.getByRole('button', { name: copy.search.useSwapped }).click()
  await expect(page.getByLabel(flow.outline.start)).toHaveValue('21.138637, 79.07698')
  await expect(page.getByLabel(flow.outline.end)).toHaveValue('21.157819, 79.095988')
  await expect(page.getByText(/^Length 2\.90 km · 2 sections of up to 2 km$/)).toBeVisible()
})

test('drawing a polygon on the map fills in the outline', async ({ page }) => {
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))),
    'no WebGL2',
  )
  await page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
  await page.evaluate(() =>
    (window as any).__gs.map.jumpTo({ center: [79.0882, 21.1458], zoom: 15, pitch: 0, bearing: 0 }),
  )
  const box = (await page.locator('.map-stage canvas').boundingBox())!
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2
  for (const [dx, dy] of [
    [-80, -80],
    [80, -80],
    [80, 80],
    [-80, 80],
    [-80, -80],
  ])
    await page.mouse.click(cx + dx!, cy + dy!)
  await expect(page.getByText(/^Area \d+\.\d\d km²/)).toBeVisible()
})

const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
const styleReady = (page: Page) => page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
const AREA = /^Area \d+\.\d\d km²/

async function clickSquare(page: Page) {
  const box = (await page.locator('.map-stage canvas').boundingBox())!
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2
  for (const [dx, dy] of [
    [-80, -80],
    [80, -80],
    [80, 80],
    [-80, 80],
    [-80, -80],
  ])
    await page.mouse.click(cx + dx!, cy + dy!)
}

// MapLibre's isStyleLoaded() is false while any tile loads, so a draw session that waited for it never started when step 2 opened during a fly-to.
test('drawing starts while the map is still loading tiles', async ({ page }) => {
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await styleReady(page)
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/tiles/**', async (route) => {
    await held
    await route.continue()
  })
  // The deep link already flew to Nagpur and loaded its tiles: go somewhere new, or no tile is requested and none can be held back.
  await page.evaluate(() =>
    (window as any).__gs.map.jumpTo({ center: [72.8777, 19.076], zoom: 15, pitch: 0, bearing: 0 }),
  )
  try {
    await expect.poll(() => page.evaluate(() => (window as any).__gs.map.isStyleLoaded())).toBe(false)
    await page.getByRole('button', { name: flow.outline.redraw }).click() // a new draw session, asked for while tiles are held back
    await page.evaluate(() => window.scrollTo(0, 0)) // on a phone the click scrolled the panel up over the map
    await clickSquare(page)
    await expect(page.getByText(AREA)).toBeVisible()
  } finally {
    release()
  }
})

// A theme switch reloads the style and drops the draw layers; a lost WebGL context rebuilds the map under the open draw session (its stop() used to throw and blank the page).
test('drawing survives a theme switch and a rebuilt map', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  const drawLayer = () => page.evaluate(() => !!(window as any).__gs.map.getLayer('td-polygon'))
  await expect.poll(drawLayer).toBe(true)
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(
    () =>
      (window as any).__gs.map.getStyle()?.layers.find((l: any) => l.id === 'bg')?.paint?.[
        'background-color'
      ] === '#FFFFFF',
  )
  await expect.poll(drawLayer).toBe(true)
  await page.evaluate(() => {
    const w = window as any
    w.__before = w.__gs.map
    w.__gs.map.getCanvas().dispatchEvent(new Event('webglcontextlost'))
  })
  await page.waitForFunction(
    () => (window as any).__gs.map && (window as any).__gs.map !== (window as any).__before,
  )
  await expect.poll(drawLayer).toBe(true)
  await page.evaluate(() =>
    (window as any).__gs.map.jumpTo({ center: [79.0882, 21.1458], zoom: 15, pitch: 0, bearing: 0 }),
  )
  await clickSquare(page)
  await expect(page.getByText(AREA)).toBeVisible()
  expect(errors).toEqual([])
})

// WCAG 2.4.3: the button that changed the step unmounts with it, so focus must land on the new step's heading, not <body>.
test('Back and Continue move focus to the new step heading', async ({ page }) => {
  await startAt(page)
  await page.getByRole('button', { name: copy.common.back }).click()
  await expect(page.getByRole('heading', { name: flow.place.title })).toBeFocused()
  await page.getByRole('button', { name: copy.common.next }).click()
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeFocused()
})

test('step 1 needs a place: search, pick, then Continue opens the outline step at that place', async ({
  page,
}) => {
  await page.goto('/new?tier=0')
  await expect(page.getByRole('heading', { name: flow.place.title })).toBeVisible()
  await expect(page.getByText(flow.place.need)).toBeVisible()
  await expect(page.getByRole('button', { name: copy.common.next })).toBeDisabled()
  await page.getByLabel(copy.search.label).fill('Nagpur')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.getByRole('button', { name: 'Nagpur, Maharashtra, India' }).click()
  await expect(page.getByText(flow.place.chosen('Nagpur, Maharashtra, India'))).toBeVisible()
  await page.getByRole('button', { name: copy.common.next }).click()
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
  await expect(page.getByLabel(flow.outline.centre)).toHaveValue('21.145800, 79.088200')
})

test('picking a place on step 1 flies the map there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/new?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await styleReady(page)
  await page.getByLabel(copy.search.label).fill('Nagpur')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.getByRole('button', { name: 'Nagpur, Maharashtra, India' }).click()
  await page.waitForFunction(() => Math.abs((window as any).__gs.map.getCenter().lng - 79.0882) < 0.01)
})

// The outline layer is ours (gs-aoi): accent coloured, and the installer re-applies it after the theme switch reloads the style.
test('the outline is drawn on the map in the accent colour and survives a theme switch', async ({ page }) => {
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await styleReady(page)
  await outlineSiteByCoords(page, 1000)
  const outline = () =>
    page.evaluate(() => {
      const m = (window as any).__gs.map
      return {
        features: m.getStyle().sources['gs-aoi']?.data?.features?.length,
        color: m.getPaintProperty('gs-aoi-line', 'line-color'),
      }
    })
  await expect.poll(outline).toEqual({ features: 1, color: '#e48444' })
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await expect.poll(outline).toEqual({ features: 1, color: '#a74e1b' })
})

// A phone puts the panel under the map band, but with no map (tier 0) there is no band to clear.
test('the panel starts under the header when there is no map, and under the map band when there is', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'the map band is a phone-width layout')
  const stepper = page.getByRole('navigation', { name: flow.stepOf(2) })
  await startAt(page)
  expect((await stepper.boundingBox())!.y).toBeLessThan(120)
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  expect((await stepper.boundingBox())!.y).toBeGreaterThan(page.viewportSize()!.height * 0.45)
})

// The shell's axe loop only sees step 1; step 2 adds the radio cards, the open form, the error list and the swapped question.
test('step 2 passes axe in both themes, with an error and the swapped question showing', async ({ page }) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  await page.getByLabel(flow.outline.width).fill('4')
  await page.getByLabel(flow.outline.start).fill('79.07698, 21.138637')
  await page.getByRole('button', { name: flow.outline.useLine }).click()
  await expect(page.getByText(copy.search.swapped(79.07698, 21.138637))).toBeVisible()
  await expect(page.getByText('Road width must be a whole number from 5 to 200 metres.')).toBeVisible()
  for (let i = 0; i < 2; i++) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
})

// A deep link or a reload at step 2 starts with the map on the globe; it has to go to the place the link names.
test('a deep link at step 2 flies the map to the place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await page.waitForFunction(() => {
    const m = (window as any).__gs?.map
    if (!m) return false
    const c = m.getCenter()
    return m.getZoom() > 10 && Math.abs(c.lng - 79.0882) < 0.01 && Math.abs(c.lat - 21.1458) < 0.01
  })
})

// The forms make an outline without a click on the map, so the map has to go and show it (the place alone flies to zoom 13).
test('the square form fits the map to the outline it makes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await styleReady(page)
  await outlineSiteByCoords(page, 1000)
  await page.waitForFunction(() => (window as any).__gs.map.getZoom() > 13)
})
