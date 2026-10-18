import type { Map as MlMap } from 'maplibre-gl'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { config } from '../config.ts'
import { copy } from '../ui/copy.ts'
import { currentTheme, useTheme } from '../ui/theme.ts'
import type { Camera } from './createMap.ts'
import { chooseTier, downgrade, probeFrameMs, readSignals, type Tier } from './tier.ts'

export type Layout = 'globe' | 'side' | 'mini' | 'hidden'
type Installer = { install(m: MlMap): void; uninstall(m: MlMap): void }
interface MapStageValue {
  map: MlMap | null
  tier: Tier
  layout: Layout
  /** The stage's element, for a screen that puts a control inside it (the workbench's close button on the mini map). */
  stage: HTMLDivElement | null
  /** The first `idle` after the current style loaded; false again while a new style loads and on a rebuilt map. */
  mapReady: boolean
  /** The style or its tiles have been failing for more than 10 s after a style load, with no `idle` since. */
  mapFailed: boolean
  setLayout(l: Layout): void
  setTierOverride(t: Tier | null): void
  installLayers(id: string, install: (m: MlMap) => void, uninstall: (m: MlMap) => void): () => void
}

const Ctx = createContext<MapStageValue | null>(null)
const OVERRIDE = 'gs-tier-override'

function overrideTier(): Tier | null {
  const q = config.testMode ? new URLSearchParams(location.search).get('tier') : null
  let v: string | null = q
  if (v === null) {
    try {
      v = localStorage.getItem(OVERRIDE)
    } catch {
      v = null
    }
  }
  return v !== null && /^[0-3]$/.test(v) ? (Number(v) as Tier) : null
}

export function MapStageProvider({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const installers = useRef(new Map<string, Installer>())
  // Where the last map stood, so a rebuilt map (tier change, context loss) resumes there instead of at the start view.
  const camera = useRef<Camera | null>(null)
  const [tier, setTier] = useState<Tier>(() => overrideTier() ?? chooseTier(readSignals()))
  const [map, setMap] = useState<MlMap | null>(null)
  const [layout, setLayout] = useState<Layout>('hidden')
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [status, setStatus] = useState({ ready: false, failed: false })
  const [theme] = useTheme()
  const appliedTheme = useRef(currentTheme())

  useEffect(() => {
    if (tier === 0 || !container.current) return
    let cancelled = false
    let m: MlMap | null = null
    import('./createMap.ts').then(({ createMap }) => {
      if (cancelled || !container.current) return
      try {
        m = createMap(container.current, {
          tier,
          getTheme: () => appliedTheme.current,
          camera: camera.current,
        })
      } catch {
        setTier(0)
        return
      }
      const map = m
      map.on('moveend', () => {
        camera.current = {
          center: map.getCenter().toArray(),
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        }
      })
      map.on('style.load', () => {
        for (const i of installers.current.values()) i.install(map)
      })
      // map.remove() in the cleanup below also fires this event; without the guard a tier change cascades down to tier 0.
      map.getCanvas().addEventListener('webglcontextlost', () => !cancelled && setTier((t) => downgrade(t)), {
        once: true,
      })
      // Ready on the first idle of a loaded style; failed when errors have gone on for 10 s with no idle in between.
      let failTimer: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        clearTimeout(failTimer)
        failTimer = undefined
      }
      map.on('idle', () => {
        settle()
        if (map.getStyle()) setStatus({ ready: true, failed: false })
      })
      map.on('error', () => {
        failTimer ??= setTimeout(
          () => !cancelled && setStatus((s) => (s.ready ? s : { ready: false, failed: true })),
          10_000,
        )
      })
      map.once('idle', () => {
        probeFrameMs().then((ms) => {
          if (!cancelled && ms > 42 && overrideTier() === null) setTier((t) => downgrade(t))
        })
      })
      if (config.testMode)
        (window as unknown as { __gs?: object }).__gs = {
          ...((window as unknown as { __gs?: object }).__gs ?? {}),
          map,
        }
      setMap(map)
    })
    return () => {
      cancelled = true
      m?.remove()
      setMap(null)
      setStatus({ ready: false, failed: false })
    }
  }, [tier])

  useEffect(() => {
    if (!map || theme === appliedTheme.current) return
    appliedTheme.current = theme
    setStatus({ ready: false, failed: false }) // the new style is loading
    import('./createMap.ts').then(({ styleUrl }) => map.setStyle(styleUrl(theme)))
  }, [theme, map])

  useEffect(() => {
    if (!map) return
    const id = requestAnimationFrame(() => map.resize())
    return () => cancelAnimationFrame(id)
  }, [layout, map])

  // MapLibre starts a compact attribution open until the first drag. The mini map is 360 px wide and the outline step's map is
  // the one people draw on: there it starts as the "i" button, one click from the text (what its own drag handler does), and the
  // other layouts get back what they had.
  useEffect(() => {
    if (!map || (layout !== 'mini' && layout !== 'side')) return
    const a = map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
    if (!a?.classList.contains('maplibregl-compact-show')) return
    a.classList.remove('maplibregl-compact-show')
    // Only if the person left it open: MapLibre keeps `open` and `compact-show` in step, and a closed one carrying the class is a
    // wide empty pill whose first click seems to do nothing.
    return () => {
      // The control may have been swapped meanwhile (the satellite view's credit): the live one is the one to give back.
      const live = map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
      if (live?.hasAttribute('open')) live.classList.add('maplibregl-compact-show')
    }
  }, [map, layout])

  const installLayers = useCallback(
    (id: string, install: (m: MlMap) => void, uninstall: (m: MlMap) => void) => {
      installers.current.set(id, { install, uninstall })
      // getStyle() is undefined until the style JSON is loaded; isStyleLoaded() also waits for tiles, which would skip the install for good.
      if (map?.getStyle()) install(map)
      return () => {
        installers.current.delete(id)
        if (map && map.getStyle()) uninstall(map)
      }
    },
    [map],
  )

  const setTierOverride = useCallback((t: Tier | null) => {
    try {
      if (t === null) localStorage.removeItem(OVERRIDE)
      else localStorage.setItem(OVERRIDE, String(t))
    } catch {
      /* storage unavailable: still apply for this session */
    }
    setTier(t ?? chooseTier(readSignals()))
  }, [])

  const value = useMemo(
    () => ({
      map,
      tier,
      layout,
      stage,
      mapReady: status.ready,
      mapFailed: status.failed,
      setLayout,
      setTierOverride,
      installLayers,
    }),
    [map, tier, layout, stage, status, setTierOverride, installLayers],
  )
  return (
    <Ctx.Provider value={value}>
      {/* Children first: the skip link must be the first Tab stop, ahead of the map canvas and its controls. Painting is unchanged (the stage is fixed at z-index 0; the shell sits at z 10 and up). */}
      {children}
      <div
        ref={setStage}
        className="map-stage"
        data-layout={tier === 0 ? 'hidden' : layout}
        role="region"
        aria-label={copy.map.label}
      >
        {/* MapLibre's CSS sets position: relative on its container, so it gets this full-size child, never the fixed stage. */}
        <div ref={container} className="h-full w-full" />
      </div>
    </Ctx.Provider>
  )
}

export function useMapStage(): MapStageValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMapStage outside MapStageProvider')
  return v
}

export function useMapLayout(l: Layout) {
  const { setLayout } = useMapStage()
  useEffect(() => {
    setLayout(l)
    return () => setLayout('hidden')
  }, [l, setLayout])
}
