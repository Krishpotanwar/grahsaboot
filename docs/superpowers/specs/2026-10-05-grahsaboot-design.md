# GrahSaboot design spec (R3)

Date: 2026-10-05. Status: **approved design (D13) and spec (D14)**. Implementation plan: `docs/superpowers/plans/2026-10-05-grahsaboot-plan.md` (phases A–D, every code block validated in a scratch build). Supersedes `docs/geoverify/ARCHITECTURE_V2.md` (R2), `TRD.md` and `DESIGN.md` wherever they differ. Research basis: `docs/geoverify/research/2026-10-05-r3-*.md` (five verified reports, two rounds of cross-examination). Working name GeoVerify is retired.

**GrahSaboot** = *grah* (planet/orbit, root of *upgrah*, satellite) + *saboot* (proof). Tagline: "Satellite proof for any place."

---

## 1. Decisions

| ID | Decision | Source |
|---|---|---|
| D1 | Commercial product, free at launch, built to scale | user |
| D2/D3 | Demand not validated; no reachable tester yet. Technical pilot ≠ validated business | user |
| D4 | Both large buildings/sites **and** roads/highway corridors | user |
| D5 | Before/after **and** multi-date timeline; optional user-supplied claim shown beside evidence | user |
| D6 | Free/open imagery only (Sentinel-2 L2A); resolution may vary; no paid imagery | user |
| D7 | India-first assumption; worldwide coverage works by construction | assumption |
| D8 | One-month first usable version; ₹0 cash at start; paid hosting only when free tiers fail | user |
| D9 → **D12** | ~~Provider-managed processing~~ → **browser reads public Sentinel-2 COGs from AWS; the server re-reads and verifies every saved frame** | user, 2026-10-05 |
| D10 | God's-eye frontend: 3D globe with live satellites. **Industry-grade UI, not a movie look** (no NVG/FLIR/CRT effects) | user |
| D10b | Globe rebuilt from scratch (MapLibre), not ported from `WorldPolicy-Env/globe.jsx`; real zoom from world down to street | user |
| D11 | Name: **GrahSaboot** | user |
| D13 | Design approved; this spec + implementation plan follow | user |
| — | **Black is the default theme; a light theme stays available as a toggle** | user |
| — | Design skills: industrial-brutalist-ui + apple-design + minimalist-ui + design-taste-frontend-v1 | user |
| — | Agents commit locally; agents never push | default (user rule from prior projects) |

## 2. Product

### 2.1 Promise
A user enters a place (search, `lat, lon`, or a Google Maps link), outlines a **site** polygon or draws a **road** line with its width, and picks a date range. GrahSaboot shows every Sentinel-2 acquisition in that range on a timeline, checks each one for cloud over the user's outline, and lets the user compare any two dates (swipe or side by side), scrub through the timeline, inspect a road **section × date** grid, write notes, and export an evidence report. Signed-in users save investigations; every saved frame is re-derived by the server from the same public file and marked **server-verified**.

### 2.2 What the product says and never says
- Says: "Visible change", "No clear visible change", "Not enough clear view", "First visible between 9 May 2023 and 4 Jun 2023".
- Never says: "constructed", "completed", "verified project", "fraud", "abandoned", "% complete", or any confidence percentage. Evidence ≠ verdict. A gap is a gap, never "no change".
- Every frame shows: photo date, satellite, resolution (10 m), clear-view %, source ID, verification status.

### 2.3 Users and wedge
Wedge: a **free, non-GIS, outline-in / evidence-report-out** page for a large site or road corridor. First testers to recruit (from `r3-market-name.md` §1.4): the Nagpur civil-engineering network, CSR impact-assessment consultants (CSR projects ≥ ₹1 crore need independent assessment), and RTI/social-audit groups and local journalists. Competitor baseline: Copernicus Browser (free, expert UI). EO Browser was retired on 2026-03-20.

### 2.4 Scope of the first usable version (v1)
In: globe shell with live satellites; place search; site + road outlining; date range; progressive timeline with per-site cloud check; before/after swipe and side-by-side; brightness-difference view (labelled); road section × date grid; notes; optional claim; save (Google sign-in) with server verification; HTML report export + print-to-PDF; provenance JSON; delete everything; dark (default) + light themes; lite mode; privacy notice, limits page, attribution.

Out (later, each with a trigger in §13): automatic change detection/hotspots (AlphaEarth gate), shareable public report links (needs R2), Hindi UI, ESA acquisition-plan KML for exact next pass, same-day multi-tile mosaics, Sentinel-1 radar, higher-res Indian imagery (Bhoonidhi clearance), Cesium "cinematic" view, organisations/teams, scheduled monitoring, payments, mobile apps.

## 3. User journeys

1. **Explore (no sign-in):** land on the black globe with satellites moving → search "Nagpur" or paste coordinates → camera flies down to the city in 3D.
2. **Investigate (no sign-in):** choose *Site* (draw/adjust polygon) or *Road* (draw line, confirm width) → pick date range (default: last 24 months) → review screen shows area/length, sections, what will be fetched and the limits → open the workbench.
3. **Workbench:** timeline fills progressively (ticks per acquisition with clear-view glyphs) → defaults pick the clearest early and late dates as before/after → swipe/side-by-side/difference → for roads, the section × date grid → notes ("Visible change / No clear visible change / Not sure" + text) tied to a date.
4. **Save (sign-in):** "Save and verify" → Google sign-in → investigation saved → each **pinned date** is verified by the server → frames show *Verified · 5 Oct 2026 14:02 IST*.
   - Pinning: before and after are pinned automatically, and the user can pin up to 22 more timeline dates (≤ 24 total).
   - Only pinned dates are verified and stored as frames. The full acquisition list is rediscovered from STAC whenever the investigation is reopened.
   - Local work survives the sign-in redirect (IndexedDB).
