import { gzipSync } from 'node:zlib'

// The rules behind scripts/check-bundle.ts, on a map of dist-relative path to bytes so tests need no build.
//
// Accounts are dormant (.superpowers/sdd/2026-10-05-grahsaboot-phase-d-backend/dormant-addendum.md): a build made without the
// flag must hold no accounts code, no Supabase bytes and none of their words. Text inside a .map is never scanned:
// `sourcesContent` carries the integration points' own text (loadAccounts, the loader). Only the map's `sources` paths are.

export type Files = Record<string, Uint8Array | string>
export interface Rules {
  /** The flag-on build (dist-accounts/): accounts code must exist, in a chunk the first page does not fetch. */
  accounts: boolean
  /** GS_ACCOUNTS_RELEASE=1: the plain dist/ is the deliberate activation build, so it is held to the flag-on rules. */
  release: boolean
  /** The VITE_CONTEXT_IMAGERY=0 build (dist-nocontext/): the satellite view is left out of it, bytes included. */
  noContext?: boolean
}

/** Which build a `check-bundle.ts` call is about, from its arguments: the folder it reads and the rules that folder is held to. */
export function targetFor(argv: string[], release = false): { name: string; rules: Rules } {
  const accounts = argv.includes('--accounts')
  const noContext = argv.includes('--no-context')
  return {
    name: accounts ? 'dist-accounts' : noContext ? 'dist-nocontext' : 'dist',
    rules: { accounts, release, noContext },
  }
}

/** Gzipped JS budget for what the browser fetches before the first render (index.html's module script and modulepreloads). */
export const BUDGET_KB = 150

const SENTINEL = 'Sign in with Google'
/** The marked stand-in in src/ui/copy-account.ts until the owner names the grievance contact (an activation blocker). */
const PLACEHOLDER = '[name and email of the grievance contact]'
/** A flag-off build holds none of these in any file the browser can load. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['"supabase" (a VITE_SUPABASE_* value from .env.local or the shell is baked into the build)', /supabase/i],
  [`the accounts copy ("${SENTINEL}")`, /Sign in with Google/],
  ['the auth storage key "gs-auth"', /gs-auth/],
  ['the consent storage key "gs-consent"', /gs-consent/],
]
const TEXT = /\.(?:m?js|html|css|json|svg|webmanifest|txt)$|(?:^|\/)_headers$/
/** The satellite picture's source and layer id (src/map/contextLayer.ts): a build without the view holds it nowhere. */
const CONTEXT_ID = 'gs-context'
/** Module paths (map `sources`) that are the satellite view. src/new/contextGate.ts is the folded condition and is in every build. */
const CONTEXT_SOURCE = /src\/context\/|src\/new\/(?:ContextToggle|contextState)|src\/map\/contextLayer/
/** Module paths (map `sources`) that are accounts code. src/accounts/enabled.ts is the one switch and is allowed everywhere. */
const ACCOUNTS_SOURCE = /src\/accounts\/(?!enabled\.ts)|\/@supabase\/|copy-account\.ts/

const text = (v: Uint8Array | string) => (typeof v === 'string' ? v : Buffer.from(v).toString('utf8'))
const bytes = (v: Uint8Array | string) => (typeof v === 'string' ? Buffer.from(v) : v)
const kb = (n: number) => (n / 1024).toFixed(1)

