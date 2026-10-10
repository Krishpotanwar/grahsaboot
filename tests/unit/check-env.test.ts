import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { missingEnv } from '../../scripts/check-env.ts'

// Fake values only: nothing here is a real key, project or account.
const dev = {
  VITE_ACCOUNTS: '1',
  VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake',
}
const local = {
  SUPABASE_ACCESS_TOKEN: 'sbp_fake',
  SUPABASE_DEV_REF: 'abcdefghij0123456789',
  SUPABASE_DEV_DB_PASSWORD: 'fake-db-password',
  DEV_TEST_EMAIL: 'gs-smoke@example.com',
  DEV_TEST_PASSWORD: 'fake-test-password',
}

describe('missingEnv', () => {
  it('accepts a complete pair of env files', () => {
    expect(missingEnv(dev, local)).toEqual([])
  })

  it('lists every missing variable', () => {
    expect(missingEnv({}, {})).toEqual([...Object.keys(dev), ...Object.keys(local)])
  })

  it('reads browser variables only from the dev file and tooling variables only from .env.local', () => {
    const r = missingEnv(local, dev)
    expect(r.slice(0, 8)).toEqual([...Object.keys(dev), ...Object.keys(local)])
    expect(r.slice(8)).toHaveLength(3) // the VITE_* values found in the tooling file are reported as misplaced
  })

  it('flags a VITE_* variable in .env.local: production builds would bake it in', () => {
    expect(missingEnv(dev, { ...local, VITE_ACCOUNTS: '1' })).toEqual([
      'VITE_ACCOUNTS (browser variable: move it to .env.development.local)',
    ])
  })

  it('treats a placeholder (a value containing <) or an empty value as missing', () => {
    expect(
      missingEnv(
        { ...dev, VITE_SUPABASE_PUBLISHABLE_KEY: '<publishable or anon key>' },
        { ...local, DEV_TEST_PASSWORD: '', SUPABASE_DEV_REF: '<dev project ref>' },
      ),
    ).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_DEV_REF', 'DEV_TEST_PASSWORD'])
  })

  it('requires VITE_ACCOUNTS to be exactly 1', () => {
    for (const v of ['0', 'true', '']) {
      expect(missingEnv({ ...dev, VITE_ACCOUNTS: v }, local)).toEqual([
        expect.stringContaining('VITE_ACCOUNTS'),
      ])
    }
  })

  it('requires the URL to be https://<20-char-ref>.supabase.co', () => {
    for (const url of [
      'http://abcdefghij0123456789.supabase.co',
      'https://abcdefghij012345678.supabase.co',
      'https://abcdefghij0123456789.supabase.co/',
      'https://abcdefghij0123456789.supabase.co.example.com',
      'https://ABCDEFGHIJ0123456789.supabase.co',
    ]) {
      expect(missingEnv({ ...dev, VITE_SUPABASE_URL: url }, local), url).toEqual([
        expect.stringContaining('VITE_SUPABASE_URL'),
      ])
    }
  })
})

describe('npm run env:check', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gs-env-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  // Both paths are overridden, so the script never touches a real .env file. null = the file does not exist.
  const run = (devText: string | null, localText: string | null) => {
    const put = (name: string, text: string | null) => {
      if (text === null) rmSync(join(tmp, name), { force: true })
      else writeFileSync(join(tmp, name), text)
      return join(tmp, name)
    }
    const r = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
        fileURLToPath(new URL('../../scripts/check-env.ts', import.meta.url)),
      ],
      {
        env: { ...process.env, ENV_DEV_FILE: put('dev', devText), ENV_LOCAL_FILE: put('local', localText) },
        encoding: 'utf8',
        timeout: 20_000,
      },
    )
    return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
  }
  const lines = (env: Record<string, string>, eol = '\n') =>
    ['# a comment', '', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), ''].join(eol)

  it('prints env ok for a complete pair (CRLF line ends and quoted values included)', () => {
    const quoted = { ...dev, VITE_SUPABASE_URL: `"${dev.VITE_SUPABASE_URL}"` }
    expect(run(lines(quoted, '\r\n'), lines(local))).toEqual({ status: 0, out: 'env ok', err: '' })
  })

  it('exits 1 and names what is missing', () => {
    const { VITE_SUPABASE_PUBLISHABLE_KEY: _drop, ...rest } = dev
    const r = run(lines(rest), lines({ ...local, DEV_TEST_PASSWORD: '<long random password>' }))
    expect(r.status).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(r.err).toContain('DEV_TEST_PASSWORD')
    expect(r.err).not.toContain('SUPABASE_ACCESS_TOKEN')
  })

  it('reports files that do not exist as missing variables', () => {
    const r = run(null, null)
    expect(r.status).toBe(1)
    expect(r.err).toContain('VITE_ACCOUNTS')
    expect(r.err).toContain('SUPABASE_ACCESS_TOKEN')
  })
})