5. **Report:** "Report" → on-screen report (black/light per theme) → "Download HTML" (self-contained, images embedded), "Download provenance JSON", "Print / Save as PDF" (white paper).
6. **Delete:** delete an investigation, or "Delete my account and data" (immediate; audit keeps opaque IDs only).

## 4. Architecture

```
                         ┌──────────────── Browser (React 19, Vite 8, TS) ─────────────────┐
                         │ MapLibre 6.12 globe · terra-draw · Web Workers:                 │
                         │   imagery.worker (geotiff 3.0.5 + proj4 2.22: SCL/TCI windows,  │
                         │                   hashes, reprojection, difference)            │
                         │   sats.worker    (satellite.js 7.1: positions, tracks, passes)  │
                         │ IndexedDB: local investigations + decoded-window cache          │
                         └──┬──────────────┬───────────────┬───────────────┬──────────────┘
                            │ STAC search  │ COG range GETs│ /api/tle      │ Auth, REST, verify
                            ▼              ▼               ▼               ▼
              Earth Search STAC   AWS Open Data S3     Cloudflare Worker   Supabase (ap-south-1 Mumbai)
              (sentinel-2-l2a)    sentinel-cogs        static assets +     Auth (Google) ·
              fallback: Planetary (TCI.tif, SCL.tif)   /api/tle (CelesTrak  Postgres + PostGIS + RLS · Edge fn
              Computer STAC                            cached 2 h)          `verify` (Deno, geotiff) ·
                                                                            pg_cron purge (SQL only)
              OpenFreeMap vector tiles · NASA GIBS Blue Marble · AWS Terrarium DEM · Nominatim (search)
```

### 4.1 Components and responsibilities
| Unit | Does | Depends on |
|---|---|---|
| `src/geo/` | Coordinate parsing (with a swapped-order hint), outline validation measured in UTM, coarsened bbox | `src/evidence` (proj4) |
| `src/stac/` | Earth Search search with paging cap, item parsing/validation, per-date item selection, Planetary Computer fallback | fetch |
| `src/evidence/` (pure TS, runtime-neutral) | `frame-v1` window maths + SHA-256, AOI rasterisation (even-odd sites, flat-capped road corridors), road parts every 2 km (`partsOf`), `scl-v2` quality stats + labels, `display-v1` reprojection, `diff-v1` | proj4, WebCrypto |
| `src/workers/imagery.worker.ts` | geotiff I/O, calls `src/evidence`, IndexedDB window cache | geotiff, evidence |
| `src/sats/` + `sats.worker.ts` | OMM → satrec, positions 1 Hz, tracks/swaths 30 s, next-pass estimate | satellite.js |
| `src/map/` | MapLibre setup, basemap switching (theme/zoom), terrain, buildings, satellites layers, evidence image sources, tier handling | maplibre-gl |
| `src/ui/` | Design-system primitives (Base UI + Tailwind tokens), screens, report renderer | Base UI, motion, phosphor |
| `src/data/` | Supabase client, auth, save/load, verify calls, local store | supabase-js |
| `worker/index.ts` | Serve SPA assets; `/api/tle` CelesTrak proxy with 2 h edge cache; daily keep-alive ping to Supabase | Cloudflare Workers |
| `supabase/migrations/` | Schema, PostGIS constraints, RLS, triggers (freeze, audit, limits), purge function + cron | Postgres |
| `supabase/functions/verify/` | Authoritative frame verification and quality stats; writes `frames` | Deno, geotiff, `_shared/evidence` |

`src/evidence/` is the single source of truth for recipes. It must not import DOM APIs. The Edge function imports the same files (copied into `supabase/functions/_shared/evidence/` by a build step `npm run sync:evidence`, checked by a test that diffs both copies), so browser and server cannot drift.

### 4.2 Why this shape (ponytail)
- No imagery server, no queue, no provider keys, no image storage: the public COGs are the store; the server keeps manifests only.
- One server function (`verify`) because evidence integrity needs one place the client cannot fake.
- Outline rules run twice with the same limits: the browser measures in UTM for instant feedback, and PostGIS re-checks on the spheroid (0.5 % tolerance) as the authority. Road sections are never stored: browser and `verify` both cut them with the shared `partsOf`, so they agree by construction. No turf.
- Explicitly not built: Redis/queues/workers, Sentinel Hub, image CDN, R2, router library, global state library, form library, i18n framework, ML.

## 5. Evidence pipeline

### 5.1 Discover (STAC)
- Endpoint: `POST https://earth-search.aws.element84.com/v1/search`, collection **`sentinel-2-l2a`** (complete archive; `sentinel-2-c1-l2a` is incomplete for 2017–2019 and 2022, never use it alone).
- Query uses a **coarsened bbox** (AOI bbox snapped outward to a 0.1° grid) for privacy; filtering to the true AOI happens in the browser.
- `fields.include`: `id, collection, geometry, properties.datetime, properties.eo:cloud_cover, properties.s2:processing_baseline, properties.s2:nodata_pixel_percentage, properties.proj:code|proj:epsg, assets.visual, assets.scl`. Exact field names are confirmed in probe P1.
- Sort by datetime ascending; `limit: 100`; follow `next` links up to **10 pages**. If capped, show "Search limited to 1,000 acquisitions; narrow the dates."
- **Per-date selection:** group items by UTC date; keep items whose footprint contains the AOI (else coverage = partial); choose max AOI coverage, then min scene cloud, then lexical id. Others are kept as alternates.
- Fallback: Planetary Computer STAC (`sentinel-2-l2a`, assets `visual`/`SCL`, SAS token via its anonymous token endpoint) when Earth Search fails 3 times in a row. Recorded per frame as `collection`.
- Copy: "The catalogue may omit a few acquisitions."

