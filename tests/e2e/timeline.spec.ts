import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fmtDate } from '../../src/lib/format.ts'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  CORS,
  manyPasses,
  openFixtureRoad,
  openFixtureSite,
  openThenEdit,
  readStored,
  tabKey,
  waitForSettled,
} from './helpers.ts'
import { FIXTURE_DATES } from '../fixtures/scene.ts'

const slider = (page: Page) => page.getByRole('slider', { name: flow.workbench.timelineLabel })
const aside = (page: Page) => page.getByRole('complementary', { name: flow.workbench.timeline })
const grid = (page: Page) => page.getByRole('grid', { name: flow.workbench.grid })
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** From the last pass (20 Dec, once its check is done) back to 15 Jun, then 5 Mar. */
async function stepBack(page: Page, times: number) {
  const s = slider(page)
  await expect(s).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
  await s.focus()
  for (let i = 0; i < times; i++) await page.keyboard.press('ArrowLeft')
}

test('timeline steps through passes from the keyboard and announces quality', async ({ page }) => {
  await openFixtureSite(page)
  const s = slider(page)
  await expect(s).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
  await s.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
})

test('pin and unpin a date; before/after cannot be unpinned', async ({ page }) => {
  await openFixtureSite(page)
  const s = slider(page)
  await expect(s).toHaveAttribute('aria-valuetext', /Clear/, { timeout: 30_000 })
  // The "after" date is pinned for good: its button reads Unpin and is disabled.
  await expect(page.getByRole('button', { name: flow.workbench.unpin })).toBeDisabled()
  await s.focus()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: flow.workbench.pin }).click()
  // The label says what pressing does now; it is not also a toggle button, which a screen reader would say twice.
  const unpin = page.getByRole('button', { name: flow.workbench.unpin })
  await expect(unpin).toBeEnabled()
  await expect(unpin).not.toHaveAttribute('aria-pressed')
  await expect(page.getByRole('button', { name: flow.workbench.pin })).toHaveCount(0)
})

test('road grid shows two sections and supports arrow keys', async ({ page }) => {
  await openFixtureRoad(page)
  const g = grid(page)
  await expect(g.getByRole('rowheader')).toHaveText(['01 · 0.0–2.0 km', '02 · 2.0–2.9 km'], {
    timeout: 30_000,
  })
  const first = g.getByRole('button').first()
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^2\.0–2\.9 km, 10 Jan 2025: Clear$/)
})

test('Details lists the four class shares of the date on show', async ({ page }) => {
  await openFixtureSite(page)
  await stepBack(page, 0)
  const a = aside(page)
  const shares = a.locator('dd')
  await a.locator('summary', { hasText: copy.common.details }).click()
  for (const label of Object.values(flow.workbench.shares))
    await expect(a.getByText(label, { exact: true })).toBeVisible()
  await expect(shares).toHaveText(['100%', '0%', '0%', '0%']) // 20 Dec: all visible ground
  await slider(page).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  // The block belongs to a different row now: Details is still open, as it was left.
  await expect(a.locator('summary', { hasText: copy.common.details }).locator('..')).toHaveJSProperty(
    'open',
    true,
  )
  await expect(a.getByText(flow.workbench.shares.valid, { exact: true })).toBeVisible()
  // 5 Mar: the right of the outline is under cloud, so ground and cloud both have a share
  const [valid, , obstructed] = (await shares.allTextContents()).map((t) => Number.parseInt(t))
  expect(valid).toBeGreaterThan(0)
  expect(obstructed).toBeGreaterThan(0)
  expect(valid! + obstructed!).toBeGreaterThanOrEqual(99)
})

