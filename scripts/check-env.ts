import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Browser variables live ONLY in .env.development.local (the dev server reads it; production builds do not).
// Vite loads .env.local in every build mode, so a VITE_* value there would be baked into the next production
// build and ship the dev project, with accounts ON. Tooling variables live in .env.local.
const BROWSER = ['VITE_ACCOUNTS', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
const TOOLING = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DEV_REF',
  'SUPABASE_DEV_DB_PASSWORD',
  'DEV_TEST_EMAIL',
  'DEV_TEST_PASSWORD',
]

/** What is missing or invalid. `dev` = .env.development.local (browser), `local` = .env.local (tooling). */
export function missingEnv(dev: Record<string, string>, local: Record<string, string>): string[] {
  const unset = (env: Record<string, string>, k: string) => !env[k] || env[k].includes('<')
  const out = [...BROWSER.filter((k) => unset(dev, k)), ...TOOLING.filter((k) => unset(local, k))]
  if (!unset(dev, 'VITE_ACCOUNTS') && dev.VITE_ACCOUNTS !== '1') out.push('VITE_ACCOUNTS (must be 1)')
  if (
    !unset(dev, 'VITE_SUPABASE_URL') &&
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(dev.VITE_SUPABASE_URL!)
  )
    out.push('VITE_SUPABASE_URL (must look like https://<20-char-ref>.supabase.co)')
  // Vite loads .env.local in every build mode: a VITE_* value there would ship in the next production build.
  const misplaced = Object.keys(local)
    .filter((k) => k.startsWith('VITE_'))
    .map((k) => `${k} (browser variable: move it to .env.development.local)`)
  return [...out, ...misplaced]
}

const readEnv = (path: string): Record<string, string> =>
  existsSync(path)
    ? Object.fromEntries(
        readFileSync(path, 'utf8')
          .split('\n')
          .filter((l) => /^[A-Z0-9_]+=/.test(l))
          .map((l) => [
            l.slice(0, l.indexOf('=')),
            l
              .slice(l.indexOf('=') + 1)
              .trim()
              .replace(/^(["'])(.*)\1$/, '$2'),
          ]),
      )
    : {}

// Only when run as a script (npm run env:check); importing it, as the unit test does, reads no file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const missing = missingEnv(
    readEnv(process.env.ENV_DEV_FILE ?? '.env.development.local'),
    readEnv(process.env.ENV_LOCAL_FILE ?? '.env.local'),
  )
  if (missing.length) {
    console.error(
      `Missing or invalid: ${missing.join(', ')}. Browser variables go in .env.development.local, tooling variables in .env.local. See docs/ops/accounts.md.`,
    )
    process.exitCode = 1
  } else console.log('env ok')
}
