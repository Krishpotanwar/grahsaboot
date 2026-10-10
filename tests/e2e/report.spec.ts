import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Download, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { manyPasses, openFixtureRoad, openFixtureSite, openThenEdit, waitForPhotos } from './helpers.ts'

const CREDIT = 'Contains modified Copernicus Sentinel data 2025'
const PAIR = { before: '2025-01-10', after: '2025-12-20', pinned: ['2025-01-10', '2025-12-20'] }
const reportFrame = (page: Page) => page.frameLocator(`iframe[title="${flow.report.title}"]`)
const fileOf = async (dl: Download) => readFileSync((await dl.path())!, 'utf8')
const download = async (page: Page, name: string) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()])
  return dl
}
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

/** From the workbench with both photos on screen to the finished report. */
async function openReport(page: Page) {
  await waitForPhotos(page)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  await expect(reportFrame(page).locator('p', { hasText: CREDIT })).toBeVisible({ timeout: 30_000 })
}

/** A saved investigation with `patch`, opened straight at its report. */
async function reportOf(page: Page, patch: Record<string, unknown>, open = openFixtureSite) {
  const id = await openThenEdit(page, patch, open)
  await page.goto(`/i/${id}/report?tier=0`)
  return id
}

test('report previews, downloads a self-contained HTML and provenance', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const panel = page.getByRole('region', { name: flow.notes.title })
  await panel.getByLabel(flow.notes.what).fill('<script>window.pwned=1</script> roof')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await openReport(page)
  await expect(page).toHaveTitle(`${copy.titles.report} · ${copy.app.name}`)
  const iframe = reportFrame(page)
  await expect(iframe.locator('h1')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  // Nothing sticks out sideways, on a desktop or on a phone.
  expect(await iframe.locator('html').evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  const dl = await download(page, flow.report.download)
  expect(dl.suggestedFilename()).toMatch(/^[a-z0-9-]+\.html$/)
  const html = await fileOf(dl)
  expect(html).not.toContain('<script>window.pwned=1</script>')
  expect(html).toContain('&lt;script&gt;window.pwned=1&lt;/script&gt; roof')
  expect(html).toMatch(/<img src="data:image\/png;base64,/)
  expect(html).not.toMatch(/<img src="https?:/)
  expect(html).not.toMatch(/<(img|link|script)[^>]+(src|href)="https?:/i)

  const pj = await download(page, flow.report.provenance)
  expect(pj.suggestedFilename()).toMatch(/^[a-z0-9-]+\.provenance\.json$/)
  const prov = JSON.parse(await fileOf(pj))
  expect(prov.schema).toBe('grahsaboot.provenance/1')
  expect(prov.app.version).toBe('0.1.0')
  expect(prov.frames.map((f: { date: string; asset: string }) => `${f.date}:${f.asset}`)).toEqual([
    '2025-01-10:scl',
    '2025-01-10:visual',
    '2025-12-20:scl',
    '2025-12-20:visual',
  ])
  expect(prov.notes[0].body).toBe('<script>window.pwned=1</script> roof')
})

test('printed report is white paper', async ({ page }) => {
  await openFixtureSite(page)
  await openReport(page)
  const iframe = reportFrame(page)
  const bg = () => iframe.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
  expect(await bg()).toBe('rgb(9, 9, 11)') // on screen it follows the theme
  await page.emulateMedia({ media: 'print' })
  expect(await bg()).toBe('rgb(255, 255, 255)')
  expect(await iframe.locator('h1').evaluate((h) => getComputedStyle(h).color)).toBe('rgb(0, 0, 0)')
  // The outline is a dark accent on white, not the dark theme's orange.
  expect(
    await iframe
      .locator('.ph path')
      .first()
      .evaluate((p) => getComputedStyle(p).stroke),
  ).toBe('rgb(167, 78, 27)')
})

test('the report follows the theme, and the outline is drawn on both photos', async ({ page }) => {
  await openFixtureSite(page)
  await openReport(page)
  const iframe = reportFrame(page)
  await expect(iframe.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(iframe.locator('.ph path')).toHaveCount(2)
  await expect(iframe.locator('.ph svg').first()).toHaveAttribute('aria-hidden', 'true')
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await expect(iframe.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(iframe.locator('.ph path')).toHaveCount(2)
})

test('typing in Prepared by builds the page again but never the pictures', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __encodes: number }
    w.__encodes = 0
    const toDataURL = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (
      this: HTMLCanvasElement,
      ...a: Parameters<typeof toDataURL>
    ) {
      w.__encodes++
      return toDataURL.apply(this, a)
    }
  })
  await openFixtureSite(page)
  await openReport(page)
  const iframe = reportFrame(page)
  const sources = () =>
    iframe.locator('img').evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src))
  const encodes = () => page.evaluate(() => (window as unknown as { __encodes: number }).__encodes)
  const [before, encoded] = [await sources(), await encodes()]
  expect(before).toHaveLength(4) // both photos, as shown and as source pixels
  expect(encoded).toBeGreaterThan(0)
  await page.getByLabel(flow.report.preparedBy).pressSequentially('Field team, Panvel')
  await expect(iframe.getByText(`${flow.report.preparedByLabel}: Field team, Panvel`)).toBeVisible()
  expect(await sources()).toEqual(before)
  expect(await encodes()).toBe(encoded)
  const html = await fileOf(await download(page, flow.report.download))
  expect(html).toContain(`${flow.report.preparedByLabel}: Field team, Panvel`)
})

