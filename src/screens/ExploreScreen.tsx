import { useEffect, useMemo, useState } from 'react'
import { LOAD_MB } from '../explore/cost.ts'
import { placeFromParams, startKey } from '../explore/params.ts'
import { MIN_PLAY } from '../explore/playback.ts'
import { Player, type YearFrame } from '../explore/Player.tsx'
import { isArmed } from '../explore/startFlag.ts'
import { useTimeLapse, type Run } from '../explore/useTimeLapse.ts'
import { YearStrip } from '../explore/YearStrip.tsx'
import { Link, useSearchParams } from '../lib/router.tsx'
import { placeToQuery } from '../map/camera.ts'
import type { Place } from '../search/nominatim.ts'
import { copy } from '../ui/copy.ts'
import { explore } from '../ui/copy-explore.ts'
import { Figure } from '../ui/figure/Figure.tsx'
import { Button } from '../ui/kit.tsx'

const WRAP = 'mx-auto grid max-w-[46rem] gap-6 px-4 py-8 lg:px-6'
const H1 = 'text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight tracking-[-0.03em]'

const framesOf = (years: Run['years']): YearFrame[] =>
  [...years.values()]
    .flatMap((y) => ('frame' in y ? [{ year: y.year, frame: y.frame }] : []))
    .sort((a, b) => a.year - b.year)

/** The page of the time-lapse of one place, `/explore?lat&lon&name`: a plain notice for an address that names none. */
export default function ExploreScreen() {
  const place = placeFromParams(useSearchParams())
  // One load for one place: a different place is a different page, so the old load ends with its page.
  return place ? <Explore key={startKey(place)} place={place} /> : <BadAddress />
}

function BadAddress() {
  return (
    <div className={`${WRAP} justify-items-start`}>
      <h1 className={H1}>{explore.title}</h1>
      <p>{explore.bad}</p>
      <Link
        to="/"
        className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg hover:opacity-90"
      >
        {explore.home}
      </Link>
    </div>
  )
}

function Explore({ place }: { place: Place }) {
  // Pressed from our own button: it loads at once, as the button said it would. Any other way in waits for a tap on Load (D8).
  const [auto] = useState(() => isArmed(startKey(place)))
  const { run, start } = useTimeLapse(place, auto)
  const [status, setStatus] = useState('')
  const frames = useMemo(() => framesOf(run.years), [run.years])
  const { plan } = run

  // Spoken when a load starts and when it ends, never for each picture.
  useEffect(() => {
    if (run.phase === 'loading') setStatus(explore.loading)
    else if (run.phase === 'done')
      setStatus(explore.loaded(frames.length, plan?.years.length ?? frames.length))
  }, [run.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // The button that was pressed is gone once the load starts: focus goes to the page, as it does on a change of route.
  const begin = () => {
    start()
    document.getElementById('main')?.focus({ preventScroll: true })
  }
  const strip = (current: number | null) =>
    plan && <YearStrip years={plan.years} results={run.years} current={current} />

  return (
    <div className={WRAP}>
      <h1 className={H1}>{explore.title}</h1>
      <p className="max-w-[60ch] text-fg-2">{explore.squareAround(place.name)}</p>
      <p role="status" className="sr-only">
        {status}
      </p>

      {/* A picture for the wait, until the first year is drawn: the pictures themselves are never shown beside anything that moves. */}
      {frames.length === 0 && (run.phase === 'idle' || run.phase === 'loading') && (
        <Figure className="-my-4 -ml-11 w-64" />
      )}

      {run.phase === 'idle' && (
        <div className="grid justify-items-start gap-3">
          <p className="max-w-[60ch]">{explore.intro}</p>
          <Button variant="primary" onClick={begin}>
            {explore.load(LOAD_MB)}
          </Button>
          <p className="text-sm text-fg-2">{explore.waitsForTap}</p>
        </div>
      )}

      {run.phase === 'loading' && (
        <p className="text-fg-2">
          {plan ? explore.progress(run.years.size, plan.years.length) : explore.searching}
        </p>
      )}

      {run.phase === 'failed' && run.failure && (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-bad">
            {explore.failed[run.failure]}
          </p>
          {(run.failure === 'OFFLINE' || run.failure === 'FAILED') && (
            <Button onClick={begin}>{copy.common.retry}</Button>
          )}
        </div>
      )}

      {frames.length > 0 && plan ? (
        <Player
          frames={frames}
          width={plan.grid.width}
          height={plan.grid.height}
          name={place.name}
          done={run.phase === 'done'}
          say={setStatus}
          strip={strip}
        />
      ) : (
        strip(null)
      )}

      {run.phase === 'done' && frames.length < MIN_PLAY && <p>{explore.tooFew}</p>}

      {frames.length > 0 && (
        <div className="grid max-w-[60ch] gap-3 text-sm text-fg-2">
          <p>{explore.notEvidence}</p>
          <p>{explore.credit(frames.map((f) => Number(f.frame.date.slice(0, 4))))}</p>
        </div>
      )}

      <Link
        to={placeToQuery(place)}
        className="inline-flex min-h-11 w-fit items-center underline underline-offset-4"
      >
        {explore.handOver}
      </Link>
    </div>
  )
}
