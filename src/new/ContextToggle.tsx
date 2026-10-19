import type { Map as MlMap } from 'maplibre-gl'
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { loadContext } from '../context/load.ts'
import { regionFor, viewTooWide } from '../context/region.ts'
import type { Bbox } from '../geo/aoi.ts'
import { fmtDate } from '../lib/format.ts'
import { removeContextLayer, setContextLayer } from '../map/contextLayer.ts'
import { useMapStage } from '../map/MapStage.tsx'
import { searchSentinel2 } from '../stac/search.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button } from '../ui/kit.tsx'
import { createImageryClient, type ImageryClient } from '../workers/imagery-client.ts'
import {
  COST_MB,
  nowFromUrl,
  OFF,
  readChoice,
  runLoad,
  SLOW_MS,
  writeChoice,
  type Choice,
  type View,
} from './contextState.ts'

// The Map | Satellite switch of the outline step, its one status line and the buttons under it (see the plan's design review
// D2-D8). The picture is a 10 m photo to find a place by, never evidence. This whole file, and everything under src/context, is a
// lazy chunk that a build with VITE_CONTEXT_IMAGERY=0 leaves out (contextGate.ts).

// The viewer's view tabs (EvidenceViewer.tsx): real radios in one group, only their look is a segmented control.
const RADIO = 'peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default'
const FACE =
  'inline-flex h-11 cursor-pointer items-center px-4 text-[0.9375rem] font-medium text-fg-2 peer-checked:bg-fg peer-checked:text-bg forced-colors:peer-checked:underline peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-default peer-disabled:opacity-40'

export interface ControlsProps {
  /** Satellite is the choice: a remembered one waits here until the map is ready and the view fits. */
  want: boolean
  view: View
  /** The map has loaded (false while it loads, is rebuilt or swaps its style). */
  ready: boolean
  /** The view is wider than the picture can cover. */
  tooWide: boolean
  onChoose(c: Choice): void
  /** Update for this view, or Try again. */
  onAgain(): void
  onCancel(): void
  mapRadio?: Ref<HTMLInputElement>
}

/** What the line under the switch says, and whether it is a failure. */
function lineFor({ want, view, ready, tooWide }: ControlsProps): { text: ReactNode; alert: boolean } {
  switch (view.s) {
    case 'off':
      // The map's own line above says "Loading the map": nothing to add while it does, whichever view is the choice.
      if (!ready) return { text: '', alert: false }
      if (want) return { text: tooWide ? flow.context.tooWideOn : '', alert: false }
      return { text: tooWide ? flow.context.tooWideOn : flow.context.off, alert: false }
    case 'loading':
      return {
        text: (
          <>
            {flow.context.stages[view.stage]}
            {view.slow && <span className="block">{flow.context.still}</span>}
          </>
        ),
        alert: false,
      }
    case 'on': {
      const { image, cloudy } = view
      const more = [
        image.ageDays > 75 || image.widened ? flow.context.age(image.ageDays) : null,
        cloudy ? flow.context.cloudy(image.clearPct) : null,
        tooWide ? flow.context.tooWideUpdate : null,
      ].filter(Boolean)
      const label = flow.context.on(fmtDate(image.date))
      return { text: more.length ? `${label}. ${more.join(' ')}` : label, alert: false }
    }
    case 'none':
      return { text: flow.context.none, alert: false }
    case 'fail':
      return { text: view.offline ? flow.context.offline : flow.context.failed, alert: true }
  }
}

