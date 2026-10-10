/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // The first PostGIS start in each tests/db file takes several seconds (tests/db/harness.ts).
    hookTimeout: 60000,
  },
})
