import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Download, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  manyPasses,
  openClaim,
  openFixtureRoad,
  openFixtureSite,
  openThenEdit,
  waitForPhotos,
} from './helpers.ts'

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
  const claim = await openClaim(page)
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

// "What we measured": the change rule is run on the pinned pair in a worker of its own before the report is built (ruling R46). The
// page is watched in two ways: through its Worker, whose one `change` request is let through, failed or never answered, and through
// the documents its report preview is given.
type Mode = 'pass' | 'fail' | 'silent'
interface Watch {
  /** What the worker does with the change request: `pass` lets it through, `fail` answers it with an error, `silent` never answers. */
  mode: Mode
  /** Requests to the change rule, the round trip of its answer in ms, and the workers asked for it that were ended. */
  asked: number
  ms: number | null
  ended: number
  /** Every document the report preview was given, in order: whether it holds the block. */
  docs: boolean[]
}
const watched = (page: Page) => page.evaluate(() => (window as unknown as { __watch: Watch }).__watch)
const setMode = (page: Page, mode: Mode) =>
  page.evaluate((m) => ((window as unknown as { __watch: Watch }).__watch.mode = m), mode)
const measured = (page: Page) => reportFrame(page).locator('.measured')
const SITE_SECTIONS = ['01', '02', '03', '04', '05', '06', '07', '08']
/**
 * The recipes of a report, by their tags (unit tests tie them to src/evidence/types.ts): a report that printed no block lists the four
 * it listed before the change rule existed and no more, one that printed it lists the rule too (ruling R55). Written out here, not
 * imported, so that the lines of the tests above stay where they were.
 */
const BEFORE_THE_RULE = { frame: 'frame-v1', scl: 'scl-v2', display: 'display-v1', diff: 'diff-v1' }
const WITH_THE_RULE = { ...BEFORE_THE_RULE, change: 'change-v1' }
/** The `recipes` of the provenance the report page itself embeds (a JSON script in the preview). */
const embeddedRecipes = async (page: Page) =>
  JSON.parse((await reportFrame(page).locator('script#provenance').textContent())!).recipes as unknown

async function watchReport(page: Page, how: Mode) {
  await page.addInitScript(
    ({ mode, title }) => {
      const w: Watch = { mode, asked: 0, ms: null, ended: 0, docs: [] }
      ;(window as unknown as { __watch: Watch }).__watch = w
      const note = (el: Node) => {
        if (el instanceof HTMLIFrameElement && el.title === title)
          w.docs.push((el.getAttribute('srcdoc') ?? '').includes('<div class="measured">'))
      }
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'attributes') note(r.target)
          else r.addedNodes.forEach(note)
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['srcdoc'] })
      const Real = window.Worker
      window.Worker = class extends Real {
        askedAt = -1
        constructor(...a: ConstructorParameters<typeof Worker>) {
          super(...a)
          this.addEventListener('message', (e) => {
            if (this.askedAt >= 0 && (e.data as { ok?: boolean }).ok === true)
              w.ms = performance.now() - this.askedAt
          })
        }
        override postMessage(message: unknown, ...rest: unknown[]): void {
          if ((message as { op?: string } | null)?.op !== 'change')
            return super.postMessage(message, ...(rest as []))
          w.asked++
          this.askedAt = performance.now()
          if (w.mode === 'pass') return super.postMessage(message, ...(rest as []))
          const { id } = message as { id: number }
          if (w.mode === 'fail')
            queueMicrotask(() =>
              this.onmessage?.(
                new MessageEvent('message', {
                  data: { id, ok: false, error: { name: 'Error', message: 'SIZE_MISMATCH' } },
                }),
              ),
            )
        }
        override terminate(): void {
          if (this.askedAt >= 0) w.ended++
          super.terminate()
        }
      }
    },
    { mode: how, title: flow.report.title },
  )
}

