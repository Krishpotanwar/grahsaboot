import { config } from '../config.ts'
import type { Bbox } from '../geo/aoi.ts'
import { parseItem } from './parse.ts'
import type { Collection, S2Item, SearchResult } from './types.ts'

export class StacError extends Error {
  constructor(
    public status: number,
    message = `STAC_${status}`,
  ) {
    super(message)
  }
}

export interface SearchArgs {
  bbox: Bbox
  from: string
  to: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  maxPages?: number
  sleep?: (ms: number) => Promise<void>
}

const FIELDS = [
  'id',
  'collection',
  'geometry',
  'properties.datetime',
  'properties.eo:cloud_cover',
  'properties.s2:processing_baseline',
  'properties.s2:nodata_pixel_percentage',
  'properties.proj:epsg',
  'properties.proj:code',
  'assets.visual',
  'assets.scl',
]
const BACKOFF = [500, 1500]
const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError'

interface Req {
  url: string
  method: 'GET' | 'POST'
  body?: unknown
}
type Json = {
  features?: unknown[]
  links?: Array<{ rel?: string; href?: string; method?: string; body?: unknown; merge?: boolean }>
}

async function fetchJson(req: Req, a: SearchArgs): Promise<Json> {
  const f = a.fetchImpl ?? fetch
  const sleep = a.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await f(req.url, {
        method: req.method,
        headers: req.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
        signal: a.signal,
      })
      if (res.ok) return (await res.json()) as Json
      last = new StacError(res.status)
      if (res.status !== 429 && res.status < 500) throw last
    } catch (e) {
      if (isAbort(e) || (e instanceof StacError && e.status < 500 && e.status !== 429)) throw e
      last = e
    }
    if (attempt < 2) await sleep(BACKOFF[attempt]!)
  }
  throw last
}

async function searchEndpoint(
  base: string,
  collection: Collection,
  a: SearchArgs,
  useFields: boolean,
): Promise<SearchResult> {
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: a.bbox,
    datetime: `${a.from}T00:00:00Z/${a.to}T23:59:59Z`,
    limit: 100,
    sortby: [{ field: 'properties.datetime', direction: 'asc' }],
    ...(useFields ? { fields: { include: FIELDS } } : {}),
  }
  let req: Req = { url: `${base}/search`, method: 'POST', body }
  const items: S2Item[] = []
  for (let pages = 1; ; pages++) {
    const json = await fetchJson(req, a)
    for (const f of json.features ?? []) {
      const it = parseItem(f, collection)
      if (it) items.push(it)
    }
    const next = (json.links ?? []).find((l) => l.rel === 'next' && l.href)
    if (!next) return { items, limited: false, source: collection }
    if (pages >= (a.maxPages ?? 10)) return { items, limited: true, source: collection }
    req =
      next.method === 'POST'
        ? {
            url: next.href!,
            method: 'POST',
            body: next.merge ? { ...(req.body as object), ...(next.body as object) } : next.body,
          }
        : { url: next.href!, method: 'GET' }
  }
}

export async function searchSentinel2(a: SearchArgs): Promise<SearchResult> {
  try {
    return await searchEndpoint(config.stacUrl, 'sentinel-2-l2a', a, true)
  } catch (e) {
    if (isAbort(e)) throw e
    return await searchEndpoint(config.pcStacUrl, 'pc:sentinel-2-l2a', a, false)
  }
}
