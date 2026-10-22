import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Download, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  finishDatesAndOpen,
  openFixtureSite,
  outlineSiteByCoords,
  startAt,
  waitForPhotos,
} from './helpers.ts'

// The "Sharper" viewing aid: one switch in the viewer's tool row. It changes how the screen draws the photos (an SVG filter on
// the viewer's canvases, a contrast on the map's photo layer) and nothing else: no stored or hashed pixel, nothing of it in the report.

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
const sharperSwitch = (page: Page) => page.getByRole('checkbox', { name: flow.sharper.label })
const photos = (page: Page) => page.getByRole('img', { name: /^(Before|After) photo/ })
/** The CSS filter a canvas is drawn with ("none" when it has none). Its text is the engine's own (Chromium and WebKit print `url("#gs-sharper")`), so it is only searched for the id. */
const filterOf = (canvas: ReturnType<Page['locator']>) => canvas.evaluate((c) => getComputedStyle(c).filter)
const ID = '#gs-sharper'

test('the switch is off at first and named as a viewing aid; on, both photos are drawn through the filter and a line says so', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const sharper = sharperSwitch(page)
  await expect(sharper).not.toBeChecked()
  await expect(sharper).toHaveAccessibleName(new RegExp(`^${flow.sharper.label}\\s?: ${flow.sharper.aid}$`))
  await expect(page.getByText(flow.sharper.note)).toHaveCount(0)
  await expect(page.locator('filter#gs-sharper')).toHaveCount(0)
  for (const i of [0, 1]) expect(await filterOf(photos(page).nth(i))).toBe('none')

  await sharper.check()
  await expect(page.getByText(flow.sharper.note)).toBeVisible()
  await expect(page.locator('filter#gs-sharper')).toHaveCount(1)
  await expect(photos(page)).toHaveCount(2)
  for (const i of [0, 1]) expect(await filterOf(photos(page).nth(i))).toContain(ID)
  // The picture is the same pixels: the canvas holds exactly what it held, only the drawing differs.
  expect(
    await photos(page)
      .nth(1)
      .evaluate((c) => getComputedStyle(c).imageRendering),
  ).toBe('auto')

  await sharper.uncheck()
  await expect(page.getByText(flow.sharper.note)).toHaveCount(0)
  await expect(page.locator('filter#gs-sharper')).toHaveCount(0)
  for (const i of [0, 1]) expect(await filterOf(photos(page).nth(i))).toBe('none')
})

test('the canvas keeps its pixels: the same bytes with the aid on and off', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const bytes = () =>
    photos(page)
      .nth(1)
      .evaluate((c) => {
        const canvas = c as HTMLCanvasElement
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        let h = 0
        for (let i = 0; i < data.length; i++) h = (Math.imul(h, 31) + data[i]!) | 0
        return `${canvas.width}x${canvas.height}:${h}`
      })
  const off = await bytes()
  await sharperSwitch(page).check()
  expect(await bytes()).toBe(off)
})

test('the filter does not lift the outermost pixels of the picture or the edge of a no-data hole', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await sharperSwitch(page).check()
  // A flat light-grey picture with a transparent hole, drawn outside the viewer, through the same filter, over black. A blur that
  // counts a transparent neighbour as black lifts the outermost pixels by tens of levels (57 of 255 at pixel ratio 2); filled and
  // limited, nothing may rise more than 4 above the flat area.
  await page.evaluate((id) => {
    const wrap = document.createElement('div')
    wrap.id = 'edge-probe'
    wrap.style.cssText =
      'position:fixed;left:0;top:0;z-index:99999;background:#000;padding:12px;line-height:0'
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    c.style.cssText = `width:64px;height:64px;filter:url(${id})`
    const g = c.getContext('2d')!
    g.fillStyle = 'rgb(191,191,191)'
    g.fillRect(0, 0, 64, 64)
    g.clearRect(24, 24, 16, 16)
    wrap.append(c)
    document.body.append(wrap)
  }, ID)
  const shot = await page.locator('#edge-probe').screenshot()
  const { w, d } = await page.evaluate(async (b64) => {
    // Decoded by the page itself: no PNG library in the tests.
    const bmp = await createImageBitmap(
      new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }),
    )
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    return { w: bmp.width, d: Array.from(g.getImageData(0, 0, bmp.width, bmp.height).data) }
  }, shot.toString('base64'))
  const red = (x: number, y: number) => d[(y * w + x) * 4]!
  const scale = w / (64 + 24)
  const flat = red(Math.round((12 + 8) * scale), Math.round((12 + 8) * scale)) // inside the picture, far from every edge
  expect(flat, 'the filter is on the probe: 1.1 x 191 - 0.045 x 255 is about 199').toBeGreaterThan(190)
  expect(flat).toBeLessThan(207)
  let highest = 0
  for (let y = Math.round(12 * scale); y < Math.round((12 + 64) * scale); y++)
    for (let x = Math.round(12 * scale); x < Math.round((12 + 64) * scale); x++)
      highest = Math.max(highest, red(x, y))
  expect(highest - flat, `the highest pixel is ${highest}, the flat area ${flat}`).toBeLessThanOrEqual(4)
})

test('the difference layer and the timeline previews are drawn as they were; the photo under the difference is not', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await sharperSwitch(page).check()
  await page.getByRole('radio', { name: flow.workbench.modes.diff }).check({ timeout: 30_000 })
  const heat = page.getByRole('img', { name: flow.workbench.modes.diff, exact: true })
  await expect(heat).toBeVisible({ timeout: 30_000 }) // the masks arrived and the difference was drawn
  expect(await filterOf(heat)).toBe('none')
  expect(await filterOf(page.getByRole('img', { name: /^Before photo/ }))).toContain(ID)
  // The 52 px previews of the timeline are not the viewer's pictures: they keep the page as it was.
  const previews = page.locator('canvas[aria-label^="Satellite pass photo"]')
  expect(await previews.count()).toBeGreaterThan(0)
  for (const canvas of await previews.all()) expect(await filterOf(canvas)).toBe('none')
})

