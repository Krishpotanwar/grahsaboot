const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// The shape frames.item_id has in the database and the handler accepts for an item id: nothing in it can end a PostgREST value,
// open a group or add a condition.
const ITEM_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/

const date = (v: unknown): string => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw new Error('BAD_DATE')
  return v
}

/**
 * The `or` filter of the prune delete (always combined with `investigation_id = <id>`): frames whose date is no longer pinned,
 * and frames of `current.date` that came from another item than `current.itemId` (an alternate or the fallback source was
 * picked). `null` means no extra filter: with nothing pinned every frame of the investigation goes. Every value is checked
 * here, so no string from a request reaches the filter unchecked; anything malformed throws.
 */
export function pruneFilter(pinned: string[], current: { date: string; itemId: string }): string | null {
  const keep = pinned.map(date)
  const day = date(current.date)
  if (typeof current.itemId !== 'string' || !ITEM_RE.test(current.itemId)) throw new Error('BAD_ITEM')
  if (!keep.length) return null
  return `frame_date.not.in.(${keep.join(',')}),and(frame_date.eq.${day},item_id.neq.${current.itemId})`
}
