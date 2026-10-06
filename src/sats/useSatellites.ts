import type { FeatureCollection } from 'geojson'
import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config.ts'
import type { LonLat } from '../evidence/types.ts'

export interface SatPosition {
  norad: number
  name: string
  short: string
  lon: number
  lat: number
}
export interface PassSummary {
  norad: number
  name: string
  family: 'sentinel-2' | 'landsat'
  times: Array<{ time: number; distanceKm: number }>
}

export function useSatellites(enabled: boolean) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [sats, setSats] = useState<SatPosition[]>([])
  const [tracks, setTracks] = useState<FeatureCollection | null>(null)
  const [swaths, setSwaths] = useState<FeatureCollection | null>(null)
  const worker = useRef<Worker | null>(null)
  const waiting = useRef(new Map<number, (p: PassSummary[]) => void>())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0
    const w = new Worker(new URL('./sats.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { op: 'tick'; sats: SatPosition[]; tracks?: FeatureCollection; swaths?: FeatureCollection }
        | { op: 'passes'; id: number; passes: PassSummary[] }
      if (m.op === 'tick') {
        setSats(m.sats)
        if (m.tracks) setTracks(m.tracks)
        if (m.swaths) setSwaths(m.swaths)
      } else {
        waiting.current.get(m.id)?.(m.passes)
        waiting.current.delete(m.id)
      }
    }
    fetch(config.tleUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`TLE_${r.status}`))))
      .then((omm: unknown) => {
        if (cancelled || !Array.isArray(omm) || omm.length === 0) throw new Error('TLE_EMPTY')
        w.postMessage({ op: 'init', omm })
        setStatus('ready')
        let n = 0
        const tick = () => {
          if (document.visibilityState === 'visible')
            w.postMessage({ op: 'tick', t: Date.now(), withTracks: n % 30 === 0 })
          n++
        }
        tick()
        timer = window.setInterval(tick, 1000)
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
      clearInterval(timer)
      w.terminate()
      worker.current = null
    }
  }, [enabled])

  const passes = useCallback(
    (target: LonLat) =>
      new Promise<PassSummary[]>((resolve) => {
        const id = Math.random()
        waiting.current.set(id, resolve)
        worker.current?.postMessage({ op: 'passes', id, target, from: Date.now() })
      }),
    [],
  )

  return { status, sats, tracks, swaths, passes }
}
