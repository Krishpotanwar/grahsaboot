import type { Investigation } from '../data/investigation.ts'
import { isUsable } from './defaults.ts'
import type { DateEntry } from './runner.ts'

/**
 * What a save has to wait for before it can send everything it can (E7), or null when it can go. `checks`: a pinned date has no
 * entry yet or is still being checked. `photos`: a usable pinned date has no preview yet, or the before or after photo is not in.
 * A failure is an answer: a failed check or photo is not waited for. `searchDone`: the whole range has been searched, so a pinned
 * date with no entry is not coming. `byDate`: the workbench's own map of its entries, so a render builds nothing. Used only when
 * accounts are on; the words for it are the accounts copy's.
 */
export function saveWait(
  inv: Pick<Investigation, 'pinned' | 'before' | 'after'>,
  byDate: Map<string, DateEntry>,
  searchDone: boolean,
): 'checks' | 'photos' | null {
  const pins = inv.pinned.map((d) => byDate.get(d))
  // Nothing is pinned until the search has picked the pair: until it is over, the pair is still to come.
  if (!searchDone && (pins.length === 0 || pins.some((e) => !e))) return 'checks'
  const held = pins.filter((e): e is DateEntry => !!e)
  if (held.some((e) => e.status === 'queued' || e.status === 'checking')) return 'checks'
  if (held.some((e) => isUsable(e) && !e.thumb && !e.thumbFailed)) return 'photos'
  for (const d of [inv.before, inv.after]) {
    const e = d ? byDate.get(d) : undefined
    if (e && !e.full && !e.error) return 'photos'
  }
  return null
}
