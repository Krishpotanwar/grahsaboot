import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogUrl, sha256Hex } from '../src/evidence/index.ts'
import type { LonLat } from '../src/evidence/types.ts'

const SQUARE: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
const id = new URLSearchParams(location.search).get('item')!
const el = document.getElementById('out')!
try {
  const it = await (
    await fetch(`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${id}`)
  ).json()
  const out: Record<string, unknown> = { item: it.id }
  for (const [key, samples] of [
    ['scl', [0]],
    ['visual', [0, 1, 2]],
  ] as const) {
    const asset = { transform: it.assets[key]['proj:transform'], shape: it.assets[key]['proj:shape'] }
    const cog = await openCogUrl(it.assets[key].href)
    const lvl = levelInfoFor(asset, cog, 0)
    const win = aoiPixelWindow(
      aoiPointsUtm({ kind: 'site', rings: [SQUARE] }, it.properties['proj:epsg']),
      lvl,
      2,
    )!.clamped
    out[`${key}Window`] = win
    out[`${key}Sha`] = await sha256Hex(await cog.read(0, win, [...samples]))
  }
  el.textContent = JSON.stringify(out)
} catch (e) {
  el.textContent = `ERROR ${(e as Error).message}`
}
