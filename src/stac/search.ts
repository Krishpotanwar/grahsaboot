import { config } from '../config.ts'
import { coarsenBbox, type Bbox } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
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
  /** Pages per window (never more than `LIMITS.stacMaxPagesPerWindow`). */
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
  'properties.view:sun_elevation',
  'properties.proj:epsg',
  'properties.proj:code',
  'assets.visual',
  'assets.scl',
]
const BACKOFF = [500, 1500]
const TIMEOUT_MS = 20_000
const WINDOW_MONTHS = 12
const WINDOWS_AT_ONCE = 3
/**
 * A stalled network ends in a retry or the fallback (TimeoutError), never a hung spinner; a caller abort stays an abort.
 * Without AbortSignal.any (Safari < 17.4) the caller's signal goes through untimed, else the timeout alone.
 */
export function withTimeout(s?: AbortSignal): AbortSignal | undefined {
  if (s && typeof AbortSignal.any !== 'function') return s
  const t = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined
  return s && t ? AbortSignal.any([s, t]) : (s ?? t)
}
/** A caller abort is the caller's own signal firing, never the error's name: WebKit rejects a timed-out fetch with an AbortError too. */
const isAbort = (s?: AbortSignal) => !!s?.aborted
const fatal = (e: unknown) => e instanceof StacError && e.status < 500 && e.status !== 429

interface Req {
  url: string
  method: 'GET' | 'POST'
  body?: unknown
}
type Json = {
  features?: unknown[]
  links?: Array<{ rel?: string; href?: string; method?: string; body?: unknown; merge?: boolean }>
}

/** What the fetch below reads of its caller: a search brings more, a lookup by id only this. */
type FetchArgs = Pick<SearchArgs, 'signal' | 'fetchImpl' | 'sleep'>

async function fetchJson(req: Req, a: FetchArgs): Promise<Json> {
  const f = a.fetchImpl ?? fetch
  const sleep = a.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await f(req.url, {
        method: req.method,
        headers: req.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
        signal: withTimeout(a.signal),
      })
      if (res.ok) return (await res.json()) as Json
      last = new StacError(res.status)
      if (fatal(last)) throw last
    } catch (e) {
      if (isAbort(a.signal) || fatal(e)) throw e
      last = e
    }
    a.signal?.throwIfAborted()
    if (attempt < 2) await sleep(BACKOFF[attempt]!)
  }
  throw last
}

/** Consecutive windows of at most 12 calendar months: window k is [from + 12k months, from + 12(k+1) months - 1 day], the last cut at `to`. */
function windows(from: string, to: string): Array<[string, string]> {
  const [y, m, d] = from.split('-').map(Number)
  const day = (k: number, back = 0) =>
    new Date(Date.UTC(y!, m! - 1 + WINDOW_MONTHS * k, d! - back)).toISOString().slice(0, 10)
  const out: Array<[string, string]> = []
  // The first window is always searched, so a reversed range fails at the server as it always did.
  for (let k = 0; k === 0 || day(k) <= to; k++) out.push([day(k), day(k + 1, 1) < to ? day(k + 1, 1) : to])
  return out
}

async function searchWindow(
  base: string,
  collection: Collection,
  a: SearchArgs,
  [from, to]: [string, string],
  useFields: boolean,
): Promise<{ items: S2Item[]; limited: boolean }> {
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: coarsenBbox(a.bbox), // privacy: the exact outline never leaves the browser
    datetime: `${from}T00:00:00Z/${to}T23:59:59Z`,
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
    if (!next) return { items, limited: false }
    if (pages >= Math.min(a.maxPages ?? LIMITS.stacMaxPagesPerWindow, LIMITS.stacMaxPagesPerWindow))
      return { items, limited: true }
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

/** Every window of the range, 3 at a time, merged oldest first. `limited` when any window ran out of pages. */
async function searchEndpoint(
  base: string,
  collection: Collection,
  a: SearchArgs,
  useFields: boolean,
): Promise<SearchResult> {
  const ws = windows(a.from, a.to)
  const done: Array<{ items: S2Item[]; limited: boolean }> = []
  let next = 0
  // ponytail: a window that fails leaves the others to finish their pages, and the result is thrown away; cancel them if that load ever matters.
  const worker = async () => {
    while (next < ws.length) {
      const i = next++
      done[i] = await searchWindow(base, collection, a, ws[i]!, useFields)
      a.signal?.throwIfAborted() // no new window once the caller has gone, whatever the fetch does
    }
  }
  await Promise.all(Array.from({ length: Math.min(WINDOWS_AT_ONCE, ws.length) }, worker))
  const byId = new Map<string, S2Item>()
  for (const w of done) for (const it of w.items) byId.set(it.id, it)
  return {
    items: [...byId.values()].sort((x, y) => Date.parse(x.datetime) - Date.parse(y.datetime)),
    limited: done.some((w) => w.limited),
    source: collection,
  }
}

export async function searchSentinel2(a: SearchArgs): Promise<SearchResult> {
  try {
    return await searchEndpoint(config.stacUrl, 'sentinel-2-l2a', a, true)
  } catch (e) {
    if (isAbort(a.signal) || fatal(e)) throw e
    return await searchEndpoint(config.pcStacUrl, 'pc:sentinel-2-l2a', a, false)
  }
}

/** An Earth Search scene id. The other catalogue builds its ids differently (S2B_MSIL2A_20250307T053649_R005_T43QBB_20250307T082113). */
export const SCENE_ID = /^S2[ABC]_[0-9]{2}[A-Z]{3}_[0-9]{8}_[0-9]_L2A$/

/**
 * One Earth Search scene by its id, with a search's retries and timeout; null when there is no such scene (a 404, or an id of the
 * other catalogue, which is not asked for). Any other failure throws, as a search's does, so a caller can tell "gone" from "no
 * answer". The id is checked before it reaches the path and the answer must be that scene: never a stand-in.
 */
export async function getItemById(id: string, a: FetchArgs = {}): Promise<S2Item | null> {
  if (!SCENE_ID.test(id)) return null
  try {
    const raw = await fetchJson(
      { url: `${config.stacUrl}/collections/sentinel-2-l2a/items/${id}`, method: 'GET' },
      a,
    )
    const item = parseItem(raw, 'sentinel-2-l2a')
    return item?.id === id ? item : null
  } catch (e) {
    if (e instanceof StacError && e.status === 404) return null
    throw e
  }
}
