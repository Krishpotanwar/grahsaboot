import { createHash } from 'node:crypto'
import { ASSET_HOSTS, config } from '../src/config.ts'

// The page's content security policy, built from what the code really talks to (src/config.ts: its defaults and ASSET_HOSTS),
// so a new host in the code is a new host here, in one place. Pure: scripts/write-headers.ts writes it to dist/_headers after
// the build, scripts/check-csp.ts holds a built dist to it, tests/unit/csp.test.ts runs it on synthetic pages.

const origin = (u: string) => new URL(u.replace(/\{[xyz]\}/g, '0')).origin

/** Where the browser fetches data from. Each entry says what for. */
const CONNECT = [
  origin(config.stacUrl), // Earth Search STAC
  origin(config.pcStacUrl), // Planetary Computer STAC and its SAS token endpoint (same origin)
  ...ASSET_HOSTS.map((h) => `https://${h}`), // the Sentinel-2 COGs, read by the imagery worker
  origin(config.nominatimUrl), // place search
  origin(config.styleDark), // OpenFreeMap style, vector tiles, sprites and glyphs
  origin(config.gibsTiles), // NASA GIBS base imagery
  origin(config.terrainTiles), // terrain tiles
]
const IMG = [...new Set([origin(config.styleDark), origin(config.gibsTiles), origin(config.terrainTiles)])]

export interface CspOptions {
  /** `'sha256-...'` entries of the page's inline scripts. */
  scriptHashes: string[]
  /** The Supabase project's origin: only in a build with accounts. */
  supabaseOrigin?: string | null
}

export function buildCsp({ scriptHashes, supabaseOrigin = null }: CspOptions): string {
  const connect = [...new Set([...CONNECT, ...(supabaseOrigin ? [supabaseOrigin] : [])])]
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((h) => `'${h}'`).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMG.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ')
}

/** The `_headers` file of Cloudflare's static assets: these headers for every asset. */
export function buildHeaders(opts: CspOptions): string {
  return [
    '/*',
    '  X-Content-Type-Options: nosniff',
    // Nominatim's policy wants a Referer that names the app: the origin goes cross-origin, nothing more.
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(self)',
    `  Content-Security-Policy: ${buildCsp(opts)}`,
    '',
  ].join('\n')
}

/** `sha256-<base64>` of every inline script of a page that runs (a data block of another type does not need one). */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? ''
    if (/\bsrc\s*=/.test(attrs)) continue
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue
    out.push(
      `sha256-${createHash('sha256')
        .update(m[2] ?? '')
        .digest('base64')}`,
    )
  }
  return out
}

/** The CSP value of a `_headers` file, or null. */
export const cspOf = (headers: string) =>
  /^\s*Content-Security-Policy:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null

/**
 * What is wrong with a built `_headers` next to its page, or [] when it holds: every inline script is allowed by hash (a
 * hash that went stale after the page changed is the failure this exists for), nothing is wildcarded or `unsafe-eval`,
 * the rejected headers are absent, and only a build with accounts names the project's origin (exactly one).
 */
export function cspProblems(
  headers: string | null,
  html: string,
  opts: { accounts: boolean; supabaseOrigin?: string | null },
): string[] {
  if (headers === null)
    return ['dist/_headers is missing: run the build (it writes it with scripts/write-headers.ts).']
  const problems: string[] = []
  const csp = cspOf(headers)
  if (!csp) return ['_headers has no Content-Security-Policy line.']
  const directive = (name: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `))
      ?.split(/\s+/)
      .slice(1) ?? []
  const script = directive('script-src')
  for (const h of inlineScriptHashes(html))
    if (!script.includes(`'${h}'`))
      problems.push(`script-src has no '${h}' for an inline script of index.html: the page would not start.`)
  for (const [name, values] of [
    ['script-src', script],
    ['connect-src', directive('connect-src')],
  ] as const) {
    if (values.some((v) => v === '*' || v.includes('*'))) problems.push(`${name} has a wildcard.`)
    if (values.includes("'unsafe-eval'") || values.includes("'unsafe-inline'"))
      problems.push(`${name} allows unsafe-eval or unsafe-inline.`)
  }
  if (directive('connect-src').includes('data:'))
    problems.push('connect-src has data: (the photo reaches the map as decoded pixels, not as a data: URL).')
  if (/frame-ancestors/i.test(headers))
    problems.push('frame-ancestors is ruled out (the site may be embedded).')
  if (/Cross-Origin-Opener-Policy/i.test(headers)) problems.push('Cross-Origin-Opener-Policy is ruled out.')
  if (/eox\.at/i.test(headers)) problems.push('an EOX host: the app does not use it (least privilege).')
  if (!/^\s*X-Content-Type-Options:\s*nosniff\s*$/im.test(headers))
    problems.push('X-Content-Type-Options: nosniff is missing.')
  const supa = headers.match(/https?:\/\/[^\s;]*supabase[^\s;]*/gi) ?? []
  if (!opts.accounts && (supa.length || /supabase/i.test(headers)))
    problems.push('a build without accounts names Supabase in its headers.')
  if (opts.accounts) {
    if (supa.length !== 1)
      problems.push(`a build with accounts names exactly one Supabase origin; found ${supa.length}.`)
    else if (opts.supabaseOrigin && supa[0] !== opts.supabaseOrigin)
      problems.push(`the Supabase origin is ${supa[0]}, not ${opts.supabaseOrigin}.`)
    if (!directive('connect-src').some((v) => v.startsWith('https://')))
      problems.push('connect-src has no https origins.')
  }
  return problems
}