test('a failed check is not shown as Loading, and Try again checks the date', async ({ page }) => {
  const scl = '**/cog/2025-06-15/SCL.tif'
  await page.route(scl, (r) => r.fulfill({ status: 500, headers: CORS, body: 'unavailable' }))
  await openFixtureSite(page)
  await stepBack(page, 1)
  const s = slider(page)
  const a = aside(page)
  await expect(s).toHaveAttribute('aria-valuetext', `15 Jun 2025, ${flow.workbench.checkFailed}`)
  await expect(a.getByText(flow.workbench.checkFailed, { exact: true })).toBeVisible()
  await expect(a.getByText(copy.common.loading, { exact: true })).toHaveCount(0)
  await page.unroute(scl)
  await a.getByRole('button', { name: copy.common.retry }).click()
  await expect(s).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
  await expect(a.getByText(flow.workbench.checkFailed)).toHaveCount(0)
})

test('the 25th pin is refused next to the pin buttons, and nothing is added', async ({ page }) => {
  const pinned = [
    '2025-01-10',
    '2025-12-20',
    ...Array.from({ length: 22 }, (_, i) => `2025-02-${String(i + 1).padStart(2, '0')}`),
  ].sort() // the limit: 24
  const id = await openThenEdit(page, { before: '2025-01-10', after: '2025-12-20', pinned })
  await page.goto(`/i/${id}?tier=0`)
  await waitForSettled(page)
  await stepBack(page, 2)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  const pin = aside(page).getByRole('button', { name: flow.workbench.pin })
  await pin.click()
  const message = page.getByText(flow.workbench.errors.TOO_MANY_PINS!) // one message on the page, not two
  await expect(message).toBeVisible()
  await expect(aside(page).getByRole('alert')).toHaveText(flow.workbench.errors.TOO_MANY_PINS!)
  await expect(pin).toBeVisible() // still "Pin to report": nothing was added
  await expect(aside(page).getByRole('button', { name: flow.workbench.unpin })).toHaveCount(0)
  expect((await readStored(page, id)).pinned).toEqual(pinned)
})

test('changing the after date keeps the old one pinned', async ({ page }) => {
  await openFixtureSite(page)
  await stepBack(page, 2) // 5 Mar
  const a = aside(page)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  await a.getByRole('button', { name: flow.workbench.useAfter }).click()
  await expect(page.getByText(/^Site · 1\.00 km² · 10 Jan 2025 ↔ 5 Mar 2025$/)).toBeVisible()
  await expect(a.getByRole('button', { name: flow.workbench.unpin })).toBeDisabled() // 5 Mar is the after date now
  await slider(page).focus()
  await page.keyboard.press('End') // 20 Dec: no longer the after date, still pinned
  const unpin = a.getByRole('button', { name: flow.workbench.unpin })
  await expect(unpin).toBeEnabled() // still pinned: the button says Unpin, and does it
})

test('a preview that cannot load says so, instead of a skeleton that never ends', async ({ page }) => {
  await page.route('**/cog/2025-03-05/TCI.tif', (r) => r.abort())
  await openFixtureSite(page)
  await stepBack(page, 2)
  const a = aside(page)
  await expect(a.getByText(flow.workbench.thumbFailed)).toBeVisible({ timeout: 30_000 })
  // Its row has the stripes and not a picture, and nothing in the list is left pulsing.
  await expect(a.getByRole('button', { name: /^5 Mar 2025/ }).locator('canvas')).toHaveCount(0)
  await expect(a.locator('.animate-pulse')).toHaveCount(0)
})

