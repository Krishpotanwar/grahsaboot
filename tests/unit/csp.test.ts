import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ASSET_HOSTS, config } from '../../src/config.ts'
import { buildCsp, buildHeaders, cspOf, cspProblems, inlineScriptHashes } from '../../scripts/csp.ts'

const sha = (s: string) => `sha256-${createHash('sha256').update(s).digest('base64')}`
const THEME = "document.documentElement.dataset.theme='dark'"
const page = `<!doctype html><html><head><script>${THEME}</script><script type="module" crossorigin src="/assets/index-a.js"></script></head><body></body></html>`
const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co'
const dormant = (html = page) => buildHeaders({ scriptHashes: inlineScriptHashes(html) })
const withAccounts = (html = page) =>
  buildHeaders({ scriptHashes: inlineScriptHashes(html), supabaseOrigin: SUPABASE })

describe('inlineScriptHashes', () => {
  it('hashes the body of an inline script exactly, and skips a script with a src and a data block', () => {
    expect(inlineScriptHashes(page)).toEqual([sha(THEME)])
    const html = `${page}<script type="application/json" id="d">{"a":1}</script><script>var x=1</script>`
    expect(inlineScriptHashes(html)).toEqual([sha(THEME), sha('var x=1')])
  })
})

describe('buildCsp', () => {
  const csp = buildCsp({ scriptHashes: [sha(THEME)] })
  const directive = (name: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `))!

  it("allows exactly the hosts the code's defaults name, from src/config.ts", () => {
    const connect = directive('connect-src')
    for (const url of [
      config.stacUrl,
      config.pcStacUrl,
      config.pcSasUrl,
      config.nominatimUrl,
      config.styleDark,
      config.styleLight,
      config.gibsTiles,
      config.terrainTiles,
    ])
      expect(connect, url).toContain(new URL(url.replace(/\{[xyz]\}/g, '0')).origin)
    for (const h of ASSET_HOSTS) expect(connect).toContain(`https://${h}`)
    expect(connect).toContain("'self'")
  })

  it('has no data: in connect-src, no EOX host, no wildcard and no eval', () => {
    expect(directive('connect-src')).not.toContain('data:')
    expect(csp).not.toMatch(/eox\.at|\*|unsafe-eval/)
    expect(directive('script-src')).toBe(`script-src 'self' '${sha(THEME)}'`)
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('base-uri')).toBe("base-uri 'none'")
  })

  it('names the Supabase project only when it is given', () => {
    expect(csp).not.toMatch(/supabase/i)
    expect(buildCsp({ scriptHashes: [], supabaseOrigin: SUPABASE })).toContain(` ${SUPABASE}`)
  })
})

describe('cspProblems', () => {
  it('passes the build without accounts and the build with them', () => {
    expect(cspProblems(dormant(), page, { accounts: false })).toEqual([])
    expect(cspProblems(withAccounts(), page, { accounts: true, supabaseOrigin: SUPABASE })).toEqual([])
  })

  it('fails when the inline script changed after the hash was written', () => {
    const changed = page.replace(THEME, "document.documentElement.dataset.theme='light'")
    const problems = cspProblems(dormant(), changed, { accounts: false }).join('\n')
    expect(problems).toContain('script-src has no')
  })

  it('fails on a missing file, a missing CSP, a wildcard, frame-ancestors, COOP and an EOX host', () => {
    expect(cspProblems(null, page, { accounts: false }).join()).toContain('missing')
    expect(
      cspProblems('/*\n  X-Content-Type-Options: nosniff\n', page, { accounts: false }).join(),
    ).toContain('no Content-Security-Policy')
    const base = dormant()
    const bad = (extra: string) => cspProblems(`${base}${extra}\n`, page, { accounts: false }).join('\n')
    expect(bad('  Cross-Origin-Opener-Policy: same-origin')).toContain('Cross-Origin-Opener-Policy')
    expect(bad("  X-Frame: x\n  Content-Security-Policy: frame-ancestors 'none'")).toContain(
      'frame-ancestors',
    )
    expect(
      cspProblems(base.replace("connect-src 'self'", "connect-src 'self' https://*.example.org"), page, {
        accounts: false,
      }).join(),
    ).toContain('wildcard')
    expect(
      cspProblems(
        base.replace("connect-src 'self'", "connect-src 'self' data: https://tiles.maps.eox.at"),
        page,
        {
          accounts: false,
        },
      ).join('\n'),
    ).toMatch(/data:[\s\S]*EOX|EOX[\s\S]*data:/)
  })

  it('keeps Supabase out of the build without accounts and holds the one with accounts to a single origin', () => {
    expect(cspProblems(withAccounts(), page, { accounts: false }).join()).toContain('Supabase')
    expect(cspProblems(dormant(), page, { accounts: true }).join()).toContain('exactly one')
    expect(
      cspProblems(withAccounts(), page, {
        accounts: true,
        supabaseOrigin: 'https://other.supabase.co',
      }).join(),
    ).toContain('not https://other.supabase.co')
  })

  it('reads the CSP line out of a headers file', () => {
    expect(cspOf(dormant())).toContain("default-src 'self'")
    expect(cspOf('/*\n  X-A: b\n')).toBeNull()
  })
})
