import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
}

// ponytail: Cloudflare only promises a working Cache API on custom domains; on *.workers.dev it may do nothing,
// and CelesTrak answers a repeat download inside 2 h with 403. This per-isolate copy keeps the 2 h window and the
// back-off either way (each cold isolate still asks once). Drop it once the custom-domain route lands (C11).
const mem = new Map<string, Response>()

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/tle') {
      const edge = (caches as unknown as { default: TleCache }).default
      const cache: TleCache = {
        match: async (r) => (await edge.match(r)) ?? mem.get(r.url)?.clone(),
        put: async (r, res) => {
          mem.set(r.url, res.clone())
          await edge.put(r, res)
        },
      }
      // workerd throws "Illegal invocation" if fetch is called as deps.fetch(), so hand over a wrapper.
      const res = await handleTle(req, { fetch: (input, init) => fetch(input, init), cache })
      if (res.status !== 503) return res
      // ponytail: CelesTrak can be slow or down; with nothing cached, serve the snapshot shipped with the build
      // (public/tle-snapshot.json, orbits drift a few km a day). Refresh it on each deploy.
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
    return env.ASSETS.fetch(req)
  },
}