test('a date past the first twelve gets its preview when you rest on it; scrubbing past dates loads none', async ({
  page,
}) => {
  const { log, dates } = await manyPasses(page, 20)
  await openFixtureSite(page)
  const s = slider(page)
  await expect(s).toHaveAttribute('max', String(dates.length - 1), { timeout: 30_000 })
  // The sweep and the first previews are done when no picture request has arrived for a second.
  await expect
    .poll(
      async () => {
        const n = log.length
        await page.waitForTimeout(1000)
        return log.length === n
      },
      { timeout: 45_000 },
    )
    .toBe(true)
  const previews = () => new Set(log.filter((e) => e.file === 'TCI').map((e) => e.date))
  const had = previews()
  expect(had.size).toBeGreaterThanOrEqual(12)
  expect(had.size).toBeLessThan(dates.length - 1)
  // Four neighbouring clear dates with no preview yet.
  const lacking = (d: string | undefined) => d !== undefined && d !== '2025-06-15' && !had.has(d)
  const start = dates.findIndex((_, i) => [0, 1, 2, 3].every((k) => lacking(dates[i + k])))
  expect(start).toBeGreaterThan(-1)
  const run = [0, 1, 2, 3].map((k) => start + k)
  const resting = dates[run[3]!]!
  // Step across all four within 160 ms: far less than the 250 ms a date must be rested on, far more than no wait at all.
  await s.evaluate(async (el: HTMLInputElement, values: number[]) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    for (const v of values) {
      set.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 40))
    }
  }, run)
  await expect(s).toHaveAttribute('aria-valuetext', `${fmtDate(resting)}, Clear`)
  // The date on show has a row of its own, and its preview is the picture in it.
  const photo = aside(page)
    .getByRole('button', { name: new RegExp(`^${fmtDate(resting)}`) })
    .locator('canvas')
  await expect(photo).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  expect([...previews()].filter((d) => !had.has(d))).toEqual([resting])
})

test('resting on a date still waiting in the sweep checks it next', async ({ page }) => {
  const { log, held, open, dates } = await manyPasses(page, 20, true)
  await openFixtureSite(page)
  const s = slider(page)
  await expect(s).toHaveAttribute('max', String(dates.length - 1), { timeout: 30_000 })
  // The four real dates are checked; the six copies in flight are held, so the other fourteen wait in the queue.
  await expect.poll(() => held.length, { timeout: 30_000 }).toBe(6)
  const checks = () => log.filter((e) => e.file === 'SCL').map((e) => e.date)
  const late = '2025-01-22' // the very last date of the sweep
  await s.fill(String(dates.indexOf(late)))
  await expect(s).toHaveAttribute('aria-valuetext', `${fmtDate(late)}, ${copy.common.loading}`)
  await page.waitForTimeout(600) // longer than the 250 ms rest
  expect(checks()).not.toContain(late)
  held[0]!() // one check finishes: the freed place goes to the date being looked at, not to 15 Jan, next in the sweep
  await expect.poll(checks).toContain(late)
  expect(checks()).not.toContain('2025-01-15')
  open()
  await expect(s).toHaveAttribute('aria-valuetext', `${fmtDate(late)}, Clear`, { timeout: 30_000 })
})

test('the road grid has a column per pinned date, and focus follows its date', async ({ page }) => {
  await openFixtureRoad(page)
  const g = grid(page)
  const headers = g.getByRole('columnheader')
  await expect(headers).toHaveText([flow.workbench.sectionCol, '10 Jan 2025', '20 Dec 2025'], {
    timeout: 30_000,
  })
  const cell = (day: string) => g.getByRole('button', { name: new RegExp(`^0\\.0–2\\.0 km, ${day}:`) })
  const dec = cell('20 Dec 2025')
  await dec.focus() // the roving stop moves to the focused cell, wherever the focus came from
  await expect(dec).toHaveAttribute('tabindex', '0')
  await expect(cell('10 Jan 2025')).toHaveAttribute('tabindex', '-1')
  await stepBack(page, 2) // 5 Mar
  await aside(page).getByRole('button', { name: flow.workbench.pin }).click()
  await expect(headers).toHaveText([flow.workbench.sectionCol, '10 Jan 2025', '5 Mar 2025', '20 Dec 2025'])
  await expect(g.getByRole('button')).toHaveCount(6)
  // The new column sits left of 20 Dec: the roving stop is still on the date, not on the column number.
  await expect(dec).toHaveAttribute('tabindex', '0')
  await expect(cell('5 Mar 2025')).toHaveAttribute('tabindex', '-1')
  await dec.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^0\.0–2\.0 km, 5 Mar 2025: /)
  await page.keyboard.press('Home')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^0\.0–2\.0 km, 10 Jan 2025: /)
  await page.keyboard.press('End')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^0\.0–2\.0 km, 20 Dec 2025: /)
  // A click selects that date on the timeline, in every row of its column.
  await cell('10 Jan 2025').click()
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '10 Jan 2025, Clear')
  await expect(g.locator('[aria-current="date"]')).toHaveCount(2)
  // Unpinning takes the column away again.
  await slider(page).focus()
  await page.keyboard.press('ArrowRight') // 5 Mar
  await aside(page).getByRole('button', { name: flow.workbench.unpin }).click()
  await expect(headers).toHaveText([flow.workbench.sectionCol, '10 Jan 2025', '20 Dec 2025'])
})

