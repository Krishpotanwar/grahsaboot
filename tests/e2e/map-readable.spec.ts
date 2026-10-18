import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { startAt } from './helpers.ts'

// The outline step's map: readable roads and labels, a line that says the map is loading or failed, the credit folded away, and
// the aids for drawing (the hint, Undo, Finish). Tier 2 so there is a map; the styles are the fixtures' (real layer ids).
const NAGPUR = 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur'
const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
const styleReady = (page: Page) => page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
const paint = (page: Page, id: string, prop: string) =>
  page.evaluate(([i, p]) => (window as any).__gs.map.getPaintProperty(i, p), [id, prop] as const)
const status = (page: Page) => page.getByRole('status').filter({ hasText: /Loading the map|^$/ })

async function open(page: Page) {
  await startAt(page, NAGPUR)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await styleReady(page)
  await page.evaluate(() =>
    (window as any).__gs.map.jumpTo({ center: [79.0882, 21.1458], zoom: 15, pitch: 0, bearing: 0 }),
  )
  await page.waitForFunction(() => !!(window as any).__gs?.draw)
}
async function corner(page: Page, dx: number, dy: number) {
  // On a phone the panel is below the map and scrolls over it: pressing Undo or Finish scrolled it into view.
  await page.evaluate(() => window.scrollTo(0, 0))
  const box = (await page.locator('.map-stage canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
}
const corners = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__gs.draw.getSnapshot().find((f: any) => f.properties.currentlyDrawing)?.properties
        .committedCoordinateCount ?? 0,
  )

test('the readable-map patch is on the map, and follows a theme switch', async ({ page }) => {
  await open(page)
  expect(await paint(page, 'highway_minor', 'line-color')).toBe('#686868') // dark: 3.5:1 against the ground
  expect(await paint(page, 'highway_name_other', 'text-color')).toBe('#c9c9c9')
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await expect.poll(() => paint(page, 'highway_minor', 'line-color')).toBe('#a8a8a8') // light
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await expect.poll(() => paint(page, 'highway_minor', 'line-color')).toBe('#686868')
})

test('says the map is loading until it is ready, and the line then goes', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/style/*.json', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/new?${NAGPUR}`)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await expect(page.getByText(flow.outline.mapLoading)).toBeVisible()
  release()
  await expect(page.getByText(flow.outline.mapLoading)).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a map that cannot load says so after 10 s and opens the coordinates instead', async ({ page }) => {
  await page.route('**/style/*.json', (route) => route.abort())
  await page.goto(`/new?${NAGPUR}`)
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await expect(page.getByRole('alert')).toHaveText(flow.outline.mapFailed, { timeout: 30_000 })
  await expect(page.locator('details', { hasText: flow.outline.byCoords })).toHaveJSProperty('open', true)
  await expect(page.getByRole('button', { name: flow.outline.finish })).toHaveCount(0) // nothing to draw on
  // and the form still makes an outline
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
  await expect(page.getByText(/^Area \d+\.\d\d km²/)).toBeVisible()
})

test('the credit starts folded to the "i" button on the outline step, one click from the text', async ({
  page,
}) => {
  await open(page)
  const attrib = page.locator('.maplibregl-ctrl-attrib')
  const button = attrib.locator('.maplibregl-ctrl-attrib-button')
  const text = attrib.locator('.maplibregl-ctrl-attrib-inner')
  await expect(button).toBeVisible()
  await expect(text).toBeHidden()
  await button.click()
  await expect(text).toBeVisible()
  await expect(text).toContainText(copy.attribution.osm)
})

test('the hint, Undo and Finish: a corner can be taken back, and an outline finished from three', async ({
  page,
}) => {
  await open(page)
  await expect(page.getByText(flow.outline.drawSite)).toBeVisible()
  const undo = page.getByRole('button', { name: flow.outline.undo })
  const finish = page.getByRole('button', { name: flow.outline.finish })
  await expect(undo).toBeDisabled()
  await expect(finish).toBeDisabled()
  await corner(page, -80, -80)
  await expect(undo).toBeEnabled()
  await corner(page, 80, -80)
  await corner(page, 80, 80)
  await expect(finish).toBeEnabled()
  expect(await corners(page)).toBe(3)
  await undo.click()
  await expect.poll(() => corners(page)).toBe(2)
  await expect(finish).toBeDisabled() // two corners are not an outline
  await corner(page, -80, 80)
  await expect(finish).toBeEnabled()
  // each is a 44 px target
  for (const b of [undo, finish]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await finish.click()
  await expect(page.getByText(/^Area \d+\.\d\d km²/)).toBeVisible()
  await expect(finish).toBeDisabled()
  await expect(page.getByRole('button', { name: copy.common.next })).toBeEnabled()
})

test('a road is finished from two points', async ({ page }) => {
  await open(page)
  await page.getByRole('radio', { name: new RegExp(flow.outline.road) }).check()
  await expect(page.getByText(flow.outline.drawRoad)).toBeVisible()
  const finish = page.getByRole('button', { name: flow.outline.finish })
  await corner(page, -100, 0)
  await expect(finish).toBeDisabled()
  await corner(page, 100, 0)
  await expect(finish).toBeEnabled()
  await finish.click()
  await expect(page.getByText(/^Length \d+\.\d\d km/)).toBeVisible()
})

test('the outline step with its map passes axe in both themes, at 1440 and 390 px', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await open(page)
    await corner(page, -60, -60)
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .exclude('.maplibregl-canvas')
        .analyze()
      expect(results.violations, `${width}px`).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  }
})
