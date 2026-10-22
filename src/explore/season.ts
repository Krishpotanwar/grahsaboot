/*
 * The same-season picker (plan F7, review answer D29): which season the time-lapse compares, and which picture of each year.
 * Pure: it decides from scene metadata the caller already holds (one scene per date, as `selectPerDate` gives it), searches
 * nothing, reads no pixel and prints no text; the words for a gap or for an age are Explore's copy.
 *
 *   the scenes of the last 12 months (LOOKBACK_DAYS)
 *     -> pickSeason: for target days every 5 days back from now, count the scenes of 20% cloud or less within 20 days;
 *        the most wins, ties by the lowest mean of the two lowest clouds, then the latest target day
 *        -> Season { monthDay, cluster (newest first: [0] is the last frame), windows (the last SPAN_YEARS years) }
 *   the caller searches each earlier year's window
 *     -> rankYear: covers the square, least cloud, nearest the target day; never a scene outside the window
 *     -> the caller checks them in that order  -> settleYear: the first one clear over 80% is the frame, else a labelled gap
 */
import { realDate } from '../lib/dates.ts'
import type { DateCandidate, S2Item } from '../stac/types.ts'

/** The years of a time-lapse: the year of the last frame and the ones before it. */
export const SPAN_YEARS = 6
/** A frame comes from within this many days of the target day, either side; so does a scene of the cluster that sets the day. */
export const WINDOW_DAYS = 20
/** The scenes that set the season are the last 12 months: this many days back from the day of now. */
export const LOOKBACK_DAYS = 365
/** A picture is a frame when it is clear over at least this share of the square (the bar of `loadContext` too). */
export const CLEAR_VIEW_MIN = 0.8

const TARGET_STEP_DAYS = 5
const CLEAR_SCENE_CLOUD = 20 // a scene at or under this cloud cover (%) is clear in the metadata
const NO_CLOUD_FIGURE = 101 // sorts after every real one, as in `rankScenes`
const DAY = 86_400_000

export interface YearWindow {
  /** The year of the middle day: a window across 1 January belongs to the year its middle day is in. */
  year: number
  /** The target day in that year, `YYYY-MM-DD`; 29 February is 28 February in a year that has none. */
  middle: string
  /** First and last day of the window, `YYYY-MM-DD`, both included: the range of that year's search. */
  from: string
  to: string
}
export interface Season {
  /** The target day as `MM-DD`: the same month and day in every year. */
  monthDay: string
  /** The clear scenes within 20 days of the target day, newest first. The first is the last frame (its age: `ageDays`). */
  cluster: DateCandidate[]
  /** The last SPAN_YEARS years, newest first. The first is the year of the cluster: its frame comes from `cluster`. */
  windows: YearWindow[]
}
export type GapReason = 'no-clear-picture' | 'timed-out' | 'offline'
export interface Checked {
  scene: DateCandidate
  /** The share of the square that is clear (0 to 1). */
  clear: number
}
export type Settled = { frame: Checked } | { gap: GapReason }

/** Days since 1970-01-01 of `YYYY-MM-DD`, or NaN when it is not a real day (every comparison with NaN is false). */
const dayNumber = (text: string): number => (realDate(text)?.getTime() ?? NaN) / DAY
const ymd = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10)
const cloudOf = (s: DateCandidate): number => s.item.cloudCover ?? NO_CLOUD_FIGURE

interface ClearScene {
  scene: DateCandidate
  day: number
  cloud: number
}
/** The mean of the two lowest cloud covers (of the one, for a cluster of one). */
const lowMean = (xs: ClearScene[]): number => {
  const two = xs
    .map((x) => x.cloud)
    .sort((a, b) => a - b)
    .slice(0, 2)
  return two.reduce((a, b) => a + b, 0) / two.length
}

/**
 * The season of the clearest stretch of the last 12 months, or null when no scene qualifies (a scene counts when it covers the
 * square, has a cloud figure of 20% or less and a real date inside the 365 days up to the day of `now`). Target days run back from
 * the day of `now` in steps of 5 days; the scenes of a target day are those within 20 days of it. Pass one scene per date.
 */