### 5.2 Quality first (`scl-v2`)
- Read the SCL window (native 20 m, image 0 of `SCL.tif`) covering the AOI bbox + 2 px. About 20–60 KB per date.
- Rasterise the AOI in the item's UTM CRS with the **pixel-centre rule on a 10 m grid**, with SCL nearest-upsampled 2×. Measured error ≤ 1 pp versus a 2 m truth.
- Classes: valid = {4 vegetation, 5 not-vegetated, 6 water}; uncertain = {2 dark/topographic shadow, 7 unclassified}; obstructed = {1 defective, 3 cloud shadow, 8 cloud medium, 9 cloud high, 10 cirrus, 11 snow}; no data = {0}.
- **Clear view = valid + uncertain.** A real-data survey (Navi Mumbai, 24 dates, 2018–2025) found older processing baselines (`00.01`, `02.xx`, `03.01`, i.e. most 2017–2021 photos) put 73–86% of visibly cloud-free construction ground in classes 2 and 7. Under the first rule (`scl-v1`, valid only) about a quarter of clear photos read "PARTIAL"; `scl-v2` labels them as people see them, and Details still shows the valid/uncertain/obstructed split.
- Labels (policy `scl-v2`, versioned, thresholds adjustable):

  | Label | Rule |
  |---|---|
  | `CLEAR` | clear view ≥ 0.95 |
  | `PARTIAL` | 0.05 < clear view < 0.95 |
  | `OBSCURED` | clear view ≤ 0.05 |
  | `NOT_COVERED` | no-data share ≥ 0.5 (outline area outside the scene counts as no-data), or the outline is entirely outside the scene |

  Raw class shares are always shown next to the label.
- Statistics never use overview levels. Roads get per-section stats from the same window.
- The quality check runs for dates in view first (concurrency 4), then the rest in the background.

### 5.3 Pictures (`frame-v1`)
- Asset `visual` (`TCI.tif`, 8-bit RGB, 10 m, 1024-px internal tiles, 5 levels). **Level 1 (20 m)** gives timeline thumbnails for `CLEAR`/`PARTIAL` dates; **level 0 (10 m)** gives the before/after pair and zoom.
- Window: AOI projected to item CRS → pixel bbox at that level → floor/ceil → pad 2 px → clamp. Integers `[x0, y0, x1, y1]`. The window is computed **once by the client and sent**; the server re-reads exactly that window and separately checks it covers the AOI (±2 px). This avoids cross-engine floating-point drift.
- Bytes = geotiff.js `readRasters({ window, samples: [0,1,2] (TCI) | [0] (SCL), interleave: true })` on image `level`. **Hash = SHA-256 (hex) of those raw bytes.** Never hash a PNG/canvas (encoders differ).
- Measured envelope: a 1 km² site is about 2.8 MB per date at 10 m (mean); a 10 km road about 4.7 MB per date at 10 m, 1.25 MB at 20 m. First view of a 12-date road ≈ 25 MB with the SCL-first order.

### 5.4 Display (`display-v1`) and difference (`diff-v1`)
- One shared **EPSG:3857 output grid** per investigation (AOI bbox + 10 % padding, longest side 512–1024 px by viewport/tier). Each frame is reprojected from its own UTM zone in the worker: bilinear for TCI, nearest for SCL masks. Both swipe images therefore align pixel-for-pixel even across tiles or zones. Display is presentation only; evidence is the raw window.
- Difference view: per-pixel |ΔY| (Rec. 709 luma) between the before and after display images, masked where either SCL is invalid, mapped to a single-hue ramp of the accent. No threshold, no polygons. Caption: "Brightness difference between these two dates. Season, moisture, shadows and clouds also cause differences. This is not a construction detector."

### 5.5 Verify (server, `supabase/functions/verify`)
`POST /functions/v1/verify` with the user's JWT.
```ts
type VerifyRequest = {
  investigation_id: string;                       // must be owned by caller
  item: { collection: 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'; id: string };   // id matches ^[A-Za-z0-9_.-]{1,100}$
  frames: Array<{ asset: 'visual' | 'scl'; level: 0 | 1; window: [number, number, number, number]; sha256: string }>; // 1..4
};
type VerifyResponse = {
  frames: Array<{
    asset: 'visual' | 'scl'; level: 0 | 1; status: 'verified' | 'mismatch';
    server_sha256: string; frame_id: string; verified_at: string;
    quality: null | {                              // SCL frames only
      policy: 'scl-v2'; label: string; counts: number[]; total: number;
      clearFraction: number; validFraction: number; uncertainFraction: number; obstructedFraction: number; nodataFraction: number;
      parts: Array<{ idx: number; fromM: number; toM: number; label: string; clearFraction: number /* …same fields */ }>;
    };
  }>;
};
```
Steps:
1. Validate body shape.
2. Load the investigation through the user's JWT (RLS = ownership).
3. Rate limit: ≤ 600 frame checks per user per 24 h, else `429`. Checks are counted from the audit log, so re-checking the same frames counts too.
4. Fetch the STAC item by id server-side; check its date is inside the investigation range and its footprint intersects the AOI.
5. Per frame: HEAD the asset (record ETag, Last-Modified, `x-amz-checksum-crc64nvme` if present; record STAC `file:checksum` if present); check window bounds and coverage; read; hash; compare.
6. For SCL frames, compute the **authoritative** `scl-v2` stats for the site or each road section. Sections come from the shared `partsOf`, the same code the browser runs.
7. Upsert `frames` rows (service role) on (investigation, item, asset, level), refreshing `verified_at`, so saving again is idempotent.
8. Return.

Errors: `400` shape, `401`, `404` investigation or item, `422` window/date/coverage, `429`, `502` upstream (retryable by the client with backoff, max 3). A `mismatch` is stored, never hidden. CPU budget is 2 s per call: ≤ 4 frames per call, client batches per date (TCI L0/L1 + SCL).