/** The files the first page loads: index.html's module script, then its modulepreloads (as dist-relative paths). */
export function entryFiles(files: Files): string[] {
  const html = text(files['index.html'] ?? '')
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
  const urls = (el: 'script' | 'link', key: string, value: string, from: string) =>
    (html.match(new RegExp(`<${el}\\b[^>]*>`, 'g')) ?? [])
      .filter((tag) => attr(tag, key) === value)
      .flatMap((tag) => attr(tag, from) ?? [])
  return [
    ...new Set([...urls('script', 'type', 'module', 'src'), ...urls('link', 'rel', 'modulepreload', 'href')]),
  ].map((u) => u.replace(/^\//, ''))
}

export const entrySizes = (files: Files) =>
  entryFiles(files).map((path) => ({
    path,
    gzip: path in files ? gzipSync(bytes(files[path]!)).length : 0,
  }))

/** `sources` of each map, or a problem for a map that cannot be read (fails closed). */
function mapSources(files: Files, problems: string[]): Array<{ map: string; js: string; sources: string[] }> {
  return Object.keys(files)
    .filter((p) => p.endsWith('.map'))
    .flatMap((map) => {
      try {
        const s = (JSON.parse(text(files[map]!)) as { sources?: unknown }).sources
        if (!Array.isArray(s) || !s.every((x) => typeof x === 'string')) throw new Error('no sources')
        return [{ map, js: map.slice(0, -4), sources: s as string[] }]
      } catch {
        problems.push(`${map} is not a readable source map, so it cannot be checked.`)
        return []
      }
    })
}

/** Every rule that fails for `files`; an empty list means the build is as it should be. */
export function bundleProblems(files: Files, rules: Rules): string[] {
  if (!files['index.html']) return ['index.html is missing from the build.']
  const entry = entrySizes(files)
  if (!entry.length) return ['index.html lists no <script type="module" src="...">.']
  const problems: string[] = []
  for (const e of entry)
    if (!(e.path in files)) problems.push(`${e.path} is listed in index.html but is not in the build.`)
  const total = entry.reduce((n, e) => n + e.gzip, 0)
  if (total > BUDGET_KB * 1024)
    problems.push(`entry JS is ${kb(total)} KB gzip, over the ${BUDGET_KB} KB budget.`)

  const maps = mapSources(files, problems)
  const inEntry = new Set(entry.map((e) => e.path))
  const accountsSources = (m: { sources: string[] }) => m.sources.filter((s) => ACCOUNTS_SOURCE.test(s))
  const sentinelFiles = Object.keys(files).filter(
    (p) => /\.(?:js|html)$/.test(p) && text(files[p]!).includes(SENTINEL),
  )

  if (rules.noContext) {
    for (const p of Object.keys(files).filter((p) => /\.(?:m?js|html)$/.test(p)))
      if (text(files[p]!).includes(CONTEXT_ID))
        problems.push(`${p} holds "${CONTEXT_ID}": the satellite view is in a build made without it.`)
    for (const m of maps) {
      const bad = m.sources.filter((src) => CONTEXT_SOURCE.test(src))
      if (bad.length)
        problems.push(
          `${m.map} lists the satellite view's code: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ', ...' : ''}`,
        )
    }
  }

  if (rules.accounts || rules.release) {
    // Flag-on: not vacuous (Supabase and the remote module are in a chunk), and none of it in the first page's files.
    const later = maps.filter((m) => !inEntry.has(m.js))
    const has = (re: RegExp) => later.some((m) => m.sources.some((s) => re.test(s)))
    if (!has(/\/@supabase\//) || !has(/src\/accounts\/remote\.ts/))
      problems.push(
        rules.accounts
          ? 'the accounts build has no accounts chunk (expected @supabase and src/accounts/remote.ts in a chunk outside the entry). Is the flag folded away?'
          : 'GS_ACCOUNTS_RELEASE=1 but dist/ holds no accounts chunk: this is a dormant build. Build with VITE_ACCOUNTS=1 and the Supabase URL and key.',
      )
    // Measured on rolldown 1.2.12 (the D8a report): the dynamic import keeps every export of src/accounts/index.ts, so the
    // accounts copy IS in the accounts chunk. Requiring it there also keeps SENTINEL, which the flag-off rules search for, in
    // step with src/ui/copy-account.ts: a reworded sign-in button fails here instead of silently blinding the dormant check.
    if (!sentinelFiles.some((p) => p !== 'index.html' && !inEntry.has(p)))
      problems.push(
        `no chunk of the accounts build holds the accounts copy ("${SENTINEL}"). If src/ui/copy-account.ts was reworded, change SENTINEL in scripts/bundle-rules.ts.`,
      )
    for (const m of maps.filter((m) => inEntry.has(m.js)))
      for (const s of accountsSources(m))
        problems.push(`${m.js} (loaded with the first page) holds accounts code: ${s}`)
    for (const p of sentinelFiles.filter((p) => inEntry.has(p) || p === 'index.html'))
      problems.push(`${p} (loaded with the first page) holds the accounts copy ("${SENTINEL}").`)
    // Only the deliberate activation build is held to it: the flag-on build a tester uses may still show the placeholder.
    if (rules.release)
      for (const p of Object.keys(files).filter((p) => TEXT.test(p)))
        if (text(files[p]!).includes(PLACEHOLDER))
          problems.push(
            `${p} holds the grievance contact placeholder ("${PLACEHOLDER}"). Name the contact in src/ui/copy-account.ts before an activation build (docs/ops/accounts-test.md).`,
          )
    return problems
  }

  // Flag-off: nothing of accounts anywhere.
  const onAccounts =
    sentinelFiles.length > 0 ||
    maps.some((m) => m.sources.some((s) => /\/@supabase\/|src\/accounts\/(?!enabled\.ts)/.test(s)))
  if (onAccounts)
    problems.unshift(
      'dist/ holds accounts code or its words. Either it was built with accounts ON (unset VITE_ACCOUNTS, VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_PUBLISHABLE_KEY: look in .env, .env.local, .env.production* and the shell), or a module imports ' +
        'src/accounts/* other than through src/accounts/enabled.ts. A plain build must be dormant. Only the deliberate ' +
        'activation build sets GS_ACCOUNTS_RELEASE=1 (docs/ops/accounts-test.md). Never `npm run deploy`: it must ship the dormant build.',
    )
  for (const p of Object.keys(files).filter((p) => TEXT.test(p))) {
    const t = text(files[p]!)
    for (const [label, re] of FORBIDDEN) if (re.test(t)) problems.push(`${p} contains ${label}.`)
  }
  for (const m of maps) {
    const bad = accountsSources(m)
    if (bad.length)
      problems.push(
        `${m.map} lists accounts code: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ', ...' : ''}`,
      )
  }
  return problems
}
