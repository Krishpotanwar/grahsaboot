import { expect, test, type Page } from '@playwright/test'
import { account } from '../../src/ui/copy-account.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { itemId } from '../fixtures/scene.ts'
import { openFixtureSite, openThenEdit, readStored, waitForPhotos, waitForSettled } from '../e2e/helpers.ts'
import { consentKey } from '../../src/accounts/consent.ts'
import {
  agreed,
  INSERTED_ID,
  mockSupabase,
  signedIn,
  type MockOptions,
  type SupabaseCall,
  USER_ID,
} from './helpers.ts'

// "Save and verify" in the accounts build (port 4174), against the fake Supabase of helpers.ts. The mock verifies every frame
// with the hash it was sent, on 5 Oct 2026. The fixture's pair is 10 Jan and 20 Dec 2025, both pinned: each date sends its SCL
// window, its preview and (before and after) its full photo, so a complete save verifies 6 frames in 2 calls.
const PAIR = { before: '2025-01-10', after: '2025-12-20', pinned: ['2025-01-10', '2025-12-20'] }
const CHECKED_ON = '5 Oct 2026'
const FRAMES = 6

const saveButton = (page: Page) => page.getByRole('button', { name: account.save })
const verifies = (calls: SupabaseCall[]) => calls.filter((c) => c.path === '/functions/v1/verify')
const inserts = (calls: SupabaseCall[]) =>
  calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/investigations')
const authorizes = (calls: SupabaseCall[]) => calls.filter((c) => c.path === '/auth/v1/authorize')
const savedLine = (n = FRAMES) => `Saved · ${n} frames verified · ${CHECKED_ON}`
const idOf = (page: Page) => page.url().split('/i/')[1]!.split('?')[0]!

/** A fixture site on screen with both photos in, and the button ready (everything a save can send is in the page). */
async function opened(page: Page) {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await expect(saveButton(page)).toBeEnabled({ timeout: 30_000 })
  return idOf(page)
}

const mismatchAll: NonNullable<MockOptions['verify']> = (b) => ({
  status: 200,
  body: {
    frames: b.frames.map((f) => ({
      asset: f.asset,
      level: f.level,
      status: 'mismatch',
      server_sha256: 'e'.repeat(64),
      frame_id: `m-${f.asset}${f.level}`,
      verified_at: '2026-10-05T10:00:00Z',
      quality: null,
    })),
  },
})

test('a first save asks for consent once, saves, verifies every pinned date and says how many; saving again asks and sends nothing', async ({
  page,
}) => {
  await signedIn(page)
  const calls = await mockSupabase(page)
  await openFixtureSite(page)
  await waitForPhotos(page)
  const save = saveButton(page)
  await expect(save).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByText(flow.workbench.notSaved, { exact: true }).first()).toBeVisible()

  await save.click()
  const dialog = page.getByRole('dialog', { name: account.consent.title })
  await expect(dialog).toBeVisible()
  const agree = dialog.getByRole('button', { name: account.consent.agree })
  await expect(agree).toBeDisabled() // the 18+ confirmation comes first
  await dialog.getByLabel(account.consent.age).check()
  await agree.click()

  await expect(page.getByText(savedLine())).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(account.savedLabel, { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(calls.filter((c) => c.path === '/rest/v1/rpc/record_consent')).toHaveLength(1)
  expect(inserts(calls)).toHaveLength(1)
  // One call per pinned date, each with the frames it holds: the scene check, the preview, the full photo.
  expect(verifies(calls).map((c) => (c.body as { item: { id: string } }).item.id)).toEqual([
    itemId('2025-01-10'),
    itemId('2025-12-20'),
  ])
  for (const c of verifies(calls))
    expect(
      (c.body as { frames: Array<{ asset: string; level: number }> }).frames.map(
        (f) => `${f.asset}${f.level}`,
      ),
    ).toEqual(['scl0', 'visual1', 'visual0'])

  // Again: it does not ask, it updates the row, and it sends nothing more. The line still says how many are verified.
  await save.click()
  await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(1)
  await expect(save).not.toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(savedLine())).toBeVisible()
  expect(verifies(calls)).toHaveLength(2)
  expect(calls.filter((c) => c.path === '/rest/v1/rpc/record_consent')).toHaveLength(1)
  expect(inserts(calls)).toHaveLength(1)
})

