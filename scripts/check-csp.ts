import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cspProblems } from './csp.ts'

// `tsx scripts/check-csp.ts` holds dist/ (the build without accounts) to its _headers; `--accounts` does dist-accounts/.
const accounts = process.argv.includes('--accounts')
// `--dir=dist` with `--accounts` holds the activation build (npm run build with the accounts variables) to its headers.
const dir =
  process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? (accounts ? 'dist-accounts' : 'dist')
const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
const html = read('index.html')
if (html === null) {
  console.error(
    `check-csp: ${dir}/index.html is missing. Run "npm run ${accounts ? 'build:accounts' : 'build'}" first.`,
  )
  process.exit(1)
}
const supabaseOrigin =
  accounts && process.env.VITE_SUPABASE_URL ? new URL(process.env.VITE_SUPABASE_URL).origin : null
const problems = cspProblems(read('_headers'), html, { accounts, supabaseOrigin })
if (problems.length) {
  console.error(`check-csp: ${dir}/_headers fails:\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}
console.log(
  `check-csp: ${dir}/_headers holds (every inline script is allowed by hash, no wildcard, nothing ruled out).`,
)
