import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  finishDatesAndOpen,
  openFixtureRoad,
  openFixtureSite,
  outlineRoadByCoords,
  outlineSiteByCoords,
  readStored,
  startAt,
  waitForPhotos,
} from './helpers.ts'

// The Look-closer box (the outline step and the workbench's title block) and the Street View note helper (the notes panel). Its
// links open Google's own pages, so the specs that click one stub every Google host: no test here reaches the real one.

const STREET_VIEW = (at: string) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at}`
const EARTH = (at: string) => `https://earth.google.com/web/@${at},0a,2000d,35y,0h,0t,0r`
/** The fixture site is a 1000 m square around 21.1458, 79.0882; the fixture road runs between its two ends, so this is its middle. */
const SITE_MIDDLE = '21.145800,79.088200'
const ROAD_MIDDLE = '21.148228,79.086484'
const GOOGLE = /google/i
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

const title = (page: Page) => page.getByRole('heading', { name: flow.lookCloser.title })
const streetView = (page: Page) => page.getByRole('link', { name: flow.lookCloser.streetView })
const earth = (page: Page) => page.getByRole('link', { name: flow.lookCloser.earth })
const notesOf = (page: Page) => page.getByRole('region', { name: flow.notes.title })
const what = (page: Page) => notesOf(page).getByLabel(flow.notes.what)
const helper = (page: Page) => notesOf(page).getByRole('button', { name: flow.lookCloser.groundNote })
const titleBlock = (page: Page) =>
  page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) })

/** Every request any page of this context makes to a Google host: a click may make one, a load never. */
function googleRequests(page: Page) {
  const urls: string[] = []
  page.context().on('request', (r) => {
    if (GOOGLE.test(new URL(r.url()).hostname)) urls.push(r.url())
  })
  return urls
}

/** Answers every google.com request with an empty page, and keeps what each one carried. */
async function stubGoogle(page: Page) {
  const seen: Array<{ url: string; referer: string | undefined }> = []
  await page.context().route(/^https:\/\/[^/]*google\.com\//, async (route) => {
    seen.push({ url: route.request().url(), referer: (await route.request().allHeaders()).referer })
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' })
  })
  return seen
}

