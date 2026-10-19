// E3b real-data check (scratch grade, kept for the record): the satellite view of the outline step against the REAL services (STAC,
// the public COGs, OpenFreeMap), on a hook build at tier 2. Build and serve it first, then run this once:
//   VITE_TEST_HOOKS=1 VITE_ACCOUNTS=0 npx vite build --outDir <tmp> --emptyOutDir && npx vite preview --outDir <tmp> --port 4190
//   BASE=http://localhost:4190 npx tsx scripts/probe-e/context-view.mts [measure|shots|ui|throttled]    (default: measure, shots, ui)
//
// measure: for each place and each view (zoom 15, 14, 13 on a 1440 px laptop), a cold browser context presses Satellite and reports
//   the time to the picture, when each stage word appeared, the bytes of the STAC and COG requests, the long tasks (over 50 ms) from
//   the press to two seconds after the picture, and the JS heap before and after (after a garbage collection).
// shots: dark and light, map and satellite, at zoom 13, 15 and 17 with an outline drawn on top (docs/screenshots/phase-e/e3-*.png).
// ui: the whole outline step with the view on, off and loading, at 1440 and 390 px.
// throttled (P16): the same measurement as `measure` for three views, on a phone-sized screen and a laptop one, with the network held to
//   4G (1.6 Mbit/s down, 150 ms round trip, one pipe shared by every request, the Lighthouse mobile preset) and the page's main thread
//   four times slower. The bytes still come over the VM's own link first and are then held back, so this is slower than 4G, never faster;
//   the imagery worker's own CPU is NOT slowed (CDP throttles the main thread only). A real phone is still needed to decide.
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'

const BASE = process.env.BASE ?? 'http://localhost:4190'
const OUT = fileURLToPath(new URL('../../docs/screenshots/phase-e/', import.meta.url)) // not .pathname: the folder name has spaces
const PLACES = [
  { id: 'airport', name: 'Navi Mumbai airport', lat: 18.99135, lon: 73.06575 },
  { id: 'village', name: 'Village near Nagpur', lat: 21.0463, lon: 79.2615 },
]
const what = process.argv[2] ?? 'all'
const THROTTLE = what === 'throttled'
type W = Window & { __gs: { map: any }; __long: Array<{ start: number; ms: number }> }

const launch = () => chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const BYTES_PER_MS = 1.6e6 / 8 / 1000
const RTT_MS = 150
async function throttle(ctx: BrowserContext) {
  let linkFree = 0 // when the one shared pipe is free again
  await ctx.route('**/*', async (route) => {
    const resp = await route.fetch()
    const body = await resp.body()
    const now = Date.now()
    linkFree = Math.max(now, linkFree) + body.length / BYTES_PER_MS
    await sleep(Math.max(0, linkFree + RTT_MS - now))
    await route.fulfill({ response: resp, body })
  })
}
async function open(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport })
  if (THROTTLE) await throttle(ctx)
  await ctx.addInitScript(() => {
    localStorage.setItem('gs-tier-override', '2')
    ;(window as unknown as W).__long = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        (window as unknown as W).__long.push({ start: e.startTime, ms: e.duration })
    }).observe({ type: 'longtask', buffered: true })
  })
  const page = await ctx.newPage()
  if (THROTTLE) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
  return { ctx, page }
}
async function goTo(page: Page, p: (typeof PLACES)[number], zoom: number) {
  await page.goto(`${BASE}/new?tier=2&lat=${p.lat}&lon=${p.lon}&name=${encodeURIComponent(p.name)}`)
  await page.getByRole('heading', { name: flow.outline.title }).waitFor()
  await page.waitForFunction(() => (window as unknown as W).__gs?.map?.isStyleLoaded())
  await jump(page, p, zoom)
}
const jump = (page: Page, p: (typeof PLACES)[number], zoom: number) =>
  page.evaluate(
    ([lon, lat, z]) =>
      (window as unknown as W).__gs.map.jumpTo({ center: [lon, lat], zoom: z, pitch: 0, bearing: 0 }),
    [p.lon, p.lat, zoom] as const,
  )
const satellite = (page: Page) => page.getByRole('radio', { name: /^Satellite · about/ })
const statusText = (page: Page) =>
  page
    .getByRole('status')
    .allInnerTexts()
    .then((t) => t.join(' | ').trim())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Resident memory (MB) of every process the browser has, by kind (renderer, gpu, browser, utility), read from /proc. */