test('the date on show lists the sections of a road, each with its word', async ({ page }) => {
  await openFixtureRoad(page)
  await stepBack(page, 0)
  const rows = aside(page).getByRole('list', { name: flow.workbench.sectionsLabel }).getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toHaveText(`0.0–2.0 km${copy.quality.CLEAR.word}`)
  await expect(rows.nth(1)).toHaveText(`2.0–2.9 km${copy.quality.CLEAR.word}`)
})

test('a pinned date whose check failed keeps its column, with the failure word and no glyph', async ({
  page,
}) => {
  await page.route('**/cog/2025-06-15/SCL.tif', (r) => r.fulfill({ status: 500, headers: CORS, body: 'no' }))
  await openFixtureRoad(page)
  await stepBack(page, 1) // 15 Jun
  await expect(slider(page)).toHaveAttribute('aria-valuetext', `15 Jun 2025, ${flow.workbench.checkFailed}`)
  await aside(page).getByRole('button', { name: flow.workbench.pin }).click()
  const failed = grid(page).getByRole('button', {
    name: new RegExp(`15 Jun 2025: ${escapeRe(flow.workbench.checkFailedShort)}$`),
  })
  await expect(failed).toHaveCount(2)
  await expect(failed.locator('svg')).toHaveCount(0)
  // The sections of that date say so too, in the short word; the sentence is in the date's row, once.
  const sections = aside(page).getByRole('list', { name: flow.workbench.sectionsLabel }).getByRole('listitem')
  await expect(sections).toHaveCount(2)
  await expect(sections).toHaveText([
    `0.0–2.0 km${flow.workbench.checkFailedShort}`,
    `2.0–2.9 km${flow.workbench.checkFailedShort}`,
  ])
  await expect(page.getByText(flow.workbench.checkFailed, { exact: true })).toHaveCount(1)
})

test('on a phone, many pinned dates scroll inside the grid panel, never the page, with the first column kept', async ({
  page,
}) => {
  const { dates } = await manyPasses(page, 20)
  const pinned = dates.slice(0, 9).concat('2025-12-20') // 10 dates
  const id = await openThenEdit(page, { before: '2025-01-10', after: '2025-12-20', pinned }, openFixtureRoad)
  await page.setViewportSize({ width: 390, height: 844 }) // after the set-up: only the workbench is looked at on a phone
  await page.goto(`/i/${id}?tier=0`)
  const g = grid(page)
  await expect(g.getByRole('columnheader')).toHaveCount(11, { timeout: 30_000 })
  const pageFits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  const panel = g.locator('xpath=..') // the scrolling box around the table
  expect(await pageFits()).toBe(true)
  expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await panel.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  expect(await pageFits()).toBe(true)
  const edge = (await panel.boundingBox())!.x
  expect(Math.abs((await g.getByRole('rowheader').first().boundingBox())!.x - edge)).toBeLessThan(2)
})

// ---- the barcode, the list of pinned dates and the road grid, as the approved mockups draw them ----

