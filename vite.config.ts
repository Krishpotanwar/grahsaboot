/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleTle, type TleCache } from './worker/tle.ts'

/** Serves /api/tle in `vite dev` and `vite preview` with the same handler the Cloudflare Worker uses. */
function tleDev(): Plugin {
  const store = new Map<string, Response>()
  const cache: TleCache = {
    match: async (r) => store.get(r.url)?.clone(),
    put: async (r, res) => {
      store.set(r.url, res.clone())
    },
  }
  const mw = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if (req.url?.split('?')[0] !== '/api/tle') return next()
    try {
      const r = await handleTle(new Request(`http://localhost${req.url}`), { fetch, cache })
      res.statusCode = r.status
      r.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await r.arrayBuffer()))
    } catch (err) {
      next(err)
    }
  }
  return {
    name: 'gs-tle-dev',
    configureServer: (s) => {
      s.middlewares.use(mw)
    },
    configurePreviewServer: (s) => {
      s.middlewares.use(mw)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tleDev()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    // MapLibre is its own ~1,033 kB chunk by design (B4); lift the 500 kB notice just above it.
    chunkSizeWarningLimit: 1100,
    // @tailwindcss/vite emits CSS without a map; its one SOURCEMAP_BROKEN notice is expected noise.
    // satellite.js ships WASM runtimes that mention node:module / node:worker_threads; nothing here uses them and tree-shaking drops them (sats.worker stays ~23 kB), so those externalised-module notices are noise too.
    rolldownOptions: {
      onLog: (level, log, handler) =>
        (log.code === 'SOURCEMAP_BROKEN' && log.plugin?.startsWith('@tailwindcss/vite')) ||
        (log.message.includes('externalized for browser compatibility') &&
          log.message.includes('satellite.js/wasm-build'))
          ? undefined
          : handler(level, log),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
})
