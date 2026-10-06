import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

// Budget for the JS the browser fetches before the first render: index.html's module script plus its modulepreloads, gzipped.
const BUDGET_KB = 150
const dist = new URL('../dist/', import.meta.url)
const fail = (msg: string): never => {
  console.error(`check-bundle: ${msg}`)
  return process.exit(1)
}
const read = (path: string) => {
  try {
    return readFileSync(new URL(path, dist))
  } catch {
    return fail(`cannot read dist/${path}. Run "npm run build" first.`)
  }
}
const kb = (bytes: number) => (bytes / 1024).toFixed(1)

const html = read('index.html').toString('utf8')
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const urls = (el: 'script' | 'link', key: string, value: string, from: string) =>
  (html.match(new RegExp(`<${el}\\b[^>]*>`, 'g')) ?? [])
    .filter((tag) => attr(tag, key) === value)
    .flatMap((tag) => attr(tag, from) ?? [])
const entries = urls('script', 'type', 'module', 'src')
if (!entries.length) fail('dist/index.html lists no <script type="module" src="...">.')

let total = 0
for (const url of new Set([...entries, ...urls('link', 'rel', 'modulepreload', 'href')])) {
  const path = url.replace(/^\//, '')
  const bytes = gzipSync(read(path)).length
  total += bytes
  console.log(`  ${path}  ${kb(bytes)} KB gzip`)
}
console.log(`entry JS: ${kb(total)} KB gzip (budget ${BUDGET_KB} KB)`)
if (total > BUDGET_KB * 1024) fail(`entry JS is ${kb(total)} KB gzip, over the ${BUDGET_KB} KB budget.`)
