import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { bundleProblems, entryFiles, entrySizes, targetFor, type Files } from '../../scripts/bundle-rules.ts'

const SENTINEL = 'Sign in with Google'
const html = (entry: string, preload: string[] = []) =>
  `<!doctype html><html><head><script type="module" crossorigin src="/assets/${entry}"></script>${preload
    .map((p) => `<link rel="modulepreload" crossorigin href="/assets/${p}">`)
    .join('')}<link rel="stylesheet" crossorigin href="/assets/index-a.css"></head><body></body></html>`
// A map's sourcesContent carries the integration points' own text, so it holds the very words the guard forbids.
const map = (...sources: string[]) =>
  JSON.stringify({
    version: 3,
    sources,
    sourcesContent: sources.map(() => `loadAccounts && import('./index.ts') // ${SENTINEL} supabase gs-auth`),
    mappings: '',
  })

/** A clean dormant dist: an entry, a modulepreload, a lazy screen, css and headers. */
const dormant = (): Files => ({
  'index.html': html('index-a.js', ['config-b.js']),
  'assets/index-a.js': 'console.log("app")',
  'assets/index-a.js.map': map('../../src/main.tsx', '../../src/accounts/enabled.ts'),
  'assets/config-b.js': 'export const c = 1',
  'assets/config-b.js.map': map('../../src/config.ts'),
  'assets/Workbench-c.js': 'export const w = 2',
  'assets/Workbench-c.js.map': map('../../src/screens/Workbench.tsx', '../../node_modules/react/index.js'),
  'assets/index-a.css': 'body{margin:0}',
  'assets/font.woff2': new Uint8Array([1, 2, 3]),
  _headers: '/*\n  X-Content-Type-Options: nosniff\n',
})

/** A flag-on dist: the accounts code sits in its own chunk, loaded by the dynamic import. */
const accountsOn = (): Files => ({
  ...dormant(),
  'assets/index-b.js': `import('./accounts-d.js')`,
  'assets/accounts-d.js': `export const s = "${SENTINEL}"; /* supabase */`,
  'assets/accounts-d.js.map': map(
    '../../src/accounts/remote.ts',
    '../../src/ui/copy-account.ts',
    '../../node_modules/@supabase/supabase-js/dist/index.mjs',
  ),
})

const rules = { accounts: false, release: false }
const on = { accounts: true, release: false }

describe('entryFiles', () => {
  it('lists the module script and the modulepreloads, as dist-relative paths', () => {
    expect(entryFiles(dormant())).toEqual(['assets/index-a.js', 'assets/config-b.js'])
  })
  it('gzips what it lists', () => {
    const [a, b] = entrySizes(dormant())
    expect(a!.path).toBe('assets/index-a.js')
    expect(a!.gzip).toBeGreaterThan(0)
    expect(b!.path).toBe('assets/config-b.js')
  })
})

describe('bundleProblems, flag off (dist/)', () => {
  it.each(['manifest.webmanifest', 'data.json', 'logo.svg', 'notes.txt', 'chunk.mjs'])(
    'finds a forbidden word in %s as well as in js, html and css',
    (name) => {
      const files = { ...dormant(), [name]: 'x https://abc.supabase.co y' }
      expect(bundleProblems(files, { accounts: false, release: false }).join('\n')).toContain(name)
    },
  )
  it('passes a clean dormant build, including a map whose text holds the forbidden words', () => {
    expect(bundleProblems(dormant(), rules)).toEqual([])
  })

  it('fails each forbidden string in a chunk, in index.html, in css and in _headers', () => {
    const words: Array<[string, string]> = [
      ['supabase', 'https://x.supabase.co'],
      ['Supabase', 'Supabase'],
      ['the accounts copy', SENTINEL],
      ['gs-auth', 'gs-auth'],
      ['gs-consent', 'gs-consent'],
    ]
    for (const file of ['assets/Workbench-c.js', 'index.html', 'assets/index-a.css', '_headers']) {
      for (const [label, w] of words) {
        const files = { ...dormant() }
        files[file] = `${files[file] as string}\n${w}`
        const problems = bundleProblems(files, rules)
        expect(problems.length, `${file} + ${label}`).toBeGreaterThan(0)
        expect(problems.join('\n'), `${file} + ${label}`).toContain(file)
      }
    }
  })

  it('fails an accounts module or Supabase in a map source, and lets src/accounts/enabled.ts through', () => {
    for (const source of [
      '../../src/accounts/remote.ts',
      '../../src/accounts/index.ts',
      '../../node_modules/@supabase/supabase-js/dist/index.mjs',
      '../../src/ui/copy-account.ts',
    ]) {
      const files = {
        ...dormant(),
        'assets/Workbench-c.js.map': map('../../src/screens/Workbench.tsx', source),
      }
      expect(bundleProblems(files, rules).join('\n'), source).toContain('Workbench-c.js.map')
    }
    expect(bundleProblems(dormant(), rules)).toEqual([]) // enabled.ts is in the entry map above
  })

  it('refuses an accounts-ON build unless GS_ACCOUNTS_RELEASE=1, naming the variable and `npm run deploy`', () => {
    const files = accountsOn()
    const refused = bundleProblems(files, rules)
    expect(refused[0]).toContain('GS_ACCOUNTS_RELEASE')
    expect(refused[0]).toContain('Never `npm run deploy`')
    expect(bundleProblems(files, { accounts: false, release: true })).toEqual([])
  })

  it('refuses a release build that is dormant: nothing to activate', () => {
    const problems = bundleProblems(dormant(), { accounts: false, release: true })
    expect(problems.join('\n')).toContain('dormant build')
  })

  it('fails an entry over 150 KB gzip, counting modulepreloads and not lazy chunks', () => {
    const big = randomBytes(160_000) // random bytes do not compress
    expect(bundleProblems({ ...dormant(), 'assets/config-b.js': big }, rules).join('\n')).toContain(
      'over the 150 KB',
    )
    expect(bundleProblems({ ...dormant(), 'assets/index-a.js': big }, rules).join('\n')).toContain(
      'over the 150 KB',
    )
    expect(bundleProblems({ ...dormant(), 'assets/Workbench-c.js': big }, rules)).toEqual([])
    expect(bundleProblems({ ...dormant(), 'assets/index-a.js': randomBytes(100_000) }, rules)).toEqual([])
  })

  it('fails closed on an unreadable map, a missing entry file and a missing index.html', () => {
    expect(bundleProblems({ ...dormant(), 'assets/x.js.map': 'not json' }, rules).join('\n')).toContain(
      'x.js.map',
    )
    const { 'assets/config-b.js': _gone, ...lacking } = dormant()
    expect(bundleProblems(lacking, rules).join('\n')).toContain('config-b.js')
    const { 'index.html': _html, ...none } = dormant()
    expect(bundleProblems(none, rules)).toEqual(['index.html is missing from the build.'])
  })
})