### 5.6 Provenance
Every frame records: `collection, item_id, acquired_at, processing_baseline, asset, href, level, window, crs, transform, recipe ('frame-v1'|'scl-v2'), sha256, source_identity {stac_checksum?, etag, last_modified, crc64nvme?}, verification {status, verified_at} | null, quality`. Re-opening a saved investigation later can re-check: if the source changed, show "Source file changed since capture" (the export remains the durable copy). Attribution on every view and export: "Contains modified Copernicus Sentinel data [year]".

## 6. Roads
- Input: LineString (≤ 200 vertices, 0.2–10 km), full corridor width 5–200 m (default 30 m, must be confirmed; the helper text explains why).
- The corridor is every point within width/2 of the centre line, with flat end caps (`rasterizeAoi` in `src/evidence/`). `partsOf` cuts the line every 2 km and labels each part with chainage (`0.0–2.0 km`). Browser and `verify` run the same code; nothing about sections is stored. PostGIS checks length and vertex count.
- The section × date grid: rows are sections with chainage, columns are actual acquisition dates; cells are glyph + word (CLEAR/PARTIAL/OBSCURED/NOT COVERED), tap/keyboard to open that section-date. There is no whole-road percentage and no "km completed".

## 7. Frontend

### 7.1 Stack (versions verified on npm 2026-10-05)
react / react-dom 19.3.0 · vite 8.3.2 · @vitejs/plugin-react 6.1.1 · typescript 7.0.2 (fallback 6.0.3, probe P7) · tailwindcss + @tailwindcss/vite 4.3.3 · @base-ui/react 1.8.0 (used directly; no shadcn generator) · motion 14.0.0 · @phosphor-icons/react 2.1.10 · @fontsource-variable/geist + geist-mono 5.3.0 · maplibre-gl 6.12.0 · terra-draw 1.36.0 + terra-draw-maplibre-gl-adapter 1.4.1 · geotiff 3.0.5 · proj4 2.22.0 · satellite.js 7.1.0 · @supabase/supabase-js 2.117.2 (lazy-loaded with the account menu, outside the entry bundle). No turf: geometry is a few hundred lines of tested TypeScript in `src/evidence/` and `src/geo/`. Dev: vitest 5.0.3, @playwright/test 1.63.0 + @axe-core/playwright 4.13.0, wrangler 4.147.0, supabase CLI 2.119.0, deno 2.9.6 (npm), @electric-sql/pglite 0.5.8 + pglite-postgis 0.2.8, tsx 4.23.15 (runs `.ts` scripts; the VM's Node 22 has no TypeScript support), @types/geojson, prettier.

Routing is about 30 lines of `history.pushState` over 6 routes: `/`, `/new`, `/i/:id`, `/i/:id/report`, `/privacy`, `/limits`. Local investigations use `/i/local-:uuid`. State is React state plus URL plus IndexedDB. There is no global store.

### 7.2 Globe and map
- One MapLibre map, `projection: globe`, sky/atmosphere on.
- Layers by zoom:

  | Zoom | Layer |
  |---|---|
  | z0–5 | NASA GIBS Blue Marble (labelled date) |
  | z ≥ 5 | OpenFreeMap vector basemap (dark style in black theme, positron-like style in light theme; place labels for states, cities and streets) |
  | z ≥ 10 | AWS Terrarium `raster-dem` terrain (exaggeration 1.3) |
  | z ≥ 14 | OpenFreeMap buildings as `fill-extrusion` (single flat fill, hairline edges, "heights approximate") |

  Optional "Context imagery (2016)" toggle: EOX Sentinel-2 cloudless **2016 only** (CC BY 4.0; 2018+ years are non-commercial).
- Camera: landing auto-rotates slowly (stops on interaction or after 30 s, off under reduced motion); search → `flyTo` (curve 1.4, 3–5 s, interruptible); city arrival tilts to pitch 55–60°.
- Evidence on the map: the selected frame as an `image` source on the AOI (opacity crossfade only). Comparison itself is DOM.
- Attribution control always visible: OpenStreetMap/OpenFreeMap, NASA GIBS, Copernicus Sentinel, EOX (when on), Nominatim.

### 7.3 Live satellites
- `/api/tle` returns CelesTrak GP JSON (OMM) for a config list:

  | Satellite | NORAD ID | Swath |
  |---|---|---|
  | Sentinel-2A | 40697 | 290 km (extended operations to 2026-12-31) |
  | Sentinel-2B | 42063 | 290 km |
  | Sentinel-2C | 60989 | 290 km |
  | Landsat 8 | 39084 | 185 km |
  | Landsat 9 | 49260 | 185 km |

  IDs are confirmed in probe P8. The response is cached at the edge for 2 h; on upstream error the last good copy is served, or `503` if none exists.
- The worker propagates with SGP4: markers at 1 Hz; ±45 min ground track and swath polygon every 30 s.
- Layers: swath (accent fill 8 %), track (dashed hairline), marker (green-400 "LIVE" dot, breathing, the only perpetual animation besides the globe drift).
- Panel: name, lat/lon, status.
- "Next pass over your site (estimated)": SGP4 scan 10 days at 60 s steps; keep **daylight descending** passes whose swath covers the AOI centroid. Copy: "Estimated from orbit data. A pass is not a usable photo; clouds can block it."
- Tier T0/T1: text list only.

### 7.4 Screens
1. **Globe (/)** is asymmetric. Left column: wordmark, one-line promise, search/coordinates field, "Start an investigation", worked example link (Navi Mumbai airport site, 2 km square, Dec 2017 – Dec 2025), and "My investigations" when signed in. Right two-thirds: globe. Floating satellite panel bottom-right. Mobile: globe on top (55 dvh), content in a bottom sheet. Wherever page content floats over the map, its empty areas pass pointer input through to the globe; only the panels take clicks.
2. **New investigation (/new)** has 4 steps (Place → Outline → Dates → Review). Mobile shows one question per screen; desktop shows a left panel with the map right. The review screen shows area/length/sections, date range, expected data use (MB estimate), limits and what is stored if saved.
3. **Workbench (/i/:id)**: header (name, before ↔ after dates, Save/Verify state, Report). Left: evidence viewer (Swipe | Side by side | Difference) with caption rows. Right: timeline scrubber (one tick per acquisition, glyph-coded), road section × date grid, notes, claim. Mobile: viewer full width, scrubber under it, grid/notes in a bottom sheet.
4. **Report (/i/:id/report)**:
   1. What was looked at (outline image, area/width, sections, dates).
   2. Evidence (before/after with captions).
   3. Timeline table.
   4. Section × date grid.
   5. Notes (attributed "you" or the user-entered "Prepared by" name; never the email).
   6. Optional claim beside evidence.
   7. Gaps and limits.
   8. Provenance and verification.
   9. Attribution.

   Actions: Download HTML, Download provenance JSON, Print/Save as PDF.

   The report badge has three states: not saved (unverified), every pinned photo verified (with the date of the latest check), or saved but partly verified. The pinned-dates table has a "Server check" column. A verified mark counts only when the server's hash equals the hash of the pixels shown. Opening the report before a before/after pair exists shows a short explanation and a link back, never an empty report.
5. **Privacy (/privacy)** and **Limits (/limits)** are plain-language pages, linked from every footer.

Every async surface has designed loading (skeleton matching layout), empty, partial, error, rate-limited and offline states. There are no generic spinners.

### 7.5 Design system
Fusion rules: each source skill owns a layer; where they conflict, the stated resolution wins.

| Layer | Owner | Applies to |
|---|---|---|
| Structure and data | industrial-brutalist-ui | grids, 1 px hairline dividers, mono caps micro-labels, tabular numbers, square data surfaces |
| Restraint and copy | minimalist-ui | whitespace on Globe/New/Report, plain sentence-case copy, no gradients, no heavy shadows |
| Motion and touch | apple-design | springs, interruptible gestures, 1:1 swipe tracking with velocity hand-off, sheets with detents, reduced motion/transparency |
| Anti-slop | design-taste-frontend-v1 | sans-only type, one desaturated accent, asymmetric hero, skeleton loaders, full state cycles, no emojis, no pure #000, no glows, no 3-equal-card rows |

Dials (taste skill), by surface:

| Surface | Variance | Motion | Density |
|---|---|---|---|
| Globe | 7 | 6 | 3 |
| New investigation | 5 | 5 | 4 |
| Workbench | 3 | 4 | 7 |
| Report | 2 | 2 | 5 |

Conflict resolutions: no magnetic buttons, custom cursors or perpetual card loops (precision tool; Apple "agency"). Radius: **0 on data surfaces** (evidence frames, grid cells, map), **6 px controls** (buttons, inputs, chips), **12 px floating panels/sheets**. Glass only on panels floating over the map: `bg/92` (0.85 fails 4.5:1 for `--fg-2` over bright imagery) + `backdrop-blur-md` + 1 px `white/10` inner border + `inset 0 1px 0 rgba(255,255,255,.06)`; solid under reduced transparency or tiers T0/T1.

Tokens (Tailwind 4 `@theme` + `[data-theme]`; default `data-theme="dark"`, toggle persisted in localStorage). Contrast was computed 2026-10-05:

| Token | Dark (default, black) | Light |
|---|---|---|
| `--bg` | zinc-950 `#09090B` | white `#FFFFFF` |
| `--panel` | zinc-900 `#18181B` | zinc-50 `#FAFAFA` |
| `--line` (decorative) | zinc-800 `#27272A` | zinc-200 `#E4E4E7` |
| `--control` (input/button borders) | zinc-500 `#71717A` (4.12:1 ✓ ≥ 3) | zinc-500 (4.83:1 ✓) |
| `--fg` | zinc-100 `#F4F4F5` (18.1:1) | zinc-900 `#18181B` (17.7:1) |
| `--fg-2` | zinc-400 `#A1A1AA` (7.76:1) | zinc-600 `#52525B` (7.73:1) |
| `--fg-3` (min text) | zinc-400 | zinc-500 (4.83:1) |
| `--accent` (sat 72–75 %) | `#E48444` (7.28:1; zinc-950 text on it 7.28:1) | `#A74E1B` (5.60:1; white text 5.60:1) |
| `--bad` / `--ok` (= LIVE) / `--warn` / `--info` | red-400 / green-400 / yellow-400 / sky-300 | red-700 / green-700 / yellow-700 / sky-700 |

Primary button = solid `--fg` with `--bg` text (inverted); secondary = 1 px `--control` outline; destructive = `--bad` outline + confirm only for irreversible actions. Accent marks selection, focus ring (2 px), active tab, slider thumb and the user's outline on imagery. Red is only for errors/rejection. Colour never carries meaning alone: every status has glyph + word (solid square CLEAR, half square PARTIAL, hollow square NOT COVERED, crossed square OBSCURED).

Type: **Geist Variable** (UI) + **Geist Mono Variable** (data, coordinates, dates, IDs, micro-labels), self-hosted via Fontsource, `font-display: swap`. Scale in rem:

| Role | Size / leading | Tracking / weight |
|---|---|---|
| Display | `clamp(2.25rem, 5vw, 3.75rem)` / 1.0 | -0.04em, 700 |
| H2 | 1.5rem / 1.2 | 600 |
| H3 | 1.125rem / 1.3 | 600 |
| Body | 1rem / 1.5, max 65ch | 400 |
| Dense UI | 0.875rem / 1.35 | 500 |
| Micro-label (mono, uppercase) | 0.75rem / 1.3 | +0.06em, 500 |

Numbers are tabular. Minimum text is 12 px. Spacing scale: 4 px base (4, 8, 12, 16, 24, 32, 48, 64, 96). Grid: 12 columns. Text pages max 1200 px wide; map is full-bleed. Full-height sections use `min-h-[100dvh]`.

Motion (motion 14):

| Use | Setting |
|---|---|
| Default | `{ type: 'spring', stiffness: 260, damping: 32 }` (critically damped, ~0.4 s) |
| Sheets | `{ type: 'spring', stiffness: 300, damping: 26 }` |
| Swipe divider | 1:1 pointer tracking, release velocity → spring, snap to 0/50/100 % |
| Press feedback | `scale(0.98)` on pointerdown, 100 ms |
| List/section entry | stagger 60 ms, `opacity` + `translateY(8px)` (Globe/New/Report only; none in the workbench) |
| Globe | `flyTo` |

Only `transform`/`opacity` are animated. Everything is interruptible. `prefers-reduced-motion` → cross-fades, no auto-rotate, `jumpTo`.

Icons: Phosphor, one weight (Bold), 20 px, always with a text label in primary flows. Wordmark: `GRAHSABOOT` in Geist Mono, uppercase, tracked, with an orbit-ring glyph.

### 7.6 Performance tiers (decided at load, one-way downgrade, user can "Switch to full")
| Tier | Condition (first match) | Runs |
|---|---|---|
| T0 Static | no WebGL2, software renderer, or context creation fails | no map; coordinate form, DOM evidence viewer, grid, satellites as text |
| T1 Flat | Save-Data / 2g/3g, or deviceMemory ≤ 2 | Mercator, no pitch/terrain/buildings, pixelRatio 1, satellites as text, thumbnails only until tap |
| T2 Globe | default | globe, flyTo, satellites animated, no terrain/buildings |
| T3 City | deviceMemory ≥ 4 and cores ≥ 6 (or unknown on Safari/Firefox) and FPS probe ok | + terrain + 3D buildings |

A 1.5 s rAF probe after first render drops one tier if the median frame time is > 42 ms. `webglcontextlost` drops one tier. A quiet "Lite mode" chip shows the tier.

Budgets (targets verified in probe P5 and the final perf task):

| Metric | Target |
|---|---|
| Initial JS before the map chunk | ≤ 150 KB gz |
| First meaningful paint | ≤ 3 s on a throttled mid-range Android profile |
| Interaction latency | ≤ 100 ms |
| Map frame rate | T2 ≥ 30 fps median |
| Memory | < 350 MB |

### 7.7 Accessibility (WCAG 2.2 AA)
- Swipe is a native `<input type="range">` overlay (keyboard arrows); side-by-side is always one tap away (WCAG 2.5.7). Side-by-side is the default under 600 px width.
- Timeline scrubber is a range input stepping through acquisitions; each step announces the date and clear-view label.
- The grid uses `role="grid"` with roving tabindex and arrow keys.
- Focus is always visible (2 px accent ring). Targets ≥ 44 px on touch.
- Every image has alt text (date, satellite, clear %). Text sizes are rem-based. Respects reduced motion/transparency/contrast.

### 7.8 Copy rules
Plain words in the main flow: "photo date", "clear view", "gap", "outline", "section". Technical names (SCL, L2A, baseline, UTM, hash) live in a "Details" disclosure and the provenance JSON. Every number has a "what this means" line; every limit links to `/limits`. English only in v1. All strings live in `src/ui/copy*.ts`: `copy.ts` (shell), `copy-flow.ts` (investigation flow and report) and `copy-account.ts` (sign-in, saving, consent, deletion). A test scans every copy file for the banned verdict words.

## 8. Backend (Supabase, Mumbai `ap-south-1`)

### 8.1 Schema (PostGIS in schema `extensions`)
```sql
investigations(
  id uuid pk default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('site','road')),
  geom extensions.geography not null,          -- Polygon (site) | LineString (road), SRID 4326
  road_width_m int check ((kind='road') = (road_width_m is not null) and (road_width_m is null or road_width_m between 5 and 200)),
  date_from date not null, date_to date not null check (date_to > date_from),
  before_date date, after_date date check (before_date < after_date),
  pinned date[] not null default '{}' check (cardinality(pinned) <= 24),
  claim_text text check (char_length(claim_text) <= 2000), claim_date date, claim_criterion text check (char_length(claim_criterion) <= 500),
  frozen_at timestamptz,                        -- set on first frame; geom/kind/width/dates immutable afterwards
  created_at timestamptz not null default now(), updated_at timestamptz not null default now())

frames(id uuid pk default gen_random_uuid(), investigation_id uuid not null references investigations on delete cascade,
  owner uuid not null, acquired_at timestamptz not null, frame_date date not null, collection text not null, item_id text not null,
  processing_baseline text, asset text not null check (asset in ('visual','scl')), level smallint not null check (level in (0,1)),
  win int4[] not null check (array_length(win,1)=4), crs text not null, transform float8[] not null, href text not null,
  source_identity jsonb not null, recipe text not null, client_sha256 text not null, server_sha256 text not null,
  status text not null check (status in ('verified','mismatch')), quality jsonb,
  verified_at timestamptz not null default now(),
  unique (investigation_id, item_id, asset, level))

annotations(id uuid pk default gen_random_uuid(), investigation_id uuid not null references investigations on delete cascade,
  owner uuid not null default auth.uid(), frame_date date, section_idx smallint,
  kind text not null check (kind in ('change','no_clear_change','unsure')),
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now())

audit_log(id bigint generated always as identity pk, actor uuid, action text not null,
  entity text not null, entity_id uuid, at timestamptz not null default now())   -- IDs only, never content
```

### 8.2 Rules in the database
- **RLS:**
  - `investigations`, `annotations`: owner-only select/insert/update/delete.
  - `frames`: owner **select only**; inserts only by the `verify` function (service role); no update/delete except cascade.
  - `audit_log`: no client access.
- **Geometry checks (trigger, PostGIS):**
  - Site: `Polygon`, `ST_IsValid`, ≤ 200 vertices, area ≤ 9 km², max vertex distance ≤ 4.25 km.
  - Road: `LineString`, ≤ 200 vertices, 0.2–10 km.
  - `date_from ≥ 2017-01-01`, `date_to ≤ today`.
- **Freeze:** geom/kind/width/date range immutable once `frozen_at` is set (first frame insert).
- **Limits:**
  - ≤ 50 investigations per user.
  - ≤ 200 annotations per investigation.
  - ≤ 24 pinned dates per investigation. Each pinned date stores SCL (level 0) + TCI (level 1); the before and after dates also store TCI level 0. That is ≤ 50 frames.
- **Audit:** AFTER triggers on insert/update/delete of `investigations`, `frames`, `annotations` write `audit_log(actor = auth.uid(), or the row owner for service-role writes, action, entity, id)`. Consent is logged as `consent:v1`.
- **Account deletion:** Edge Function `delete-account` (user JWT) logs `delete_account` and deletes the user through the Auth admin API; foreign-key cascades remove every row; audit keeps IDs.
- **Purge (pg_cron, daily 02:30 IST):** delete investigations of users with `last_sign_in_at < now() - interval '12 months'`; delete `audit_log` older than 365 days.

### 8.3 Auth
Google OAuth only (scopes `openid email profile`; no sensitive scopes → no Google app verification needed). The consent screen shows the Supabase project domain until a custom domain exists. No email/password, no magic links (default SMTP is team-only). Exception: the **dev** project enables email/password with confirmation off, for one automated smoke-test user. The publishable key goes to the browser; the service key is only in the Edge function environment.

### 8.4 Cloudflare Worker
Workers static assets (`not_found_handling: single-page-application`) with `run_worker_first: ["/api/*"]` so static requests stay free and unlimited. Routes: `GET /api/tle` (above). A `scheduled()` daily keep-alive calls the `keep_alive()` RPC with the publishable key, which prevents free-tier pausing.

## 9. Privacy, security, licences
- **DPDP Act 2023 / Rules 2025** (core duties from 2027-05-13; we comply from launch):
  - Plain notice at first save: data held (Google email/name, outlines, dates, notes, claim), purposes, retention, third parties, deletion route, grievance contact.
  - 18+ confirmation in the consent dialog at first save (consent logged with IDs only). Own 1-year audit log with IDs only. Delete account anytime.
  - Purge after 12 months without sign-in. Breach runbook in `docs/ops/`.
- **Third-party reads disclosed:** STAC searches use a coarsened area; COG range reads reveal an approximate window to AWS; Nominatim sees search text; CelesTrak sees nothing user-specific (edge proxy). The app never sends email/name to any third party.
- **Security:**
  - RLS everywhere; ownership checked in `verify`; service key never in the browser.
  - Input validation in browser + DB + function; notes rendered as text and escaped in HTML export.
  - Fetch allowlist in the worker/function (earth-search.aws.element84.com, planetarycomputer.microsoft.com, sentinel-cogs / e84-earth-search-sentinel-data S3 hosts, celestrak.org).
  - No user-supplied URLs fetched server-side. CSP on the Worker (self + allowlisted tile/data hosts).
  - Rate limits: DB caps, the verify daily cap, Supabase auth defaults, 1 Cloudflare rule on `/api/*`.
- **Licences/attribution:**

  | Source | Licence | Notes |
  |---|---|---|
  | Sentinel | EU legal notice | attribution |
  | OpenStreetMap/OpenFreeMap | ODbL | attribution |
  | NASA GIBS | open | |
  | EOX 2016 cloudless | CC BY 4.0 | only that year |
  | AWS Terrarium | joerd attribution | |
  | Nominatim | usage policy | ≤ 1 req/s, search on submit only, no autocomplete, valid Referer/UA |
  | All npm dependencies | MIT/BSD/Apache/OFL | |

  Rejected for licence: LEVIR-CD, OSCD labels, BIT code, MapTiler/Stadia free tiers, EOX 2018+, Google 3D Tiles, Cesium ion Community, Vercel Hobby, Dynamic World (Earth Engine).

## 10. Limits users see (`/limits`)

| Item | Limit |
|---|---|
| Site | ≤ 9 km², ≤ 4.25 km across |
| Road | ≤ 10 km long, width 5–200 m, 2 km sections |
| Dates | 2017-01-01 to today; 10 m colour photos (small or narrow features may be invisible) |
| Saved investigations | 50 per account |
| Verified frames | 600 per day |

Other things users are told:
- Clouds block photos.
- "No clear visible change" does not prove nothing happened.
- Interiors, quality, payments and contracts cannot be judged from orbit.
- The next-pass estimate is not a guaranteed photo.
- Verification proves the pictures match the public source file at verification time; it does not prove a construction claim.

## 11. Testing
| Layer | Tool | Covers |
|---|---|---|
| Logic | Vitest 5 | coordinate parsing; geometry validation + sections; STAC parsing + per-date selection + paging cap; `frame-v1` window maths + SHA-256 vectors; `scl-v2` counts/labels on synthetic rasters; `display-v1` alignment; `diff-v1`; tier chooser; satellite positions/passes on a frozen TLE + clock; provenance schema; report HTML escaping |
| DB | Vitest + PGlite + PostGIS + an `auth` shim | RLS isolation between two users, constraints, freeze, limits (including re-checks at the frame cap), audit triggers (every frame check), consent, keep-alive, purge function, cascade on user deletion |
| Function | Deno test (`npx deno test`) | `verify` as a pure handler with injected dependencies and fixture GeoTIFFs: verified, mismatch, foreign investigation (404), window out of bounds, date outside range, rate limit, upstream 5xx, malformed or path-like input, host allowlist |
| E2E | Playwright 1.63 (Chromium, Firefox, WebKit) | site journey, road journey, swipe keyboard, report export, theme toggle, lite mode, all with STAC/COG/TLE/Supabase routes intercepted by fixtures; plus one opt-in live smoke test (`LIVE=1`) against real Earth Search/AWS |
| Determinism | Playwright + Deno | same window → same SHA-256 in Chromium, Firefox, WebKit, Deno (probe P2 becomes a permanent test) |

`npm run check` = evidence sync + typecheck + Vitest (logic and DB) + build + entry-bundle budget (150 KB gzip). `npm run e2e` runs Playwright; `npx deno test` runs the function tests; CI runs all three. Every task in the plan ends green.

## 12. Environments, deploy, cost
- **Repo:** `Idea lab laa/` becomes git repo **grahsaboot** (app at root; planning history stays in `docs/geoverify/`). Agents commit; the user pushes.
- **Accounts (user, ₹0):**
  - Supabase: 2 projects (`grahsaboot-dev`, `grahsaboot-prod`), region Mumbai.
  - Cloudflare: Workers.
  - Google Cloud: OAuth client.

  Optional first paid item: domain `grahsaboot.com`/`.in` (~₹1k/yr), which unlocks Google brand verification and a custom domain.
- **Deploy:**
  - Frontend: `wrangler deploy`.
  - Database: `supabase db push`.
  - Function: `supabase functions deploy verify`.

  The user runs prod deploys or explicitly authorises each one.
- **Cost:**

  | Volume | Monthly cost |
  |---|---|
  | Up to ~1,100 saved analyses/month (Supabase Free DB 500 MB at 12-month retention) | ₹0 |
  | 1,000 to well over 10,000 analyses/month | Supabase Pro $25 (~₹2,400 + GST) |

  Imagery bandwidth is AWS-sponsored. Cloudflare Free covers 100k API requests/day.

## 13. Risks and scale triggers
| Trigger | Action |
|---|---|
| Supabase DB > 400 MB or pausing hurts | Pro ($25), user approval |
| `verify` CPU > 2 s on real sections (P3) | Verify SCL + level-1 only, or Cloudflare Workers Paid ($5/mo) for verify, user approval |
| AWS 403/503 or sponsorship notice | Planetary Computer assets (already the STAC fallback) |
| Earth Search outage | Planetary Computer STAC |
| p95 first-frame time > 15 s on mid-range Android | More aggressive level-1 first, smaller windows, prefetch |
| Partial-coverage dates > 20 % of corridors | Same-day multi-tile mosaic (v1.1) |
| Users ask "where did it change?" repeatedly | Run the AlphaEarth offline gate (r3-science §4.2) |
| Users want to share reports | R2 + share links |
| Nominatim volume > 1 req/s sustained | Photon self-host or paid geocoder |
| Customer requires provider-attested frames | Sentinel Hub Process as an extra attestation tier |

## 14. Week-1 probes (each has a pass rule and a fallback)
| # | Probe | Pass | Fallback |
|---|---|---|---|
| P1 | geotiff 3.0.5 range reads of TCI/SCL from both S3 hosts in Chromium/Firefox/WebKit; STAC field names | correct window pixels; fields present | Planetary Computer assets |
| P2 | SHA-256 of identical windows across 3 browsers + Deno, 3 scenes | identical | server-only hashing; client hash advisory |
| P3 | Supabase Free: Mumbai, PostGIS, pg_cron; `verify` with `npm:geotiff` on 1 km² and a 2 km diagonal section | CPU < 1.5 s, RSS < 200 MB | §13 row 2 |
| P4 | Google sign-in with a non-team account (app "In production", basic scopes) | succeeds | keep testing mode with test users until domain |
| P5 | MapLibre globe + terrain + extrusion + satellites at 4× CPU throttle | T2 ≥ 30 fps, T3 ≥ 30 fps on desktop | tier thresholds adjusted |
| P6 | OpenFreeMap building/height coverage (Nagpur, Delhi, Mumbai at z15); `dark`/`positron` styles; the EOX **2016** layer identifier from its WMTS capabilities (the default `s2cloudless_3857` layer is the latest year, which is non-commercial) | buildings present; 2016 layer id recorded | terrain only where sparse; drop EOX toggle if no 2016 id |
| P7 | Toolchain: Vite 8 + React 19.3 + TS 7.0.2 + Tailwind 4.3 + Base UI 1.8 + Motion 14 build + typecheck | green | TypeScript 6.0.3 |
| P8 | CelesTrak GP for the 5 NORAD IDs; Nominatim policy text re-read | data + policy allows search-on-submit | Photon |

## 15. Human assignment (not code)
Prepare six contacts (three site/civil engineers, three road/monitoring people) and book three 20-minute sessions after the first deploy. Task: "Find out whether new road surface appeared at this place between these dates." Measure time to first comparison and confusions between "no data" and "no change". Ask what decision the report would change. Nothing is sent by agents.

## 16. Open items needing the user
1. Create the free accounts at the plan's human gates: Cloudflare at G1 (before task C11), and Supabase dev + prod plus the Google OAuth client at G0 (needed from task D4). `docs/ops/accounts.md` (task D0) gives the exact steps.
2. Optional domain purchase (first paid item).
3. Manual IP India trademark search for "GrahSaboot" (classes 9, 35, 42) before any spend.
4. Grievance contact name/email for the privacy notice.
