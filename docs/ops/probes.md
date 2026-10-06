# Probes (spec §14)

| # | Probe | Date | Result | Evidence / numbers | Decision |
|---|---|---|---|---|---|
| P7 | Toolchain: Vite 8 + React 19.3 + TS 7.0.2 + Tailwind 4.3 | 2026-10-05 | PASS | `npm run check` green (Node 22.22.1, linux-arm64): tsc 7.0.2 clean, Vitest 5.0.3 `2 passed`, vite 8.3.2 build 15 modules. See P7 notes. | keep TS 7 |
| P1 | COG range reads in browsers | 2026-10-06 | PARTIAL: PASS in Chromium 153 and Firefox 155; WebKit not runnable on this VM (not PASS) | Item `S2B_44QLJ_20260512_0_L2A`. Chromium PASS, Firefox PASS, WebKit not runnable on this VM. Per browser: 1 Earth Search 200 + 26 range reads on `sentinel-cogs`, all 206, 2.68 MB, CORS `*`, 12-13 s page load; window and both hashes equal Node's. Node `ms` 13373, 15270, 16337. See P1/P2 notes. | keep Earth Search + AWS (no fallback needed in Chromium or Firefox). WebKit open: re-run `npm run e2e:live -- --project=webkit` on a host with its system libs. |
| P2 | Hash determinism (3 browsers + Node + Deno) | 2026-10-06 | PARTIAL: identical in Node, Deno, Chromium and Firefox on 3 scenes; WebKit not runnable on this VM (not PASS) | Item `S2B_44QLJ_20260512_0_L2A`: scl window `[45,2996,103,3057]` sha `0a0d8e8379002c01009e064e77b9cd3eac113039738eafbb332c98b9d15c385a`; visual window `[92,5994,203,6111]` sha `df3bb3c2ad37aa84ebe93da6fadf485b682be0cc4a2855e7774c63d290826631`. Node x3 PASS (`ms` 13373-16337), Deno 2.9.6 PASS (12318 ms), Chromium PASS, Firefox PASS, WebKit not runnable on this VM. Two more scenes in P1/P2 notes. | no mismatch, so no fallback triggered; WebKit unverified. If any runtime ever mismatches: client hashes advisory, server hash authoritative (spec §14); note for Phase D. |
| P3 | Supabase Free + `verify` CPU/RSS | | pending | | |
| P4 | Google sign-in non-team user | | pending | | |
| P5 | Globe FPS at 4x CPU throttle | | pending | | |
| P6 | OpenFreeMap buildings + styles; EOX 2016 layer id | | pending | | |
| P8 | CelesTrak GROUP=resource; Nominatim policy | | pending | | |

## P7 notes

- Beyond the scaffold, a throwaway entry (not committed) importing Base UI 1.8, Motion 14, MapLibre 6.12 (with `?worker&url`), terra-draw, geotiff 3, proj4, satellite.js 7, supabase-js and Fontsource Geist typechecked under TS 7.0.2 strict and bundled with Vite 8.3.2.
- `vite build` would print one `SOURCEMAP_BROKEN` notice from `@tailwindcss/vite` (it returns no CSS map while `build.sourcemap` is true). `vite.config.ts` filters that one notice; no CSS map is emitted and the JS chunk is identical either way.

## P1 / P2 notes

- Run 2026-10-06 on this VM (Ubuntu 26.04 arm64): Node 22.22.1 + tsx 4.23.15, Deno 2.9.6 (plain `npx deno run -A`; `--node-modules-dir=manual` not needed), Playwright 1.63.0 Chromium 153.0.8010.12 and Firefox 155.0. `npm run e2e:live -- --project=chromium --project=firefox`: 4 passed. The Node vector equals the planning-time `KNOWN` vector (3 runs, including the no-argument pick, which chose the same item).
- WebKit 26.6 downloads but does not launch: `browserType.launch` host-requirements error, missing apt packages `libevent-2.1-7t64 libflite1 libavif16 libmanette-0.2-0 gstreamer1.0-libav`, no sudo. Recorded "not runnable on this VM"; neither P1 nor P2 is PASS for WebKit.
- Extra scenes (spec §14 P2 asks for 3; the committed test pins only the first). Scratch runs, identical windows and hashes in Node, Deno, Chromium and Firefox:
  - `S2A_44QKJ_20180228_1_L2A` (baseline 05.00): scl `[5046,2996,5104,3057]` `123593e5e6c2663af204cf45269b44989390437d8d238e8aee266bcd2d628602`; visual `[10094,5994,10205,6111]` `a09f60cc45bb898227a7d3e04e3d1c80e0ff56a45efe834b076f192b6415dc5d`.
  - `S2C_44QLJ_20260107_0_L2A` (baseline 05.11): scl `[45,2996,103,3057]` `1a2d282865a5262a28a44b3213a73741a94cd66dfc3f17964852ab2a09187b24`; visual `[92,5994,203,6111]` `324b771933e76d68441a582dec3e706ed1787c4e695ca18e618f5d21b0a47c22`.
- STAC fields confirmed on the known item: `properties.datetime`, `eo:cloud_cover`, `s2:processing_baseline`, `s2:nodata_pixel_percentage`, `proj:epsg` (number 32644; `proj:code` is absent); `assets.visual` and `assets.scl` each have `href`, `proj:shape` `[rows, cols]`, `proj:transform`.
- Second S3 host `e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com`: header check only (curl on a `sentinel-2-c1-l2a` TCI asset with `Origin` and `Range`: `206`, `Access-Control-Allow-Origin: *`, `Accept-Ranges: bytes`). No geotiff read from it, and no `sentinel-2-l2a` item sampled was served from it, so "both hosts" in spec §14 P1 is only half checked.
- `ms` covers the item fetch, two COG opens and two window reads end to end from this VM; the browser pages took about the same.
