import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { finishDatesAndOpen, outlineSiteByCoords, startAt } from './helpers.ts'

// What this page's own IndexedDB holds: creating must write the investigation, not only change the URL.
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const open = indexedDB.open('gs-investigations')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction('investigations').objectStore('investigations').getAll()
          all.onsuccess = () => resolve(all.result)
          all.onerror = () => reject(all.error)
        }
      }),
  )

test('dates validate and show a data estimate', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(flow.dates.from, { exact: true }).fill('2025-12-31')
  await page.getByLabel(flow.dates.to, { exact: true }).fill('2025-01-01')
  await expect(page.getByText(flow.dates.order)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByLabel(flow.dates.from, { exact: true }).fill('2025-01-01')
  await page.getByLabel(flow.dates.to, { exact: true }).fill('2025-12-31')
  await expect(
    page.getByText(/^About 75 satellite passes\. The first view uses about 18 MB of data\.$/),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test('review creates a local investigation and opens it', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page)
  await finishDatesAndOpen(page)
  const [inv, ...rest] = await stored(page)
  expect(rest).toEqual([])
  expect(page.url()).toMatch(new RegExp(`/i/${inv!.id}$`))
  expect(inv).toMatchObject({
    name: 'Nagpur',
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
    serverId: null,
    before: null,
    after: null,
    pinned: [],
    aoi: { kind: 'site' },
  })
})

test('the worked example lands on review with the airport prefilled', async ({ page }) => {
  await page.goto('/new?tier=0&example=navi-mumbai-airport')
  await expect(page.getByRole('heading', { name: flow.review.title })).toBeVisible()
  await expect(page.getByLabel(flow.review.name)).toHaveValue('Navi Mumbai airport site')
  await expect(page.getByText(/^Area 3\.99 km²/)).toBeVisible()
})

test('the name typed on the review step is the one that is saved', async ({ page }) => {
  await page.goto('/new?tier=0&example=navi-mumbai-airport')
  await page.getByLabel(flow.review.name).fill('Terminal apron')
  await page.getByRole('button', { name: flow.review.open }).click()
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
  expect(await stored(page)).toMatchObject([
    { name: 'Terminal apron', dateFrom: '2017-12-01', dateTo: '2025-12-31' },
  ])
})

// A point with no name is "Point at 21.14580, 79.08820"; cutting that at its first comma saved "Point at 21.14580".
test('a point with no name is saved under its whole label', async ({ page }) => {
  await startAt(page, 'tier=0&lat=21.1458&lon=79.0882')
  await outlineSiteByCoords(page)
  await finishDatesAndOpen(page)
  expect(await stored(page)).toMatchObject([{ name: copy.search.coordsResult(21.1458, 79.0882) }])
})

// IndexedDB can refuse a write (storage full, private mode): say so, keep the page and the keyboard focus, and let the user try again.
test('a save that fails says so, keeps focus on the button, and trying again works', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    let refuse = true
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (refuse) {
        refuse = false
        throw new DOMException('Storage is full', 'QuotaExceededError')
      }
      return put.apply(this, args)
    }
  })
  await startAt(page)
  await outlineSiteByCoords(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  const open = page.getByRole('button', { name: flow.review.open })
  await open.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(flow.workbench.errors.SAVE_FAILED!)).toBeVisible()
  await expect(page).toHaveURL(/\/new/)
  await expect(open).toBeFocused() // a button disabled while saving dropped focus to <body> in Chrome
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
  expect(await stored(page)).toHaveLength(1)
})

// A second press while the first save is in flight must not mint a second investigation (each press makes a new id).
test('pressing Open the workbench twice saves one investigation', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: flow.review.open }).dblclick()
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
  expect(await stored(page)).toHaveLength(1)
})

// The shell's axe loop only sees step 1 and new-outline.spec step 2; steps 3 and 4 add date fields, an error and a definition list.
test('the dates and review steps pass axe in both themes, with a date error showing', async ({ page }) => {
  const axe = async () => {
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
      await page.getByRole('button', { name: copy.nav.themeToggle }).click()
    }
  }
  await startAt(page)
  await outlineSiteByCoords(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(flow.dates.from, { exact: true }).fill('2025-12-31')
  await page.getByLabel(flow.dates.to, { exact: true }).fill('2025-01-01')
  await expect(page.getByText(flow.dates.order)).toBeVisible()
  await axe()
  await page.getByLabel(flow.dates.from, { exact: true }).fill('2025-01-01')
  await page.getByLabel(flow.dates.to, { exact: true }).fill('2025-12-31')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: flow.review.title })).toBeVisible()
  await axe()
})