export function pickSeason(scenes: readonly DateCandidate[], now: Date): Season | null {
  const today = Math.floor(now.getTime() / DAY)
  const clear = scenes.flatMap((scene): ClearScene[] => {
    const cloud = scene.item.cloudCover
    if (!scene.coversAoi || cloud === null || cloud > CLEAR_SCENE_CLOUD) return []
    const day = dayNumber(scene.date)
    return day >= today - LOOKBACK_DAYS && day <= today ? [{ scene, day, cloud }] : []
  })
  let best: { target: number; members: ClearScene[]; mean: number } | undefined
  // From the latest target day back, and only a strictly better count or mean replaces the best: the latest wins a tie.
  for (let k = 0; k * TARGET_STEP_DAYS <= LOOKBACK_DAYS; k++) {
    const target = today - k * TARGET_STEP_DAYS
    const members = clear.filter((c) => Math.abs(c.day - target) <= WINDOW_DAYS)
    if (!members.length) continue
    const mean = lowMean(members)
    if (
      !best ||
      members.length > best.members.length ||
      (members.length === best.members.length && mean < best.mean)
    )
      best = { target, members, mean }
  }
  if (!best) return null
  const target = ymd(best.target)
  return {
    monthDay: target.slice(5),
    cluster: [...best.members]
      .sort((a, b) => b.day - a.day || a.scene.item.id.localeCompare(b.scene.item.id))
      .map((c) => c.scene),
    windows: yearWindows(target.slice(5), Number(target.slice(0, 4))),
  }
}

/**
 * The windows of the last SPAN_YEARS years ending in `lastYear`, newest first: 20 days either side of `monthDay` (`MM-DD`) in
 * each year, so the day of the year never drifts after a leap day. A month and day that is not a real one has no windows.
 */
export function yearWindows(monthDay: string, lastYear: number): YearWindow[] {
  return Array.from({ length: SPAN_YEARS }, (_, i) => lastYear - i).flatMap((year): YearWindow[] => {
    const exact = dayNumber(`${year}-${monthDay}`)
    const middle = Number.isNaN(exact) && monthDay === '02-29' ? dayNumber(`${year}-02-28`) : exact
    return Number.isNaN(middle)
      ? []
      : [{ year, middle: ymd(middle), from: ymd(middle - WINDOW_DAYS), to: ymd(middle + WINDOW_DAYS) }]
  })
}

/**
 * The candidates of one year in the order to check them: only scenes that cover the square and fall inside the window (a year
 * never borrows a picture of another season), least cloud first, then nearest the middle day, then the later date.
 */
export function rankYear(scenes: readonly DateCandidate[], window: YearWindow): DateCandidate[] {
  const from = dayNumber(window.from)
  const to = dayNumber(window.to)
  const middle = dayNumber(window.middle)
  return scenes
    .flatMap((scene) => {
      const day = dayNumber(scene.date)
      return scene.coversAoi && day >= from && day <= to ? [{ scene, day }] : []
    })
    .sort(
      (a, b) =>
        cloudOf(a.scene) - cloudOf(b.scene) ||
        Math.abs(a.day - middle) - Math.abs(b.day - middle) ||
        b.day - a.day ||
        a.scene.item.id.localeCompare(b.scene.item.id),
    )
    .map((x) => x.scene)
}

/**
 * What a year comes to once its candidates were checked, `checked` in rank order: the first one clear over at least 80% of the
 * square is the frame, else the year is a gap, never another scene or season. `cut` says the year was stopped before every
 * candidate was checked (its deadline passed, or there is no network); that reason is kept, and is not "no clear picture".
 */
export function settleYear(
  checked: readonly Checked[],
  cut?: Exclude<GapReason, 'no-clear-picture'>,
): Settled {
  const frame = checked.find((c) => c.clear >= CLEAR_VIEW_MIN)
  return frame ? { frame } : { gap: cut ?? 'no-clear-picture' }
}

/** A scene's age in whole days at `now` (rounded down, never below 0), as `rankScenes` counts it: the label of the last frame. */
export function ageDays(item: Pick<S2Item, 'datetime'>, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(item.datetime)) / DAY))
}
