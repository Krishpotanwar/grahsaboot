import { expect, test } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

test.use({ viewport: { width: 1440, height: 900 } })

// Fixture orbits have epoch 2026-10-04. At this instant Sentinel-2B is the first to look at Nagpur (9 Oct 05:23 UTC) and the map
// holds three satellites on the near side of the globe (centred on India) and two on the far side.
const NOW = new Date('2026-10-05T05:40:00Z')
const ACCENT = 'rgb(228, 132, 68)'

test('lists the five satellites with live positions', async ({ page }) => {
  await page.goto('/?tier=0')
  const panel = page.getByRole('region', { name: copy.sats.title })
  for (const name of ['Sentinel-2A', 'Sentinel-2B', 'Sentinel-2C', 'Landsat 8', 'Landsat 9'])
    await expect(panel.getByText(name)).toBeVisible()
  await expect(panel.getByText(/\d+\.\d°[NS] \d+\.\d°[EW]/).first()).toBeVisible()
})

test('shows an estimated next look after picking a place, with its satellite in accent', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  const panel = page.getByRole('region', { name: copy.sats.title })
  await expect(panel.getByText(/^Next look at/)).toBeVisible()
  await expect(panel.getByText(copy.sats.estimated)).toBeVisible()
  await expect(panel.getByText(/^Sentinel-2B · /)).toBeVisible()
  await expect(panel.getByRole('rowheader', { name: 'Sentinel-2B' })).toHaveCSS('color', ACCENT)
  await expect(panel.getByRole('rowheader', { name: 'Sentinel-2A' })).not.toHaveCSS('color', ACCENT)
})

test('stays calm when CelesTrak data is unavailable', async ({ page }) => {
  await page.route('**/tle', (r) => r.fulfill({ status: 503, body: '{}' }))
  await page.goto('/?tier=0')
  await expect(page.getByText(copy.sats.unavailable)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('theme switch keeps satellite map layers', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))),
    'no WebGL2',
  )
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getSource('gs-sat-track'))
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(
    () =>
      (window as any).__gs.map.getStyle().layers.find((l: any) => l.id === 'bg')?.paint?.[
        'background-color'
      ] === '#FFFFFF',
  )
  await page.waitForFunction(
    () =>
      !!(window as any).__gs.map.getSource('gs-sat-track') &&
      !!(window as any).__gs.map.getLayer('gs-sat-swath'),
  )
})

// Approved mockup (01-landing): glyph + name markers hidden on the far side, dashed tracks, next-pass track in accent, place pin.
test('marks satellites, hides the far side, draws the next-pass track in accent and pins the place', async ({
  page,
}) => {
  await page.clock.setFixedTime(NOW)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(
    !(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))),
    'no WebGL2',
  )
  const markers = page.locator('.sat-marker')
  await expect(markers).toHaveCount(5)
  await expect(markers).toHaveText(['Sentinel-2A', 'Sentinel-2B', 'Sentinel-2C', 'Landsat 8', 'Landsat 9'])
  await expect(markers.first()).toHaveAttribute('aria-hidden', 'true')
  await expect(markers.first().locator('svg')).toHaveCount(1)
  await expect
    .poll(() => markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.opacity)))
    .toEqual(['1', '1', '0', '0', '1'])

  const paint = () =>
    page.evaluate(() => {
      const m = (window as any).__gs.map
      return ['line-dasharray', 'line-width', 'line-color'].map((k) => m.getPaintProperty('gs-sat-track', k))
    })
  await page.waitForFunction(() => !!(window as any).__gs.map.getSource('gs-sat-track'))
  expect(await paint()).toEqual([
    [3, 3],
    ['case', ['get', 'hot'], 1.6, 1.1],
    ['case', ['get', 'hot'], '#e48444', 'rgba(244,244,245,0.6)'],
  ])

  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect(page.locator('.place-pin')).toHaveText(copy.search.coordsResult(21.1458, 79.0882))
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__gs.map
          .getStyle()
          .sources['gs-sat-track'].data.features.filter((f: any) => f.properties.hot)
          .map((f: any) => f.properties.norad),
      ),
    )
    .toEqual([42063])
})