test('when the agreement is not recorded, nothing is saved, it is not remembered, and the dialog says so', async ({
  page,
}) => {
  await signedIn(page)
  const calls = await mockSupabase(page, { consent: { status: 500, body: { message: 'boom' } } })
  await opened(page)
  await saveButton(page).click()
  const dialog = page.getByRole('dialog', { name: account.consent.title })
  await dialog.getByLabel(account.consent.age).check()
  await dialog.getByRole('button', { name: account.consent.agree }).click()
  await expect(dialog.getByRole('alert')).toHaveText(account.consent.failed)
  await expect(dialog).toBeVisible() // still open: it can be tried again
  expect(inserts(calls)).toHaveLength(0)
  expect(verifies(calls)).toHaveLength(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), consentKey(USER_ID))).toBeNull()
  // the database's own words are never shown
  await expect(page.getByText('boom')).toHaveCount(0)
})

test('a reload keeps the saved label and the check on both photos', async ({ page }) => {
  await signedIn(page)
  await agreed(page)
  await mockSupabase(page)
  await opened(page)
  await saveButton(page).click()
  await expect(page.getByText(savedLine())).toBeVisible({ timeout: 30_000 })
  // Exact: the line under the button ends "frames verified · 5 Oct 2026" and a substring match would count it
  const badge = page.getByText(flow.workbench.verifiedBadge(CHECKED_ON), { exact: true })
  await expect(badge).toHaveCount(2)

  await page.reload()
  await waitForPhotos(page)
  await expect(page.getByText(account.savedLabel, { exact: true })).toBeVisible()
  await expect(badge).toHaveCount(2)
  // No photo says "Not saved" any more: each says what the server found.
  await expect(page.getByText(flow.workbench.notSaved, { exact: true })).toHaveCount(0)
})

test('a server mismatch is shown in words, on the photos and under the button, never hidden', async ({
  page,
}) => {
  await signedIn(page)
  await agreed(page)
  const calls = await mockSupabase(page, { verify: mismatchAll })
  await opened(page)
  await saveButton(page).click()
  await expect(page.getByText(account.mismatched(FRAMES))).toBeVisible({ timeout: 30_000 })
  // Nothing is verified, and the line says so rather than "Saved · 0 frames verified"
  await expect(page.getByText(account.savedNone)).toBeVisible()
  // Exact: the line "6 frames did not match the source file" is not a badge
  await expect(page.getByText(flow.workbench.mismatchBadge, { exact: true })).toHaveCount(2)
  await expect(page.getByText(flow.workbench.verifiedBadge(CHECKED_ON), { exact: true })).toHaveCount(0)
  expect(verifies(calls)).toHaveLength(2)
  // A mismatch is checked again by the next save: that is what lets a failed read recover.
  await saveButton(page).click()
  await expect.poll(() => verifies(calls).length).toBe(4)
})

test('signed out, Save goes to Google with ?save=1 and keeps local work; the return saves once, after the photos are in', async ({
  page,
}) => {
  await agreed(page)
  const calls = await mockSupabase(page)
  const id = await opened(page)

  await saveButton(page).click()
  await expect.poll(() => authorizes(calls).length).toBe(1)
  const sent = authorizes(calls)[0]!
  expect(sent.query.get('provider')).toBe('google')
  const back = new URL(sent.query.get('redirect_to')!)
  expect(back.pathname).toBe(`/i/${id}`)
  expect(back.searchParams.get('save')).toBe('1')
  expect(verifies(calls)).toHaveLength(0)
  expect(await readStored(page, id)).toMatchObject({ id, serverId: null, before: PAIR.before })

  // Back from Google with a code. The photos are held, so the page is not ready: nothing is sent until they are in.
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/\/cog\/2025-\d\d-\d\d\/TCI\.tif$/, async (route) => {
    await held
    await route.continue()
  })
  back.searchParams.set('code', 'e2e-code')
  back.searchParams.set('tier', '0')
  await page.goto(back.toString())
  await expect(page.getByText(account.waiting.photos)).toBeVisible({ timeout: 30_000 })
  await expect(saveButton(page)).toBeDisabled()
  await page.waitForTimeout(1000)
  expect(verifies(calls)).toHaveLength(0)
  expect(inserts(calls)).toHaveLength(0)

  release()
  await expect(page.getByText(savedLine())).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500) // a second run would show itself by now
  expect(verifies(calls)).toHaveLength(2)
  expect(inserts(calls)).toHaveLength(1)
  // A second run would be a PATCH with no verify (everything is recorded): none happened.
  expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  // The request is spent: a reload must not save again.
  expect(new URL(page.url()).searchParams.has('save')).toBe(false)
  expect(page.url()).toContain(`/i/${id}`)
})

