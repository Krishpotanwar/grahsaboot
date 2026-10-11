import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogUrl, sha256Hex } from '../src/evidence/index.ts'
import { readEnv } from './check-env.ts'

// Probe P3, the function half: one real `verify` call against the DEV project. Written, never run: it needs the dev project
// with the migrations applied, `verify` deployed to it and a test user (docs/ops/accounts.md). It talks to Supabase, to Earth
// Search and to the satellite archive, so nothing in `npm run check` or CI calls it.
// Browser variables come from .env.development.local, tooling variables from .env.local (as scripts/check-env.ts).
const dev = readEnv('.env.development.local')
const local = readEnv('.env.local')
const url = dev.VITE_SUPABASE_URL
const key = dev.VITE_SUPABASE_PUBLISHABLE_KEY
const email = local.DEV_TEST_EMAIL
const password = local.DEV_TEST_PASSWORD
const devRef = local.SUPABASE_DEV_REF
const unset = (v?: string) => !v || v.includes('<')
if (
  !existsSync('.env.development.local') ||
  !existsSync('.env.local') ||
  [url, key, email, password, devRef].some(unset)
) {
  console.error('accounts are not configured (see docs/ops/accounts.md)')
  process.exit(2)
}
// This script signs a test user up and writes a row: it must only ever talk to the DEV project.
if (!url!.startsWith(`https://${devRef}.`)) {
  console.error('VITE_SUPABASE_URL is not the dev project (SUPABASE_DEV_REF): refusing to run')
  process.exit(2)
}

const sb = createClient(url!, key!, { auth: { persistSession: false } })
let { error } = await sb.auth.signInWithPassword({ email: email!, password: password! })
if (error) {
  await sb.auth.signUp({ email: email!, password: password! })
  ;({ error } = await sb.auth.signInWithPassword({ email: email!, password: password! }))
  if (error) throw error
}

const ring: [number, number][] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
const ewkt = `SRID=4326;POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(',')}))`
const itemRes = await fetch(
  'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_44QLJ_20260512_0_L2A',
)
if (!itemRes.ok) {
  console.error(`item not found (${itemRes.status}): swap the item literal in this script for a recent one`)
  process.exit(2)
}
const item = await itemRes.json()
// the handler and the browser accept proj:epsg or proj:code
const epsg = item.properties['proj:epsg'] ?? Number(String(item.properties['proj:code']).replace('EPSG:', ''))
// verify checks only pinned dates, by the UTC date of the item (as the browser pins it).
const pinned = new Date(item.properties.datetime).toISOString().slice(0, 10)
const { data: inv, error: e1 } = await sb
  .from('investigations')
  .insert({
    name: 'smoke',
    kind: 'site',
    geom: ewkt,
    date_from: '2026-01-01',
    date_to: '2026-05-31',
    pinned: [pinned],
  })
  .select('id')
  .single()
if (e1) throw e1

try {
  const frames = []
  for (const [asset, level, samples] of [
    ['scl', 0, [0]],
    ['visual', 0, [0, 1, 2]],
  ] as const) {
    const a = { transform: item.assets[asset]['proj:transform'], shape: item.assets[asset]['proj:shape'] }
    const cog = await openCogUrl(item.assets[asset].href)
    const lvl = levelInfoFor(a, cog, level)
    const window = aoiPixelWindow(aoiPointsUtm({ kind: 'site', rings: [ring] }, epsg), lvl, 2)!.clamped
    frames.push({
      asset,
      level,
      window,
      sha256: await sha256Hex(await cog.read(level, window, [...samples])),
    })
  }
  const t0 = Date.now()
  const { data, error: e2 } = await sb.functions.invoke('verify', {
    body: { investigation_id: inv.id, item: { collection: 'sentinel-2-l2a', id: item.id }, frames },
  })
  const ms = Date.now() - t0
  // A non-2xx answer carries verify's static error code in the response the SDK hands back as `context`.
  const refusal = await e2?.context?.json?.().catch(() => null)
  const statuses: string[] | undefined = data?.frames?.map((f: { status: string }) => f.status)
  console.log(
    JSON.stringify({
      ms,
      error: e2?.message ?? null,
      code: refusal?.error ?? null,
      statuses,
      quality: data?.frames?.[0]?.quality?.label,
    }),
  )
  if (e2 || statuses?.length !== 2 || statuses.some((s) => s !== 'verified')) process.exitCode = 1
} finally {
  await sb.from('investigations').delete().eq('id', inv.id)
}
