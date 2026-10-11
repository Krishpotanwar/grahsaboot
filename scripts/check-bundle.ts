import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUDGET_KB, bundleProblems, entrySizes, type Files } from './bundle-rules.ts'

// `tsx scripts/check-bundle.ts` checks dist/ (the dormant build); `--accounts` checks dist-accounts/ (the flag-on build).
// The rules are in bundle-rules.ts so tests/unit/bundle-rules.test.ts runs them on synthetic builds.
const accounts = process.argv.includes('--accounts')
const release = process.env.GS_ACCOUNTS_RELEASE === '1'
const name = accounts ? 'dist-accounts' : 'dist'
const dir = fileURLToPath(new URL(`../${name}/`, import.meta.url))
const fail = (msg: string): never => {
  console.error(`check-bundle: ${msg}`)
  return process.exit(1)
}
const kb = (bytes: number) => (bytes / 1024).toFixed(1)

const files: Files = {}
try {
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true }))
    if (e.isFile()) {
      const path = relative(dir, join(e.parentPath, e.name))
      files[path] = readFileSync(join(dir, path))
    }
} catch {
  fail(`cannot read ${name}/. Run "npm run ${accounts ? 'build:accounts' : 'build'}" first.`)
}

console.log(
  `${name}/${release && !accounts ? ' (GS_ACCOUNTS_RELEASE=1: held to the accounts build rules)' : ''}`,
)
for (const e of entrySizes(files)) console.log(`  ${e.path}  ${kb(e.gzip)} KB gzip`)
const total = entrySizes(files).reduce((n, e) => n + e.gzip, 0)
console.log(`entry JS: ${kb(total)} KB gzip (budget ${BUDGET_KB} KB)`)

const problems = bundleProblems(files, { accounts, release })
if (problems.length) fail(`${name}/ fails:\n  - ${problems.join('\n  - ')}`)