const tick = (page: Page, date: string) => page.locator(`[data-date="${date}"]`)
/** The middle of a mark, once it is on screen (on a phone the timeline is far down the page). */
const centre = async (l: Locator) => {
  await l.scrollIntoViewIfNeeded()
  const b = (await l.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** The row of the list for a date (a button: the whole row selects the date). */
const row = (page: Page, date: string) =>
  aside(page).getByRole('button', { name: new RegExp(`^${fmtDate(date)}`) })

test('a click on a tick selects that date, and the date nearest to the click between two', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForSettled(page)
  const s = slider(page)
  const jan = await centre(tick(page, '2025-01-10'))
  const mar = await centre(tick(page, '2025-03-05'))
  const jun = await centre(tick(page, '2025-06-15'))
  await page.mouse.click(mar.x, mar.y)
  await expect(s).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  // A quarter of the way from March to June is nearer March, three quarters of the way nearer June.
  await page.mouse.click(mar.x + (jun.x - mar.x) * 0.75, mar.y)
  await expect(s).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
  await page.mouse.click(mar.x + (jun.x - mar.x) * 0.25, mar.y)
  await expect(s).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  // Off the left end: the first pass, not nothing.
  await page.mouse.click(jan.x - 6, jan.y)
  await expect(s).toHaveAttribute('aria-valuetext', '10 Jan 2025, Clear')
  // The date on show has its tick underlined and its row outlined.
  await expect(row(page, '2025-01-10').locator('xpath=..')).toHaveCSS('outline-style', 'solid')
})

test('a drag across the barcode passes each date in turn and ends on the one under the pointer', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForSettled(page)
  const s = slider(page)
  await s.evaluate((el: HTMLInputElement) => {
    const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = [])
    new MutationObserver(() => seen.push(el.getAttribute('aria-valuetext')!)).observe(el, {
      attributes: true,
      attributeFilter: ['aria-valuetext'],
    })
  })
  const from = await centre(tick(page, '2025-01-10'))
  const to = await centre(tick(page, '2025-12-20'))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 40 })
  await page.mouse.up()
  await expect(s).toHaveAttribute('aria-valuetext', '20 Dec 2025, Clear')
  // Each pass once and in order, though the pointer moved forty times.
  expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual([
    '10 Jan 2025, Clear',
    '5 Mar 2025, Partly clear',
    '15 Jun 2025, Obscured',
    '20 Dec 2025, Clear',
  ])
  // Moving with no button down selects nothing.
  await page.mouse.move(from.x, from.y, { steps: 10 })
  await expect(s).toHaveAttribute('aria-valuetext', '20 Dec 2025, Clear')
})