test('every pinned date is in the table and the provenance, and only those days are searched', async ({
  page,
}) => {
  const pinned = ['2025-01-10', '2025-03-05', '2025-06-15', '2025-12-20']
  const days: string[] = []
  const id = await openThenEdit(page, { ...PAIR, pinned })
  // From here on: the report's own searches.
  page.on('request', (r) => {
    if (!r.url().endsWith('/stac/search') || r.method() !== 'POST') return
    const [from = '', to = ''] = ((r.postDataJSON()?.datetime as string) ?? '').split('/')
    days.push(from.slice(0, 10) === to.slice(0, 10) ? from.slice(0, 10) : `${from}/${to}`)
  })
  await page.goto(`/i/${id}/report?tier=0`)
  await expect(reportFrame(page).locator('p', { hasText: CREDIT })).toBeVisible({ timeout: 30_000 })
  expect([...days].sort()).toEqual(pinned) // one search per day, never the range
  const table = reportFrame(page).locator('table.dates')
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0)).toContainText('Clear')
  await expect(rows.nth(1)).toContainText('Partly clear')
  await expect(rows.nth(2)).toContainText('Obscured')
  await expect(rows.nth(3)).toContainText('Clear')
  await expect(table.getByRole('columnheader')).toHaveText([
    flow.report.labels.date,
    flow.report.labels.view,
    flow.report.labels.clear,
    flow.report.labels.serverCheck,
    flow.report.labels.source,
    flow.report.labels.sha256,
  ])
  await expect(table.getByText(flow.report.values.notChecked)).toHaveCount(4)
  await expect(reportFrame(page).getByText(flow.report.obscured(1, 4))).toBeVisible()
  // The provenance lists the 10 m frame of the pair, the level-1 preview of the other usable date, and the check of all four.
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  expect(
    prov.frames.map((f: { date: string; asset: string; level: number }) => `${f.date}:${f.asset}:${f.level}`),
  ).toEqual([
    '2025-01-10:scl:0',
    '2025-01-10:visual:0',
    '2025-03-05:scl:0',
    '2025-03-05:visual:1',
    '2025-06-15:scl:0',
    '2025-12-20:scl:0',
    '2025-12-20:visual:0',
  ])
  const hashes = prov.frames.map((f: { sha256: string }) => f.sha256)
  for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/)
  // The table shows the frame's hash where the frame is loaded, the quality window's where it is not.
  const shown = await rows.locator('td:last-child').allTextContents()
  expect(shown).toEqual([1, 2, 4, 6].map((i) => prov.frames[i].sha256))
})

test('the report waits for the previews of every usable pinned date, also past the 12 that load by themselves', async ({
  page,
}) => {
  const pinned = Array.from({ length: 15 }, (_, i) => `2025-01-${10 + i}`)
  const id = await openThenEdit(page, { before: pinned[0], after: pinned[14], pinned })
  await manyPasses(page, 14) // 10 Jan and 14 copies of it, every one a clear pass
  await page.goto(`/i/${id}/report?tier=0`)
  await expect(reportFrame(page).locator('p', { hasText: CREDIT })).toBeVisible({ timeout: 45_000 })
  await expect(reportFrame(page).locator('table.dates tbody tr')).toHaveCount(15)
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  const frames = prov.frames as Array<{ date: string; asset: string; level: number }>
  expect(frames.filter((f) => f.asset === 'scl')).toHaveLength(15)
  expect(frames.filter((f) => f.asset === 'visual' && f.level === 0).map((f) => f.date)).toEqual([
    pinned[0],
    pinned[14],
  ])
  expect(frames.filter((f) => f.asset === 'visual' && f.level === 1)).toHaveLength(13) // all the others, the 13th included
})

