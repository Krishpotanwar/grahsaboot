// P13: do the live OpenFreeMap styles still have the layers src/map/readable.ts patches? Compares layer ids and types with the
// vendored copies in tests/fixtures/styles. A warning, never a build failure: run it at the start of a work session and before a
// deploy that touches maps. Refresh a vendored file when you accept a change: curl -s <url> -o tests/fixtures/styles/<name>.json
import { readFileSync } from 'node:fs'

const STYLES = { dark: 'https://tiles.openfreemap.org/styles/dark', positron: 'https://tiles.openfreemap.org/styles/positron' }
let drift = false
for (const [name, url] of Object.entries(STYLES)) {
  const live = (await (await fetch(url)).json()) as { layers: Array<{ id: string; type: string }> }
  const kept = JSON.parse(readFileSync(new URL(`../../tests/fixtures/styles/${name}.json`, import.meta.url), 'utf8')) as typeof live
  const was = new Map(kept.layers.map((l) => [l.id, l.type]))
  const now = new Map(live.layers.map((l) => [l.id, l.type]))
  const gone = [...was.keys()].filter((id) => !now.has(id))
  const added = [...now.keys()].filter((id) => !was.has(id))
  const retyped = [...was].filter(([id, t]) => now.has(id) && now.get(id) !== t).map(([id]) => id)
  if (gone.length || added.length || retyped.length) drift = true
  console.log(`${name}: ${gone.length} gone ${JSON.stringify(gone)}, ${added.length} added ${JSON.stringify(added)}, ${retyped.length} retyped ${JSON.stringify(retyped)}`)
}
console.log(drift ? 'P13 WARNING: the live styles moved; check src/map/readable.ts against them.' : 'P13 ok: no layer id or type moved.')
