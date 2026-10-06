import { config } from '../config.ts'

export interface Place {
  name: string
  lat: number
  lon: number
  bbox: [number, number, number, number] | null
}

export function createNominatim(
  opts: {
    baseUrl?: string
    fetchImpl?: typeof fetch
    now?: () => number
    sleep?: (ms: number) => Promise<void>
    minIntervalMs?: number
  } = {},
) {
  const base = opts.baseUrl ?? config.nominatimUrl
  const f = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const gap = opts.minIntervalMs ?? 1000
  const cache = new Map<string, Place[]>()
  let last = -Infinity
  return {
    async search(q: string, signal?: AbortSignal): Promise<Place[]> {
      const key = q.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!key) return []
      const hit = cache.get(key)
      if (hit) return hit
      const wait = last + gap - now()
      if (wait > 0) await sleep(wait)
      last = now()
      const res = await f(`${base}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q.trim())}`, {
        headers: { 'Accept-Language': 'en' },
        signal,
      })
      if (!res.ok) throw new Error(`NOMINATIM_${res.status}`)
      const rows = (await res.json()) as unknown[]
      const places = (Array.isArray(rows) ? rows : []).flatMap((r): Place[] => {
        const o = r as { display_name?: unknown; lat?: unknown; lon?: unknown; boundingbox?: unknown }
        const lat = Number(o.lat),
          lon = Number(o.lon)
        if (typeof o.display_name !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon)) return []
        const bb =
          Array.isArray(o.boundingbox) && o.boundingbox.length === 4 ? o.boundingbox.map(Number) : null
        return [
          {
            name: o.display_name,
            lat,
            lon,
            bbox: bb && bb.every(Number.isFinite) ? [bb[2]!, bb[0]!, bb[3]!, bb[1]!] : null,
          },
        ]
      })
      cache.set(key, places)
      return places
    },
  }
}

export const nominatim = createNominatim()
