import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  finishDatesAndOpen,
  outlineRoadByCoords,
  outlineSiteByCoords,
  startAt,
  waitForPhotos,
  waitForSettled,
} from './helpers.ts'

// Tier 0 is a device with no WebGL, or one the user chose to run lightly: no map canvas at all. The whole journey must work
// without one, on every step, and say nothing in the console.
const noMap = (page: Page) => expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0)

function watch(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  // The report preview is a sandbox without scripts on purpose: the browser says so once for its JSON data block. Not an error.
  const sandboxed = /^Blocked script execution in 'about:srcdoc'/
  page.on('console', (m) => {
    if (m.type() === 'error' && !sandboxed.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

const timeline = (page: Page) => page.getByRole('region', { name: flow.workbench.photoTimeline })

test('the whole site journey works without WebGL (tier 0): outline, dates, review, photos, a pin, a note, the report', async ({
  page,
}) => {
  const errors = watch(page)
  await startAt(page)
  await noMap(page)
  await outlineSiteByCoords(page, 1000)
  await noMap(page)
  await finishDatesAndOpen(page, '2025-01-01', '2025-12-31')
  await waitForPhotos(page)
  await waitForSettled(page)
  await noMap(page)

  // Pin another date: step the slider back one pass and press Pin.
  const slider = page.getByRole('slider', { name: flow.workbench.timelineLabel })
  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  await timeline(page).getByRole('button', { name: flow.workbench.pin }).click()
  await expect(timeline(page).getByText(flow.workbench.pinnedCount(3), { exact: false })).toBeVisible()

  // A note.
  const notes = page.getByRole('region', { name: flow.notes.title })
  await notes.getByLabel(flow.notes.what).fill('A new roof inside the outline')
  await notes.getByRole('button', { name: flow.notes.add }).click()
  await expect(notes.getByText('A new roof inside the outline')).toBeVisible()
  await noMap(page)

  // The report, with the note in it.
  await page.getByRole('link', { name: flow.workbench.report }).click()
  await expect(page).toHaveTitle(`${copy.titles.report} · ${copy.app.name}`)
  const frame = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(frame.getByText('A new roof inside the outline').first()).toBeVisible({ timeout: 30_000 })
  await noMap(page)
  expect(errors).toEqual([])
})

test('the whole road journey works without WebGL (tier 0): outline, dates, review, the section grid, photos, the report', async ({
  page,
}) => {
  const errors = watch(page)
  await startAt(page)
  await outlineRoadByCoords(page)
  await noMap(page)
  await finishDatesAndOpen(page, '2025-01-01', '2025-12-31')
  await noMap(page)
  await expect(page.getByRole('grid', { name: flow.workbench.grid })).toBeVisible({ timeout: 30_000 })
  await waitForPhotos(page)
  await noMap(page)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const frame = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(frame.getByRole('heading', { name: flow.report.sections.grid })).toBeVisible({
    timeout: 30_000,
  })
  await noMap(page)
  expect(errors).toEqual([])
})
