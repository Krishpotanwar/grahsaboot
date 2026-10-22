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
  /** The caller's. An error is an abort when this has fired, whatever its name; nothing more is asked after it. */
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
  frames: RebuiltFrame[]
  /** `missing-frame`: a frame has no scene by id or by day. `date-fallback`: a frame has the day's scene, not the one named. */
  notices: ShareNotice[]
}

/** An answer, or null for a miss. A failed lookup is a miss, unless the caller has gone: that no lookup may hide. */
async function ask(lookup: () => Promise<S2Item | null>, signal?: AbortSignal): Promise<S2Item | null> {
  signal?.throwIfAborted() // nothing new is asked once the caller has gone
  try {
    const item = await lookup()
    signal?.throwIfAborted() // whatever the lookup did with the signal
    return item
  } catch (e) {
    if (signal?.aborted) throw e
    return null
  }
}

/**
 * The scenes of a share's frames, in the order of the link, every frame asked at once. It throws only for a caller abort: a frame
 * that cannot be had is left out with `missing-frame`, and the others stay. The codes are a set, shown once each whether this or
 * `decodeShare` raised them.
 */
export async function rebuildFrames(
  frames: readonly ShareFrame[],
  { byId, byDate, signal }: Lookups,
): Promise<Rebuilt> {
  const one = async ({ date, id }: ShareFrame): Promise<RebuiltFrame | null> => {
    const named = id === null ? null : await ask(() => byId(id), signal)
    // Exact is the scene the link named, of the day it gave: any other answer is a miss, so a stand-in is never passed off as it.
    if (named?.id === id && named.date === date) return { date, item: named, exact: true }
    const item = await ask(() => byDate(date), signal)
    return item && { date, item, exact: false }
  }
  const kept = (await Promise.all(frames.map(one))).filter((f): f is RebuiltFrame => f !== null)
  const notices: ShareNotice[] = []
  if (kept.length < frames.length) notices.push('missing-frame')
  if (kept.some((f) => !f.exact)) notices.push('date-fallback')
  return { frames: kept, notices }
}