async function rss(browser: Browser) {
  const cdp = await browser.newBrowserCDPSession()
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
  await cdp.detach()
  const by: Record<string, number> = {}
  for (const p of processInfo) {
    const kb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${p.id}/status`, 'utf8'))?.[1] ?? 0)
    by[p.type] = (by[p.type] ?? 0) + kb / 1024
  }
  return by
}
const total = (by: Record<string, number>) => Object.values(by).reduce((a, b) => a + b, 0)
const delta = (a: Record<string, number>, b: Record<string, number>) =>
  Object.fromEntries(
    Object.keys({ ...a, ...b }).map((k) => [k, Math.round(((b[k] ?? 0) - (a[k] ?? 0)) * 10) / 10]),
  )

async function measure(
  browser: Browser,
  p: (typeof PLACES)[number],
  zoom: number,
  viewport = { width: 1440, height: 900 },
) {
  const { ctx, page } = await open(browser, viewport)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    const m = (await cdp.send('Performance.getMetrics')).metrics
    return m.find((x) => x.name === 'JSHeapUsedSize')!.value
  }
  const net: Array<{ kind: string; bytes: number }> = []
  page.on('requestfinished', async (r) => {
    const u = r.url()
    const kind = /earth-search|planetarycomputer.microsoft.com\/api/.test(u)
      ? 'stac'
      : /sentinel-cogs|sentinel2l2a01|e84-earth-search/.test(u)
        ? 'cog'
        : 'other'
    const s = await r.sizes().catch(() => null)
    if (s) net.push({ kind, bytes: s.responseBodySize + s.responseHeadersSize })
  })
  await goTo(page, p, zoom)
  await satellite(page).waitFor()
  await page.waitForFunction(
    () => !(document.querySelector('input[value="satellite"]') as HTMLInputElement).disabled,
    null,
    { timeout: 60_000 },
  )
  await sleep(4000) // the map's own tiles settle first
  const view = await page.evaluate(() => {
    const b = (window as unknown as W).__gs.map.getBounds()
    const km =
      (b.getEast() - b.getWest()) * 111.19 * Math.cos(((b.getNorth() + b.getSouth()) / 2) * (Math.PI / 180))
    return {
      widthKm: Math.round(km * 10) / 10,
      heightKm: Math.round((b.getNorth() - b.getSouth()) * 111.19 * 10) / 10,
    }
  })
  const h0 = await heap()
  const r0 = await rss(browser)
  net.length = 0
  const p0 = await page.evaluate(() => performance.now())
  const t0 = Date.now()
  await satellite(page).check()
  const stages: Record<string, number> = {}
  let last = ''
  for (;;) {
    const t = await statusText(page)
    for (const [k, w] of Object.entries(flow.context.stages))
      if (t.includes(w) && !(k in stages)) stages[k] = Date.now() - t0
    // the picture, a line saying there is none, or an alert: the load is over
    if (
      /Satellite view · Sentinel-2|No recent photo/.test(t) ||
      (await page.getByRole('alert').count()) > 0
    ) {
      last = t
      break
    }
    if (Date.now() - t0 > 100_000) break
    await sleep(100)
  }
  const ms = Date.now() - t0
  const alert = await page.getByRole('alert').allInnerTexts()
  await sleep(2000)
  const h1 = await heap()
  const r1 = await rss(browser)
  const long = (await page.evaluate(() => (window as unknown as W).__long)).filter(
    (e) => e.start >= p0 && e.ms > 50,
  )
  const sum = (kind: string) => net.filter((n) => n.kind === kind).reduce((s, n) => s + n.bytes, 0)
  const result = {
    place: p.id,
    zoom,
    viewport: `${viewport.width}x${viewport.height}`,
    throttled: THROTTLE,
    view,
    ms,
    stages,
    status: last,
    alert,
    stacBytes: sum('stac'),
    cogBytes: sum('cog'),
    stacAndCogMB: Math.round(((sum('stac') + sum('cog')) / 1e6) * 100) / 100,
    otherBytes: sum('other'),
    requests: net.length,
    longTasks: long,
    heapBeforeMB: Math.round(h0 / 1e5) / 10,
    heapAfterMB: Math.round(h1 / 1e5) / 10,
    heapDeltaMB: Math.round((h1 - h0) / 1e5) / 10,
    rssDeltaMB: Math.round((total(r1) - total(r0)) * 10) / 10,
    rssDeltaByKind: delta(r0, r1),
  }
  console.log(JSON.stringify(result))
  await ctx.close()
  return result
}

async function draw(page: Page) {
  const clear = page.getByRole('button', { name: flow.outline.redraw })
  await clear.click()
  const b = (await page.locator('.map-stage canvas').boundingBox())!
  const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2]
  for (const [dx, dy] of [
    [-110, -90],
    [110, -90],
    [110, 90],
    [-110, 90],
    [-110, -90],
  ])
    await page.mouse.click(cx + dx!, cy + dy!)
}
async function settle(page: Page, ms = 2500) {
  await page.waitForFunction(() => (window as unknown as W).__gs.map.isStyleLoaded())
  await sleep(ms)
}
const toggleTheme = async (page: Page) => {
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await sleep(500)
  await settle(page)
}

async function shots(browser: Browser, p: (typeof PLACES)[number]) {
  const { ctx, page } = await open(browser)
  await goTo(page, p, 13)
  await page.waitForFunction(
    () => !(document.querySelector('input[value="satellite"]') as HTMLInputElement).disabled,
    null,
    {
      timeout: 60_000,
    },
  )
  await sleep(3000)
  const t0 = Date.now()
  await satellite(page).check()
  await page.getByText(/^Satellite view · Sentinel-2/).waitFor({ timeout: 100_000 })
  console.log(`${p.id}: picture after ${Date.now() - t0} ms: ${await statusText(page)}`)
  const take = async (theme: string, mode: string) => {
    for (const z of [13, 15, 17]) {
      await jump(page, p, z)
      await settle(page, 1500)
      await draw(page)
      await settle(page, 1500)
      const b = (await page.locator('.map-stage').boundingBox())!
      const path = `${OUT}e3-${p.id}-${theme}-${mode}-z${z}.png`
      await page.screenshot({
        path,
        clip: { x: b.x + (b.width - 640) / 2, y: b.y + (b.height - 640) / 2, width: 640, height: 640 },
      })
      console.log(`  ${path.replace(OUT, '')}`)
    }
  }
  const first = await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')
  const other = first === 'dark' ? 'light' : 'dark'
  await take(first, 'satellite')
  await toggleTheme(page)
  await take(other, 'satellite')
  await page.getByRole('radio', { name: flow.context.map, exact: true }).check()
  await settle(page)
  await take(other, 'map')
  await toggleTheme(page)
  await take(first, 'map')
  await ctx.close()
}

async function ui(browser: Browser) {
  const p = PLACES[1]!
  for (const [width, height, theme] of [
    [1440, 900, 'dark'],
    [390, 844, 'light'],
  ] as const) {
    const { ctx, page } = await open(browser, { width, height })
    await ctx.addInitScript((t) => localStorage.setItem('gs-theme', t), theme)
    await goTo(page, p, 14)
    await page.waitForFunction(
      () => !(document.querySelector('input[value="satellite"]') as HTMLInputElement).disabled,
      null,
      {
        timeout: 60_000,
      },
    )
    await sleep(3000)
    await page.screenshot({ path: `${OUT}e3-ui-${width}-${theme}-off.png` })
    await satellite(page).check()
    await sleep(2500)
    await page.screenshot({ path: `${OUT}e3-ui-${width}-${theme}-loading.png` })
    await page.getByText(/^Satellite view · Sentinel-2/).waitFor({ timeout: 100_000 })
    await sleep(2500)
    await page.screenshot({ path: `${OUT}e3-ui-${width}-${theme}-on.png` })
    console.log(`ui ${width} ${theme}: ${await statusText(page)}`)
    await ctx.close()
  }
}

mkdirSync(OUT, { recursive: true })
const browser = await launch()
try {
  if (what === 'all' || what === 'measure')
    for (const p of PLACES) for (const z of [15, 14, 13]) await measure(browser, p, z)
  if (THROTTLE)
    for (const [p, z, v] of [
      [PLACES[0]!, 15, { width: 390, height: 844 }],
      [PLACES[1]!, 15, { width: 390, height: 844 }],
      [PLACES[1]!, 13, { width: 390, height: 844 }],
      [PLACES[1]!, 13, { width: 1440, height: 900 }],
    ] as const)
      await measure(browser, p, z, v)
  if (what === 'all' || what === 'shots') for (const p of PLACES) await shots(browser, p)
  if (what === 'all' || what === 'ui') await ui(browser)
} finally {
  await browser.close()
}