test('the report is not shown before every pinned date has its check and its preview', async ({ page }) => {
  const id = await openThenEdit(page, { ...PAIR, pinned: ['2025-01-10', '2025-03-05', '2025-12-20'] })
  // Slow down 5 Mar only: the pair's frames are in long before its check and its preview.
  await page.route(/\/cog\/2025-03-05\/(SCL|TCI)\.tif$/, async (route) => {
    await new Promise((r) => setTimeout(r, 600))
    await route.continue()
  })
  await page.goto(`/i/${id}/report?tier=0`)
  await expect(page.getByText(flow.report.preparing)).toBeVisible()
  await page.locator('iframe').waitFor({ timeout: 30_000 })
  // The first sight of the page is the finished one: read once, no waiting for it to improve.
  await reportFrame(page).locator('table.dates').waitFor()
  expect(await reportFrame(page).locator('table.dates tbody tr').nth(1).innerText()).toContain('Partly clear')
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  expect(prov.frames.map((f: { date: string; asset: string }) => `${f.date}:${f.asset}`)).toContain(
    '2025-03-05:visual',
  )
})

test('a road report has the sections x dates grid, numbered after the table', async ({ page }) => {
  await openFixtureRoad(page)
  await openReport(page)
  const iframe = reportFrame(page)
  await expect(iframe.locator('section .n')).toHaveText([
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
  ])
  await expect(iframe.locator('h2').nth(3)).toHaveText(flow.report.sections.grid)
  const grid = iframe.locator('table.sections')
  await expect(grid.locator('tbody th')).toHaveText(['0.0–2.0 km', '2.0–2.9 km'])
  await expect(grid.locator('tbody tr').first().locator('td')).toHaveText(['Clear', 'Clear'])
  await expect(iframe.getByText('30 m wide')).toBeVisible()
  // The centre line is drawn open (no fill) over the photos.
  await expect(iframe.locator('.ph path:not(.site)')).toHaveCount(2)
})

test('with no before and after pair the report says what to do, and the link goes back', async ({ page }) => {
  const id = await openThenEdit(page, {
    dateFrom: '2025-06-01',
    dateTo: '2025-06-30',
    before: null,
    after: null,
    pinned: [],
  })
  await page.goto(`/i/${id}?tier=0`)
  await expect(page.getByText(flow.workbench.allCloudy)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('link', { name: flow.workbench.report }).click()
  await expect(page.getByText(flow.report.needPair)).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByText(flow.report.preparing)).toHaveCount(0)
  await page.getByRole('link', { name: flow.report.back }).click()
  await expect(page).toHaveURL(new RegExp(`/i/${id}$`))
  await expect(page.getByText(flow.workbench.allCloudy)).toBeVisible({ timeout: 30_000 })
})

test('an unknown investigation says the page is not found', async ({ page }) => {
  await page.goto('/i/does-not-exist/report?tier=0')
  await expect(page.getByRole('heading', { name: copy.notFound.title })).toBeVisible()
  await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
  await expect(page).toHaveTitle(`${copy.titles.report} · ${copy.app.name}`)
})

test('a store that cannot be read says so and links home, never a skeleton forever', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.get = () => {
      throw new DOMException('Storage is unavailable', 'UnknownError')
    }
  })
  await page.goto('/i/local-anything/report?tier=0')
  await expect(page.getByText(flow.workbench.errors.STORE_FAILED!)).toBeVisible()
  await expect(page.getByRole('link', { name: copy.notFound.home })).toBeVisible()
})

test('an outline that can no longer be read says so, with no Try again', async ({ page }) => {
  await reportOf(page, {
    ...PAIR,
    aoi: {
      kind: 'site',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [79.08, 21.14],
            [79.09, 21.15],
          ],
        ],
      },
    },
  })
  await expect(page.getByText(flow.workbench.badOutline)).toBeVisible()
  await expect(page.getByRole('button', { name: copy.common.retry })).toHaveCount(0)
  await expect(page.getByRole('link', { name: flow.report.back })).toBeVisible()
})

test('a failed search says so, and Try again builds the report', async ({ page }) => {
  const search = '**/stac/search'
  await page.route(search, (r) => r.abort())
  await reportOf(page, PAIR)
  await expect(page.getByText(flow.workbench.searchFailed)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(flow.report.preparing)).toHaveCount(0)
  await page.unroute(search)
  await page.getByRole('button', { name: copy.common.retry }).click()
  await expect(reportFrame(page).locator('p', { hasText: CREDIT })).toBeVisible({ timeout: 30_000 })
})