/** The control and its line, for a given state. ContextToggle below holds the state. */
export function ContextControls(p: ControlsProps) {
  const { want, view, ready, tooWide } = p
  const { text, alert } = lineFor(p)
  const again = view.s === 'none' || view.s === 'fail'
  return (
    <div className="grid content-start gap-2">
      <fieldset className="flex w-fit max-w-full overflow-hidden rounded-[6px] border border-control">
        <legend className="sr-only">{flow.context.legend}</legend>
        {(['map', 'satellite'] as const).map((c) => (
          <label key={c} className={`relative ${c === 'satellite' ? 'border-l border-control' : ''}`}>
            <input
              ref={c === 'map' ? p.mapRadio : undefined}
              type="radio"
              name="basemap"
              value={c}
              checked={c === 'satellite' ? want : !want}
              // Turning it on needs a map that is ready and a view the picture can cover; once it is on, both stay usable.
              disabled={c === 'satellite' && view.s === 'off' && (!ready || tooWide)}
              onChange={() => p.onChoose(c)}
              className={RADIO}
            />
            <span className={FACE}>{c === 'map' ? flow.context.map : flow.context.satellite(COST_MB)}</span>
          </label>
        ))}
      </fieldset>
      {/* The polite line is always mounted, so a screen reader hears every change made inside it (a live region inserted with its
          text is announced unreliably); a failure is a separate alert, there only while it lasts. */}
      <div>
        <p role="status" className="text-sm text-fg-2">
          {alert ? '' : text}
        </p>
        {alert && (
          <p role="alert" className="text-sm text-bad">
            {text}
          </p>
        )}
      </div>
      {view.s !== 'off' && (
        // One button for Update / Try again, kept in place while it loads. Then it is greyed but stays focusable (a focused button that
        // becomes disabled drops focus to the page), and a second press finds start() busy and does nothing.
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={p.onAgain}
            aria-disabled={view.s === 'loading' || undefined}
            className={view.s === 'loading' ? 'opacity-40' : ''}
            disabled={!ready || (view.s === 'on' && tooWide)}
          >
            {again ? copy.common.retry : flow.context.update}
          </Button>
          {view.s === 'loading' && (
            <Button size="sm" onClick={p.onCancel}>
              {copy.common.cancel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** The map's visible box, or null when the camera cannot say (MapLibre throws on a camera that has gone NaN). */
function viewBox(map: MlMap): Bbox | null {
  try {
    const b = map.getBounds()
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
  } catch {
    return null
  }
}

export default function ContextToggle() {
  const { map, mapReady, installLayers } = useMapStage()
  const [want, setWant] = useState(() => readChoice() === 'satellite')
  const [view, setView] = useState<View>(OFF)
  const [tooWide, setTooWide] = useState(false)
  // The load in flight, if any: at most one, whatever is pressed.
  const run = useRef<AbortController | null>(null)
  const mapRadio = useRef<HTMLInputElement>(null)
  const image = view.s === 'on' ? view.image : null

  const stop = () => {
    run.current?.abort()
    run.current = null
  }

  /** Plans the region from the view as it is now and loads it. The imagery client lives for this load only. */
  const start = () => {
    if (run.current || !map || !mapReady) return
    const box = viewBox(map)
    if (!box || viewTooWide(box)) {
      setTooWide(true)
      setView(OFF) // the choice waits for a view that fits
      return
    }
    const ac = new AbortController()
    let client: ImageryClient
    try {
      client = createImageryClient()
    } catch {
      setView({ s: 'fail', offline: false }) // no worker to read with: the calm failure line and Try again, not a dead button
      return
    }
    run.current = ac
    ac.signal.addEventListener('abort', () => client.dispose(), { once: true })
    const slow = setTimeout(() => {
      if (!ac.signal.aborted) setView((v) => (v.s === 'loading' ? { ...v, slow: true } : v))
    }, SLOW_MS)
    setView({ s: 'loading', stage: 'searching', slow: false })
    void runLoad(
      (onStage) =>
        loadContext(
          { search: searchSentinel2, client, now: nowFromUrl(location.search), onStage },
          regionFor(box).bbox,
          ac.signal,
        ),
      ac.signal,
      {
        stage: (stage) => setView((v) => (v.s === 'loading' ? { ...v, stage } : v)),
        done: setView,
      },
    ).finally(() => {
      clearTimeout(slow)
      if (run.current === ac) run.current = null
      client.dispose()
    })
  }

  const choose = (c: Choice) => {
    writeChoice(c)
    setWant(c === 'satellite')
    if (c === 'map') {
      stop()
      setView(OFF)
    }
  }

  // Where the view is: the switch cannot be turned on, and Update cannot be pressed, when it is too wide.
  useEffect(() => {
    if (!map) return
    const update = () => {
      const box = viewBox(map)
      setTooWide(!box || viewTooWide(box))
    }
    update()
    map.on('moveend', update) // MapLibre fires it when the window is resized too
    return () => void map.off('moveend', update)
  }, [map])

  // The choice takes effect once the map is ready and the view fits: pressing Satellite, a remembered choice, and the restart
  // after a theme switch or a rebuilt map all come through here, and only while nothing is loaded or loading.
  useEffect(() => {
    if (want && view.s === 'off' && map && mapReady && !tooWide) start()
  }, [want, view.s, map, mapReady, tooWide]) // eslint-disable-line react-hooks/exhaustive-deps

  // A theme switch or a rebuilt map in the middle of a load ends that load; the choice stays and starts it again when the map is ready.
  useEffect(() => {
    if (!mapReady && run.current) {
      stop()
      setView(OFF)
    }
  }, [mapReady])

  // Leaving the step (or a new place) ends the load and frees its worker.
  useEffect(() => stop, [])

  // The picture goes on through installLayers, so it comes back after a theme switch and on a rebuilt map.
  useEffect(() => {
    if (!map || !image) return
    return installLayers('context', (m) => setContextLayer(m, image), removeContextLayer)
  }, [map, installLayers, image])

  // The credit follows the picture, per map; createMap is the lazy module that holds it.
  useEffect(() => {
    if (!map) return
    let live = true
    const year = image ? Number(image.date.slice(0, 4)) : undefined
    void import('../map/createMap.ts').then(({ setContextCredit }) => {
      if (live) setContextCredit(map, image !== null, year)
    })
    return () => {
      live = false
    }
  }, [map, image])
  useEffect(
    () => () => {
      if (map) void import('../map/createMap.ts').then(({ setContextCredit }) => setContextCredit(map, false))
    },
    [map],
  )

  return (
    <ContextControls
      want={want}
      view={view}
      ready={mapReady}
      tooWide={tooWide}
      onChoose={choose}
      onAgain={start}
      onCancel={() => {
        choose('map')
        mapRadio.current?.focus() // the Cancel button is gone: focus goes to where the choice went
      }}
      mapRadio={mapRadio}
    />
  )
}
