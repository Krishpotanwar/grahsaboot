import type { Marker } from 'maplibre-gl'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { loadAccounts } from '../accounts/enabled.ts'
import { EXAMPLES } from '../data/examples.ts'
import { LOAD_MB } from '../explore/cost.ts'
import { exploreHref, startKey } from '../explore/params.ts'
import { armStart } from '../explore/startFlag.ts'
import { Link } from '../lib/router.tsx'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { flyToPlace, placeToQuery } from '../map/camera.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import {
  addPlacePin,
  installSatLayers,
  syncSatMarkers,
  uninstallSatLayers,
  updateSatLayers,
} from '../map/satLayers.ts'
import type { Place } from '../search/nominatim.ts'
import { useSatellites } from '../sats/useSatellites.ts'
import { copy } from '../ui/copy.ts'
import { explore } from '../ui/copy-explore.ts'
import { Button } from '../ui/kit.tsx'
import { Optional } from '../ui/Optional.tsx'
import { SatellitesPanel } from '../ui/SatellitesPanel.tsx'
import { SearchBox } from '../ui/SearchBox.tsx'

// Null in a build without accounts: the list is then not rendered, requested or loaded at all.
const load = loadAccounts
const LazyMine = load ? lazy(() => load().then((m) => ({ default: m.MyInvestigations }))) : null

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const EXAMPLE_PLACE = EXAMPLES['navi-mumbai-airport']!.place

// The map outlives this screen (it remounts on every visit to /), so the picked place has to as well: the pin and the next pass come back with it.
let lastPlace: Place | null = null

