import { useEffect, useId, useState } from 'react'
import { placeLabel } from '../map/camera.ts'
import type { Place } from '../search/nominatim.ts'
import type { PassSummary, SatPosition } from '../sats/useSatellites.ts'
import { copy } from './copy.ts'

// en-IN: the UI is English only, and Indian viewers see "IST" as in the approved mockup (other zones print GMT±n or UTC).
const fmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
})

export function SatellitesPanel({
  sats,
  status,
  place,
  passes,
  onHot,
}: {
  sats: SatPosition[]
  status: 'loading' | 'ready' | 'unavailable'
  place: Place | null
  passes(target: [number, number]): Promise<PassSummary[]>
  /** Told which satellite looks at the place first (NORAD id), or null; the globe draws that track in accent. */
  onHot?(norad: number | null): void
}) {
  const id = useId()
  const [next, setNext] = useState<PassSummary[] | null>(null)
  useEffect(() => {
    setNext(null)
    if (!place || status !== 'ready') return
    let live = true
    passes([place.lon, place.lat]).then((p) => {
      if (live) setNext(p)
    })
    return () => {
      live = false
    }
  }, [place, status, passes])

  const hot = next
    ?.flatMap((p) => p.times.slice(0, 1).map((t) => ({ norad: p.norad, name: p.name, time: t.time })))
    .sort((a, b) => a.time - b.time)[0]
  const hotNorad = hot?.norad ?? null
  useEffect(() => {
    onHot?.(hotNorad)
  }, [hotNorad, onHot])

  return (
    <section aria-labelledby={id} className="glass no-print w-full px-5 pb-4 pt-[18px] text-sm lg:w-[352px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 id={id} className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
          {copy.sats.title}
        </h2>
        {status === 'ready' && (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.12em] text-ok">
            <span className="sat-dot" aria-hidden />
            {copy.sats.live}
          </span>
        )}
      </div>
      {status === 'loading' && <p className="text-fg-2">{copy.sats.loading}</p>}
      {status === 'unavailable' && (
        <p className="text-fg-2" role="status">
          {copy.sats.unavailable}
        </p>
      )}
      {status === 'ready' && (
        <table className="num w-full border-collapse font-mono text-[0.8125rem] leading-none">
          <tbody>
            {sats.map((s) => (
              <tr key={s.norad} className="border-t border-line">
                <th
                  scope="row"
                  className={`py-2.5 text-left font-normal ${s.norad === hotNorad ? 'text-accent' : ''}`}
                >
                  {s.name}
                </th>
                <td className="py-2.5 text-right text-fg-2">{copy.sats.position(s.lat, s.lon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div aria-live="polite">
        {place && status === 'ready' && (
          <div className="mt-3.5 grid gap-1.5 border-t border-line pt-3.5">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-fg-2">
              {copy.sats.nextLook(placeLabel(place))}
            </p>
            <p className="text-[0.9375rem] font-medium">
              {next === null ? (
                <span className="text-fg-2">{copy.common.loading}</span>
              ) : hot ? (
                `${hot.name} · ${fmt.format(hot.time)}`
              ) : (
                copy.sats.noPass
              )}
            </p>
            <p className="mt-1.5 text-xs leading-[1.45] text-fg-2">{copy.sats.estimated}</p>
          </div>
        )}
      </div>
    </section>
  )
}
