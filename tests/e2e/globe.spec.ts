import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
const styleReady = (page: Page) => page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())

test('globe renders at tier 2 with attribution', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await styleReady(page)
  expect(await page.evaluate(() => (window as any).__gs.map.getProjection().type)).toBe('globe')
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap')
})

// Pins two real failures: MapLibre's CSS collapsing the fixed stage to 0 px, and page layers swallowing map input.
test('the globe fills its area, receives pointer input and zooms with the wheel', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  const box = (await page.locator('.map-stage canvas').boundingBox())!
  expect(box.height).toBeGreaterThan(300)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [cx, cy])).toBe('CANVAS')
  const z0 = await page.evaluate(() => (window as any).__gs.map.getZoom())
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -600)
  await expect.poll(() => page.evaluate(() => (window as any).__gs.map.getZoom())).toBeGreaterThan(z0 + 0.2)
})

test('tier 0 shows a plain notice and no map, but the main actions still work', async ({ page }) => {
  await page.goto('/?tier=0')
  await expect(page.getByText(copy.map.staticNotice)).toBeVisible()
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0)
  await expect(page.getByRole('link', { name: copy.nav.newInvestigation }).first()).toBeVisible()
})

// With no map there is nothing to put beside the text: one column, with the panel under the search instead of stranded bottom right.
test('tier 0 on a desktop is one column with the satellites panel in it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the two-column desktop layout starts at 1024 px')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?tier=0')
  const panel = page.getByRole('region', { name: copy.sats.title })
  await expect(panel.getByText('Sentinel-2A')).toBeVisible()
  const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!
  const box = (await panel.boundingBox())!
  expect(Math.abs(box.x - h1.x)).toBeLessThan(2)
  expect(box.y).toBeGreaterThan(h1.y + h1.height)
})

test('reduced motion disables auto-rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  const a = await page.evaluate(() => (window as any).__gs.map.getCenter().lng)
  await page.waitForTimeout(1500)
  const b = await page.evaluate(() => (window as any).__gs.map.getCenter().lng)
  expect(Math.abs(b - a)).toBeLessThan(0.01)
})

test('theme toggle swaps the map style', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(
    () =>
      (window as any).__gs.map.getStyle().layers.find((l: any) => l.id === 'bg')?.paint?.[
        'background-color'
      ] === '#FFFFFF',
  )
  await page.waitForFunction(() => !!(window as any).__gs.map.getLayer('gs-gibs'))
})

// The Blue Marble covers the basemap labels (the approved mockup has none) until it fades out; the satellite layers stay above it, also after a style reload.
test('the Blue Marble draws over the basemap labels and under the satellite layers', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  const order = () =>
    page.evaluate(() => (window as any).__gs.map.getStyle().layers.map((l: any) => l.id) as string[])
  const want = ['bg', 'labels', 'gs-gibs', 'gs-sat-swath', 'gs-sat-track']
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getLayer('gs-sat-track'))
  expect(await order()).toEqual(want)
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(
    () =>
      (window as any).__gs.map.getStyle().layers.find((l: any) => l.id === 'bg')?.paint?.[
        'background-color'
      ] === '#FFFFFF' && !!(window as any).__gs.map.getLayer('gs-sat-track'),
  )
  expect(await order()).toEqual(want)
})

// Ruled start zoom: the globe fills ~88% of the stage's short side. The map is created before the first layout is set, so this also pins the hidden stage sharing the globe's box (phones).
test('the globe starts sized to the stage', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  const { zoom, w, h } = await page.evaluate(() => {
    const m = (window as any).__gs.map
    const c = m.getContainer()
    return { zoom: m.getZoom(), w: c.clientWidth, h: c.clientHeight }
  })
  expect(zoom).toBeCloseTo(Math.log2((0.44 * Math.min(w, h) * 2 * Math.PI) / 512) + 0.36, 2)
})

// Pins a real failure: map.remove() fires webglcontextlost, which used to downgrade the tier again and cascade to tier 0.
test('switch to full rebuilds the map at tier 3 and stays there', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.getByRole('button', { name: copy.map.switchFull }).click()
  await page.waitForFunction(() => !!(window as any).__gs.map.getStyle()?.sources['gs-terrain'])
  await expect(page.getByText(copy.map.staticNotice)).toHaveCount(0)
})

