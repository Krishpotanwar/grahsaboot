import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/tle') {
      const cache = (caches as unknown as { default: TleCache }).default
      // workerd throws "Illegal invocation" if fetch is called as deps.fetch(), so hand over a wrapper.
      return handleTle(req, { fetch: (input, init) => fetch(input, init), cache })
    }
    return env.ASSETS.fetch(req)
  },
}
