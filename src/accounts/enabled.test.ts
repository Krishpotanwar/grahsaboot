import { afterEach, describe, expect, it, vi } from 'vitest'

const URL_ = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
const KEY = 'sb_publishable_fake'
const load = async () => (await import('./enabled.ts')).loadAccounts
const set = (env: Record<string, string>) => {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  vi.resetModules()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('loadAccounts (the one accounts switch)', () => {
  it('is null in the test environment: vite.config.ts pins VITE_ACCOUNTS=0, whatever the env files hold', async () => {
    expect(await load()).toBeNull()
  })

  it('is a loader function only when the flag, the URL and the key are all set', async () => {
    set({ VITE_ACCOUNTS: '1', VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })
    // Not called: that would import the whole accounts barrel (and supabase-js) into this test.
    expect(typeof (await load())).toBe('function')
  })

  it('stays null for every partial setting', async () => {
    const all = { VITE_ACCOUNTS: '1', VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY }
    const partial: Array<[string, Record<string, string>]> = [
      // blank values, not absent ones: a developer's .env or .env.local may hold a URL and key in every mode
      ['only the flag', { VITE_ACCOUNTS: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }],
      [
        'URL and key without the flag',
        { VITE_ACCOUNTS: '0', VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY },
      ],
      ['no URL', { ...all, VITE_SUPABASE_URL: '' }],
      ['no key', { ...all, VITE_SUPABASE_PUBLISHABLE_KEY: '' }],
      ['flag spelled true', { ...all, VITE_ACCOUNTS: 'true' }],
    ]
    for (const [name, env] of partial) {
      vi.unstubAllEnvs()
      set(env)
      expect(await load(), name).toBeNull()
    }
  })
})
