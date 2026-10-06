import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Phase D runs this directory unchanged in a Supabase Deno function: siblings, geotiff and proj4 only, no DOM.
const files = readdirSync(new URL('.', import.meta.url)).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
)
const ALLOWED = /^\.\/[\w-]+\.ts$|^geotiff$|^proj4$/
const IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
// `window.` means member access: scl.ts says "the same window." in prose, which is not a DOM use.
const DOM = /\b(?:document|DOMException|localStorage)\b|\bwindow\.(?=\w)/

describe('evidence core is runtime-neutral', () => {
  it('imports only sibling .ts files, geotiff and proj4, and touches no DOM API', () => {
    expect(files).toContain('cog.ts')
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      for (const m of src.matchAll(IMPORT)) if (!ALLOWED.test(m[1]!)) bad.push(`${f}: import ${m[1]}`)
      const dom = DOM.exec(src)
      if (dom) bad.push(`${f}: ${dom[0]}`)
    }
    expect(bad).toEqual([])
  })
})
