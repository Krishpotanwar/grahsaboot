# Probes (spec §14)

| # | Probe | Date | Result | Evidence / numbers | Decision |
|---|---|---|---|---|---|
| P7 | Toolchain: Vite 8 + React 19.3 + TS 7.0.2 + Tailwind 4.3 | 2026-10-05 | PASS | `npm run check` green (Node 22.22.1, linux-arm64): tsc 7.0.2 clean, Vitest 5.0.3 `2 passed`, vite 8.3.2 build 15 modules. See P7 notes. | keep TS 7 |
| P1 | COG range reads in browsers | | pending | | |
| P2 | Hash determinism (3 browsers + Node + Deno) | | pending | | |
| P3 | Supabase Free + `verify` CPU/RSS | | pending | | |
| P4 | Google sign-in non-team user | | pending | | |
| P5 | Globe FPS at 4x CPU throttle | | pending | | |
| P6 | OpenFreeMap buildings + styles; EOX 2016 layer id | | pending | | |
| P8 | CelesTrak GROUP=resource; Nominatim policy | | pending | | |

## P7 notes

- Beyond the scaffold, a throwaway entry (not committed) importing Base UI 1.8, Motion 14, MapLibre 6.12 (with `?worker&url`), terra-draw, geotiff 3, proj4, satellite.js 7, supabase-js and Fontsource Geist typechecked under TS 7.0.2 strict and bundled with Vite 8.3.2.
- `vite build` would print one `SOURCEMAP_BROKEN` notice from `@tailwindcss/vite` (it returns no CSS map while `build.sourcemap` is true). `vite.config.ts` filters that one notice; no CSS map is emitted and the JS chunk is identical either way.
