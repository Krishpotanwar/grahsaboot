const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
export const fmtDate = (ymd: string) => DATE.format(new Date(`${ymd}T00:00:00Z`))
export const pct = (f: number) => Math.round(f * 100)
