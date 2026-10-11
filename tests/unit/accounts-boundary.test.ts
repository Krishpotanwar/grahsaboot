import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A flag-off build must hold no accounts bytes (scripts/check-bundle.ts proves it on the built files). This is the source
// side of the same rule: the accounts modules and their words are reachable only through src/accounts/enabled.ts, whose
// import() the bundler drops when the flag is off.
const root = new URL('../../src/', import.meta.url)
const files = (readdirSync(root, { recursive: true }) as string[])
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .sort()

const IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
const ENABLED = /(?:^|\/)accounts\/enabled\.ts$/
const ACCOUNTS = /(?:^|\/)accounts\//
const LOADER = /import\(\s*['"]\.\/index\.ts['"]\s*\)/

/** What a file outside src/accounts/ may not do. `file` is relative to src/. */
function offences(file: string, src: string): string[] {
  const bad: string[] = []
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1]!
    if (/copy-account/.test(spec)) bad.push(`${file}: imports ${spec} (accounts copy)`)
    else if (ACCOUNTS.test(spec) && !ENABLED.test(spec))
      bad.push(`${file}: imports ${spec} (only accounts/enabled.ts is allowed)`)
  }
  return bad
}

describe('accounts module boundary', () => {
  it('walks the source tree (so the checks below are not vacuous)', () => {
    expect(files).toContain('accounts/enabled.ts')
    expect(files).toContain('data/useInvestigation.ts')
    expect(files.length).toBeGreaterThan(60)
  })

  it('catches an import of accounts code or copy-account from outside src/accounts/', () => {
    expect(offences('screens/Workbench.tsx', `import '../accounts/save.ts'`)).toHaveLength(1)
    expect(offences('screens/Workbench.tsx', `import { account } from '../ui/copy-account.ts'`)).toHaveLength(
      1,
    )
    expect(offences('x.ts', `const m = import('./accounts/remote.ts')`)).toHaveLength(1)
    expect(offences('x.ts', `import { loadAccounts } from '../accounts/enabled.ts'`)).toEqual([])
    expect(offences('x.ts', `import { x } from '../data/accounts-list.ts'`)).toEqual([])
  })

  it('lets nothing outside src/accounts/ import accounts code, except through accounts/enabled.ts, or copy-account', () => {
    const bad = files
      .filter((f) => !f.startsWith('accounts/'))
      .flatMap((f) => offences(f, readFileSync(new URL(f, root), 'utf8')))
    expect(bad).toEqual([])
  })

  it("keeps the loader, import('./index.ts'), in src/accounts/enabled.ts and nowhere else", () => {
    const holders = files.filter((f) => LOADER.test(readFileSync(new URL(f, root), 'utf8')))
    expect(holders).toEqual(['accounts/enabled.ts'])
  })
})