/** What the page logged or threw, bar the notice a browser prints for the JSON script of the sandboxed preview (it is there in every report). */
function loud(page: Page) {
  const seen: string[] = []
  page.on('console', (m) => {
    if (!m.text().includes("'about:srcdoc'")) seen.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`))
  return seen
}

/** From the workbench to the preparing page: the rule has been asked for the pair, and nothing has answered yet. */
async function openReportAsked(page: Page) {
  await waitForPhotos(page)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  await page.waitForFunction(() => (window as unknown as { __watch: Watch }).__watch.asked === 1, null, {
    timeout: 30_000,
  })
}

test('the report prints what the change rule measured on the pair, in the first page its preview shows', async ({
  page,
}) => {
  const seen = loud(page)
  await watchReport(page, 'pass')
  await openFixtureSite(page)
  await openReport(page)
  const iframe = reportFrame(page)
  await expect(measured(page).locator('h3')).toHaveText(flow.report.measured.title)
  // At the end of the Evidence section, which keeps its number: the block takes none of its own.
  await expect(iframe.locator('section', { has: measured(page) }).locator('h2')).toHaveText(
    flow.report.sections.evidence,
  )
  await expect(iframe.locator('section .n')).toHaveText(SITE_SECTIONS)
  const [lead, before, after, figure, seasons, record] = await measured(page).locator('p').allInnerTexts()
  expect(lead).toBe(flow.report.measured.lead)
  expect(before).toBe('Before, 10 Jan 2025: 100% clear view.')
  expect(after).toBe('After, 20 Dec 2025: 100% clear view.')
  // The fixture's one difference between the two days is the roof: 30 by 30 pixels of 10 m, which is 9 ha (tests/fixtures/scene.ts).
  const found = new RegExp(
    '^Between 10 Jan 2025 and 20 Dec 2025, the change rule \\(change-v1\\) found 1 changed patch of at least 0\\.3 ha and 30 m across, ' +
      '(\\d+\\.\\d) ha in all\\. It rests on ([\\d,]+) pixels that are clear in both pictures\\. ' +
      'It cannot tell a building from a crop or a season: compare the pictures by eye\\.$',
  ).exec(figure!)
  expect(found, figure).not.toBeNull()
  expect(Number(found![1])).toBeGreaterThan(8.5)
  expect(Number(found![1])).toBeLessThan(10)
  expect(Number(found![2]!.replaceAll(',', ''))).toBeGreaterThan(500_000) // most of the 1024 by 1024 grid is clear in both
  expect(seasons).toBe(flow.report.measured.differentSeasons)
  expect(record).toMatch(/^Rule change-v1, grid display-v1, 1024 × 1024 pixels\. Settings: bandThreshold 38,/)
  // It states what the rule did and never judges the claim.
  const words = await measured(page).innerText()
  expect(words).not.toMatch(/nothing you can claim/i)
  expect(words).not.toMatch(/\bno change\b/i)
  // The report printed the block, so the provenance, the page's own and the file, names the rule among its recipes.
  expect(await embeddedRecipes(page)).toStrictEqual(WITH_THE_RULE)
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  expect(prov.recipes).toStrictEqual(WITH_THE_RULE)
  // The first sight was the finished page: the preview was given one document, with the block in it, and it was never rebuilt.
  await expect.poll(async () => (await watched(page)).ended).toBe(1)
  const w = await watched(page)
  expect(w.docs).toEqual([true])
  // The rule was asked once, in a worker that was ended, and answered far inside its deadline of 10 s.
  expect(w.asked).toBe(1)
  expect(w.ms).toBeGreaterThan(0)
  expect(w.ms).toBeLessThan(5_000)
  expect(seen).toEqual([])
})

test('a worker that fails the change request leaves the report finished, with no block and no word about it', async ({
  page,
}) => {
  const seen = loud(page)
  await watchReport(page, 'fail')
  await openFixtureSite(page)
  await openReport(page)
  const iframe = reportFrame(page)
  await expect(measured(page)).toHaveCount(0)
  await expect(iframe.locator('section .n')).toHaveText(SITE_SECTIONS) // the same sections, the same table
  await expect(iframe.locator('table.dates tbody tr')).toHaveCount(2)
  const html = await fileOf(await download(page, flow.report.download))
  expect(html).not.toContain(flow.report.measured.title)
  expect(html).not.toContain('class="measured"')
  // Nothing was printed from the rule, so the rule is named nowhere: not in the block, not in the provenance (ruling R55).
  expect(html).not.toContain(WITH_THE_RULE.change)
  expect(await embeddedRecipes(page)).toStrictEqual(BEFORE_THE_RULE)
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  expect(prov.recipes).toStrictEqual(BEFORE_THE_RULE)
  const w = await watched(page)
  expect([w.asked, w.ended, w.docs]).toEqual([1, 1, [false]]) // asked once, its worker ended, one document and never another
  expect(seen).toEqual([])
})

test('a worker that never answers is waited for 10 s at most, then the report is built without the block', async ({
  page,
}) => {
  const seen = loud(page)
  await watchReport(page, 'silent')
  await openFixtureSite(page)
  await openReportAsked(page)
  const asked = Date.now()
  // Until the deadline it is the preparing page, never a half-built report.
  await expect(page.getByText(flow.report.preparing)).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.locator('iframe').waitFor({ timeout: 25_000 })
  const waited = Date.now() - asked
  expect(waited, 'it waited for the deadline').toBeGreaterThan(9_000)
  expect(waited, 'and not for the 120 s of the imagery client').toBeLessThan(20_000)
  await expect(reportFrame(page).locator('p', { hasText: CREDIT })).toBeVisible()
  await expect(measured(page)).toHaveCount(0)
  // The same as a failed run: the rule is named nowhere (ruling R55).
  expect(await fileOf(await download(page, flow.report.download))).not.toContain(WITH_THE_RULE.change)
  expect(await embeddedRecipes(page)).toStrictEqual(BEFORE_THE_RULE)
  const prov = JSON.parse(await fileOf(await download(page, flow.report.provenance)))
  expect(prov.recipes).toStrictEqual(BEFORE_THE_RULE)
  const w = await watched(page)
  expect([w.asked, w.ended, w.docs]).toEqual([1, 1, [false]])
  expect(seen).toEqual([])
})

test('leaving the report while the rule runs ends its worker at once and is quiet, and leaves nothing for the next report', async ({
  page,
}) => {
  const seen = loud(page)
  await watchReport(page, 'silent')
  await openFixtureSite(page)
  await openReportAsked(page)
  await page.getByRole('link', { name: flow.report.back }).click()
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
  // Not at the deadline, 10 s later: now.
  await expect.poll(async () => (await watched(page)).ended, { timeout: 3_000 }).toBe(1)
  // The abandoned run built nothing, so there is no provenance of it to name the rule in: no report was ever shown.
  expect((await watched(page)).docs).toEqual([])
  // The next report is a run of its own: with the worker answering, it prints the block and its provenance names the rule.
  await setMode(page, 'pass')
  await openReport(page)
  await expect(measured(page)).toHaveCount(1)
  expect(await embeddedRecipes(page)).toStrictEqual(WITH_THE_RULE)
  const w = await watched(page)
  expect([w.asked, w.docs]).toEqual([2, [true]])
  await expect.poll(async () => (await watched(page)).ended).toBe(2)
  expect(seen).toEqual([])
})
