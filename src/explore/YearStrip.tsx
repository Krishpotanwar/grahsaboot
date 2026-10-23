import { fmtDate } from '../lib/format.ts'
import { explore } from '../ui/copy-explore.ts'
import type { YearResult } from './load.ts'

/**
 * The years of the time-lapse, oldest first, as a plain list that fills as the pictures arrive: a year is its date and how clear
 * it is, a gap says why it has no picture, and a year still on its way says so. `current` is the year the player shows.
 */
export function YearStrip({
  years,
  results,
  current,
}: {
  years: readonly number[]
  results: ReadonlyMap<number, YearResult>
  current: number | null
}) {
  return (
    <ol aria-label={explore.stripLabel} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {years.map((year) => {
        const r = results.get(year)
        const here = r !== undefined && 'frame' in r && current === year
        return (
          <li
            key={year}
            aria-current={here ? 'true' : undefined}
            className={`grid content-start gap-0.5 rounded-[6px] border p-3 text-sm ${here ? 'border-fg bg-panel' : r ? 'border-line' : 'border-dashed border-line'}`}
          >
            <span className="num font-semibold">{year}</span>
            {r && 'frame' in r ? (
              <>
                <span className="text-fg-2">{fmtDate(r.frame.date)}</span>
                <span className="text-fg-2">{explore.clear(r.frame.clearPct)}</span>
              </>
            ) : (
              <span className="text-fg-2">{r ? explore.gap[r.gap] : explore.slotLoading}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
