import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Context imagery is for finding a place and is never evidence: nothing here may digest or keep the pixels, and nothing
// here may reach into the accounts code. The needle is built in pieces so that this file passes its own scan.
const dir = fileURLToPath(new URL('.', import.meta.url))
const files = readdirSync(dir, { recursive: true })
  .map(String)
  .filter((f) => /\.[cm]?[jt]sx?$/.test(f))
const text = (f: string) => readFileSync(dir + f, 'utf8')
const NEEDLE = ['s', 'ha'].join('')

describe('src/context guard', () => {
  it('scans the files it is meant to scan', () => {
    expect(files).toEqual(expect.arrayContaining(['guard.test.ts', 'load.ts', 'rank.ts', 'region.ts']))
  })

  it('has no identifier, word or comment containing the pixel-digest name (case-insensitive)', () => {
    expect(files.filter((f) => text(f).toLowerCase().includes(NEEDLE))).toEqual([])
  })

  it('imports nothing from src/accounts', () => {
    const fromAccounts = /(?:\bfrom|\bimport)\s*\(?\s*['"][^'"]*\baccounts\b/
    expect(files.filter((f) => fromAccounts.test(text(f)))).toEqual([])
  })
})
