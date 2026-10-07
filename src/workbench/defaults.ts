import type { DateEntry } from './runner.ts'

export const isUsable = (e: DateEntry) =>
  e.quality?.stats.label === 'CLEAR' || e.quality?.stats.label === 'PARTIAL'

function fraction(date: string, from: string, to: string) {
  const t0 = Date.parse(from)
  return (Date.parse(date) - t0) / Math.max(1, Date.parse(to) - t0)
}

export function quartilesDone(entries: DateEntry[], from: string, to: string): boolean {
  return (
    entries.length > 0 &&
    entries.every((e) => {
      const f = fraction(e.date, from, to)
      return (f > 0.25 && f < 0.75) || e.status === 'checked' || e.status === 'error'
    })
  )
}

export function pickDefaults(
  entries: DateEntry[],
  from: string,
  to: string,
): { before: string | null; after: string | null } {
  const ok = entries.filter(isUsable)
  if (ok.length < 2) return { before: null, after: null }
  const v = (e: DateEntry) => e.quality!.stats.clearFraction
  const early = ok
    .filter((e) => fraction(e.date, from, to) <= 0.25)
    .sort((a, b) => v(b) - v(a) || a.date.localeCompare(b.date))
  const late = ok
    .filter((e) => fraction(e.date, from, to) >= 0.75)
    .sort((a, b) => v(b) - v(a) || b.date.localeCompare(a.date))
  const before = (early[0] ?? ok[0]!).date
  const after = (late[0] ?? ok[ok.length - 1]!).date
  return before < after ? { before, after } : { before: ok[0]!.date, after: ok[ok.length - 1]!.date }
}
