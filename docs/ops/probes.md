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
| P8 | CelesTrak GROUP=resource; Nominatim policy | 2026-10-06 | PASS | CelesTrak `GROUP=resource&FORMAT=json`: `200 40697:true 42063:true 60989:true 39084:true 49260:true` (167 objects, 70,351 B re-serialised; the five-satellite subset is 2,110 B). Nominatim policy re-read: at most 1 request per second, HTTP Referer or User-Agent identifying the app, no client-side autocomplete, attribution, cached results; the requirements do not ask for an email. See P8 notes. | keep `GROUP=resource` and the five NORAD IDs for B7. Keep search on submit only, 1 req/s plus cache, attribution shown. |

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

## P8 notes

- CelesTrak probe, 2026-10-06 07:46 UTC from this VM (Node 22.22.1 `fetch` with its default headers: no custom header, no email). Command, which printed `200 40697:true 42063:true 60989:true 39084:true 49260:true`:
  `node -e "fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json').then(async (r) => { const all = await r.json(); console.log(r.status, [40697, 42063, 60989, 39084, 49260].map((id) => id + ':' + all.some((s) => s.NORAD_CAT_ID === id)).join(' ')) })"`
  (I also wrote the body to a scratch file so nothing had to hit CelesTrak twice.) Response `content-type: application/json; charset=UTF-8`, no `last-modified` or `cache-control`. Records: SENTINEL-2A, SENTINEL-2B, SENTINEL-2C, LANDSAT 8, LANDSAT 9 (epochs 2026-10-05 18:07 to 23:36 UTC); `NORAD_CAT_ID` is a number; the 17 field names equal those in `tests/fixtures/tle.json`.
- One live request only. CelesTrak's page (https://celestrak.org/NORAD/documentation/gp-data-formats.php, read 2026-10-06) says new GP data is checked once every 2 hours; for some datasets since March 2026 (its example is `GROUP=active`) a repeat inside that window gets HTTP 403, "GP data has not updated since your last successful download ... Data is updated once every 2 hours"; and 50 HTTP 301/403/404 errors in 2 hours put the IP address in the firewall. The Worker's 2-hour cache window matches this. Whether `GROUP=resource` is enforced the same way was not tested (that would need a second request). The dev and preview smoke tests used a stubbed upstream.
- Nominatim policy (https://operations.osmfoundation.org/policies/nominatim/, read 2026-10-06, no revision date on the page): "an absolute maximum of 1 request per second"; "Provide a valid HTTP Referer or User-Agent identifying the application (stock User-Agents as set by http libraries will not do)"; auto-complete "you must not implement such a service on the client side"; "Clearly display attribution as suitable for your medium"; "Results must be cached on your side". The requirement list does not ask for an email address.
- App against the policy: search runs on submit only, at most 1 request per second with a cache (B5); the browser sends its own Referer (no Referrer-Policy override in `index.html`); the request adds only `Accept-Language`; the panel shows "Search by OpenStreetMap Nominatim" and the map shows "© OpenStreetMap contributors". No User-Agent or email is set for Nominatim; the Worker's CelesTrak request uses the fixed `User-Agent: GrahSaboot/1.0`.

## P9: STAC search shape on real data (2026-10-07)

Run 2026-10-07 against the real Earth Search STAC and the real AWS COGs, with the app's own request shape (`src/stac/search.ts` body, `limit: 100`, sort by datetime ascending, 10 pages at most, one search for the whole range). The place is the featured worked example (Navi Mumbai airport, a 2 km square).

| Range | Items | Distinct dates | Pages | Time | Truncated | Last date returned |
|---|---|---|---|---|---|---|
| 2017-12-01 to 2025-12-31 (the worked example) | 1000 | 279 | 10 | 23 s | yes | 2021-11-28 |
| 2024-01-01 to 2025-12-31 | 334 | 161 | 5 | 7.8 s | no | 2025-12-27 |
| 2025-01-01 to 2025-12-31 | 180 | 88 | 3 | 4.0 s | no | 2025-12-27 |

Findings:

1. There are about 3.6 STAC items per date in this bbox, so 1000 items are only about 280 dates. The spec's "up to 10 pages" (design spec section on STAC search) was a guess made before this measurement.
2. The search is sorted oldest first, so truncation silently drops the newest photos (2022 to 2025), which is what an "after" photo needs. The worked example's "after" would have been November 2021.
3. The pages were fetched one after another, about 2 s each.
4. In the browser the quality checks ran at about 12 COG requests per second at concurrency 4, and the workbench waited until every date in both outer quartiles was checked before it picked a default before/after, so a range of about 600 dates took minutes to show a photo.

Ruling (task C5b):

- Search in consecutive windows of at most 12 calendar months, at most 3 windows at a time, at most 5 pages (500 items) per window (`LIMITS.stacMaxPagesPerWindow`). Merge by item id, oldest first. `limited` is true only when a window used its 5 pages with a `next` link left. A failing primary endpoint still redoes the whole range on Planetary Computer.
- The default before/after is picked as soon as each outer quartile has a checked CLEAR photo (or has nothing left to check). Because the runner checks both ends of the range first, that is the widest clear span.
- The runner's default concurrency is 6 (the measurement below).
- The worked example carries its known pair (22 Feb 2018 and 12 Dec 2025, real Sentinel-2B passes), so it opens on photos at once.

Measured after the change (this VM, headless Chromium 153 through the dev server, the app's own `searchSentinel2`, `createRunner` and imagery worker, real services, one fresh browser context per run so the HTTP cache is cold; scratch script, not in the repo):

- Windowed search of the worked example: 9 windows, 3142 items, 1076 distinct dates, 20.0 s, 20.1 s and 19.5 s in three runs (the old single search needed 23 s for 10 pages and got 279 dates). Each window on its own took 1.4 to 9.2 s. Three of the nine windows used all 5 pages: 2018-12 to 2019-11 (478 items kept, a 6th page left), 2019-12 to 2020-11 (500 items, ends 2020-11-08) and 2020-12 to 2021-11 (500 items, ends 2021-09-19). Five of the others hold 300 to 378 items and the last one (December 2025 only) holds 30. So the worked example still shows "Some passes are not shown"; its pair (windows 1 and 9) is not affected. A cap of 6 or 7 pages would cover the heavy windows at about 2 s a page.
- Quality checks completed in the 30 s after the search ended (worked example, priority pair first, then the range from both ends in; checks plus the runner's own preview loads, no full frames):

  | Concurrency | Runs | After 10 s | After 20 s | After 30 s |
  |---|---|---|---|---|
  | 4 | 3 | 8 | 20 | 32 (all three runs) |
  | 6 | 3 | 12 | 30 | 48 (all three runs) |
  | 8 | 1 | 16 | 32 | 48 |
  | 12 | 1 | 12 | 24 | 48 |

  6 is 1.5 times as fast as 4 at every point, so the runner keeps 6. 8 and 12 give no more at 30 s, which fits the browser's limit of 6 connections per host. A check takes about 3.7 s here whatever the concurrency, which is why the counts repeat exactly.
- LIVE test (`LIVE=1 E2E_BROWSERS=chromium npx playwright test tests/e2e/live-example.spec.ts`, dev server, real services, same VM): passed, both photos (22 Feb 2018 and 12 Dec 2025) on screen 34.6 s after pressing "Open the workbench" (test total 36.3 s), no console errors. Roughly 20 s of that is the search; the rest is waiting for a free slot (the first 6 checks run first) and loading the two frames. The same journey on the production build (`vite preview` of `dist/`, scratch script, two runs) took 31.3 s and 31.3 s to both photos, no console errors.