async function axeInBothThemes(page: Page, where: string) {
  for (let i = 0; i < 2; i++) {
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
    expect(results.violations, `${where}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
}

test('the outline step offers Street View and Google Earth for the middle of the outline, once there is one', async ({
  page,
}) => {
  const requested = googleRequests(page)
  await startAt(page)
  await expect(title(page)).toHaveCount(0) // nothing to look at yet
  await outlineSiteByCoords(page, 1000)
  await expect(title(page)).toBeVisible()
  for (const [link, href] of [
    [streetView(page), STREET_VIEW(SITE_MIDDLE)],
    [earth(page), EARTH(SITE_MIDDLE)],
  ] as const) {
    await expect(link).toHaveAttribute('href', href)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  await expect(page.getByText(flow.lookCloser.note, { exact: true })).toBeVisible()
  // A screen reader hears that it opens a new tab; the icon beside the words is for the eyes only.
  await expect(streetView(page)).toHaveAccessibleName(
    `${flow.lookCloser.streetView} ${flow.lookCloser.newTab}`,
  )
  await expect(earth(page)).toHaveAccessibleName(`${flow.lookCloser.earth} ${flow.lookCloser.newTab}`)
  expect(requested, 'looked at, never followed').toEqual([])
})

test('a road gets the links for the middle of its box, and an outline the rules refuse gets none', async ({
  page,
}) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  await expect(streetView(page)).toHaveAttribute('href', STREET_VIEW(ROAD_MIDDLE))
  await expect(earth(page)).toHaveAttribute('href', EARTH(ROAD_MIDDLE))
  await page.getByLabel(flow.outline.width).fill('4')
  await expect(page.getByText('Road width must be a whole number from 5 to 200 metres.')).toBeVisible()
  await expect(title(page)).toHaveCount(0)
  await expect(streetView(page)).toHaveCount(0)
})

test('a click opens Google in a new tab that cannot reach this page, and sends no address of it', async ({
  page,
}) => {
  const seen = await stubGoogle(page)
  const requested = googleRequests(page)
  await startAt(page)
  await outlineSiteByCoords(page, 1000)
  await expect(streetView(page)).toBeVisible()
  expect(seen, 'nothing has gone to Google before a click').toEqual([])
  expect(requested, 'nor has anything been asked of a Google host').toEqual([])
  for (const [link, href] of [
    [streetView(page), STREET_VIEW(SITE_MIDDLE)],
    [earth(page), EARTH(SITE_MIDDLE)],
  ] as const) {
    const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()])
    await tab.waitForLoadState()
    expect(tab.url()).toBe(href)
    expect(await tab.evaluate(() => window.opener)).toBeNull()
    await tab.close()
  }
  expect(seen).toEqual([
    { url: STREET_VIEW(SITE_MIDDLE), referer: undefined },
    { url: EARTH(SITE_MIDDLE), referer: undefined },
  ])
  // Positive control: the listener that the "nothing is requested" test relies on does see Google's two requests, so a typo in
  // GOOGLE cannot make an empty list there mean nothing.
  expect(requested).toEqual([STREET_VIEW(SITE_MIDDLE), EARTH(SITE_MIDDLE)])
  // This page stayed where it was.
  await expect(page).toHaveURL(/\/new/)
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
})

test('counter-case: the same click without rel sends the page address, so the check above can see one', async ({
  page,
}) => {
  const seen = await stubGoogle(page)
  await startAt(page)
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    page.evaluate(() => {
      const a = document.createElement('a')
      a.href = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=1,1'
      a.target = '_blank'
      document.body.append(a)
      a.click()
    }),
  ])
  await tab.waitForLoadState()
  expect(seen).toHaveLength(1)
  expect(seen[0]!.referer).toBe(`${new URL(page.url()).origin}/`) // the origin, as the policy of the page says
})

test('nothing is requested from Google while the outline step, the workbench and the notes load and are used', async ({
  page,
}) => {
  const requested = googleRequests(page)
  await openFixtureSite(page) // the outline step on the way, with its box
  await waitForPhotos(page)
  await expect(streetView(page)).toBeVisible()
  await helper(page).click()
  await page.reload()
  await waitForPhotos(page)
  await expect(streetView(page)).toBeVisible()
  expect(requested).toEqual([])
})

test('the workbench title block has the box for the middle of the outline, in a row under the title and the buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFixtureSite(page)
  await waitForPhotos(page)
  const head = titleBlock(page)
  const street = head.getByRole('link', { name: flow.lookCloser.streetView })
  const globe = head.getByRole('link', { name: flow.lookCloser.earth })
  await expect(street).toHaveAttribute('href', STREET_VIEW(SITE_MIDDLE))
  await expect(globe).toHaveAttribute('href', EARTH(SITE_MIDDLE))
  for (const link of [street, globe]) {
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  await expect(head.getByText(flow.lookCloser.note, { exact: true })).toBeVisible()
  // The title and the Report button keep their row; the box has the row under it, on the left.
  const [t, r, s, g] = (
    await Promise.all([
      head.getByRole('heading', { level: 1 }).boundingBox(),
      head.getByRole('link', { name: flow.workbench.report }).boundingBox(),
      street.boundingBox(),
      globe.boundingBox(),
    ])
  ).map((b) => b!)
  expect(s.y).toBeGreaterThanOrEqual(Math.max(t.y + t.height, r.y + r.height))
  expect(g.y).toBe(s.y)
  expect(s.x).toBeLessThan(r.x)
})

test('a road workbench has the links for the middle of the road', async ({ page }) => {
  await openFixtureRoad(page)
  await waitForPhotos(page)
  await expect(titleBlock(page).getByRole('link', { name: flow.lookCloser.streetView })).toHaveAttribute(
    'href',
    STREET_VIEW(ROAD_MIDDLE),
  )
  await expect(titleBlock(page).getByRole('link', { name: flow.lookCloser.earth })).toHaveAttribute(
    'href',
    EARTH(ROAD_MIDDLE),
  )
})

test('on a phone the box stays inside the page in both places, and its links are 44 px tall', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const inside = async (where: string) => {
    for (const link of [streetView(page), earth(page)]) {
      const b = (await link.boundingBox())!
      expect(b.height, `${where}: height`).toBeGreaterThanOrEqual(44)
      expect(b.x, `${where}: left`).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width, `${where}: right`).toBeLessThanOrEqual(320)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(
      true,
    )
  }
  await startAt(page)
  await outlineSiteByCoords(page, 1000)
  await expect(streetView(page)).toBeVisible()
  await inside('outline step')
  await finishDatesAndOpen(page)
  await waitForPhotos(page)
  await expect(streetView(page)).toBeVisible()
  await inside('workbench')
})

test('a person who asked for less motion gets no transition on the links or on the helper', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFixtureSite(page)
  await waitForPhotos(page)
  const durations = await page
    .locator('a[href^="https://"], button')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).transitionDuration))
  expect(durations.length).toBeGreaterThan(5)
  for (const d of durations) expect(d.split(',').every((x) => parseFloat(x) < 0.001)).toBe(true)
})

test('the outline step and the workbench pass axe in both themes with the box showing', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page, 1000)
  await expect(streetView(page)).toBeVisible()
  await axeInBothThemes(page, 'outline step')
  await finishDatesAndOpen(page)
  await waitForPhotos(page)
  await expect(streetView(page)).toBeVisible()
  await what(page).fill('Roof is new')
  await helper(page).click() // the helper's own state is on show too
  await axeInBothThemes(page, 'workbench')
})

test('the helper fills an empty note with "Street View, " and leaves the date to be typed after it; the kind stays', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const panel = notesOf(page)
  const unsure = panel.getByRole('radio', { name: flow.notes.kinds.unsure, exact: true })
  await unsure.check()
  await helper(page).click()
  await expect(what(page)).toHaveValue('Street View, ')
  await expect(what(page)).toBeFocused()
  // The caret is after the phrase, so the next thing typed is the date Google's page shows.
  await page.keyboard.type('March 2023: a new wall')
  await expect(what(page)).toHaveValue('Street View, March 2023: a new wall')
  await expect(unsure).toBeChecked()
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expect(panel.getByRole('listitem')).toContainText('Street View, March 2023: a new wall')
  const id = page.url().split('/i/')[1]!.split(/[?#/]/)[0]!
  await expect
    .poll(async () =>
      ((await readStored(page, id)).notes as Array<{ kind: string; body: string }>).map((n) => [
        n.kind,
        n.body,
      ]),
    )
    .toEqual([['unsure', 'Street View, March 2023: a new wall']])
})

test('the helper keeps what is already typed and adds the phrase on a new line', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await what(page).fill('Roof is new')
  await helper(page).click()
  await expect(what(page)).toHaveValue('Roof is new\nStreet View, ')
  await expect(what(page)).toBeFocused()
  await page.keyboard.type('Nov 2024')
  await expect(what(page)).toHaveValue('Roof is new\nStreet View, Nov 2024')
  await expect(notesOf(page).getByText(flow.notes.count(33), { exact: true })).toBeVisible()
})

test('the helper keeps the 2000-character cap: off when the phrase would not fit, and filling to the last character', async ({
  page,
}) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await what(page).fill('x'.repeat(1987))
  await expect(helper(page)).toBeDisabled()
  await what(page).fill('x'.repeat(1986))
  await expect(helper(page)).toBeEnabled()
  await helper(page).click()
  await expect(what(page)).toHaveValue(`${'x'.repeat(1986)}\nStreet View, `)
  await expect(notesOf(page).getByText(flow.notes.count(2000), { exact: true })).toBeVisible()
  await expect(helper(page)).toBeDisabled()
})

test("the report prints the note as the person's own words, escaped, and not as a link", async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await helper(page).click()
  await expect(what(page)).toBeFocused() // the box takes the focus once the phrase is in it
  await page.keyboard.type('March 2023 <b>new</b> wall')
  await notesOf(page).getByRole('button', { name: flow.notes.add }).click()
  await expect(notesOf(page).getByRole('listitem')).toContainText('Street View, March 2023 <b>new</b> wall')
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const frame = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(frame.locator('h1')).toBeVisible({ timeout: 30_000 })
  const note = frame.locator('p.note')
  await expect(note).toHaveText('Street View, March 2023 <b>new</b> wall')
  await expect(note.locator('b')).toHaveCount(0) // escaped: text, not markup
  await expect(note.locator('a')).toHaveCount(0)
  await expect(frame.locator('a[href*="google"]')).toHaveCount(0) // nothing in the report links to Google
})