test('back from Google without a recorded agreement, it asks first and saves once it is given', async ({
  page,
}) => {
  const calls = await mockSupabase(page)
  const id = await opened(page)
  await saveButton(page).click()
  await expect.poll(() => authorizes(calls).length).toBe(1)
  const back = new URL(authorizes(calls)[0]!.query.get('redirect_to')!)
  back.searchParams.set('code', 'e2e-code')
  back.searchParams.set('tier', '0')
  await page.goto(back.toString())

  const dialog = page.getByRole('dialog', { name: account.consent.title })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  expect(verifies(calls)).toHaveLength(0)
  await dialog.getByLabel(account.consent.age).check()
  await dialog.getByRole('button', { name: account.consent.agree }).click()
  await expect(page.getByText(savedLine())).toBeVisible({ timeout: 30_000 })
  expect(verifies(calls)).toHaveLength(2)
  expect(inserts(calls)).toHaveLength(1)
  expect(page.url()).toContain(`/i/${id}`)
  // Focus is back on the button that asked, not lost to the page.
  await expect(saveButton(page)).toBeFocused()
})

test('a signed-out visit with ?save=1 and no session forgets the request instead of keeping it', async ({
  page,
}) => {
  const calls = await mockSupabase(page)
  const id = await openThenEdit(page, PAIR)
  await page.goto(`/i/${id}?tier=0&save=1`)
  await waitForPhotos(page)
  await expect(saveButton(page)).toBeEnabled({ timeout: 30_000 })
  await expect.poll(() => new URL(page.url()).searchParams.has('save')).toBe(false)
  expect(authorizes(calls)).toHaveLength(0) // it did not start a sign-in nobody asked for
  expect(verifies(calls)).toHaveLength(0)
})

test('a double click saves once', async ({ page }) => {
  await signedIn(page)
  await agreed(page)
  const calls = await mockSupabase(page)
  await opened(page)
  await saveButton(page).dblclick()
  await expect(page.getByText(savedLine())).toBeVisible({ timeout: 30_000 })
  expect(inserts(calls)).toHaveLength(1)
  expect(verifies(calls)).toHaveLength(2)
})

test('a session the server refuses sends the person to Google with ?save=1, and local work stays', async ({
  page,
}) => {
  await signedIn(page)
  await agreed(page)
  const calls = await mockSupabase(page, {
    verify: () => ({ status: 401, body: { code: 401, message: 'Invalid JWT' } }),
  })
  const id = await opened(page)
  await saveButton(page).click()
  await expect.poll(() => authorizes(calls).length).toBe(1)
  const back = new URL(authorizes(calls)[0]!.query.get('redirect_to')!)
  expect(back.pathname).toBe(`/i/${id}`)
  expect(back.searchParams.get('save')).toBe('1')
  expect(verifies(calls)).toHaveLength(1) // a 401 is not retried
  // The row exists and its id is kept; the pair and the pins are as they were.
  expect(await readStored(page, id)).toMatchObject({
    id,
    serverId: INSERTED_ID,
    before: PAIR.before,
    after: PAIR.after,
    pinned: PAIR.pinned,
  })
})

test('the 50-frame cap says what to do and is not retried', async ({ page }) => {
  await signedIn(page)
  await agreed(page)
  const calls = await mockSupabase(page, {
    verify: () => ({ status: 422, body: { error: 'GS:LIMIT_FRAMES' } }),
  })
  await opened(page)
  await saveButton(page).click()
  await expect(page.getByText(account.frameLimit)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('alert').filter({ hasText: account.frameLimit })).toHaveCount(1)
  expect(verifies(calls)).toHaveLength(1) // not retried, and the second date is not asked either
  expect(authorizes(calls)).toHaveLength(0)
  await expect(page.getByText('Save again to retry')).toHaveCount(0)
})

test('the report of a saved investigation says verified and gives each date its server check', async ({
  page,
}) => {
  await signedIn(page)
  await agreed(page)
  await mockSupabase(page)
  await opened(page)
  await saveButton(page).click()
  await expect(page.getByText(savedLine())).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: flow.workbench.report }).click()
  const report = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(report.locator('h1')).toBeVisible({ timeout: 30_000 })
  await expect(report.locator('p.badge.accent')).toHaveText(flow.report.verified(CHECKED_ON))
  const cells = report.locator('table.dates tbody tr td:nth-child(4)')
  await expect(cells).toHaveCount(2)
  await expect(cells).toHaveText([flow.report.check.verified, flow.report.check.verified])
})