test('the slider is out of sight but is still the keyboard stop, and the barcode draws the focus ring', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForSettled(page)
  const s = slider(page)
  const box = (await s.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(2)
  expect(box.height).toBeLessThanOrEqual(2)
  const barcode = s.locator('xpath=following-sibling::div[1]')
  await expect(barcode).toHaveCSS('outline-style', 'none')
  // Reached with Tab, as a keyboard user does (a focus() from a script is not "focus-visible" in every engine): from the
  // outline switch, past the Sharper switch, the map tool and the swipe slider where there are ones (a phone starts in side by
  // side; a page with a map has all four stops, so up to four presses).
  await page.getByRole('checkbox', { name: flow.workbench.outlineToggle }).focus()
  for (let i = 0; i < 4 && !(await s.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press(tabKey(page))
  await expect(s).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
  await expect(barcode).toHaveCSS('outline-style', 'solid')
  await expect(barcode).toHaveCSS('outline-width', '2px')
  // The ticks are out of the reading order and the tab order: Tab goes from the slider to the first row.
  expect(await tick(page, '2025-03-05').evaluate((el) => !!el.closest('[aria-hidden="true"]'))).toBe(true)
  await page.keyboard.press(tabKey(page))
  await expect(page.locator(':focus')).toHaveText(/^10 Jan 2025/)
  await expect(barcode).toHaveCSS('outline-style', 'none')
  // Pressing on the barcode puts the keyboard on the slider, so the arrow keys go on from there.
  const mar = await centre(tick(page, '2025-03-05'))
  await page.mouse.click(mar.x, mar.y)
  await page.keyboard.press('ArrowRight')
  await expect(s).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
})

test('the list holds the pinned dates and the date on show, once each, and its row has the actions', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForSettled(page)
  const a = aside(page)
  const rows = a.getByRole('button', { name: /^\d+ \w+ 2025 / })
  await expect(rows).toHaveCount(2) // 10 Jan and 20 Dec: the pair, and 20 Dec is on show
  await expect(a.getByText('4 passes · 2 pinned')).toBeVisible()
  await expect(row(page, '2025-12-20')).toHaveAttribute('aria-current', 'date')
  await expect(row(page, '2025-01-10')).not.toHaveAttribute('aria-current')
  // Each row says the date, how clearly it sees the outline, the satellite and its role.
  await expect(row(page, '2025-01-10')).toContainText(/Clear/)
  await expect(row(page, '2025-01-10')).toContainText('Sentinel-2B · 10 m · 100% clear view')
  await expect(row(page, '2025-01-10')).toContainText(flow.workbench.before)
  await expect(row(page, '2025-12-20')).toContainText(flow.workbench.after)
  // Only the date on show holds the sentence, Details and the buttons.
  await expect(a.getByRole('button', { name: flow.workbench.useBefore })).toHaveCount(1)
  await expect(a.locator('summary', { hasText: copy.common.details })).toHaveCount(1)
  // A date that is only on show gets a row between them, with no role; the selected row is outlined, the others are not.
  await slider(page).focus()
  await page.keyboard.press('ArrowLeft') // 15 Jun
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toHaveText(/^15 Jun 2025/)
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'date')
  await expect(rows.nth(1).locator('xpath=..')).toHaveCSS('outline-style', 'solid')
  await expect(rows.nth(0).locator('xpath=..')).toHaveCSS('outline-style', 'none')
  await expect(
    rows.nth(1).locator('xpath=..').getByRole('button', { name: flow.workbench.pin }),
  ).toBeVisible()
  // Pinning it keeps its row and tags it; the count follows.
  await page.keyboard.press('ArrowLeft') // 5 Mar
  await a.getByRole('button', { name: flow.workbench.pin }).click()
  await expect(a.getByText('4 passes · 3 pinned')).toBeVisible()
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText(flow.workbench.pinned)
  // Another row selects its date, and the actions move there.
  await rows.nth(0).click()
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '10 Jan 2025, Clear')
  await expect(a.getByRole('button', { name: flow.workbench.useBefore })).toHaveCount(1)
  await expect(
    rows.nth(0).locator('xpath=..').getByRole('button', { name: flow.workbench.useAfter }),
  ).toBeVisible()
  await expect(rows).toHaveCount(3) // 10 Jan, 5 Mar and 20 Dec: all pinned, and 15 Jun is gone with being on show
})

test('a row of a date that cannot be seen keeps the box of its picture, with stripes and the glyph', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForSettled(page)
  await slider(page).focus()
  await page.keyboard.press('ArrowLeft') // 15 Jun: obscured
  const picture = (date: string) => row(page, date).locator('span[aria-hidden="true"]').first()
  const dec = (await picture('2025-12-20').boundingBox())!
  const jun = (await picture('2025-06-15').boundingBox())!
  expect(jun.width).toBe(52)
  expect(jun.height).toBe(52)
  expect([dec.width, dec.height]).toEqual([52, 52])
  await expect(picture('2025-06-15')).toHaveCSS('background-image', /repeating-linear-gradient/)
  await expect(picture('2025-06-15').locator('svg')).toHaveCount(1)
  await expect(row(page, '2025-12-20').locator('canvas')).toBeVisible() // a clear one shows its preview
})

test('every pinned date has its preview, also past the twelve that load by themselves', async ({ page }) => {
  const { dates } = await manyPasses(page, 20)
  // 16 pins, all clear: the runner loads twelve previews unasked, the rest are asked for by the page.
  const pinned = [dates[0]!, ...dates.slice(1, 15), '2025-12-20']
  const id = await openThenEdit(page, { before: '2025-01-10', after: '2025-12-20', pinned })
  await page.goto(`/i/${id}?tier=0`)
  const pictures = aside(page)
    .getByRole('button', { name: /^\d+ \w+ 2025 / })
    .locator('canvas')
  await expect(pictures).toHaveCount(pinned.length, { timeout: 45_000 })
  await expect(aside(page).locator('.animate-pulse')).toHaveCount(0)
})

