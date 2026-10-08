import { expect, test, type Locator, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  openFixtureRoad,
  openFixtureSite,
  openThenEdit,
  readStored,
  waitForPhotos,
  waitForSettled,
} from './helpers.ts'

const notesOf = (page: Page) => page.getByRole('region', { name: flow.notes.title })
const claimOf = (page: Page) => page.getByRole('region', { name: flow.claim.title })
const slider = (page: Page) => page.getByRole('slider', { name: flow.workbench.timelineLabel })

/**
 * A refusal is said next to the control that was refused and is on screen where the user is looking: the page header sits
 * far above a panel that is scrolled into view, so a message there is one nobody sees (it is announced, but not shown).
 */
async function expectRefusal(where: Locator, text: string) {
  const alert = where.getByRole('alert')
  await expect(alert).toHaveText(text)
  await expect(alert).toBeInViewport()
}

/**
 * Polls what the browser's store holds for the investigation on screen. A reload straight after a click can beat the write
 * (the save is asynchronous), so a test that reloads waits for the store to hold what it saved first.
 */
const untilStored = <T>(page: Page, pick: (stored: Record<string, unknown>) => T) =>
  expect.poll(async () => pick(await readStored(page, page.url().split('/i/')[1]!.split(/[?#/]/)[0]!)))

/**
 * Opens the fixture site or road and waits until the page has settled: both photos are on screen, so the timeline (and, for a
 * road, its grid) has arrived above the notes and moved them down, and the workbench has made its own first pick of before
 * and after. A click must not land while the panel is still moving, and a save clears the message of an earlier refusal, so a
 * test that waits for a refusal's message must not race that automatic save.
 */
async function openSettled(page: Page, open = openFixtureSite) {
  await open(page)
  await waitForPhotos(page)
}

/** `n` notes as the store holds them, so a test can open an investigation that already has them. */
const seeded = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const at = new Date(Date.UTC(2025, 0, 1, 0, 0, i)).toISOString()
    return {
      id: `seed-${i}`,
      kind: 'unsure',
      body: `Seeded note ${i}`,
      date: null,
      sectionIdx: null,
      createdAt: at,
      updatedAt: at,
    }
  })

test('add, edit and delete-with-undo a note; text stays text', async ({ page }) => {
  await openSettled(page)
  const panel = page.getByRole('region', { name: flow.notes.title })
  await panel.getByRole('radio', { name: flow.notes.kinds.change, exact: true }).check()
  await panel.getByLabel(flow.notes.what).fill('<img src=x onerror=alert(1)> New roof visible')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expect(panel.getByText('<img src=x onerror=alert(1)> New roof visible')).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  await panel.getByRole('button', { name: flow.notes.edit }).click()
  await panel.getByLabel(flow.notes.edit).fill('Roof visible from March')
  await panel.getByRole('button', { name: flow.notes.save }).click()
  await expect(panel.getByText('Roof visible from March')).toBeVisible()
  await panel.getByRole('button', { name: flow.notes.delete }).click()
  await expect(panel.getByText(flow.notes.deleted)).toBeVisible()
  await panel.getByRole('button', { name: flow.notes.undo }).click()
  await expect(panel.getByText('Roof visible from March')).toBeVisible()
  await untilStored(page, (s) => (s.notes as Array<{ body: string }>).map((n) => n.body)).toEqual([
    'Roof visible from March',
  ])
  await page.reload()
  await waitForSettled(page)
  await expect(
    page.getByRole('region', { name: flow.notes.title }).getByText('Roof visible from March'),
  ).toBeVisible()
})

test('empty notes are refused with a message', async ({ page }) => {
  await openSettled(page)
  const panel = page.getByRole('region', { name: flow.notes.title })
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expectRefusal(panel, flow.workbench.errors.NOTE_EMPTY!)
  await expect(page.getByRole('alert')).toHaveCount(1) // said once, not in the header as well
})

test('claim is saved, shown and removable', async ({ page }) => {
  await openSettled(page)
  const panel = page.getByRole('region', { name: flow.claim.title })
  await panel.getByLabel(flow.claim.text, { exact: true }).fill('Warehouse roof finished by December 2025')
  await panel.getByLabel(flow.claim.date).fill('2025-12-31')
  await panel.getByLabel(flow.claim.criterion).fill('A new bright roof inside the outline')
  await panel.getByRole('button', { name: flow.claim.save }).click()
  await untilStored(page, (s) => (s.claim as { text: string } | null)?.text).toBe(
    'Warehouse roof finished by December 2025',
  )
  await page.reload()
  await waitForSettled(page)
  const saved = claimOf(page)
  await expect(saved.getByLabel(flow.claim.text, { exact: true })).toHaveValue(
    'Warehouse roof finished by December 2025',
  )
  await expect(saved.getByLabel(flow.claim.date)).toHaveValue('2025-12-31')
  await expect(saved.getByLabel(flow.claim.criterion)).toHaveValue('A new bright roof inside the outline')
  // Remove empties the three fields, and stays removed after a reload.
  await saved.getByRole('button', { name: flow.claim.remove }).click()
  await expect(saved.getByLabel(flow.claim.text, { exact: true })).toHaveValue('')
  await expect(saved.getByLabel(flow.claim.date)).toHaveValue('')
  await expect(saved.getByLabel(flow.claim.criterion)).toHaveValue('')
  await expect(saved.getByRole('button', { name: flow.claim.remove })).toHaveCount(0)
  await untilStored(page, (s) => s.claim).toBeNull()
  await page.reload()
  await waitForSettled(page)
  const removed = claimOf(page)
  await expect(removed.getByLabel(flow.claim.text, { exact: true })).toHaveValue('')
  await expect(removed.getByLabel(flow.claim.date)).toHaveValue('')
  await expect(removed.getByLabel(flow.claim.criterion)).toHaveValue('')
  await expect(removed.getByRole('button', { name: flow.claim.remove })).toHaveCount(0)
})

test('a refused note keeps what was typed, and the next good one clears the message', async ({ page }) => {
  await openSettled(page)
  const panel = notesOf(page)
  const what = panel.getByLabel(flow.notes.what)
  await what.fill('   ')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expectRefusal(panel, flow.workbench.errors.NOTE_EMPTY!)
  await expect(what).toHaveValue('   ')
  await expect(panel.getByText(flow.notes.count(3), { exact: true })).toBeVisible()
  await expect(panel.getByText(flow.notes.none)).toBeVisible()
  await what.fill('Now with words')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expect(panel.getByText('Now with words')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(what).toHaveValue('')
})

test('a note cannot be typed past 2000 characters, and the counter says where it stands', async ({
  page,
}) => {
  await openSettled(page)
  const panel = notesOf(page)
  const what = panel.getByLabel(flow.notes.what)
  await expect(panel.getByText(flow.notes.count(0), { exact: true })).toBeVisible()
  await what.fill('x'.repeat(1990))
  await what.pressSequentially('y'.repeat(20)) // ten of these do not fit
  await expect(what).toHaveValue('x'.repeat(1990) + 'y'.repeat(10))
  await expect(panel.getByText(flow.notes.count(2000), { exact: true })).toBeVisible()
})

test('a note that is one very long word stays inside the page and its panel on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSettled(page)
  const panel = notesOf(page)
  await panel.getByLabel(flow.notes.what).fill('x'.repeat(2000))
  await panel.getByRole('button', { name: flow.notes.add }).click()
  const note = panel.getByRole('listitem')
  await expect(note).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const [inner, outer] = [(await note.boundingBox())!, (await panel.boundingBox())!]
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width)
})

test('the 201st note is refused with a message, and what was typed is kept until there is room', async ({
  page,
}) => {
  const id = await openThenEdit(page, {
    notes: seeded(200),
    before: '2025-01-10',
    after: '2025-12-20',
    pinned: ['2025-01-10', '2025-12-20'], // a pair is already chosen, so the workbench saves nothing on its own
  })
  await page.goto(`/i/${id}?tier=0`)
  await waitForSettled(page)
  const panel = notesOf(page)
  const items = panel.getByRole('listitem')
  await expect(items).toHaveCount(200)
  const what = panel.getByLabel(flow.notes.what)
  await what.fill('One note too many')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expectRefusal(panel, flow.workbench.errors.TOO_MANY_NOTES!)
  await expect(what).toHaveValue('One note too many')
  await expect(items).toHaveCount(200)
  expect((await readStored(page, id)).notes).toHaveLength(200)
  // Deleting one makes room: the same text is accepted and the message goes.
  await items.first().getByRole('button', { name: flow.notes.delete }).click()
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(what).toHaveValue('')
  await expect(items).toHaveCount(200)
  await expect(items.last()).toContainText('One note too many')
})

test('a note on a road section shows the section, and keeps it after a reload', async ({ page }) => {
  await openSettled(page, openFixtureRoad)
  await expect(page.getByRole('grid', { name: flow.workbench.grid })).toBeVisible()
  const panel = notesOf(page)
  await panel.getByLabel(flow.notes.what).fill('Surface patched here')
  await panel.getByLabel(flow.notes.forSection).selectOption({ label: '2.0–2.9 km' })
  await panel.getByRole('button', { name: flow.notes.add }).click()
  // The choice stays for the next note; the whole road is one choice away.
  await panel.getByLabel(flow.notes.what).fill('Looks the same all along')
  await panel.getByLabel(flow.notes.forSection).selectOption({ label: flow.notes.anySection })
  await panel.getByRole('button', { name: flow.notes.add }).click()
  const withSection = (p: Page) =>
    notesOf(p).getByRole('listitem').filter({ hasText: 'Surface patched here' })
  const wholeRoad = (p: Page) => notesOf(p).getByRole('listitem').filter({ hasText: 'Looks the same' })
  await expect(withSection(page)).toContainText('2.0–2.9 km')
  await expect(wholeRoad(page)).toBeVisible()
  await expect(wholeRoad(page)).not.toContainText('km')
  await untilStored(page, (s) => (s.notes as unknown[]).length).toBe(2)
  await page.reload()
  await waitForSettled(page)
  await expect(withSection(page)).toContainText('2.0–2.9 km')
  await expect(wholeRoad(page)).not.toContainText('km')
})

test('a note takes the date on show unless "no specific date" is chosen, and the choice survives scrubbing', async ({
  page,
}) => {
  await openSettled(page)
  const s = slider(page)
  await expect(s).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
  const panel = notesOf(page)
  const when = panel.getByLabel(flow.notes.forDate)
  const add = async (text: string) => {
    await panel.getByLabel(flow.notes.what).fill(text)
    await panel.getByRole('button', { name: flow.notes.add }).click()
    return panel.getByRole('listitem').filter({ hasText: text })
  }
  // Two options, however many passes there are: the date on show, and none.
  await expect(when.locator('option')).toHaveText(['20 Dec 2025', flow.notes.anyDate])
  await expect(when).toHaveValue('2025-12-20')
  await expect(await add('First')).toContainText('20 Dec 2025')
  // The control follows the timeline, and a note is never saved against a date other than the one next to it.
  await s.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', /^15 Jun 2025/)
  await expect(when.locator('option')).toHaveText(['15 Jun 2025', flow.notes.anyDate])
  await expect(when).toHaveValue('2025-06-15')
  await expect(await add('Second')).toContainText('15 Jun 2025')
  // "No specific date" stays chosen while scrubbing.
  await when.selectOption('')
  await s.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(s).toHaveAttribute('aria-valuetext', /^5 Mar 2025/)
  await expect(when).toHaveValue('')
  await expect(when.locator('option')).toHaveText(['5 Mar 2025', flow.notes.anyDate])
  await expect(await add('Third')).not.toContainText('2025')
  // Choosing the date on show again ties the control to the timeline again.
  await when.selectOption('2025-03-05')
  await s.focus()
  await page.keyboard.press('ArrowRight')
  await expect(when).toHaveValue('2025-06-15')
  const stored = (await readStored(page, page.url().split('/i/')[1]!)).notes as Array<{
    body: string
    date: string | null
  }>
  expect(stored.map((n) => [n.body, n.date])).toEqual([
    ['First', '2025-12-20'],
    ['Second', '2025-06-15'],
    ['Third', null],
  ])
})

test('an edit that is refused keeps the editor open and the note as it was', async ({ page }) => {
  await openSettled(page)
  const panel = notesOf(page)
  await panel.getByLabel(flow.notes.what).fill('Roof visible')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await panel.getByRole('button', { name: flow.notes.edit }).click()
  const editor = panel.getByLabel(flow.notes.edit)
  await editor.fill('  ')
  await panel.getByRole('button', { name: flow.notes.save }).click()
  // Said in the editor that was refused, not by the Add button at the other end of a long list.
  await expectRefusal(panel.getByRole('listitem'), flow.workbench.errors.NOTE_EMPTY!)
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(editor).toHaveValue('  ') // still open, with what was typed
  await panel.getByRole('button', { name: flow.notes.cancel }).click()
  await expect(editor).toHaveCount(0)
  await expect(panel.getByText('Roof visible')).toBeVisible()
})

test('a claim that is too long is refused with a message and not saved', async ({ page }) => {
  await openSettled(page)
  const panel = claimOf(page)
  const criterion = panel.getByLabel(flow.claim.criterion)
  // The field stops typing at 500 characters; only a script can get past it, and the claim is refused all the same.
  await criterion.evaluate((el) => el.removeAttribute('maxlength'))
  await panel.getByLabel(flow.claim.text, { exact: true }).fill('A claim')
  await criterion.fill('x'.repeat(501))
  await panel.getByRole('button', { name: flow.claim.save }).click()
  await expectRefusal(panel, flow.workbench.errors.CLAIM_TOO_LONG!)
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(panel.getByRole('button', { name: flow.claim.remove })).toHaveCount(0)
  expect((await readStored(page, page.url().split('/i/')[1]!)).claim).toBeNull()
})
