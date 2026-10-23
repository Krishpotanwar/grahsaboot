import { expect, test, type Page } from '@playwright/test'
import { LOAD_MB } from '../../src/explore/cost.ts'
import { copy } from '../../src/ui/copy.ts'
import { explore } from '../../src/ui/copy-explore.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import {
  openFixtureRoad,
  openFixtureSite,
  startAt,
  tabKey,
  waitForPhotos,
  waitForSettled,
} from './helpers.ts'

// What axe cannot see (the axe sweeps of every screen live beside the screens' own specs: shell, new-outline, new-create,
// search, workbench, timeline, workbench-map, report): where the keyboard starts, how a person who asked for less motion is
// treated, and whether every control can be pressed with a thumb.

const skipLink = (page: Page) => page.getByRole('link', { name: copy.common.skip })

/** On a freshly loaded page the first Tab press lands on the skip link: the way past the header to the content. */
async function firstTabIsSkipLink(page: Page) {
  await expect(page.locator('main')).toBeVisible()
  await page.keyboard.press(tabKey(page))
  await expect(skipLink(page)).toBeFocused()
}

test('the first Tab stop is the skip link on every screen, and it leads to the content', async ({ page }) => {
  await page.goto('/?tier=0')
  await firstTabIsSkipLink(page)
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()

  for (const path of ['/limits?tier=0', '/privacy?tier=0', '/nowhere?tier=0']) {
    await page.goto(path)
    await firstTabIsSkipLink(page)
  }

  await startAt(page)
  await page.reload()
  await firstTabIsSkipLink(page)

  await openFixtureSite(page)
  await waitForPhotos(page)
  const workbench = page.url()
  await page.reload()
  await firstTabIsSkipLink(page)

  await page.goto(`${workbench.split('?')[0]}/report?tier=0`)
  await expect(page.frameLocator(`iframe[title="${flow.report.title}"]`).locator('h1')).toBeVisible({
    timeout: 30_000,
  })
  await page.reload()
  await firstTabIsSkipLink(page)
})

test('a person who asked for less motion gets no transitions, and the swipe handle jumps to its notch', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFixtureSite(page)
  await waitForPhotos(page)
  // The stylesheet's rule: every transition and animation is cut to nothing.
  const durations = await page
    .locator('button, a[href]')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).transitionDuration))
  expect(durations.length).toBeGreaterThan(5)
  for (const d of durations) expect(d.split(',').every((x) => parseFloat(x) < 0.001)).toBe(true)
  // Nothing keeps moving: every animation the page started has ended (a pulse would run for ever without the rule).
  const swipe = page.getByRole('slider', { name: flow.workbench.swipeLabel })
  await swipe.focus()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length))
    .toBe(0)
})

/**
 * Every control a thumb has to press is 44 by 44 CSS px, counting the label it sits in and the area a small button's ::after
 * adds. Exempt, and why: the skip link (visually hidden until focused, then large), the native range of the timeline (a
 * 1 px screen-reader and keyboard control: the pointer's target is the barcode, a 44 px row, and focus draws a ring on it).
 */
async function offenders(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    const sel = 'button, a[href], input, select, textarea, summary, [role=slider]'
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue
      if (el.matches('a[href="#main"], a.sr-only, [class*="sr-only"]')) continue
      let w = r.width
      let h = r.height
      const label = el.closest('label')
      if (label) {
        const lr = label.getBoundingClientRect()
        w = Math.max(w, lr.width)
        h = Math.max(h, lr.height)
      }
      const after = getComputedStyle(el, '::after')
      if (after.position === 'absolute' && after.content !== 'none' && after.left.startsWith('-')) {
        w = r.width + Math.abs(parseFloat(after.left)) + Math.abs(parseFloat(after.right) || 0)
        h = r.height + Math.abs(parseFloat(after.top)) + Math.abs(parseFloat(after.bottom) || 0)
      }
      // a link inside a sentence is exempt (WCAG 2.5.8 inline exception)
      const inline = el.tagName === 'A' && el.closest('p, li') && getComputedStyle(el).display === 'inline'
      if (inline) continue
      if (w < 43.5 || h < 43.5)
        out.push(
          `${el.tagName.toLowerCase()} ${Math.round(w)}x${Math.round(h)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"`,
        )
    }
    return out
  })
}

for (const [name, size] of [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`every control on the home page, the workbench and the report is 44 px or more (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await page.goto('/?tier=0')
    expect(await offenders(page), 'home page').toEqual([])
    await page.goto('/limits?tier=0')
    expect(await offenders(page), 'limits page').toEqual([])

    await openFixtureRoad(page)
    await waitForSettled(page)
    // the timeline's native range is 1 px on purpose (see above): nothing else may be small
    const small = (await offenders(page)).filter((o) => !o.includes('Satellite pass'))
    expect(small, 'road workbench').toEqual([])

    await page.getByRole('link', { name: flow.workbench.report }).click()
    await expect(page.frameLocator(`iframe[title="${flow.report.title}"]`).locator('h1')).toBeVisible({
      timeout: 30_000,
    })
    expect(await offenders(page), 'report screen').toEqual([])
  })
}

// The time-lapse page: the start screen, then the player with its buttons, slider and links, on both sizes of screen.
for (const [name, size] of [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`every control on the time-lapse page is 44 px or more, before and after the load (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await page.goto('/explore?lat=21.148&lon=79.0863&name=Test%20square&now=2032-03-10')
    await expect(page.getByRole('button', { name: explore.load(LOAD_MB) })).toBeVisible()
    expect(await offenders(page), 'start screen').toEqual([])
    await page.getByRole('button', { name: explore.load(LOAD_MB) }).click()
    await expect(page.locator('main p[role="status"]')).toHaveText(explore.loaded(6, 6), { timeout: 30_000 })
    await page.getByRole('button', { name: explore.pause, exact: true }).click()
    expect(await offenders(page), 'player').toEqual([])
  })
}