test('a range of several years has a row for each, and each tick is in its own year', async ({ page }) => {
  const id = await openThenEdit(page, { dateFrom: '2022-06-01', dateTo: '2025-12-31' })
  await page.goto(`/i/${id}?tier=0`)
  await waitForSettled(page)
  const labels = page
    .getByRole('region', { name: flow.workbench.photoTimeline })
    .getByText(/^20(22|23|24|25)$/)
  await expect(labels).toHaveText(['2022', '2023', '2024', '2025'])
  const y = (l: Locator) => l.boundingBox().then((b) => b!.y + b!.height / 2)
  // The passes are all in 2025: its row is the last, and each tick sits in it.
  const row2025 = await y(labels.nth(3))
  for (const d of FIXTURE_DATES) expect(Math.abs((await y(tick(page, d.date))) - row2025)).toBeLessThan(10)
  // 10 Jan is early in its row and 20 Dec at the far end.
  const first = await centre(tick(page, '2025-01-10'))
  const last = await centre(tick(page, '2025-12-20'))
  expect(last.x - first.x).toBeGreaterThan(250)
})

test('a road has one strip over its whole range, with the years under it', async ({ page }) => {
  await openFixtureRoad(page)
  await waitForSettled(page)
  const a = page.getByRole('region', { name: flow.workbench.photoTimeline })
  const strip = await centre(tick(page, '2025-01-10'))
  for (const d of FIXTURE_DATES)
    expect(Math.abs((await centre(tick(page, d.date))).y - strip.y)).toBeLessThan(10)
  // The one year of the range is labelled once, under the strip.
  const year = a.getByText('2025', { exact: true })
  await expect(year).toHaveCount(1)
  expect((await year.boundingBox())!.y).toBeGreaterThan(strip.y)
})

test('a tap and a horizontal drag on the barcode select dates on a touch screen', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'touch is only emulated by the mobile project')
  await openFixtureSite(page)
  await waitForSettled(page)
  const s = slider(page)
  const mar = await centre(tick(page, '2025-03-05'))
  await page.touchscreen.tap(mar.x, mar.y)
  await expect(s).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  // A drag along the strip: touch-action leaves horizontal moves to the page's own code.
  const jan = await centre(tick(page, '2025-01-10'))
  const dec = await centre(tick(page, '2025-12-20'))
  const cdp = await page.context().newCDPSession(page)
  const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y: jan.y }],
    })
  await at('touchStart', jan.x)
  for (let i = 1; i <= 20; i++) await at('touchMove', jan.x + ((dec.x - jan.x) * i) / 20)
  await at('touchEnd', dec.x)
  await expect(s).toHaveAttribute('aria-valuetext', '20 Dec 2025, Clear')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a vertical swipe that starts on the barcode scrolls the page and selects nothing', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'touch is only emulated by the mobile project')
  await openFixtureSite(page)
  await waitForSettled(page)
  const s = slider(page)
  const shown = await s.getAttribute('aria-valuetext')
  const y0 = await page.evaluate(() => window.scrollY)
  const t = await centre(tick(page, '2025-03-05'))
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: t.x, y }],
    })
  await send('touchStart', t.y)
  for (let i = 1; i <= 10; i++) await send('touchMove', t.y - i * 8)
  await send('touchEnd', t.y - 80)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y0)
  await expect(s).toHaveAttribute('aria-valuetext', shown!)
})