test('it is kept nowhere: a new visit starts with it off', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await sharperSwitch(page).check()
  await page.reload()
  await waitForPhotos(page)
  await expect(sharperSwitch(page)).not.toBeChecked()
  expect(await filterOf(photos(page).nth(0))).toBe('none')
})

test('the workbench passes axe in all three views and both themes with the aid on', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await sharperSwitch(page).check()
  for (const view of ['swipe', 'side', 'diff'] as const) {
    await page.getByRole('radio', { name: flow.workbench.modes[view] }).check({ timeout: 30_000 })
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
      expect(results.violations, `${view}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  }
})

const fileOf = async (dl: Download) => readFileSync((await dl.path())!, 'utf8')
/** The report's pictures, in the order they are printed: the data URLs of its <img> tags. */
const picturesOf = (html: string) =>
  [...html.matchAll(/<img src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/g)].map((m) => m[1]!)
const reportHtml = async (page: Page) => {
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: flow.report.download }).click({ timeout: 60_000 }),
  ])
  return fileOf(dl)
}

test('the report prints the same pictures with the aid on as with it off, and carries nothing of it', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const off = await reportHtml(page)
  await page.goBack()
  await waitForPhotos(page)
  await sharperSwitch(page).check()
  await expect(page.locator('filter#gs-sharper')).toHaveCount(1)
  const on = await reportHtml(page)

  const pictures = picturesOf(on)
  expect(pictures.length).toBeGreaterThanOrEqual(2) // the before and the after, as shown
  expect(pictures).toEqual(picturesOf(off))
  for (const html of [off, on]) {
    expect(html).not.toContain('gs-sharper')
    expect(html).not.toContain('<filter')
    expect(html).not.toContain(flow.sharper.label)
  }
})

// The map is drawn in software at a forced tier here, a setup the app never picks for itself (see workbench-map.spec.ts): one
// retry, as there, for the globe camera that now and then goes NaN on its own.
test.describe('on the map', () => {
  test.describe.configure({ retries: 1 })

  const hasWebgl2 = (p: Page) => p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
  /** The frame layer's paint as the live map holds it (null while there is no such layer), and the order of the layers. */
  const frame = (p: Page) =>
    p.evaluate(() => {
      const m = (window as any).__gs?.map
      if (!m?.getLayer('gs-frame')) return null
      return {
        contrast: (m.getPaintProperty('gs-frame', 'raster-contrast') ?? null) as number | null,
        resampling: (m.getPaintProperty('gs-frame', 'resampling') ?? null) as string | null,
        rasterResampling: (m.getPaintProperty('gs-frame', 'raster-resampling') ?? null) as string | null,
        ids: m.getStyle().layers.map((l: { id: string }) => l.id) as string[],
      }
    })

  /** The layer's contrast: its number while the aid is on, 0 while the layer has none, -1 while there is no layer (it is being put up again). */
  const contrast = async (p: Page) => {
    const f = await frame(p)
    return f === null ? -1 : (f.contrast ?? 0)
  }

  test('the photo layer is stretched while it is on, sets no resampling key, stays under the outline, and passes axe in both themes', async ({
    page,
  }) => {
    await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
    test.skip(!(await hasWebgl2(page)), 'no WebGL2')
    await outlineSiteByCoords(page, 1000)
    await finishDatesAndOpen(page)
    await waitForPhotos(page)
    await page.getByRole('button', { name: flow.workbench.showMap }).click()
    await expect.poll(async () => (await frame(page)) !== null, { timeout: 30_000 }).toBe(true)
    // Any error the map reports about the layer (a key it refuses) is kept, to be looked at below.
    await page.evaluate(() => {
      const w = window as any
      w.__mapErrors = [] as string[]
      w.__gs.map.on('error', (e: any) => w.__mapErrors.push(String(e?.error?.message ?? e?.message ?? e)))
    })

    expect(await frame(page)).toMatchObject({ contrast: null, resampling: null, rasterResampling: null })
    await sharperSwitch(page).check()
    await expect.poll(() => contrast(page), { timeout: 15_000 }).toBeGreaterThan(0)
    const on = (await frame(page))!
    expect(on.contrast).toBeLessThanOrEqual(1)
    expect([on.resampling, on.rasterResampling]).toEqual([null, null])
    expect(on.ids.indexOf('gs-frame')).toBeGreaterThan(-1)
    expect(on.ids.indexOf('gs-frame')).toBeLessThan(on.ids.indexOf('gs-aoi-fill'))
    expect(on.ids.indexOf('gs-aoi-fill')).toBeLessThan(on.ids.indexOf('gs-aoi-line'))

    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
    // A theme change loads another style: the layer is put up again with the aid still on.
    await expect.poll(() => contrast(page), { timeout: 30_000 }).toBeGreaterThan(0)

    await sharperSwitch(page).uncheck()
    await expect.poll(() => contrast(page), { timeout: 15_000 }).toBe(0)
    expect(await frame(page)).toMatchObject({ contrast: null, resampling: null, rasterResampling: null })
    const errors = await page.evaluate(() => (window as any).__mapErrors as string[])
    expect(errors.filter((m) => /raster|paint|resampling|contrast|gs-frame/i.test(m))).toEqual([])
  })
})
