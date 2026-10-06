import { useEffect, useState } from 'react'
import { Link } from '../lib/router.tsx'
import { flyToPlace, placeToQuery } from '../map/camera.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import type { Place } from '../search/nominatim.ts'
import { copy } from '../ui/copy.ts'
import { Button } from '../ui/kit.tsx'
import { SearchBox } from '../ui/SearchBox.tsx'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function GlobeScreen() {
  useMapLayout('globe')
  const { map, tier, setTierOverride } = useMapStage()
  const [place, setPlace] = useState<Place | null>(null)

  // Slow auto-rotation on the landing globe: stops on interaction, once any camera move is under way (setCenter would cancel a fly-to), after 30 s, once zoomed 1.4 levels past its start, or under reduced motion.
  useEffect(() => {
    if (!map || tier < 2 || reducedMotion()) return
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

  const select = (p: Place) => {
    setPlace(p)
    if (map) flyToPlace(map, p, reducedMotion())
  }

  return (
    <div className="grid min-h-[calc(100dvh-64px)] lg:grid-cols-[38%_1fr]">
      <section
        className={`pointer-events-auto relative z-10 flex flex-col gap-6 bg-bg p-6 pb-10 lg:mt-0 lg:justify-center lg:p-12 ${tier > 0 ? 'mt-[calc(55dvh-64px)] justify-end' : ''}`}
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
          <Link
            to="/new?example=nagpur"
            className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg"
          >
            {copy.nav.example}
          </Link>
        </div>
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
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}
