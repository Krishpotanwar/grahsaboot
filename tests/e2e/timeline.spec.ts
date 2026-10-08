import { expect, test, type Page } from '@playwright/test'
import { fmtDate } from '../../src/lib/format.ts'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { CORS, manyPasses, openFixtureRoad, openFixtureSite, openThenEdit, readStored } from './helpers.ts'

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
  await expect(page.getByRole('button', { name: flow.workbench.unpin })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('road grid shows two sections and supports arrow keys', async ({ page }) => {
  await openFixtureRoad(page)
  const g = grid(page)
  await expect(g.getByRole('rowheader')).toHaveText(['0.0–2.0 km', '2.0–2.9 km'], { timeout: 30_000 })
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
  await stepBack(page, 2)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
  const pin = aside(page).getByRole('button', { name: flow.workbench.pin })
  await pin.click()
  const message = page.getByText(flow.workbench.errors.TOO_MANY_PINS!) // one message on the page, not two
  await expect(message).toBeVisible()
  await expect(aside(page).getByRole('alert')).toHaveText(flow.workbench.errors.TOO_MANY_PINS!)
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
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
  await expect(unpin).toBeEnabled()
  await expect(unpin).toHaveAttribute('aria-pressed', 'true')
})

test('a preview that cannot load says so, instead of a skeleton that never ends', async ({ page }) => {
  await page.route('**/cog/2025-03-05/TCI.tif', (r) => r.abort())
  await openFixtureSite(page)
  await stepBack(page, 2)
  const a = aside(page)
  await expect(a.getByText(flow.workbench.thumbFailed)).toBeVisible({ timeout: 30_000 })
  await expect(a.getByRole('img')).toHaveCount(0)
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
  const photo = aside(page).getByRole('img', {
    name: new RegExp(`^Satellite pass photo, ${fmtDate(resting)}`),
  })
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
  const rows = aside(page).getByRole('listitem')
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
    name: new RegExp(`15 Jun 2025: ${escapeRe(flow.workbench.checkFailed)}$`),
  })
  await expect(failed).toHaveCount(2)
  await expect(failed.locator('svg')).toHaveCount(0)
  await expect(aside(page).getByRole('listitem')).toHaveCount(2) // the sections of that date say so too
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
