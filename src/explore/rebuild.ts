import type { S2Item } from '../stac/types.ts'
import type { ShareFrame, ShareNotice } from './share.ts'

// The date fallback of a share link: the frames `decodeShare` read, turned into scenes. A frame is asked for by the id the link names;
// a miss, a failed lookup, or a frame that has no id (an old link that named days only, or one made on the other catalogue, whose
// ids a link cannot carry) is asked for by its day instead, and says so. Pure: the two lookups are the caller's (`getItemById` in
// src/stac/search.ts, and a one-day search) and there is no text: a notice is a code, and the page says it.

export interface Lookups {
  /** The scene with this id, or null when there is none (`getItemById`). */
  byId: (id: string) => Promise<S2Item | null>
  /** The best scene of this day, from whichever catalogue answers, or null when there is none. */
  byDate: (date: string) => Promise<S2Item | null>
  /**
   * The caller's, the same one the lookups were given: they must honour it, for nothing here races them against it. An error is an
   * abort when this has fired, whatever its name; nothing more is asked after it.
   */
  signal?: AbortSignal
}
/** A frame with its scene. `exact` is false when the day's scene stands in for the one the link named, or for none. */
export interface RebuiltFrame {
  date: string
  item: S2Item
  exact: boolean
}
export interface Rebuilt {
  /** The frames that have a scene, in the order of the link. */
  frames: readonly RebuiltFrame[]
  /**
   * `date-fallback`: a frame has the day's scene, not the one named. `missing-frame`: a frame has no scene by id or by day, whether
   * the catalogue has none or a lookup failed.
   */
  notices: readonly ShareNotice[]
  /**
   * How many of the frames without a scene lost it to a day search that threw (offline, a failing catalogue), not to a clean answer
   * of none. They are in `missing-frame` too; the page words the two apart, and offers a retry for these.
   */
  failed: number
}

/** What a lookup gave: a scene, or none; `failed` when none is because the lookup threw, not because there was none. */
interface Answer {
  item: S2Item | null
  failed: boolean
}

/** An answer. A failed lookup is a miss that says it failed, unless the caller has gone: that no lookup may hide. */
async function ask(lookup: () => Promise<S2Item | null>, signal?: AbortSignal): Promise<Answer> {
  signal?.throwIfAborted() // nothing new is asked once the caller has gone
  try {
    const item = await lookup()
    signal?.throwIfAborted() // whatever the lookup did with the signal
    return { item, failed: false }
  } catch (e) {
    if (signal?.aborted) throw e
    return { item: null, failed: true }
  }
}

/**
 * The scenes of a share's frames, in the order of the link, every frame asked at once. It rejects only with a caller abort, and
 * once the caller has aborted it never fulfils, even when a lookup ignored the signal and answered: a frame that cannot be had is
 * left out with `missing-frame`, and the others stay. `date-fallback` is said here and nowhere else; `missing-frame` may also come
 * from `decodeShare` (a day left out of the link), so the page merges the two lists as a set.
 */
export async function rebuildFrames(
  frames: readonly ShareFrame[],
  { byId, byDate, signal }: Lookups,
): Promise<Rebuilt> {
  const one = async ({ date, id }: ShareFrame): Promise<{ frame: RebuiltFrame | null; failed: boolean }> => {
    // A lookup by id that threw only sends the frame to its day: the day search decides if the frame is lost, and why.
    const named = id === null ? null : (await ask(() => byId(id), signal)).item
    // Exact is the scene the link named, of the day it gave: any other answer is a miss, so a stand-in is never passed off as it.
    if (named?.id === id && named.date === date)
      return { frame: { date, item: named, exact: true }, failed: false }
    const { item, failed } = await ask(() => byDate(date), signal)
    // The day's scene may be the very one named (the lookup by id failed, say): it is exact then, and no fallback.
    return { frame: item && { date, item, exact: item.id === id }, failed }
  }
  const found = await Promise.all(frames.map(one))
  const kept = found.flatMap((f) => (f.frame ? [f.frame] : []))
  const notices: ShareNotice[] = []
  if (kept.length < frames.length) notices.push('missing-frame')
  if (kept.some((f) => !f.exact)) notices.push('date-fallback')
  return { frames: kept, notices, failed: found.filter((f) => f.failed).length }
}
