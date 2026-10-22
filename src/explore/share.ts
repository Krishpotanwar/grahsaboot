import { LIMITS } from '../geo/limits.ts'
import { plainNumber, realDate } from '../lib/dates.ts'
import { SCENE_ID } from '../stac/search.ts'

// The share link: what a second person needs to open the same time-lapse, written as address text and read back with the care owed
// to text anyone can edit. Pure: no DOM and no network (a scene is fetched by its id with `getItemById`, src/stac/search.ts), and
// no words for the person: a notice is a code, and the page says it.
//
//   v=1&lat=21.1458&lon=79.0882&side=2000&d=2019-02-20,2021-02-15,2025-02-20&s=S2B_44QKJ_20190220_0_L2A,,S2C_44QKJ_20250220_0_L2A
//
// `d` is the day of each frame. Entry i of `s` is the Earth Search scene of entry i of `d`; it is empty, or missing, for a frame that
// has only its day: a scene of the other catalogue (its ids are built differently), or a link that named days only.
// Never in a link: notes, a claim, a name, anything of an account. A reader ignores every parameter it does not know, and reads
// nothing free-form: each field is a number, a real day or a strict scene id, so no text of an address reaches the page.

const VERSION = '1'
const MAX_FRAMES = 8
const SIDE = { min: 500, max: 2900 } as const // 3000 fails the outline check at 59% of 20,235 sampled places

/** One frame: its day and, when it has one, the Earth Search scene that made it (null: the day alone). */
export interface ShareFrame {
  date: string
  id: string | null
}
export interface Share {
  lat: number
  lon: number
  /** The side of the square, in metres. */
  sideM: number
  frames: readonly ShareFrame[]
}
/**
 * What a read tells the page, as codes (the words are the page's):
 * - `unknown-version`: the address names a version of the link that this code does not read;
 * - `unreadable`: no place, size or frame could be taken from it;
 * - `missing-frame`: a day of the link was left out (not a real day in range, not later than the one before it, or past the 8th);
 * - `date-fallback`: a frame has no scene to ask for, so its day is searched instead.
 */
export type ShareNotice = 'unknown-version' | 'unreadable' | 'missing-frame' | 'date-fallback'
/** `share` is null for a link that cannot be opened; with no notice either, the address held no share link at all (no `v`). */
export interface ShareRead {
  share: Share | null
  notices: readonly ShareNotice[]
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)
const round4 = (x: number) => Math.round(x * 1e4) / 1e4 // 4 decimals: about 11 m
const byDate = (a: ShareFrame, b: ShareFrame) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/**
 * The frames a link may hold, in order: real days from the first day the app takes to today, each later than the one kept before
 * it, at most 8. A scene id that is not an Earth Search id is left out: the frame keeps its day. The range is checked here, around
 * `realDate`, which says only whether a day exists.
 */
function usable(frames: readonly ShareFrame[], today: Date): ShareFrame[] {
  const latest = today.toISOString().slice(0, 10)
  const kept: ShareFrame[] = []
  for (const { date, id } of frames) {
    const ok =
      realDate(date) !== undefined &&
      date >= LIMITS.dates.earliest &&
      date <= latest &&
      date > (kept.at(-1)?.date ?? '') &&
      kept.length < MAX_FRAMES
    if (ok) kept.push({ date, id: id !== null && SCENE_ID.test(id) ? id : null })
  }
  return kept
}

/**
 * The address text (no question mark) for a share, or null when no link could hold it: a centre or size that is not a number, or no
 * usable frame. It writes only the fields above, rounded and clamped so that `decodeShare` takes what it wrote: the frames sorted,
 * the first of a day kept, at most 8 (the earliest).
 */
export function encodeShare(share: Share, today: Date = new Date()): string | null {
  const { lat, lon, sideM } = share
  const frames = usable([...share.frames].sort(byDate), today)
  if (![lat, lon, sideM].every(Number.isFinite) || frames.length === 0) return null
  const ids = frames.map((f) => f.id ?? '')
  return [
    `v=${VERSION}`,
    `lat=${round4(clamp(lat, -90, 90))}`,
    `lon=${round4(clamp(lon, -180, 180))}`,
    `side=${Math.round(clamp(sideM, SIDE.min, SIDE.max))}`,
    `d=${frames.map((f) => f.date).join(',')}`,
    ...(ids.some(Boolean) ? [`s=${ids.join(',')}`] : []),
  ].join('&')
}

/**
 * Reads an address (a search string, or the page's `URLSearchParams`) and never throws. Version 1 only; the centre and the size
 * by digits-only numbers, in range (the centre kept to the 4 decimals a link carries, so what is read is what would be written);
 * the days and scenes as `usable` allows. A day it cannot take is left out with a notice and the other frames stay (a damaged
 * link still opens); a place or size it cannot take refuses the link. Whatever else the address holds is not read.
 */
export function decodeShare(search: string | URLSearchParams, today: Date = new Date()): ShareRead {
  const p = new URLSearchParams(search)
  if (!p.has('v')) return { share: null, notices: [] }
  if (p.get('v') !== VERSION) return { share: null, notices: ['unknown-version'] }
  const lat = plainNumber(p.get('lat'))
  const lon = plainNumber(p.get('lon'))
  const sideM = plainNumber(p.get('side'))
  // The lists are cut where nothing more is read: a ninth day is all it takes to know there were too many, a longer text costs no more.
  const dates = (p.get('d') ?? '').split(',', MAX_FRAMES + 1)
  const ids = (p.get('s') ?? '').split(',', MAX_FRAMES)
  const frames = usable(
    dates.map((date, i) => ({ date, id: ids[i] ?? null })),
    today,
  )
  if (
    lat === undefined ||
    Math.abs(lat) > 90 ||
    lon === undefined ||
    Math.abs(lon) > 180 ||
    sideM === undefined ||
    !Number.isInteger(sideM) ||
    sideM < SIDE.min ||
    sideM > SIDE.max ||
    frames.length === 0
  )
    return { share: null, notices: ['unreadable'] }
  const notices: ShareNotice[] = []
  if (frames.length < dates.length) notices.push('missing-frame')
  if (frames.some((f) => f.id === null)) notices.push('date-fallback')
  return { share: { lat: round4(lat), lon: round4(lon), sideM, frames }, notices }
}