describe('bundleProblems, flag on (dist-accounts/)', () => {
  it('passes when Supabase and the remote module sit in a chunk outside the entry', () => {
    expect(bundleProblems(accountsOn(), on)).toEqual([])
  })

  it('fails when the flag-on build has no accounts chunk (the flag folded away)', () => {
    expect(bundleProblems(dormant(), on).join('\n')).toContain('no accounts chunk')
    const noSupabase = { ...accountsOn(), 'assets/accounts-d.js.map': map('../../src/accounts/remote.ts') }
    expect(bundleProblems(noSupabase, on).join('\n')).toContain('no accounts chunk')
  })

  it('fails when no chunk holds the accounts copy: the sentinel would no longer match the real copy', () => {
    const files = { ...accountsOn(), 'assets/accounts-d.js': 'export const s = "Sign in"; /* supabase */' }
    expect(bundleProblems(files, on).join('\n')).toContain(
      'no chunk of the accounts build holds the accounts copy',
    )
  })

  it('fails accounts code in the entry or a modulepreload, in a map or as the sentinel', () => {
    const inMap = { ...accountsOn(), 'assets/index-a.js.map': map('../../src/accounts/remote.ts') }
    expect(bundleProblems(inMap, on).join('\n')).toContain('assets/index-a.js (loaded with the first page)')
    const inPreload = {
      ...accountsOn(),
      'assets/config-b.js.map': map('../../node_modules/@supabase/auth-js/x.js'),
    }
    expect(bundleProblems(inPreload, on).join('\n')).toContain(
      'assets/config-b.js (loaded with the first page)',
    )
    const word = { ...accountsOn(), 'assets/index-a.js': `var s = "${SENTINEL}"` }
    expect(bundleProblems(word, on).join('\n')).toContain('holds the accounts copy')
  })

  it('applies the same 150 KB entry budget', () => {
    const files = { ...accountsOn(), 'assets/index-a.js': randomBytes(160_000) }
    expect(bundleProblems(files, on).join('\n')).toContain('over the 150 KB')
  })
})