export default function GlobeScreen() {
  useMapLayout('globe')
  const { map, tier, setTierOverride, installLayers } = useMapStage()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [place, setPlace] = useState<Place | null>(lastPlace)
  const [hot, setHot] = useState<number | null>(null)
  // Positions run at every tier (T0 and T1 show the text list); only the map layers need T2+.
  const { sats, status, stale, tracks, swaths, passes } = useSatellites(true)
  const markers = useRef(new Map<number, Marker>())
  const latest = useRef({ tracks, swaths, hot })
  latest.current = { tracks, swaths, hot }

  // Slow auto-rotation on the landing globe: stops on interaction, once any camera move is under way (setCenter would cancel a fly-to), after 30 s, once zoomed 1.4 levels past its start, or under reduced motion.
  // The map outlives this screen, so coming back from a place finds it zoomed in: never start below globe zoom (fit tops out ~3.9 on 4K).
  useEffect(() => {
    if (!map || tier < 2 || reducedMotion() || map.getZoom() > 5) return
    const z0 = map.getZoom()
    let raf = 0
    let stopped = false
    let last = performance.now()
    const started = last
    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
    const tick = (now: number) => {
      if (stopped) return
      if (now - started > 30_000 || map.getZoom() > z0 + 1.4 || map.isMoving()) return stop()
      const c = map.getCenter()
      map.setCenter([c.lng + ((now - last) / 1000) * 2, c.lat])
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    map.on('mousedown', stop)
    map.on('touchstart', stop)
    map.on('wheel', stop)
    return () => {
      stop()
      map.off('mousedown', stop)
      map.off('touchstart', stop)
      map.off('wheel', stop)
    }
  }, [map, tier])

  // Satellite layers (T2+). The installer re-applies the latest data after a style reload (theme switch).
  useEffect(
    () =>
      map && tier >= 2
        ? installLayers(
            'sats',
            (m) => {
              installSatLayers(m)
              updateSatLayers(m, latest.current.tracks, latest.current.swaths, latest.current.hot)
            },
            uninstallSatLayers,
          )
        : undefined,
    [map, tier, installLayers],
  )
  useEffect(() => {
    if (map && tier >= 2) updateSatLayers(map, tracks, swaths, hot)
  }, [map, tier, tracks, swaths, hot])
  useEffect(() => {
    if (map && tier >= 2) void syncSatMarkers(map, markers.current, sats)
  }, [map, tier, sats])
  useEffect(() => {
    const all = markers.current
    return () => {
      for (const m of all.values()) m.remove()
      all.clear()
    }
  }, [map])
  // Pin on the picked place, at every tier that has a map.
  useEffect(() => {
    if (!map || !place) return
    const pin = addPlacePin(map, place)
    return () => {
      void pin.then((m) => m.remove())
    }
  }, [map, place])

  const select = (p: Place) => {
    lastPlace = p
    setPlace(p)
    if (map) flyToPlace(map, p, reducedMotion())
  }
  const panel = (
    <SatellitesPanel
      sats={sats}
      status={status}
      staleEpoch={stale}
      place={place}
      passes={passes}
      onHot={setHot}
    />
  )

  return (
    <div
      className={`grid min-h-[calc(100dvh-64px)] ${tier > 0 ? 'lg:grid-cols-[38%_1fr]' : 'lg:mx-auto lg:max-w-[40rem]'}`}
    >
      <section
        className={`pointer-events-auto relative z-10 flex flex-col gap-6 bg-bg p-6 pb-10 lg:mt-0 lg:justify-center lg:p-12 ${tier > 0 ? 'mt-[calc(max(55dvh,320px)_-_64px)] justify-end' : ''}`}
      >
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.04em]">
          {copy.app.promise}
        </h1>
        <SearchBox onSelect={select} />
        <div className="flex flex-wrap gap-3">
          <Link
            to={place ? placeToQuery(place) : '/new'}
            className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg"
          >
            {place ? copy.nav.startHere : copy.nav.newInvestigation}
          </Link>
          {place && (
            // Our own button says what it costs and starts at once; a link to the same page waits for a tap (src/explore/startFlag.ts).
            <Link
              to={exploreHref(place)}
              onClick={() => armStart(startKey(place))}
              className="inline-flex h-11 items-center rounded-[6px] border border-control px-4 font-medium text-fg hover:bg-panel"
            >
              {explore.watch(LOAD_MB)}
            </Link>
          )}
          <Link
            to="/new?example=navi-mumbai-airport"
            className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg"
          >
            {copy.nav.example}
          </Link>
        </div>
        <Link
          to={exploreHref(EXAMPLE_PLACE)}
          className="inline-flex h-11 w-fit items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg"
        >
          {explore.exampleLink}
        </Link>
        {LazyMine && (
          // Signed in: what this account has saved. Nothing at all (no gap) while signed out or before the list arrives.
          <Optional>
            <Suspense fallback={null}>
              <LazyMine />
            </Suspense>
          </Optional>
        )}
        {tier === 0 && (
          <p className="max-w-[60ch] text-sm text-fg-2" role="status">
            {copy.map.staticNotice}
          </p>
        )}
        {(tier === 1 || tier === 2) && (
          <div className="flex items-center gap-3 text-sm text-fg-2">
            <span className="font-mono uppercase tracking-[0.06em]">{copy.map.lite}</span>
            <Button size="sm" variant="ghost" onClick={() => setTierOverride(3)}>
              {copy.map.switchFull}
            </Button>
          </div>
        )}
        {(!desktop || tier === 0) && panel}
      </section>
      {tier > 0 && (
        <div className="relative hidden lg:block">
          {/* The panel is held to the screen, not to this column, which grows with the text beside it: it must stay clear of MapLibre's controls whatever is added there. */}
          <div className="sticky top-16 h-[calc(100dvh-4rem)]">
            {/* right-14 / bottom-14 keep the panel off MapLibre's zoom buttons and attribution (bottom right of the map); a touch screen has 44 px controls, so it clears them by more. */}
            {desktop && (
              <div className="pointer-events-auto absolute bottom-14 right-14 z-20 pointer-coarse:bottom-24 pointer-coarse:right-18">
                {panel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
