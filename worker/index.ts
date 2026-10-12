import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
  // Set only when accounts go live (docs/ops/accounts-test.md). Without both, the daily ping does nothing.
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
}

const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', 'x-content-type-options': 'nosniff', ...headers },
  })

// How long a visitor waits for the cache or CelesTrak before getting the bundled snapshot instead. From some Cloudflare
// locations CelesTrak's origin never answers (522 after ~20 s), and nobody should stare at a spinner for that.
const DEADLINE_MS = 800

/**
 * The daily ping that keeps a free Supabase project from being paused for inactivity. Inert until activation: Cloudflare
 * calls `scheduled` only when wrangler.jsonc has a cron trigger (it has none), and this needs both variables and an https
 * URL. It never throws: a failed ping is tried again tomorrow, and a cron that errors raises an alert.
 */
export async function keepAlive(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>,
  f: typeof fetch = fetch,
): Promise<void> {
  const { SUPABASE_URL: base, SUPABASE_PUBLISHABLE_KEY: key } = env
  if (!base || !key) return
  try {
    const url = new URL('/rest/v1/rpc/keep_alive', base)
    if (url.protocol !== 'https:') return
    await f(url.href, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // swallowed on purpose (see above)
  }
}

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
              'x-content-type-options': 'nosniff',
              'cache-control': 'public, max-age=300',
              'x-gs-stale': '1',
            },
          })
        : (res ?? (await refresh))
    }
    if (url.pathname.startsWith('/api/')) return error(404, 'NOT_FOUND')
    return env.ASSETS.fetch(req)
  },
  // The cron trigger's entry point. Never called until wrangler.jsonc gets a trigger, at activation.
  scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(keepAlive(env))
  },
}