// The grievance contact is an activation blocker (docs/ops/accounts-test.md): src/ui/copy-account.ts carries a marked placeholder
// today, and only a release build (GS_ACCOUNTS_RELEASE=1) is held to its absence. A tester build may still show it.
describe('bundleProblems, release build (GS_ACCOUNTS_RELEASE=1)', () => {
  const PLACEHOLDER = '[name and email of the grievance contact]'
  const release = { accounts: false, release: true }
  const withChunk = (body: string): Files => ({ ...accountsOn(), 'assets/accounts-d.js': body })
  const chunk = (contact: string) =>
    `export const s = "${SENTINEL}"; /* supabase */ export const g = "Questions or complaints: ${contact}."`

  it('fails while the placeholder is in a built file, naming the file and the placeholder', () => {
    const problems = bundleProblems(withChunk(chunk(PLACEHOLDER)), release).join('\n')
    expect(problems).toContain('assets/accounts-d.js')
    expect(problems).toContain(PLACEHOLDER)
  })

  it('finds it in html, css, json and _headers as well as in a chunk, and in the flag-on build', () => {
    for (const file of ['index.html', 'assets/index-a.css', 'data.json', '_headers']) {
      const files = { ...accountsOn(), [file]: `${accountsOn()[file] ?? ''}\n${PLACEHOLDER}` }
      expect(bundleProblems(files, release).join('\n'), file).toContain(`${file} holds`)
    }
    const both = { accounts: true, release: true }
    expect(bundleProblems(withChunk(chunk(PLACEHOLDER)), both).join('\n')).toContain(PLACEHOLDER)
  })

  it('passes once the contact is named', () => {
    expect(bundleProblems(withChunk(chunk('Asha Rao, asha@example.org')), release)).toEqual([])
  })

  it('leaves the flag-on build (dist-accounts/) alone: only a release build is held to it', () => {
    expect(bundleProblems(withChunk(chunk(PLACEHOLDER)), on)).toEqual([])
  })

  it('reads built files, not source maps (a map holds the source text, comments included)', () => {
    const files = {
      ...accountsOn(),
      'assets/accounts-d.js.map': JSON.stringify({
        version: 3,
        sources: ['../../src/accounts/remote.ts', '../../node_modules/@supabase/supabase-js/dist/index.mjs'],
        sourcesContent: [`// ${PLACEHOLDER}`, ''],
        mappings: '',
      }),
    }
    expect(bundleProblems(files, release)).toEqual([])
  })
})

// VITE_CONTEXT_IMAGERY=0 removes the satellite switch at build time (src/new/contextGate.ts): the switch, the loader and the map
// layer are lazy chunks that the folded condition leaves out, so that build must hold none of them.
describe('bundleProblems, build without the satellite view (dist-nocontext/)', () => {
  const off = { accounts: false, release: false, noContext: true }
  const withView = (): Files => ({
    ...dormant(),
    'assets/ContextToggle-e.js': 'export const id = "gs-context"',
    'assets/ContextToggle-e.js.map': map('../../src/new/ContextToggle.tsx', '../../src/context/load.ts'),
  })

  it('passes a build that holds none of it', () => {
    expect(bundleProblems(dormant(), off)).toEqual([])
  })

  it('fails the map layer id in any chunk or in index.html, naming the file', () => {
    for (const file of [
      'assets/ContextToggle-e.js',
      'assets/Workbench-c.js',
      'assets/index-a.js',
      'index.html',
    ]) {
      const files = { ...withView(), [file]: `${(withView()[file] as string | undefined) ?? ''} gs-context` }
      expect(bundleProblems(files, off).join('\n'), file).toContain(`${file} holds "gs-context"`)
    }
  })

  it('fails the toggle, the loader or the layer in a map, even without the id in the code', () => {
    for (const source of [
      '../../src/new/ContextToggle.tsx',
      '../../src/new/contextState.ts',
      '../../src/context/rank.ts',
      '../../src/map/contextLayer.ts',
    ]) {
      const files = {
        ...dormant(),
        'assets/Workbench-c.js.map': map('../../src/screens/Workbench.tsx', source),
      }
      expect(bundleProblems(files, off).join('\n'), source).toContain('Workbench-c.js.map')
    }
  })

  it('lets the gate through: src/new/contextGate.ts is in every build, the folded condition and nothing else', () => {
    const files = {
      ...dormant(),
      'assets/index-a.js.map': map('../../src/main.tsx', '../../src/new/contextGate.ts'),
    }
    expect(bundleProblems(files, off)).toEqual([])
  })

  it('does not hold the normal build to it: that one carries the view in a lazy chunk', () => {
    expect(bundleProblems(withView(), rules)).toEqual([])
  })

  it('still applies every other rule to this build', () => {
    expect(
      bundleProblems({ ...dormant(), 'assets/Workbench-c.js': 'https://x.supabase.co' }, off).join('\n'),
    ).toContain('supabase')
    expect(
      bundleProblems({ ...dormant(), 'assets/index-a.js': randomBytes(160_000) }, off).join('\n'),
    ).toContain('over the 150 KB')
  })
})

// scripts/check-bundle.ts reads its folder and its rules from targetFor: a leg of `npm run check` that does not pass the rule it
// names (the no-context leg without noContext) would check nothing and still print green.
describe('targetFor: what each leg of npm run check is held to', () => {
  it('points each argument at its own folder and rules', () => {
    expect(targetFor([])).toEqual({
      name: 'dist',
      rules: { accounts: false, release: false, noContext: false },
    })
    expect(targetFor(['--accounts']).name).toBe('dist-accounts')
    expect(targetFor(['--accounts']).rules.accounts).toBe(true)
    expect(targetFor(['--no-context'])).toEqual({
      name: 'dist-nocontext',
      rules: { accounts: false, release: false, noContext: true },
    })
  })

  it('carries the release flag to whichever build is checked', () => {
    expect(targetFor([], true).rules.release).toBe(true)
    expect(targetFor(['--no-context'], true).rules.release).toBe(true)
    expect(targetFor([]).rules.release).toBe(false)
  })
})
