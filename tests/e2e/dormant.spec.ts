import { expect, test, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureSite, waitForPhotos } from './helpers.ts'

// Accounts are dormant: a build without the flag does nothing of them. This runs in the main suite, on the build that
// proves it, and fails the moment an accounts word, request or storage key reaches it (dormant-addendum.md).
const ACCOUNT_WORDS = ['Sign in', 'Save and verify', 'My investigations', 'Delete my account']
// Found by grep, not guessed: localStorage in src/ui/theme.ts and src/map/MapStage.tsx; IndexedDB in src/data/store.ts and
// src/lib/byte-cache.ts. A new key means a new thing the app stores, which an accounts build must not add to this one.
const LOCAL_KEYS = ['gs-theme', 'gs-tier-override']
const DATABASES = ['gs-investigations', 'gs-bytes']
const SIGN_IN_TALK = /sign.?in|signed.?in|Google|your (whole )?account/i

/** Every URL the page and its workers request from now on. */
function requests(page: Page) {
  const urls: string[] = []
  page.context().on('request', (r) => urls.push(r.url()))
  return urls
}

async function expectDormant(page: Page, where: string, urls: string[], text?: string) {
  const body = text ?? (await page.locator('body').innerText())
  for (const word of ACCOUNT_WORDS) expect(body, `${where}: "${word}"`).not.toContain(word)
  if (text === undefined) {
    // Absent, not hidden: innerText skips display:none, the markup does not.
    const html = await page.content()
    for (const word of [...ACCOUNT_WORDS, 'Sign in with Google'])
      expect(html, `${where}: markup "${word}"`).not.toContain(word)
  }
  expect(
    urls.filter((u) => /supabase/i.test(u)),
    `${where}: requests`,
  ).toEqual([])
  const local = await page.evaluate(() => Object.keys(localStorage))
  expect(
    local.filter((k) => !LOCAL_KEYS.includes(k)),
    `${where}: localStorage`,
  ).toEqual([])
  expect(await page.evaluate(() => Object.keys(sessionStorage)), `${where}: sessionStorage`).toEqual([])
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))
  expect(
    dbs.filter((n) => !DATABASES.includes(n)),
    `${where}: IndexedDB`,
  ).toEqual([])
  return body
}

for (const path of ['/?tier=0', '/new?tier=0', '/privacy', '/limits']) {
  test(`${path} shows, requests and stores nothing of accounts`, async ({ page }) => {
    const urls = requests(page)
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    const text = await expectDormant(page, path, urls)
    // The two text pages say nothing about signing in: there is no sign-in. "Without an account" stays.
    if (path === '/privacy' || path === '/limits') expect(text).not.toMatch(SIGN_IN_TALK)
  })
}

test('an investigation and its report show, request and store nothing of accounts', async ({ page }) => {
  const urls = requests(page)
  await openFixtureSite(page)
  await waitForPhotos(page)
  await expectDormant(page, 'workbench', urls)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const report = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(report.locator('h1')).toBeVisible({ timeout: 30_000 })
  await expectDormant(page, 'report', urls)
  await expectDormant(page, 'report frame', urls, await report.locator('body').innerText())
})

test('a server investigation address is not found, and nothing is asked of a server', async ({ page }) => {
  const urls = requests(page)
  await page.goto(`/i/${crypto.randomUUID()}?tier=0`)
  await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
  await expectDormant(page, 'unknown investigation', urls)
})