test('a day of the pair with no photo says so and links back, with nothing to retry', async ({ page }) => {
  await reportOf(page, { ...PAIR, after: '2025-12-21', pinned: ['2025-01-10', '2025-12-21'] }) // no pass on 21 Dec
  await expect(page.getByText(flow.report.pairMissing)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: copy.common.retry })).toHaveCount(0)
  await expect(page.getByRole('link', { name: flow.report.back })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('a photo of the pair that fails to load says so, and Try again builds the report', async ({ page }) => {
  const tci = '**/cog/2025-12-20/TCI.tif'
  await page.route(tci, (r) => r.abort())
  await reportOf(page, PAIR)
  await expect(page.getByText(flow.report.pairMissing)).toBeVisible({ timeout: 30_000 })
  await page.unroute(tci)
  await page.getByRole('button', { name: copy.common.retry }).click()
  await expect(reportFrame(page).locator('p', { hasText: CREDIT })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(flow.report.pairMissing)).toHaveCount(0)
})

test('a pinned date that could not be checked is a dash in the report, with a sentence that says so', async ({
  page,
}) => {
  const scl = '**/cog/2025-03-05/SCL.tif'
  await page.route(scl, (r) => r.abort())
  await reportOf(page, { ...PAIR, pinned: ['2025-01-10', '2025-03-05', '2025-12-20'] })
  const iframe = reportFrame(page)
  await expect(iframe.locator('p', { hasText: CREDIT })).toBeVisible({ timeout: 30_000 })
  const row = iframe.locator('table.dates tbody tr').nth(1)
  await expect(row).toContainText('5 Mar 2025')
  await expect(row.locator('td').nth(0)).toHaveText(flow.report.values.none)
  await expect(row.locator('td').nth(1)).toHaveText(flow.report.values.none)
  await expect(row).not.toContainText('0%')
  await expect(iframe.getByText(flow.report.unchecked(1))).toBeVisible()
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  expect(prov.frames.map((f: { date: string; asset: string }) => `${f.date}:${f.asset}`)).not.toContain(
    '2025-03-05:scl',
  )
})

test('the report screen passes axe in both themes, with a note and a claim in the report', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const notes = page.getByRole('region', { name: flow.notes.title })
  await notes.getByLabel(flow.notes.what).fill('Roof visible from March')
  await notes.getByRole('button', { name: flow.notes.add }).click()
  const claim = page.getByRole('region', { name: flow.claim.title })
  await claim.getByLabel(flow.claim.text, { exact: true }).fill('Roof finished by March')
  await claim.getByRole('button', { name: flow.claim.save }).click()
  await expect(claim.getByRole('button', { name: flow.claim.remove })).toBeVisible()
  await openReport(page)
  await page.getByLabel(flow.report.preparedBy).fill('Field team')
  await expect(reportFrame(page).getByText(`${flow.report.preparedByLabel}: Field team`)).toBeVisible()
  for (const theme of ['dark', 'light']) {
    await expect(reportFrame(page).locator('html')).toHaveAttribute('data-theme', theme)
    await expect(reportFrame(page).getByText('Roof visible from March', { exact: true })).toBeVisible()
    // The preview is a sandboxed page without scripts, which axe cannot enter (Chromium would hang waiting for it): the report
    // itself is audited as a page of its own in the tests below.
    const results = await new AxeBuilder({ page }).exclude('iframe').withTags(AXE_TAGS).analyze()
    expect(results.violations, `${theme}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
})

for (const [name, open] of [
  ['site', openFixtureSite],
  ['road', openFixtureRoad],
] as const) {
  test(`the downloaded ${name} report passes axe on its own, in both themes`, async ({ page }) => {
    await open(page)
    await waitForPhotos(page)
    if (name === 'site') {
      const notes = page.getByRole('region', { name: flow.notes.title })
      await notes.getByLabel(flow.notes.what).fill('Roof visible from March')
      await notes.getByRole('button', { name: flow.notes.add }).click()
      await expect(notes.getByText('Roof visible from March')).toBeVisible()
    }
    await openReport(page)
    const html = await fileOf(await download(page, flow.report.download))
    const standalone = await page.context().newPage()
    await standalone.setContent(html)
    for (const theme of ['dark', 'light']) {
      await standalone.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      const results = await new AxeBuilder({ page: standalone }).withTags(AXE_TAGS).analyze()
      expect(results.violations, `${theme}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
    }
  })
}
