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
import { chooseTier, downgrade, probeFrameMs, readSignals, type Tier } from './tier.ts'

export type Layout = 'globe' | 'side' | 'mini' | 'hidden'
type Installer = { install(m: MlMap): void; uninstall(m: MlMap): void }
interface MapStageValue {
  map: MlMap | null
  tier: Tier
  layout: Layout
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
  const [tier, setTier] = useState<Tier>(() => overrideTier() ?? chooseTier(readSignals()))
  const [map, setMap] = useState<MlMap | null>(null)
  const [layout, setLayout] = useState<Layout>('hidden')
  const [theme] = useTheme()
  const appliedTheme = useRef(currentTheme())

  useEffect(() => {
    if (tier === 0 || !container.current) return
    let cancelled = false
    let m: MlMap | null = null
    import('./createMap.ts').then(({ createMap }) => {
      if (cancelled || !container.current) return
      try {
        m = createMap(container.current, { tier, getTheme: () => appliedTheme.current })
      } catch {
        setTier(0)
        return
      }
      const map = m
      map.on('style.load', () => {
        for (const i of installers.current.values()) i.install(map)
      })
      // map.remove() in the cleanup below also fires this event; without the guard a tier change cascades down to tier 0.
      map.getCanvas().addEventListener('webglcontextlost', () => !cancelled && setTier((t) => downgrade(t)), {
        once: true,
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
    }
  }, [tier])

  useEffect(() => {
    if (!map || theme === appliedTheme.current) return
    appliedTheme.current = theme
    import('./createMap.ts').then(({ styleUrl }) => map.setStyle(styleUrl(theme)))
  }, [theme, map])

  useEffect(() => {
    if (!map) return
    const id = requestAnimationFrame(() => map.resize())
    return () => cancelAnimationFrame(id)
  }, [layout, map])

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
    () => ({ map, tier, layout, setLayout, setTierOverride, installLayers }),
    [map, tier, layout, setTierOverride, installLayers],
  )
  return (
    <Ctx.Provider value={value}>
      {/* Children first: the skip link must be the first Tab stop, ahead of the map canvas and its controls. Painting is unchanged (the stage is fixed at z-index 0; the shell sits at z 10 and up). */}
      {children}
      <div
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
