import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildHeaders, inlineScriptHashes } from './csp.ts'

// `tsx scripts/write-headers.ts <dir>`: writes <dir>/_headers for the built page in <dir>. Run by the build scripts, after
// `vite build`, because the hash of the inline theme script is the hash of the BUILT index.html (Vite may rewrite it).
// A build with accounts (VITE_ACCOUNTS=1 and a VITE_SUPABASE_URL) adds the project's origin to connect-src; no other does.
const dir = process.argv[2]
if (!dir) {
  console.error('write-headers: usage: tsx scripts/write-headers.ts <dist directory>')
  process.exit(1)
}
const html = readFileSync(join(dir, 'index.html'), 'utf8')
const on = process.env.VITE_ACCOUNTS === '1' && !!process.env.VITE_SUPABASE_URL
const supabaseOrigin = on ? new URL(process.env.VITE_SUPABASE_URL!).origin : null
writeFileSync(join(dir, '_headers'), buildHeaders({ scriptHashes: inlineScriptHashes(html), supabaseOrigin }))
console.log(
  `write-headers: ${dir}/_headers (${inlineScriptHashes(html).length} inline script hash${supabaseOrigin ? `, ${supabaseOrigin}` : ''})`,
)
