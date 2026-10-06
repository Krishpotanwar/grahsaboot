import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
}

const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/tle') {
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return error(405, 'METHOD_NOT_ALLOWED', { allow: 'GET, HEAD' })
      // workerd throws "Illegal invocation" if fetch is called as deps.fetch(), so hand over a wrapper.
      const res = await handleTle(req, {
        fetch: (input, init) => fetch(input, init),
        cache: (caches as unknown as { default: TleCache }).default,
      })
      if (res.status !== 503) return res
      // ponytail: CelesTrak can be slow or down; with nothing cached, serve the snapshot shipped with the build
      // (public/tle-snapshot.json, orbits drift a few km a day). Refresh it with `npm run tle:snapshot`.
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
        : res
    }
    if (url.pathname.startsWith('/api/')) return error(404, 'NOT_FOUND')
    return env.ASSETS.fetch(req)
  },
}