test('the road grid looks as the mockup does: two-line dates, numbered sections, the picked cell and its detail', async ({
  page,
}) => {
  await openFixtureRoad(page)
  await waitForSettled(page)
  const g = grid(page)
  const heads = g.getByRole('columnheader')
  await expect(heads).toHaveText([flow.workbench.sectionCol, '10 Jan 2025', '20 Dec 2025'])
  // "10 Jan" over "2025", written along the line and not sideways.
  const jan = heads.nth(1)
  expect(await jan.evaluate((el) => getComputedStyle(el).writingMode)).toBe('horizontal-tb')
  const lines = await jan.evaluate((el) => {
    const year = el.querySelector('span')!.getBoundingClientRect()
    const r = document.createRange()
    r.setStart(el.firstChild!, 0)
    r.setEnd(el.firstChild!, el.firstChild!.textContent!.length)
    return {
      dayAbove: r.getBoundingClientRect().bottom <= year.top + 1,
      h: el.getBoundingClientRect().height,
    }
  })
  expect(lines.dayAbove).toBe(true)
  expect(lines.h).toBeLessThan(60)
  await expect(g.getByRole('rowheader')).toHaveText(['01 · 0.0–2.0 km', '02 · 2.0–2.9 km'])
  // Every cell has a border of its own and the glyph and word sit on one line, mono and in capitals.
  const cell = g.getByRole('button', { name: /^0\.0–2\.0 km, 10 Jan 2025:/ })
  await expect(cell).toHaveCSS('text-transform', 'uppercase')
  await expect(cell).toHaveCSS('font-family', /Geist Mono/)
  const wide = (await cell.boundingBox())!
  expect(wide.width).toBeGreaterThanOrEqual(80) // 5 rem
  const [glyph, word] = [await cell.locator('svg').boundingBox(), await cell.locator('span').boundingBox()]
  expect(Math.abs(glyph!.y + glyph!.height / 2 - (word!.y + word!.height / 2))).toBeLessThan(4)
  expect(await cell.evaluate((el) => getComputedStyle(el.parentElement!).borderRightWidth)).toBe('1px')
  // The date on show, in the row that has the focus, is outlined; the detail below is about it.
  const dec = g.getByRole('button', { name: /^0\.0–2\.0 km, 20 Dec 2025:/ })
  const outlined = (l: Locator) => l.evaluate((el) => getComputedStyle(el).boxShadow !== 'none')
  expect(await outlined(dec)).toBe(true)
  expect(await outlined(cell)).toBe(false)
  const detail = page.getByRole('heading', { level: 3 })
  await expect(detail).toHaveText('Section 01 · 0.0–2.0 km')
  await expect(page.getByText('20 Dec 2025 · Clear view', { exact: true })).toBeVisible()
  await expect(page.getByText(flow.workbench.gapNote, { exact: true })).toBeVisible()
  await expect(page.getByText(flow.workbench.gridHelp, { exact: true })).toBeVisible()
  // Another section's cell on another date: the outline, the title and the sentence follow.
  await g.getByRole('button', { name: /^2\.0–2\.9 km, 10 Jan 2025:/ }).click()
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '10 Jan 2025, Clear')
  await expect(detail).toHaveText('Section 02 · 2.0–2.9 km')
  await expect(page.getByText('10 Jan 2025 · Clear view', { exact: true })).toBeVisible()
  expect(await outlined(g.getByRole('button', { name: /^2\.0–2\.9 km, 10 Jan 2025:/ }))).toBe(true)
  expect(await outlined(dec)).toBe(false)
})

test('the barcode, the list and the grid pass axe in both themes, with pins and a note on the page', async ({
  page,
}) => {
  const scan = async (where: string) => {
    for (let i = 0; i < 2; i++) {
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(r.violations, `${where}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  }
  for (const [name, open] of [
    ['a site', openFixtureSite],
    ['a road', openFixtureRoad],
  ] as const) {
    await open(page)
    await waitForSettled(page)
    await stepBack(page, 2) // 5 Mar: on show, then pinned
    await aside(page).getByRole('button', { name: flow.workbench.pin }).click()
    await slider(page).focus()
    await page.keyboard.press('ArrowRight') // 15 Jun: on show and not pinned, so a row of its own
    const notes = page.getByRole('region', { name: flow.notes.title })
    await notes.getByLabel(flow.notes.what).fill('Roof visible from March')
    await notes.getByRole('button', { name: flow.notes.add }).click()
    await expect(notes.getByText('Roof visible from March')).toBeVisible()
    await aside(page).locator('summary', { hasText: copy.common.details }).click()
    await scan(name)
  }
})
