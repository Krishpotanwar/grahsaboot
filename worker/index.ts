import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
}

const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

// How long a visitor waits for the cache or CelesTrak before getting the bundled snapshot instead. From some Cloudflare
// locations CelesTrak's origin never answers (522 after ~20 s), and nobody should stare at a spinner for that.
const DEADLINE_MS = 800

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/tle') {
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return error(405, 'METHOD_NOT_ALLOWED', { allow: 'GET, HEAD' })
      // workerd throws "Illegal invocation" if fetch is called as deps.fetch(), so hand over a wrapper.
      const refresh = handleTle(req, {
        fetch: (input, init) => fetch(input, init),
        cache: (caches as unknown as { default: TleCache }).default,
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), DEADLINE_MS)
      })
      const res = await Promise.race([refresh, late])
      clearTimeout(timer)
      if (res && res.status !== 503) return res
      // Too slow, or down with nothing cached: a slow refresh keeps running after this answer (it fills the cache, or the
      // back-off, for the next visitor). ponytail: the snapshot shipped with the build is the answer meanwhile
      // (public/tle-snapshot.json, orbits drift a few km a day). Refresh it with `npm run tle:snapshot`.
      if (!res) ctx.waitUntil(refresh.catch(() => undefined))
      const snap = await env.ASSETS.fetch(new Request(new URL('/tle-snapshot.json', req.url)))
      return snap.ok
        ? new Response(snap.body, {
            headers: {
              'content-type': 'application/json',
              'access-control-allow-origin': '*',
              'cache-control': 'public, max-age=300',
              'x-gs-stale': '1',
            },
          })
        : (res ?? (await refresh))
    }
    if (url.pathname.startsWith('/api/')) return error(404, 'NOT_FOUND')
    return env.ASSETS.fetch(req)
  },
}
