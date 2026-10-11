import { BaseClient, BaseResponse, fromCustomClient } from 'geotiff'
import type { Cog } from '../_shared/evidence/index.ts'
import { parseStacItem, type Collection, type VerifyDeps } from './handler.ts'

// Everything `verify` reads from the outside world: the STAC item, an asset's identity and its pixels. Three rules hold for every
// request made here. It refuses redirects (the host allowlist is checked on the first URL only, so a redirect would walk past
// it). It carries the request's deadline (a stalled source cannot hold the request to the platform limit). A Planetary Computer
// URL is signed here and the signed form never leaves this module.
const ES = 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/'
const PC = 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/'
const PC_SAS = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a'
const isPc = (c: Collection) => c === 'pc:sentinel-2-l2a'
// Only this host takes the token (as the allowlist in handler.ts, the browser's own list): a URL on any other host is never signed.
const AZURE = 'sentinel2l2a01.blob.core.windows.net'
const isAzure = (href: string) => new URL(href).hostname === AZURE

class Reply extends BaseResponse {
  res: Response
  constructor(res: Response) {
    super()
    this.res = res
  }
  override get status() {
    return this.res.status
  }
  override getHeader(name: string) {
    return this.res.headers.get(name) || undefined
  }
  override getData() {
    return this.res.arrayBuffer()
  }
}

// geotiff's own fetch client has no `redirect` option. This is the same request, with redirect: 'error' and the deadline.
class NoRedirectClient extends BaseClient {
  f: typeof fetch
  deadline: AbortSignal
  constructor(url: string, f: typeof fetch, deadline: AbortSignal) {
    super(url)
    this.f = f
    this.deadline = deadline
  }
  override async request({ headers, signal }: RequestInit = {}) {
    const f = this.f
    return new Reply(
      await f(this.url, {
        headers,
        redirect: 'error',
        signal: signal ? AbortSignal.any([this.deadline, signal]) : this.deadline,
      }),
    )
  }
}

/**
 * `f` is the fetch (the tests pass a fake). Create one per isolate, so its SAS token is shared by the requests that isolate
 * serves; `forRequest` binds one request's deadline and its per-request cache of opened files.
 */
export function upstream(f: typeof fetch = fetch) {
  // A read-only token for public data: never stored, never returned, never part of a frame row.
  let sas: { token: string; until: number } | null = null

  async function sign(href: string, collection: Collection, signal: AbortSignal): Promise<string> {
    if (!isPc(collection) || !isAzure(href)) return href
    if (!sas || sas.until - Date.now() < 60_000) {
      const res = await f(PC_SAS, { redirect: 'error', signal })
      if (!res.ok) {
        await res.body?.cancel()
        throw new Error(`PC_SAS_${res.status}`)
      }
      const j = (await res.json()) as { token?: unknown; 'msft:expiry'?: unknown }
      if (typeof j.token !== 'string' || !j.token) throw new Error('PC_SAS_TOKEN')
      // No usable expiry still gets a finite life (as src/stac/pc.ts): a NaN here would stop the token ever being renewed.
      sas = { token: j.token, until: Date.parse(String(j['msft:expiry'])) || Date.now() + 5 * 60_000 }
    }
    return `${href}${href.includes('?') ? '&' : '?'}${sas.token}`
  }

  async function open(href: string, collection: Collection, signal: AbortSignal): Promise<Cog> {
    const url = await sign(href, collection, signal)
    const tiff = await fromCustomClient(
      new NoRedirectClient(url, f, signal),
      { allowFullFile: false },
      signal,
    )
    const n = await tiff.getImageCount()
    const images = await Promise.all(Array.from({ length: n }, (_, i) => tiff.getImage(i)))
    // The same read as `wrap` in src/evidence/cog.ts (not exported there), so the bytes hashed here are the bytes the browser
    // hashed; upstream.test.ts pins that. Every read carries the request deadline: the handler passes no signal of its own.
    return {
      sizes: images.map((im) => ({ width: im.getWidth(), height: im.getHeight() })),
      async read(level, win, samples) {
        const im = images[level]
        if (!im) throw new Error(`NO_LEVEL:${level}`)
        signal.throwIfAborted()
        const data = await im.readRasters({ window: win, samples, interleave: true, signal })
        signal.throwIfAborted()
        if (!(data instanceof Uint8Array)) throw new Error('NOT_UINT8')
        return data
      },
    }
  }

  return {
    forRequest(signal: AbortSignal): Pick<VerifyDeps, 'fetchItem' | 'headAsset' | 'openCog'> {
      // One open per file per request: scl0 + visual0 + visual1 would otherwise open the same file twice.
      const opened = new Map<string, Promise<Cog>>()
      return {
        async fetchItem(collection, id) {
          const res = await f(`${isPc(collection) ? PC : ES}${encodeURIComponent(id)}`, {
            redirect: 'error',
            signal,
          })
          if (!res.ok) {
            await res.body?.cancel()
            if (res.status === 404) return null
            throw new Error(`STAC_${res.status}`)
          }
          // Only parseStacItem's output (it allowlists the asset hosts and checks the shape): an item that fails is "no item".
          return parseStacItem(await res.json(), collection)
        },
        async headAsset(href, collection) {
          // The signed URL for Planetary Computer (the unsigned one answers nothing useful); the S3 checksum header is S3's.
          const res = await f(await sign(href, collection, signal), {
            method: 'HEAD',
            headers: isAzure(href) ? {} : { 'x-amz-checksum-mode': 'ENABLED' },
            redirect: 'error',
            signal,
          })
          if (!res.ok) return {}
          const pick = (k: string) => res.headers.get(k) ?? ''
          return Object.fromEntries(
            Object.entries({
              etag: pick('etag'),
              last_modified: pick('last-modified'),
              crc64nvme: pick('x-amz-checksum-crc64nvme'),
            }).filter(([, v]) => v),
          )
        },
        openCog(href, collection) {
          let p = opened.get(href)
          if (!p) opened.set(href, (p = open(href, collection, signal)))
          return p
        },
      }
    },
  }
}