test('the report of an investigation that was never saved says what it always has', async ({ page }) => {
  await signedIn(page)
  await mockSupabase(page)
  await openFixtureSite(page)
  await waitForPhotos(page)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const report = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(report.locator('h1')).toBeVisible({ timeout: 30_000 })
  await expect(report.locator('p.badge.accent')).toHaveText(flow.report.unverified)
  await expect(report.locator('table.dates tbody tr td:nth-child(4)')).toHaveText([
    flow.report.values.notChecked,
    flow.report.values.notChecked,
  ])
})

// An optional control must not take the page down with it: offline, or a newer release that replaced the file.
test('if the save control cannot be loaded, the workbench carries on with its plain status', async ({
  page,
}) => {
  await page.route('**/assets/accounts-*.js', (route) => route.abort())
  await mockSupabase(page)
  await openFixtureSite(page)
  await waitForPhotos(page)
  await expect(page.getByText(flow.workbench.notSaved, { exact: true }).first()).toBeVisible()
  await expect(saveButton(page)).toHaveCount(0)
  await expect(page.getByRole('link', { name: flow.workbench.report })).toBeVisible()
})

// The P1a no-jump guard, in the accounts build: until the save control's code arrives the row holds its place (the status and a
// blank of the button's size), so what is below it is where it will stay. Measured on a settled page at 390 px, with the chunk
// held and then let in.
test('the title row does not change size when the save control arrives (390 px)', async ({ page }) => {
  await mockSupabase(page)
  const id = await openThenEdit(page, PAIR)
  await page.setViewportSize({ width: 390, height: 844 })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/assets/accounts-*.js', async (route) => {
    await held
    await route.continue()
  })
  try {
    await page.goto(`/i/${id}?tier=0`)
    await waitForSettled(page)
    const add = page
      .getByRole('region', { name: flow.notes.title })
      .getByRole('button', { name: flow.notes.add })
    const report = page.getByRole('link', { name: flow.workbench.report })
    await expect(page.getByText(flow.workbench.notSaved, { exact: true }).first()).toBeVisible()
    await expect(saveButton(page)).toHaveCount(0)
    const [addHeld, reportHeld] = [(await add.boundingBox())!, (await report.boundingBox())!]

    release()
    await expect(saveButton(page)).toBeEnabled({ timeout: 30_000 })
    await page.waitForTimeout(300)
    const [addNow, reportNow] = [(await add.boundingBox())!, (await report.boundingBox())!]
    expect(Math.abs(addNow.y - addHeld.y), 'the notes moved').toBeLessThan(2)
    expect(Math.abs(reportNow.y - reportHeld.y), 'the Report link moved down').toBeLessThan(2)
    expect(Math.abs(reportNow.x - reportHeld.x), 'the Report link moved across').toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    release()
  }
})

// The step the test above cannot see: the code arrives while the photos are still on their way, so the "waiting" line is on the
// page. Its place is held by the fallback, so the notes and the Report link stay where they were.
test('the waiting line comes in without moving anything (390 px, photos still loading)', async ({ page }) => {
  await mockSupabase(page)
  const id = await openThenEdit(page, PAIR)
  await page.setViewportSize({ width: 390, height: 844 })
  let releaseChunk!: () => void
  let releasePhotos!: () => void
  const chunk = new Promise<void>((r) => (releaseChunk = r))
  const photos = new Promise<void>((r) => (releasePhotos = r))
  await page.route('**/assets/accounts-*.js', async (route) => {
    await chunk
    await route.continue()
  })
  await page.route(/\/cog\/2025-\d\d-\d\d\/TCI\.tif$/, async (route) => {
    await photos
    await route.continue()
  })
  try {
    await page.goto(`/i/${id}?tier=0`)
    const add = page
      .getByRole('region', { name: flow.notes.title })
      .getByRole('button', { name: flow.notes.add })
    const report = page.getByRole('link', { name: flow.workbench.report })
    await expect(add).toBeVisible({ timeout: 30_000 })
    await expect(saveButton(page)).toHaveCount(0)
    const [addHeld, reportHeld] = [(await add.boundingBox())!, (await report.boundingBox())!]

    releaseChunk()
    await expect(saveButton(page)).toBeDisabled({ timeout: 30_000 }) // the line is on the page now
    await page.waitForTimeout(300)
    const [addNow, reportNow] = [(await add.boundingBox())!, (await report.boundingBox())!]
    expect(Math.abs(addNow.y - addHeld.y), 'the notes moved').toBeLessThan(2)
    expect(Math.abs(reportNow.y - reportHeld.y), 'the Report link moved').toBeLessThan(2)
  } finally {
    releaseChunk()
    releasePhotos()
  }
})
