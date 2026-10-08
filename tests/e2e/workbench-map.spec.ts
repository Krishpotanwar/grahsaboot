import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fmtDate } from '../../src/lib/format.ts'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { itemId } from '../fixtures/scene.ts'
import {
  finishDatesAndOpen,
  manyPasses,
  openFixtureSite,
  outlineSiteByCoords,
  startAt,
  waitForPhotos,
} from './helpers.ts'

// These tests draw the globe in software (SwiftShader) at a forced tier, a setup the app never picks for itself. On a loaded
// machine MapLibre 6.12's globe camera then and again goes NaN on its own (page errors "Cannot read properties of null
// (reading '0')" in _calcMatrices, with style warnings "Input is not a number", then "Invalid LngLat object: (NaN, NaN)" from
// the next fit): a few runs in a few hundred, none reproduced outside this suite. The app no longer blanks when it happens
// (fitAoi and flyToPlace catch it), and a map in that state cannot pass these tests, so each gets one more try.
test.describe.configure({ retries: 1 })

const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
const stage = (page: Page) => page.locator('.map-stage')
const showMap = (page: Page) => page.getByRole('button', { name: flow.workbench.showMap })
const hideMap = (page: Page) => page.getByRole('button', { name: flow.workbench.hideMap })
const slider = (page: Page) => page.getByRole('slider', { name: flow.workbench.timelineLabel })

/** The fixture site opened at tier 2, so there is a map. Skips where the engine has no WebGL2. */
async function openWithMap(page: Page) {
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2')
  await outlineSiteByCoords(page, 1000)
  await finishDatesAndOpen(page)
}

/** What the map holds of ours: the outline, the photo, and the order of the layers. */
const mapState = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__gs?.map
    const ids: string[] = m?.getStyle()?.layers.map((l: { id: string }) => l.id) ?? []
    return {
      aoi: !!m?.getSource('gs-aoi'),
      frame: (m?.getSource('gs-frame')?.type ?? null) as string | null,
      ids,
    }
  })
/** The photo is drawn under the outline: its layer comes before the outline's fill, which comes before its line. */
const photoUnderOutline = ({ ids }: { ids: string[] }) =>
  ids.indexOf('gs-frame') > -1 &&
  ids.indexOf('gs-frame') < ids.indexOf('gs-aoi-fill') &&
  ids.indexOf('gs-aoi-fill') < ids.indexOf('gs-aoi-line')
const onMap = (page: Page) => mapState(page).then((s) => [s.aoi, s.frame, photoUnderOutline(s)])

/** Counts, from before the page loads, every PNG the page encodes and every full-resolution frame it asks the imagery worker for. */
async function countWork(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__enc = 0
    w.__full = [] as string[]
    const toDataURL = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, ...a: []) {
      w.__enc++
      return toDataURL.apply(this, a)
    }
    const post = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (this: Worker, msg: any, ...rest: []) {
      if (msg?.op === 'frame' && msg.req?.level === 0) w.__full.push(msg.req.item.id)
      return post.call(this, msg, ...rest)
    }
  })
  return () =>
    page.evaluate(() => ({
      enc: (window as any).__enc as number,
      full: [...(window as any).__full] as string[],
    }))
}

test('map toggle shows the outline and the selected photo on the map', async ({ page }) => {
  await openWithMap(page)
  await showMap(page).click()
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getSource('gs-aoi'))
  await page.waitForFunction(() => (window as any).__gs?.map?.getSource('gs-frame')?.type === 'image', null, {
    timeout: 30_000,
  })
  await expect(stage(page)).toHaveAttribute('data-layout', 'mini')
  await hideMap(page).click()
  await expect(stage(page)).toHaveAttribute('data-layout', 'hidden')
})

test('the outline and the photo come back after a theme switch, the photo still under the outline', async ({
  page,
}) => {
  await openWithMap(page)
  await showMap(page).click()
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(
    () =>
      (window as any).__gs.map.getStyle()?.layers.find((l: any) => l.id === 'bg')?.paint?.[
        'background-color'
      ] === '#FFFFFF',
  )
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
})

test('at tier 0 there is no map button, and the page works without one', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openFixtureSite(page)
  await waitForPhotos(page)
  await expect(showMap(page)).toHaveCount(0)
  await expect(hideMap(page)).toHaveCount(0)
  await expect(stage(page)).toHaveAttribute('data-layout', 'hidden')
  expect(errors).toEqual([])
})

test('opening and closing the map keeps the photos, and a closed map holds no photo', async ({ page }) => {
  await openWithMap(page)
  await waitForPhotos(page)
  await expect(showMap(page)).toHaveAttribute('aria-pressed', 'false')
  await showMap(page).click()
  await expect(hideMap(page)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
  await waitForPhotos(page)
  await hideMap(page).click()
  await expect(showMap(page)).toHaveAttribute('aria-pressed', 'false')
  await waitForPhotos(page)
  await expect.poll(() => mapState(page).then((s) => s.frame)).toBe(null)
  expect((await mapState(page)).aoi).toBe(true) // the outline stays installed; only the photo goes
})

// The map outlives the screens: whatever the workbench puts on it has to go when the workbench does.
test('leaving the workbench takes its outline and photo off the shared map', async ({ page }) => {
  await openWithMap(page)
  await showMap(page).click()
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
  await page.getByRole('link', { name: copy.nav.home }).click()
  await expect(stage(page)).toHaveAttribute('data-layout', 'globe')
  await expect.poll(() => mapState(page).then((s) => [s.aoi, s.frame])).toEqual([false, null])
})

// The map is 360 x 240 in the corner; the fit has to use that size, not the size of the hidden map it grew from.
test('the map opens on the whole outline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openWithMap(page)
  await showMap(page).click()
  await expect(stage(page)).toHaveAttribute('data-layout', 'mini')
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const m = (window as any).__gs.map
          const c = m.getContainer()
          const canvas = m.getCanvas() // the map sets its style size when it resizes to its container
          // Not yet resized to the corner box, or still moving: not the answer yet.
          if (
            Math.abs(parseFloat(canvas.style.width) - c.clientWidth) > 1 || // a phone's sizes are not whole pixels
            Math.abs(parseFloat(canvas.style.height) - c.clientHeight) > 1 ||
            c.clientWidth > 360 ||
            m.isMoving()
          )
            return null
          const ring: [number, number][] =
            m.getStyle().sources['gs-aoi'].data.features[0].geometry.coordinates[0]
          return ring.every((p) => {
            const { x, y } = m.project(p)
            return x >= 0 && x <= c.clientWidth && y >= 0 && y <= c.clientHeight
          })
        }),
      { timeout: 15_000 },
    )
    .toBe(true)
})