// A rebuilt map (tier change, WebGL context loss) must come back where the user was, not at the start view.
test('switch to full keeps the camera where the user flew to', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.waitForFunction(() => (window as any).__gs.map.getZoom() > 12)
  const view = () =>
    page.evaluate(() => {
      const m = (window as any).__gs.map
      const c = m.getCenter()
      return { lng: c.lng as number, lat: c.lat as number, zoom: m.getZoom() as number }
    })
  const before = await view()
  await page.getByRole('button', { name: copy.map.switchFull }).click()
  await page.waitForFunction(() => !!(window as any).__gs.map.getStyle()?.sources['gs-terrain'])
  const after = await view()
  expect(Math.abs(after.lng - before.lng)).toBeLessThan(0.01)
  expect(Math.abs(after.lat - before.lat)).toBeLessThan(0.01)
  expect(after.zoom).toBeCloseTo(before.zoom, 1)
})

// Pins a real failure: a fixed zoom-3 stop meant the globe never turned on large screens, where the start zoom already exceeds 3.
test('coming back to the globe from a place does not spin the zoomed-in map', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect
    .poll(() => page.evaluate(() => !(window as any).__gs.map.isMoving() && (window as any).__gs.map.getZoom() > 10), {
      timeout: 20_000,
    })
    .toBe(true)
  await page.getByRole('link', { name: copy.nav.startHere }).click()
  await page.getByRole('link', { name: copy.notFound.home }).click()
  await expect(page.getByLabel(copy.search.label)).toBeVisible()
  const lng = () => page.evaluate(() => (window as any).__gs.map.getCenter().lng as number)
  const before = await lng()
  await page.waitForTimeout(1000)
  expect(await lng()).toBeCloseTo(before, 6)
})

// WCAG 2.4.3: the skip link is the first Tab stop, ahead of the map canvas and its controls (axe cannot see this).
test('the first Tab stop is the skip link, not the map', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: copy.common.skip })).toBeFocused()
})

// Spec §7.6: tier 1 is a flat map, so the fly-to's 50-55 degree tilt must not apply to it.
test('tier 1 stays flat when it flies to a place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=1')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible() // maxPitch 0 must not make createMap throw (that drops to tier 0)
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.waitForFunction(() => (window as any).__gs.map.getZoom() > 12)
  expect(await page.evaluate(() => (window as any).__gs.map.getPitch())).toBe(0)
})

// WCAG 2.4.7: the canvas fills the map box and MapLibre clips overflow, so a ring drawn outside it never shows. It must be drawn inside.
test('the keyboard focus ring on the map is visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = (await canvas.boundingBox())!
  const corner = { x: box.x, y: box.y, width: 8, height: 8 }
  const before = await page.screenshot({ clip: corner })
  for (let i = 0; i < 30 && !(await canvas.evaluate((c) => c === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(canvas).toBeFocused()
  expect((await page.screenshot({ clip: corner })).equals(before)).toBe(false)
})

// The map outlives the globe screen, so the pick must too: the pin, the next pass and "start here" come back with it.
test('the picked place is still there after a trip to another page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  const pin = page.locator('.place-pin')
  await expect(pin).toHaveText(copy.search.coordsResult(21.1458, 79.0882))
  await page.getByRole('link', { name: copy.nav.startHere }).click()
  await page.getByRole('link', { name: copy.notFound.home }).click()
  await expect(pin).toHaveText(copy.search.coordsResult(21.1458, 79.0882))
  await expect(page.getByRole('link', { name: copy.nav.startHere })).toBeVisible()
  await expect(page.getByText(/^Next look at/)).toBeVisible()
})

test('the globe auto-rotates on a large screen', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a 2200 px wide emulated phone (DPR 2.6) would need a ~12 MP canvas')
  await page.setViewportSize({ width: 2200, height: 1300 })
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  expect(await page.evaluate(() => (window as any).__gs.map.getZoom())).toBeGreaterThan(3)
  const lng = () => page.evaluate(() => (window as any).__gs.map.getCenter().lng as number)
  const start = await lng()
  await expect.poll(lng, { timeout: 15_000 }).not.toBe(start)
})
