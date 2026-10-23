import { verificationFor, type Investigation } from '../data/investigation.ts'
import type { ChangeResult } from '../evidence/change.ts'
import { RECIPES } from '../evidence/types.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { copy } from '../ui/copy.ts'
import type { DateEntry } from '../workbench/runner.ts'

export interface ProvenanceFrame {
  date: string
  collection: string
  itemId: string
  acquiredAt: string
  processingBaseline: string | null
  asset: 'visual' | 'scl'
  href: string
  level: number
  window: [number, number, number, number]
  crs: string
  transform: number[]
  recipe: string
  sha256: string
  verification: null | { status: string; verifiedAt: string; serverSha256: string }
  quality?: unknown
}
export interface Provenance {
  schema: 'grahsaboot.provenance/1'
  generatedAt: string
  app: { name: string; version: string }
  investigation: Record<string, unknown>
  parts: Array<{ idx: number; fromM: number; toM: number }>
  /** What the report used: the change rule is named only by a report that printed its "What we measured" block (rulings D32, R55). */
  recipes: Omit<typeof RECIPES, 'change'> & { change?: typeof RECIPES.change }
  frames: ProvenanceFrame[]
  notes: Investigation['notes']
  attribution: string[]
}

const scaled = (t: number[], level: number) => [
  t[0]! * 2 ** level,
  t[1]!,
  t[2]!,
  t[3]!,
  t[4]! * 2 ** level,
  t[5]!,
]

/** The recipes of every report. A new recipe is added here, or to the test of what a report lists, on purpose: the type asks for it. */
const ALWAYS_USED = { frame: RECIPES.frame, scl: RECIPES.scl, display: RECIPES.display, diff: RECIPES.diff }

export function buildProvenance(
  inv: Investigation,
  summary: AoiSummary,
  entries: DateEntry[],
  appVersion: string,
  generatedAt = new Date(),
  /** What the report prints as its "What we measured" block, the `change` of `buildReportHtml`: only a report that prints it names the change rule. */
  change?: ChangeResult,
): Provenance {
  const pinned = entries.filter((e) => inv.pinned.includes(e.date))
  const frames: ProvenanceFrame[] = pinned.flatMap((e) => {
    const it = e.candidate.item
    const base = {
      date: e.date,
      collection: it.collection,
      itemId: it.id,
      acquiredAt: it.datetime,
      processingBaseline: it.baseline,
      crs: `EPSG:${it.epsg}`,
    }
    // The server's check of this frame: for this item and these pixels, or null (never saved, not checked, or other pixels).
    const check = (asset: 'visual' | 'scl', level: number, sha256: string) => {
      const v = verificationFor(inv, e.date, asset, level, sha256, it.id)
      return v ? { status: v.status, verifiedAt: v.verifiedAt, serverSha256: v.serverSha256 } : null
    }
    const out: ProvenanceFrame[] = []
    if (e.quality)
      out.push({
        ...base,
        verification: check('scl', 0, e.quality.sha256),
        asset: 'scl',
        href: it.scl.href,
        level: 0,
        window: e.quality.window,
        transform: it.scl.transform,
        recipe: RECIPES.scl,
        sha256: e.quality.sha256,
        quality: {
          ...e.quality.stats,
          parts: e.quality.parts.map((p) => ({
            idx: p.idx,
            label: p.stats.label,
            clearFraction: p.stats.clearFraction,
            validFraction: p.stats.validFraction,
          })),
        },
      })
    // The 10 m frame when it is loaded, else the level-1 preview.
    const f = e.full ?? e.thumb
    if (f)
      out.push({
        ...base,
        verification: check('visual', f.level, f.sha256),
        asset: 'visual',
        href: it.visual.href,
        level: f.level,
        window: f.window,
        transform: scaled(it.visual.transform, f.level),
        recipe: RECIPES.frame,
        sha256: f.sha256,
      })
    return out
  })
  const years = [...new Set(pinned.map((e) => Number(e.date.slice(0, 4))))].sort()
  return {
    schema: 'grahsaboot.provenance/1',
    generatedAt: generatedAt.toISOString(),
    app: { name: copy.app.name, version: appVersion },
    investigation: {
      id: inv.id,
      name: inv.name,
      kind: inv.aoi.kind,
      geometry: inv.aoi.geometry,
      roadWidthM: inv.aoi.kind === 'road' ? inv.aoi.widthM : null,
      dateFrom: inv.dateFrom,
      dateTo: inv.dateTo,
      before: inv.before,
      after: inv.after,
      pinned: inv.pinned,
      claim: inv.claim,
    },
    parts: summary.parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM })),
    // The same condition as the block's (src/report/html.ts): a recipe is listed because a figure of it is on the page.
    recipes: change && inv.before && inv.after ? RECIPES : ALWAYS_USED,
    frames,
    notes: inv.notes,
    attribution: [...(years.length ? [copy.attribution.sentinelYears(years)] : []), copy.attribution.osm],
  }
}
