import { realDate } from './dates.ts'

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
/** A real day as "20 Dec 2025". Anything else is shown as written: never as another day, and never a throw that blanks the page. */
export const fmtDate = (ymd: string): string => {
  const d = realDate(ymd)
  return d ? DATE.format(d) : ymd
}
export const pct = (f: number) => Math.round(f * 100)
