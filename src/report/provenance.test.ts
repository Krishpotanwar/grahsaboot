import { describe, expect, it } from 'vitest'
import { newInvestigation, setBeforeAfter } from '../data/investigation.ts'
import { CHANGE_CONSTANTS, CHANGE_RECIPE, type ChangeResult } from '../evidence/change.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { copy } from '../ui/copy.ts'
import { buildReportHtml } from './html.ts'
import { buildProvenance } from './provenance.ts'

// What a report lists among its recipes is what it used (rulings D32 and R55): the change rule only when the report printed its "What we
// measured" block. A report without the block lists what it listed before the rule existed, byte for byte.
const T = new Date('2026-10-22T10:00:00Z')
const inv = setBeforeAfter(
  newInvestigation(
    {
      name: 'Yard',
      aoi: {
        kind: 'site',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [79.08, 21.14],
              [79.09, 21.14],
              [79.09, 21.15],
              [79.08, 21.14],
            ],
          ],
        },
      },
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    },
    T,
    '00000000-0000-4000-8000-000000000004',
  ),
  '2025-01-10',
  '2025-12-20',
  T,
)
const noPair = { ...inv, before: null, after: null }
const summary = {
  kind: 'site',
  areaKm2: 1.15,
  extentKm: 1.52,
  lengthKm: null,
  bbox: [79.08, 21.14, 79.09, 21.15],
  parts: [{ idx: 0, fromM: 0, toM: 0, geometry: { kind: 'site', rings: [] } }],
} as AoiSummary
const rest = { recipe: CHANGE_RECIPE, constants: CHANGE_CONSTANTS, clearPixels: 143_491 }
const shift = [0, 0, 0] as const
/** One result of each state of the rule: with a pair, each is a report that prints a block. */
const results: ChangeResult[] = [
  { ...rest, state: 'not-enough-ground' },
  { ...rest, state: 'outline-too-small' },
  { ...rest, state: 'most-differs', shift },
  { ...rest, state: 'nothing', shift },
  { ...rest, state: 'changed', shift, patches: 3, hectares: 12.3 },
]
/** The provenance of `inv` with no frames, as the builder wrote it at 66945f7 (before the change rule existed), written out. */
const BEFORE_THE_RULE = {
  schema: 'grahsaboot.provenance/1',
  generatedAt: '2026-10-22T10:00:00.000Z',
  app: { name: copy.app.name, version: '0.1.0' },
  investigation: {
    id: inv.id,
    name: 'Yard',
    kind: 'site',
    geometry: inv.aoi.geometry,
    roadWidthM: null,
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
    before: '2025-01-10',
    after: '2025-12-20',
    pinned: ['2025-01-10', '2025-12-20'],
    claim: null,
  },
  parts: [{ idx: 0, fromM: 0, toM: 0 }],
  recipes: { frame: 'frame-v1', scl: 'scl-v2', display: 'display-v1', diff: 'diff-v1' },
  frames: [],
  notes: [],
  attribution: [copy.attribution.osm],
}
const WITH_THE_RULE = { ...BEFORE_THE_RULE, recipes: { ...BEFORE_THE_RULE.recipes, change: 'change-v1' } }

describe('buildProvenance: the recipes a report lists', () => {
  it('is, given no result, byte for byte the provenance of before the change rule existed', () => {
    const p = buildProvenance(inv, summary, [], '0.1.0', T)
    expect(JSON.stringify(p)).toBe(JSON.stringify(BEFORE_THE_RULE))
    expect(Object.keys(p.recipes)).toEqual(['frame', 'scl', 'display', 'diff'])
  })

  it('names the change rule after the others, and changes nothing else, given the result the report prints', () => {
    for (const result of results) {
      const p = buildProvenance(inv, summary, [], '0.1.0', T, result)
      expect(JSON.stringify(p), result.state).toBe(JSON.stringify(WITH_THE_RULE))
    }
  })

  it('does not name it for a result with no pair to compare, where the report prints no block either', () => {
    for (const result of results) {
      const p = buildProvenance(noPair, summary, [], '0.1.0', T, result)
      expect(p.recipes, result.state).toStrictEqual(BEFORE_THE_RULE.recipes)
    }
  })

  it('agrees with the page: the provenance it embeds names the rule exactly when the page prints the block', () => {
    const embedded = (html: string) =>
      JSON.parse(/<script type="application\/json" id="provenance">([\s\S]*?)<\/script>/.exec(html)![1]!)
        .recipes as Record<string, string>
    for (const i of [inv, noPair])
      for (const result of [undefined, ...results]) {
        const provenance = buildProvenance(i, summary, [], '0.1.0', T, result)
        const html = buildReportHtml({
          inv: i,
          summary,
          entries: [],
          images: [],
          change: result,
          provenance,
          theme: 'dark',
          preparedBy: '',
          generatedAt: T,
        })
        const printed = html.includes('<div class="measured">')
        const label = `${i === inv ? 'a pair' : 'no pair'}, ${result?.state ?? 'no result'}`
        expect(printed, label).toBe(i === inv && result !== undefined)
        expect(embedded(html), label).toStrictEqual(printed ? WITH_THE_RULE.recipes : BEFORE_THE_RULE.recipes)
      }
  })
})
