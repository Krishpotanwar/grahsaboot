import { writeFileSync } from 'node:fs'
import { SAT_IDS, UPSTREAM } from '../worker/tle.ts'

// Run it by hand, at most once every 2 h: CelesTrak answers a repeat download with 403. It is not part of `npm run deploy` for that reason.
const res = await fetch(UPSTREAM, { headers: { 'user-agent': 'GrahSaboot/1.0' } })
if (!res.ok) throw new Error(`CelesTrak answered ${res.status}; the snapshot is unchanged`)
const all = (await res.json()) as Array<{ NORAD_CAT_ID?: number }>
const subset = Array.isArray(all) ? all.filter((o) => SAT_IDS.includes(Number(o.NORAD_CAT_ID))) : []
if (subset.length !== SAT_IDS.length)
  throw new Error(`Found ${subset.length} of ${SAT_IDS.length} satellites; the snapshot is unchanged`)
writeFileSync(new URL('../public/tle-snapshot.json', import.meta.url), JSON.stringify(subset))
console.log(`public/tle-snapshot.json: ${subset.length} satellites`)
