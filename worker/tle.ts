export const SAT_IDS = [40697, 42063, 60989, 39084, 49260]
export const UPSTREAM = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json'
const FRESH_MS = 2 * 60 * 60 * 1000

export interface TleCache {
  match(req: Request): Promise<Response | undefined>
  put(req: Request, res: Response): Promise<void>
}

const json = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
  })

// ponytail: the Cache API is per data centre, and refreshes are neither de-duplicated nor backed off, so a
// failing upstream is retried on every request. Add a short back-off entry if CelesTrak ever blocks us (it
// firewalls an IP after 50 HTTP 301/403/404 in 2 hours).
export async function handleTle(
  req: Request,
  deps: { fetch: typeof fetch; cache: TleCache; upstream?: string; now?: () => number },
): Promise<Response> {
  const now = deps.now ?? Date.now
  const key = new Request(new URL('/api/tle?v=1', req.url).toString())
  const cached = await deps.cache.match(key)
  const cachedBody = cached ? await cached.text() : null
  const fetchedAt = Number(cached?.headers.get('x-gs-fetched') ?? -Infinity)
  if (cachedBody && now() - fetchedAt < FRESH_MS)
    return json(cachedBody, 200, { 'cache-control': 'public, max-age=600' })
  try {
    const up = await deps.fetch(deps.upstream ?? UPSTREAM, { headers: { 'user-agent': 'GrahSaboot/1.0' } })
    if (!up.ok) throw new Error(`UPSTREAM_${up.status}`)
    const all = (await up.json()) as Array<{ NORAD_CAT_ID?: number }>
    const subset = Array.isArray(all) ? all.filter((o) => SAT_IDS.includes(Number(o.NORAD_CAT_ID))) : []
    if (subset.length === 0) throw new Error('UPSTREAM_EMPTY')
    const body = JSON.stringify(subset)
    await deps.cache.put(
      key,
      json(body, 200, { 'cache-control': 'public, max-age=86400', 'x-gs-fetched': String(now()) }),
    )
    return json(body, 200, { 'cache-control': 'public, max-age=600' })
  } catch {
    if (cachedBody)
      return json(cachedBody, 200, { 'x-gs-stale': '1', 'cache-control': 'public, max-age=300' })
    return json(JSON.stringify({ error: 'TLE_UNAVAILABLE' }), 503)
  }
}
