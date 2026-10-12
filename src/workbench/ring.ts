/**
 * The rested dates whose full photos stay in memory: the last `keep` of them. A full photo and its mask are about 5 MiB at
 * 1024 px, so resting on a hundred dates would hold half a gigabyte. Dates the report or the save needs (the before and after
 * photos, the pinned dates) are never in the ring and never released.
 * `ring` is oldest first; `date` is the one just rested on. Returns the new ring and the dates to release.
 */
export function trimRing(
  ring: string[],
  date: string,
  keep: number,
  protect: ReadonlySet<string>,
): { ring: string[]; release: string[] } {
  const next = ring.filter((d) => d !== date && !protect.has(d))
  if (!protect.has(date)) next.push(date)
  const release = next.splice(0, Math.max(0, next.length - keep))
  return { ring: next, release }
}
