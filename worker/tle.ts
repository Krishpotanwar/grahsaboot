export const SAT_IDS = [40697, 42063, 60989, 39084, 49260]
export const UPSTREAM = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json'
const FRESH_MS = 2 * 60 * 60 * 1000
const BACKOFF_MS = 15 * 60_000

export interface TleCache {
  match(req: Request): Promise<Response | undefined>
  put(req: Request, res: Response): Promise<void>
}

const json = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
  })

// An empty body is a back-off entry written after a failure with nothing cached to fall back on.
const reply = (body: string, stale: boolean) =>
  body
    ? json(
        body,
        200,
        stale
          ? { 'x-gs-stale': '1', 'cache-control': 'public, max-age=300' }
          : { 'cache-control': 'public, max-age=600' },
      )
    : json(JSON.stringify({ error: 'TLE_UNAVAILABLE' }), 503)

// ponytail: the Cache API is per data centre, so every colo refreshes on its own, and refreshes are not
// de-duplicated per colo: requests that arrive together at the 2 h mark each ask CelesTrak, and a failure is
// only backed off once the first of them has finished. A Durable Object or KV lock would make it one request;
// add it if CelesTrak ever blocks us (it firewalls an IP after 50 HTTP 301/403/404 in 2 hours).
export async function handleTle(
  req: Request,
  deps: { fetch: typeof fetch; cache: TleCache; upstream?: string; now?: () => number },
): Promise<Response> {
  const now = deps.now ?? Date.now
  const key = new Request(new URL('/api/tle?v=1', req.url).toString())
  const cached = await deps.cache.match(key)
  const cachedBody = cached ? await cached.text() : ''
  const fetchedAt = Number(cached?.headers.get('x-gs-fetched') ?? -Infinity)
  if (cached && now() - fetchedAt < FRESH_MS) return reply(cachedBody, cached.headers.has('x-gs-stale'))
  try {
    const up = await deps.fetch(deps.upstream ?? UPSTREAM, { headers: { 'user-agent': 'GrahSaboot/1.0' } })
    if (!up.ok) throw new Error(`UPSTREAM_${up.status}`)
    const all = (await up.json()) as Array<{ NORAD_CAT_ID?: number }>
    const subset = Array.isArray(all) ? all.filter((o) => SAT_IDS.includes(Number(o.NORAD_CAT_ID))) : []
    if (subset.length === 0) throw new Error('UPSTREAM_EMPTY')
    const body = JSON.stringify(subset)
    await deps.cache
      .put(key, json(body, 200, { 'cache-control': 'public, max-age=86400', 'x-gs-fetched': String(now()) }))
      .catch(() => {}) // a failed write only loses the cache; the fresh body is still good
    return reply(body, false)
  } catch (err) {
    console.error('TLE refresh failed:', err instanceof Error ? err.message : err)
    // Back off: stamp the last good body (or an empty one) so it counts as fresh for BACKOFF_MS only.
    const stamp = String(now() - FRESH_MS + BACKOFF_MS)
    await deps.cache
      .put(
        key,
        json(cachedBody, 200, {
          'cache-control': 'public, max-age=86400',
          'x-gs-fetched': stamp,
          'x-gs-stale': '1',
        }),
      )
      .catch(() => {}) // a failed write only loses the back-off
    return reply(cachedBody, true)
  }
}