// 1,100 passes and a fast slider: the map follows the date the slider rests on, and asks for and encodes nothing on the way.
test('scrubbing with the map open loads and encodes nothing until the slider rests', async ({ page }) => {
  const counts = await countWork(page)
  const { log, dates } = await manyPasses(page, 20)
  await openWithMap(page)
  const s = slider(page)
  await expect(s).toHaveAttribute('max', String(dates.length - 1), { timeout: 30_000 })
  await expect(s).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
  await waitForPhotos(page)
  // The sweep and its previews are done when no picture request has arrived for a second.
  const quiet = () =>
    expect
      .poll(
        async () => {
          const n = log.length
          await page.waitForTimeout(1000)
          return log.length === n
        },
        { timeout: 45_000 },
      )
      .toBe(true)
  await quiet()
  // With the map closed, resting on a usable date asks for no full frame and encodes no PNG.
  const pair = (await counts()).full
  await s.focus()
  await page.keyboard.press('ArrowLeft') // 15 Jun, obscured
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear') // a usable photo
  await page.waitForTimeout(600)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(s).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/)
  expect(await counts()).toEqual({ enc: 0, full: pair })
  await page.waitForTimeout(400) // let 20 Dec rest, or the map would open on the 5 Mar it rested on before
  await showMap(page).click()
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
  await quiet()
  const before = await counts()
  expect(before.enc).toBe(1) // the photo of the date the map opened on
  // Twenty steps back, 15 ms apart: never 250 ms at rest. The steps and the counts are timed inside the page: a round trip to
  // the browser can stall for longer than the rest the app waits for (a busy machine did), and then the date really rests.
  const during = await s.evaluate(async (el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    for (let i = 0; i < 20; i++) {
      set.call(el, String(Number(el.value) - 1)) // what ArrowLeft does, as an input event React sees
      el.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 15))
    }
    const w = window as any
    return { enc: w.__enc as number, full: [...w.__full] as string[] }
  })
  expect(during.full).toEqual(before.full)
  expect(during.enc).toBe(before.enc)
  const rested = dates[3]!
  await expect(s).toHaveAttribute('aria-valuetext', `${fmtDate(rested)}, Clear`)
  // At rest: its full frame is asked for once, its PNG made once, and it is on the map.
  await expect
    .poll(async () => (await counts()).full, { timeout: 15_000 })
    .toEqual([...before.full, itemId(rested)])
  await expect.poll(async () => (await counts()).enc, { timeout: 15_000 }).toBe(before.enc + 1)
  await expect.poll(() => onMap(page), { timeout: 15_000 }).toEqual([true, 'image', true])
  await page.waitForTimeout(500)
  expect(await counts()).toEqual({ enc: before.enc + 1, full: [...before.full, itemId(rested)] })
})

test('resting on a pass with no usable photo takes the photo off the map and keeps the outline', async ({
  page,
}) => {
  const counts = await countWork(page)
  await openWithMap(page)
  await showMap(page).click()
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
  const s = slider(page)
  await expect(s).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
  await s.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
  await expect
    .poll(() => mapState(page).then((m) => [m.aoi, m.frame]), { timeout: 15_000 })
    .toEqual([true, null])
  expect((await counts()).full).not.toContain(itemId('2025-06-15'))
  // A partly clear pass is usable: its photo is fetched and put on the map.
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  await expect.poll(() => onMap(page), { timeout: 15_000 }).toEqual([true, 'image', true])
  expect((await counts()).full).toContain(itemId('2025-03-05'))
})

// The map floats over the bottom corner of the page, so the page has to leave room to scroll its last controls up from under it.
for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  test(`the open map covers neither the map button nor the timeline nor the last control, at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openWithMap(page)
    await waitForPhotos(page)
    await showMap(page).click()
    await expect(stage(page)).toHaveAttribute('data-layout', 'mini')
    // By rectangles, not by hit test: a disabled button takes no pointer events, so it would never be "hit" even when clear.
    const uncovered = (target: Locator) =>
      target.evaluate((el) => {
        const a = el.getBoundingClientRect()
        const b = document.querySelector('.map-stage')!.getBoundingClientRect()
        return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
      })
    expect(await uncovered(hideMap(page))).toBe(true)
    await slider(page).evaluate((el) => el.scrollIntoView({ block: 'center' }))
    expect(await uncovered(slider(page))).toBe(true)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const save = page
      .getByRole('region', { name: flow.claim.title })
      .getByRole('button', { name: flow.claim.save })
    expect(await uncovered(save)).toBe(true)
  })
}

test('the workbench with its map open passes axe in both themes', async ({ page }) => {
  await openWithMap(page)
  await showMap(page).click()
  await expect.poll(() => onMap(page), { timeout: 30_000 }).toEqual([true, 'image', true])
  for (let i = 0; i < 2; i++) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
})
