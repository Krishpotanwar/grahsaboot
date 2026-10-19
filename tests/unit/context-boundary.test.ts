import { readdirSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'

// The satellite view is a picture to find a place by, never evidence (src/context/load.ts). This is the source side of that
// rule: who may reach the context code and its map layer, and that nothing in them digests pixels. Tests are not scanned.
const root = new URL('../../src/', import.meta.url)
const files = (readdirSync(root, { recursive: true }) as string[])
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !/\.test\.[cm]?[jt]sx?$/.test(f))
  .sort()

const IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
const CONTEXT = /^context(?:\/|$)/
const LAYER = /^map\/contextLayer(?:\.[cm]?[jt]sx?)?$/
/** The files that may use src/context (it may use itself): the switch, its state types and the map layer, nothing else. */
const MAY = /^(?:context\/|map\/contextLayer\.ts$|new\/(?:ContextToggle\.tsx|contextState\.ts)$)/
/** Where the evidence, the report and the accounts live: none of it may see the picture. */
const EVIDENCE_SIDE = /^(?:report\/|workbench\/|screens\/Report\.tsx$|data\/|accounts\/)/
/** Built in pieces so that this file passes its own scan. */
const NEEDLE = ['s', 'ha'].join('')

/** What `file` (relative to src/) imports from src/, relative to src/. Only a relative specifier can reach another file of src/. */
const targets = (file: string, src: string) =>
  [...src.matchAll(IMPORT)]
    .map((m) => m[1]!)
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => posix.normalize(posix.join(posix.dirname(file), spec)))
/** Imports of src/context from a folder that may not use it. */
const strangers = (file: string, src: string) =>
  MAY.test(file) ? [] : targets(file, src).filter((t) => CONTEXT.test(t))
/** Imports of src/context or of the map layer from the evidence side. */
const leaks = (file: string, src: string) =>
  EVIDENCE_SIDE.test(file) ? targets(file, src).filter((t) => CONTEXT.test(t) || LAYER.test(t)) : []
const digestName = (src: string) => src.toLowerCase().includes(NEEDLE)

const text = (f: string) => readFileSync(new URL(f, root), 'utf8')
const found = (rule: typeof strangers) =>
  files.flatMap((f) => rule(f, text(f)).map((t) => `${f} imports ${t}`))

describe('context imagery module boundary', () => {
  it('walks the source tree (so the checks below are not vacuous)', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'context/load.ts',
        'context/rank.ts',
        'map/contextLayer.ts',
        'map/createMap.ts',
        'report/html.ts',
        'screens/Report.tsx',
      ]),
    )
    expect(files.length).toBeGreaterThan(60)
  })

  it('catches an import of the context code or the map layer from the wrong side', () => {
    const load = `import { loadContext } from '../context/load.ts'`
    expect(strangers('screens/Workbench.tsx', load)).toEqual(['context/load.ts'])
    expect(strangers('stac/search.ts', `export * from '../context/rank.ts'`)).toEqual(['context/rank.ts'])
    expect(strangers('app.tsx', `import './context/load.ts'`)).toEqual(['context/load.ts'])
    // the folders it used to be open to: only the switch, its state and the layer need it, not the rest of src/new and src/map
    expect(strangers('new/ReviewStep.tsx', load)).toEqual(['context/load.ts'])
    expect(strangers('new/OutlineStep.tsx', load)).toEqual(['context/load.ts'])
    expect(strangers('map/createMap.ts', load)).toEqual(['context/load.ts'])
    expect(strangers('report/html.ts', `const m = import('../context/region')`)).toEqual(['context/region'])
    expect(leaks('report/html.ts', `const m = import('../context/region')`)).toEqual(['context/region'])
    const layer = `import { setContextLayer } from '../map/contextLayer.ts'`
    expect(leaks('workbench/EvidenceViewer.tsx', layer)).toEqual(['map/contextLayer.ts'])
    expect(leaks('screens/Report.tsx', `import { setContextLayer } from '../map/contextLayer'`)).toEqual([
      'map/contextLayer',
    ])
    expect(leaks('accounts/save.ts', `import type { ContextImage } from '../context/load.ts'`)).toEqual([
      'context/load.ts',
    ])
    expect(leaks('data/store.ts', layer)).toEqual(['map/contextLayer.ts'])
  })

  it('does not flag the places that may, or names that only look alike', () => {
    const type = `import type { ContextImage } from '../context/load.ts'`
    expect(strangers('map/contextLayer.ts', type)).toEqual([])
    expect(strangers('new/ContextToggle.tsx', `import { loadContext } from '../context/load.ts'`)).toEqual([])
    expect(strangers('context/load.ts', `import { rankScenes } from './rank.ts'`)).toEqual([])
    expect(leaks('new/OutlineStep.tsx', `import { setContextLayer } from '../map/contextLayer.ts'`)).toEqual(
      [],
    )
    expect(leaks('screens/Workbench.tsx', `import { x } from '../map/contextLayer.ts'`)).toEqual([]) // not in the list
    for (const spec of ['../ui/context.ts', '../data/contexts.ts', '../map/contextLayers.ts', 'zod'])
      expect([
        ...strangers('report/html.ts', `import { x } from '${spec}'`),
        ...leaks('report/html.ts', `import { x } from '${spec}'`),
      ]).toEqual([])
  })

  it('lets only the switch, its state and the map layer import src/context', () => {
    expect(found(strangers)).toEqual([])
  })

  it('keeps the report, the workbench, the data layer and the accounts away from the picture and its layer', () => {
    expect(found(leaks)).toEqual([])
  })

  it('has no name with the pixel-digest word in src/context or in the map layer (case-insensitive)', () => {
    const scanned = files.filter((f) => CONTEXT.test(f) || LAYER.test(f))
    expect(scanned).toEqual(expect.arrayContaining(['context/load.ts', 'map/contextLayer.ts']))
    expect(scanned.filter((f) => digestName(text(f)))).toEqual([])
    expect(digestName(`const ${NEEDLE.toUpperCase()}OfPixels = 1`)).toBe(true) // the scan sees the word where it would be written
  })
})
