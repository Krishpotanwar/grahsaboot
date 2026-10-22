/*
 * "What we measured": the report's sentences about the change rule (src/evidence/change.ts), made from numbers only. Pure: it
 * turns the rule's result and the numbers of the two pinned pictures into text, and the words are src/ui/copy-flow.ts
 * `flow.report.measured`. The report prints them (src/report/html.ts) in this order:
 *
 *   lead        where the figures come from: computed by a fixed rule, not seen by a person
 *   pictures    the date, the clear view and the sun height of each picture (a figure that is not known is left out)
 *   findings    what the rule found, one of five (ruling D23, D27), then the different-seasons sentence when it applies
 *   record      the rule, the grid recipe and every setting it was run with, so it can be run again
 *
 * The rule's tag and its numbers (0.3 ha, 30 m, 10 m) are read from the result, which carries the constants it was made with.
 * The block states what the rule did and never judges the person's claim: no verdict, and not the honest line of the time-lapse.
 */
import type { ChangeResult } from '../evidence/change.ts'
import { RECIPES } from '../evidence/types.ts'
import { realDate } from '../lib/dates.ts'
import { fmtDate } from '../lib/format.ts'
import { flow } from '../ui/copy-flow.ts'

const M = flow.report.measured

/** More than this many days apart in the year, and the two dates are called different seasons (design, stage 2b-i). */
const SEASON_DAYS = 20

export interface MeasuredPicture {
  /** The day, YYYY-MM-DD. */
  date: string
  /** Whole percent of clear view, or null when the date has no check result. */
  clearPct: number | null
  /** Degrees above the horizon, or null when the catalogue has none. */
  sunElevation: number | null
}
export interface MeasuredText {
  lead: string
  /** The before and the after picture, one sentence each. */
  pictures: string[]
  /** What the rule found, as one paragraph; then the different-seasons sentence when it applies. */
  findings: string[]
  record: string
}

// A 365-day year, so that one date reads the same in every year: 29 February counts as 28 February (plan A14).
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const dayOfYear = (d: Date): number =>
  DAYS_BEFORE_MONTH[d.getUTCMonth()]! + Math.min(d.getUTCDate(), DAYS_IN_MONTH[d.getUTCMonth()]!)

/** How far apart two days fall in the year, going round its end (28 December and 10 January are 13 days apart); null unless both are real days. */
export function daysApartInYear(a: string, b: string): number | null {
  const [da, db] = [realDate(a), realDate(b)]
  if (!da || !db) return null
  const gap = Math.abs(dayOfYear(da) - dayOfYear(db))
  return Math.min(gap, 365 - gap)
}

/** A number of the constants as a sentence writes it: 0.3, 30, 0.96 (two decimals at most, no trailing zero). */
const plain = (x: number): string => String(Math.round(x * 100) / 100)
/** Hectares are printed rounded: the same pixels give the same figure in every runtime, the last digits of a float may not. */
const hectares = (x: number): string =>
  x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The paragraph for the one state the rule ended in. */
function found(c: ChangeResult, from: string, to: string): string {
  const k = c.constants
  const ha = plain((k.areaMinNative * k.nativeM ** 2) / 10_000)
  const across = plain(k.blockNative * k.nativeM)
  switch (c.state) {
    case 'not-enough-ground':
      return M.notEnoughGround
    case 'outline-too-small':
      return M.outlineTooSmall(c.recipe, ha, across)
    case 'most-differs':
      return M.mostDiffers(c.recipe)
    case 'nothing':
      return M.noPatch(c.recipe, ha, across, plain(k.nativeM))
    case 'changed':
      return `${M.figure({
        from,
        to,
        rule: c.recipe,
        patches: c.patches,
        ha,
        m: across,
        area: hectares(c.hectares),
        pixels: c.clearPixels.toLocaleString('en-US'),
      })} ${M.caution}`
  }
}

export function measuredText(a: {
  change: ChangeResult
  before: MeasuredPicture
  after: MeasuredPicture
  /** The display grid the rule ran on: its size is part of the record. */
  grid?: { width: number; height: number }
}): MeasuredText {
  const { change: c, before, after, grid } = a
  const picture = (role: string, p: MeasuredPicture) =>
    M.picture(role, fmtDate(p.date), p.clearPct, p.sunElevation === null ? null : Math.round(p.sunElevation))
  // In two states nothing was compared, so there is nothing for "seasonal change is included" to be included in.
  const compared = c.state === 'most-differs' || c.state === 'nothing' || c.state === 'changed'
  const apart = daysApartInYear(before.date, after.date)
  const gridRecord = [RECIPES.display, grid ? M.gridSize(grid.width, grid.height) : ''].filter(Boolean)
  const settings = Object.entries(c.constants).map(([name, value]) => `${name} ${value}`)
  return {
    lead: M.lead,
    pictures: [picture(flow.workbench.before, before), picture(flow.workbench.after, after)],
    findings: [
      found(c, fmtDate(before.date), fmtDate(after.date)),
      ...(compared && apart !== null && apart > SEASON_DAYS ? [M.differentSeasons] : []),
    ],
    record: M.record(c.recipe, gridRecord.join(', '), settings.join(', ')),
  }
}
