import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { newInvestigation, setBeforeAfter } from '../../src/data/investigation.ts'
import { CHANGE_CONSTANTS, CHANGE_RECIPE, type ChangeResult } from '../../src/evidence/change.ts'
import { makeDisplayGrid } from '../../src/evidence/display.ts'
import type { AoiSummary } from '../../src/geo/aoi.ts'
import { buildReportHtml } from '../../src/report/html.ts'
import { buildProvenance } from '../../src/report/provenance.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import type { DateEntry } from '../../src/workbench/runner.ts'

// The "What we measured" block of a report, in a browser: the report is built here from fixed numbers (the screen that runs the
// rule is not part of this check) and loaded as the page it is when it is downloaded. For each of the five states of the rule it
// passes axe in both themes and does not stick out sideways, on a desktop and on a phone.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
const NOW = new Date('2026-10-22T10:00:00Z')
const BEFORE = '2018-02-22'
const AFTER = '2025-12-20' // far apart in the year, so the longest block, with the different-seasons sentence, is the one tested

const rest = { recipe: CHANGE_RECIPE, constants: CHANGE_CONSTANTS, clearPixels: 143_491 }
const shift = [0, 0, 0] as const
const outcomes: Record<ChangeResult['state'], ChangeResult> = {
  'not-enough-ground': { ...rest, state: 'not-enough-ground' },
  'outline-too-small': { ...rest, state: 'outline-too-small' },
  'most-differs': { ...rest, state: 'most-differs', shift },
  nothing: { ...rest, state: 'nothing', shift },
  changed: { ...rest, state: 'changed', shift, patches: 3, hectares: 12.3 },
}

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
      dateFrom: BEFORE,
      dateTo: AFTER,
    },
    NOW,
    '00000000-0000-4000-8000-000000000003',
  ),
  BEFORE,
  AFTER,
  NOW,
)
const summary = {
  kind: 'site',
  areaKm2: 1.15,
  extentKm: 1.52,
  lengthKm: null,
  bbox: [79.08, 21.14, 79.09, 21.15],
  parts: [{ idx: 0, fromM: 0, toM: 0, geometry: { kind: 'site', rings: [] } }],
} as unknown as AoiSummary
const entry = (date: string, clear: number, sun: number): DateEntry =>
  ({
    date,
    status: 'checked',
    error: null,
    thumb: null,
    invalid: null,
    thumbFailed: false,
    candidate: {
      date,
      coversAoi: true,
      alternates: [],
      item: {
        id: `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`,
        collection: 'sentinel-2-l2a',
        datetime: `${date}T05:30:00Z`,
        date,
        epsg: 32644,
        sunElevation: sun,
        visual: {
          href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/TCI.tif',
          transform: [10, 0, 0, 0, -10, 0],
        },
        scl: {
          href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/SCL.tif',
          transform: [20, 0, 0, 0, -20, 0],
        },
      },
    },
    quality: {
      window: [0, 0, 1, 1],
      level: 0,
      sha256: 'a'.repeat(64),
      parts: [],
      stats: { clearFraction: clear, label: 'CLEAR' },
    },
    full: null,
  }) as unknown as DateEntry
const entries = [entry(BEFORE, 0.92, 41.2), entry(AFTER, 0.88, 40.4)]
const grid = makeDisplayGrid(summary.bbox, 1024)

const reportFor = (change: ChangeResult, theme: 'dark' | 'light') =>
  buildReportHtml({
    inv,
    summary,
    grid,
    images: [],
    entries,
    change,
    provenance: buildProvenance(inv, summary, entries, '0.1.0', NOW),
    theme,
    preparedBy: 'Field team',
    generatedAt: NOW,
  })

for (const [state, change] of Object.entries(outcomes)) {
  test(`the measured block of a report passes axe in both themes and fits the page: ${state}`, async ({
    page,
  }) => {
    for (const theme of ['dark', 'light'] as const) {
      await page.setContent(reportFor(change, theme))
      const block = page.locator('.measured')
      await expect(block.locator('h3')).toHaveText(flow.report.measured.title)
      // Under the Evidence heading, in the section it belongs to, which keeps its number.
      await expect(page.locator('section', { has: block }).locator('h2')).toHaveText(
        flow.report.sections.evidence,
      )
      await expect(block.locator('p')).toHaveCount(
        state === 'changed' || state === 'nothing' || state === 'most-differs' ? 6 : 5,
      )
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true)
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
      expect(results.violations, `${theme}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
    }
  })
}
