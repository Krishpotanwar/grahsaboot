# GrahSaboot Phase E: See the ground. A readable map, a recent satellite view and honest limits for the outline step

> **Source of truth:** the approved design doc `docs/designs/phase-e-clear-imagery.md` (office-hours, 2026-10-09; approach B, premise 2 revised, The Gate). This plan was revised on 2026-10-09 to match it; the 2026-10-08 first draft (full composite, photo zoom, building pick in the phase) is replaced. **Start only when the entry criteria hold.** Task E0 re-checks every assumption against the code of the day.
>
> **Review amendments:** the engineering review record at the end of this file (accepted amendments A-1..A-14, decisions D17-D19) overrides the task text below where they differ.
>
> **Execution method** is the owner's choice (credits): inline by the controller session, or workers per task with an independent review. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A person who does not know coordinates can find their place (a readable map; an opt-in recent satellite view for orientation), draw their outline with confidence, and is told what 10 m can show for the shape they drew. The evidence rules do not change.

**What this phase does NOT promise:** clearer evidence photos. Nothing free is sharper than 10 m; combining scenes removes clouds, not blur. The satellite view is a 10 m orientation aid, labelled "for finding your place, not evidence".

**Why now (owner report, 2026-10-08):** "nothing can be interpreted from the image", "without coordinates the user should be able to draw on the map but we are unable to draw it", "we need a more clear satellite image or we should be able to combine multiple images". Diagnosis (scratch scripts, Chromium only; Firefox check is probe P14, WebKit cannot run on the build VM):

| Observation | Evidence |
|---|---|
| Drawing works mechanically | Mouse (5 clicks closing on the first corner), double-click last corner, Enter, double-click anywhere, road variants and touch taps (Pixel 7 profile) all finish; no page errors. |
| The dark map cannot be read | OpenFreeMap `dark`: `background rgb(12,12,12)`, `building` fill `rgb(10,10,10)` (darker than the background), minor roads `#181818` (about 1.1:1), labels `rgb(80,78,78)` / `rgb(101,101,101)`. The light theme (`positron`) is readable. |
| No satellite imagery at street zoom | Spec §7.2: z0-5 NASA Blue Marble, z>=5 vector only. The spec's optional "Context imagery (2016)" toggle was never built (probe P6 pending). The owner chose the vector design V1 over the imagery design V2 (`docs/design/README.md`); this phase reverses part of that for the outline step only, as an opt-in switch. |
| The attribution box covers the map; the map is black for the first seconds | MapLibre's compact attribution starts OPEN; nothing says the tiles are loading. |
| The photos are Sentinel-2 at 10 m | A 2 km airport site is readable; a house is 1-3 pixels. "Clearer from the same data" (bicubic, joint stretch, unsharp) gave a modest gain. Sub-metre imagery is not free (spec D6; MapTiler/Stadia/EOX 2018+ rejected for licence; EOX 2016 only is CC BY 4.0). |

**Non-goals:** sharper-than-10 m imagery; machine-learning super-resolution (it invents pixels); a satellite view used as EVIDENCE (no hash, never verified, never in the report, provenance or saved frames); automatic change detection; accounts (Phase D); any paid imagery (only the owner-gated E6, behind The Gate).

## Entry criteria (all must hold; E0 checks them)

1. Phase C is finished and finally reviewed: C5c, C9 (report), P1a, P1b, C10, C11 are committed and live; `public/_headers` and `scripts/check-csp.ts` exist (C11).
2. Phase D code is committed dormant (`src/accounts/enabled.ts` exists, `loadAccounts` is `null` in a normal build), including D8a, which removes the false "signed-in accounts" sentence from the live `/limits` page. `npm run check` includes its bundle guard; Phase E must not change that.
3. `npm run check` and `E2E_BROWSERS=chromium,firefox npm run e2e` are green on `main` (E0 records the baseline numbers).

## Order of work (design doc, "Order of Work")

```
 now (no code): the Assignment (ask ten, send five, watch one)
   -> the current plan finishes (entry criteria)
   -> PART 1, ships alone:  E0 probes -> E1 readable map -> E1b size note
   -> G0: the owner says yes/no to a real single-scene render (P11 output, worked example + one village, z15-z17)
   -> PART 2 (only if G0 = yes and The Gate's "None used" has not happened): E2 loader -> E3 satellite view -> E7
   -> deferred tasks only as The Gate releases them (E2b, E4, E5, E6)
```

If G0 is "no", part 2 is not built: B reduces to A (E1 + E1b + E7's copy).

## Architecture (part 2)

```
 outline step viewport ──▶ regionFor(bbox) <= 12 km ──▶ coarsenBbox ──▶ STAC search  [existing searchSentinel2, PC fallback]
                                                              │ items (any date, any tile)
                                                              ▼
                              rankScenes(items, region): coverage >= 90 % first, then lowest cloud over the region, then newest;
                              window 75 d, then 150 d, then 240 d (only while nothing reaches 80 % clear); never older than 240 d
                                                              │ best scene
                                                              ▼
                  imagery worker (existing ops): frame(level 0|1, aoi = region, grid) -> RGBA, alpha 0 = no data
                                                              ▼
                  ContextImage { rgba, grid, scene, date, ageDays, clearPct }          (never evidence)
                                                              ▼
   MapLibre image source `gs-context` under roads/labels (P12 decides the layer order) ◀── ContextToggle (Map | Satellite, opt-in)

 Readable map (E1): paint patch table over the OpenFreeMap styles, applied on every `style.load`.
 Size note (E1b): pixels from summarizeAoi; warn, never block.
```

New and changed modules: `src/map/{readable,contextLayer}.ts`, `src/context/{region,rank,load}.ts` (pure, tested), `src/new/{ContextToggle,SizeNote}.tsx`, small edits to `createMap.ts`, `draw.ts`, `OutlineStep.tsx`, `copy-flow.ts`, `config.ts`, `scripts/check-bundle.ts`. No new npm dependency. Context code is lazy (loaded with the switch).

## Global Constraints

- **Context is not evidence.** No SHA-256, no `frame-v1`, never in the report, provenance, verify function or saved frames. **Allowlist guard:** only modules under `src/map/` and `src/new/` may import `src/context/` (a unit test scans the tree); no SHA identifier in `src/context/`; a test that photo/frame export and the report never read the context layer. The workbench mini map does NOT get the satellite view in this phase.
- **Labels.** Where the view appears: "Satellite view · Sentinel-2 · <date> · 10 m · for finding your place, not evidence", plus the scene's age whenever it is older than the base window. The attribution control (collapsed at start) lists OSM/OpenFreeMap and "Contains modified Copernicus Sentinel data <year>" whenever the view is on (tested).
- **Free and open data only** (spec D6): the same public COGs as the evidence; OpenStreetMap/OpenFreeMap (ODbL). No key, no account, no secret.
- **Network manners.** One STAC search and one scene read per load; the search uses `coarsenBbox` like the evidence search; everything aborts on switch-off, place change and unmount; never rebuilt while the user pans (explicit "Update for this view"). Opt-in everywhere: default Map on every browser and connection (no connection sniffing), cost shown ("about 8 MB when on"), choice remembered in `localStorage` (try/catch, never required).
- **Honest limits.** Said where the view is offered, in the size note and on `/limits`; nothing claims to show houses.
- **Tiers.** T0 (no WebGL): none of this exists and the coordinate forms keep working.
- **Budgets (provisional until P11/P16 replace them with measurements).** From switching on to the picture on the map <= 15 s on the worked example (build VM, real services, cold cache); <= 12 MB at level 0 (<= 6 MB at level 1 above 10 km); 0 long tasks over 50 ms; <= 80 MB extra memory; one load in flight per map; entry JS <= 150 KB gzip.
- **A11y.** The switch is a labelled control with a live status line; Undo/Finish and the switch have 44 px targets and keyboard operation; contrast of the patched maps is unit-tested (roads and building outlines >= 3:1, label text >= 4.5:1 against its halo).
- **Reversible.** `VITE_CONTEXT_IMAGERY=0` removes the switch at build time; the readable-map patch has one on/off constant.
- Copy only in `src/ui/copy-flow.ts` (the verdict-word test scans it). Existing roles, names and e2e behaviour stay unless a task names them.

## Review Focus

1. **A context image that looks like evidence.** Label, date, age, allowlist guard, no export path (E3).
2. **No usable scene / all cloudy / STAC down / offline.** The map still works, the switch explains why, nothing spins forever (E2, E3).
3. **Leaving mid-load.** Switch off, place change, theme switch and unmount abort the read and leave no layer behind (E3).
4. **The readable-map patch silently reverting** if OpenFreeMap renames layers (P13 probe, vendored fixtures; accepted risk).
5. **Phase D dormancy** stays proven by its guard and `dormant.spec.ts` after every task.
6. **The 10 m promise.** The owner sees a real single-scene render before part 2 is built (G0).

---

### Task E0: Baseline and probes (no product code)

**Files:** Create `scripts/probe-e/*.mts` (scratch-grade, committed for the record), `tests/fixtures/styles/{dark,positron}.json` (vendored OpenFreeMap styles); Modify `docs/ops/probes.md`.

**Produces:** the facts E1-E3 depend on, as probe rows P11-P16, each with a pass rule and a fallback.

- [ ] **Step 1: Entry criteria.** `git log --oneline -30`, `npm run check`, `E2E_BROWSERS=chromium,firefox npm run e2e`; record totals and entry JS size. List every file this plan edits that changed since 2026-10-08 (`git log --since 2026-10-08 -- <file>`); where P1a/P1b/C9/C11/D8a reshaped it, write the real structure into the task addendum.
- [ ] **Step 2: P11, single-scene cost and quality.** 6 regions (Nagpur centre, two villages, an expressway stretch, a lake edge, a swath-edge case) x 2 windows (Jan-Mar dry, Jul-Aug monsoon): scene chosen by the E2 ranking, bytes read, wall time cold and warm, long tasks on the main thread, blank-corner share, screenshots at z13/z15/z17 in both themes. **Pass:** at least 5 of 6 dry and 3 of 6 monsoon renders have >= 80 % clear pixels and no blank corner above 10 % of the area. **Fail:** the owner chooses between bringing E2b (compositor) forward and a longer window. **Decide:** the level switch (0 up to 10 km, else 1) and whether the read must move off the main thread. The worked-example and one-village renders are the material for G0.
- [ ] **Step 3: P12, MapLibre 6.12 and terra-draw 1.36 facts.** (a) Which of `ImageSource.updateImage`, a `canvas` source or a data URL carries an `ImageBitmap`/canvas under the CSP C11 wrote (prefer a route that needs no CSP change); (b) cost and flicker of toggling `visibility` on the style's layers, and the layer order that lets the image sit below the first road layer without hiding fills (decides E3's simple vs hide-and-restore path); (c) terra-draw 1.36's mode-level undo (`TerraDrawModeUndoRedo`, the `undoRedo` constructor option) while a polygon is in progress, and finishing from `getSnapshot()` since there is no public finish call; (d) collapsing the compact attribution at start without private API.
- [ ] **Step 4: P13, style drift.** `scripts/probe-e/style-diff.mts` fetches the live `dark` and `positron` styles and compares layer ids/types with the vendored snapshots. The controller session runs it at the start of each work session and before any deploy that touches maps; a failing run is a warning, never a build failure. A pinned copy of the style is the fallback if it warns twice.
- [ ] **Step 5: P14, drawing in Firefox.** Reproduce the drawing flow (mouse and touch emulation) on the Firefox project with the existing scratch scripts; record the owner's browser/OS/device if they supply it. Add an engine-specific fix to E1 only if something fails.
- [ ] **Step 6: P15, OpenAerialMap coverage (informational).** At the five assignment sites; if it covers them, say so in `docs/ops/probes.md`: it changes premise 4 only through The Gate.
- [ ] **Step 7: P16, throttled run.** Chromium with 4x CPU and a throttled-4G profile, E3's flow on the worked example: the proxy for a mid-range Android (a real-device run is an owner action). Use it to replace the provisional budgets.
- [ ] **Step 8: Record** P11-P16 in `docs/ops/probes.md` with the numbers, the decisions they imply and any task this plan must cut or change. **Commit** scripts, fixtures and rows.

**Gate:** if P11 fails at 8 km with every mitigation, the region cap falls to 6 km. Part 2 does not start before G0.

---

### Task E1: A map you can read

**Files:** Create `src/map/readable.ts`, `src/map/readable.test.ts`; Modify `src/map/createMap.ts`, `src/map/draw.ts`, `src/new/OutlineStep.tsx`, `src/ui/copy-flow.ts`; Test `tests/e2e/map-readable.spec.ts`.

**Interfaces:** `applyReadable(map: MlMap, theme: Theme): void` (idempotent, silent on unknown ids, called from the existing `style.load` handler); `export const READABLE: Record<Theme, Record<layerId, PaintPatch>>`; `startDrawing(...)` returns `{ stop(), undo?(): boolean, finish?(): boolean }`, with undo/finish present only if P12(c) passed.

- [ ] **Step 1: Failing tests** (`readable.test.ts`, against the vendored styles): every id in `READABLE` exists in the matching vendored style (an upstream rename fails loudly); after applying the patch to a copy of the style, road lines and building outlines are >= 3:1 against `background` in both themes and label text >= 4.5:1 against its halo; a layer in the style but not in the table is untouched; applying twice changes nothing.
- [ ] **Step 2: Implement** the table: a `gs-building-outline` line layer (same source and source-layer, z>=14) draws footprints at `#8a8a8a` in dark; minor roads lighter; `highway_path`, `railway`, `landuse_residential`, `landcover_wood`, `water` separated by luminance; `highway_name_*` and `place_*` text `#c9c9c9` with a 1.5 px dark halo. Light theme: only what the contrast test demands.
- [ ] **Step 3: Loading and error states.** `MapStage` exposes `mapReady` (first `idle`) and `mapFailed` (style or tiles failing for > 10 s); the step shows "Loading the map" (live region) until ready and "The map could not load. Enter coordinates instead." with the coordinates details opened when failed.
- [ ] **Step 4: Attribution.** Collapse the compact control at start (P12(d)); credits stay one click away.
- [ ] **Step 5: Drawing aids.** Hint: "Click each corner of your site. Click the first corner again, double-click or press Enter to finish." Undo (terra-draw's built-in mode-level undo) and Finish (closes the ring from `getSnapshot()` with at least 3 corners, then calls the same finish path) as 44 px buttons, only if P12(c) passed; otherwise no buttons and the hint ends "Press Enter to finish; Esc cancels".
- [ ] **Step 6: e2e** (tier 2, fixtures): the patched ids are applied (`map.getPaintProperty`), the loading line appears and goes, the attribution starts collapsed, the hint text, Undo removes the last corner, Finish closes (or the fallback hint), the failure line opens the coordinates. axe in both themes with the step open.

**Gates:** unit + e2e green, `npm run check` green, screenshots of dark and light at z15 and z17 next to the old ones (in the report), entry JS unchanged.

---

### Task E1b: Size note

**Files:** Create `src/new/SizeNote.tsx` (+ a pure `sizeNote(summary)` in `src/new/sizeNote.ts`, tested); Modify `src/new/OutlineStep.tsx`, `src/ui/copy-flow.ts`; Test `tests/e2e/size-note.spec.ts`.

**Behaviour:** site: when the polygon closes or is edited, pixels = `areaKm2 * 10_000` (100 m2 per pixel); road: when the line is finished and its width is set, pixels across = `widthM / 10`, and the length. It warns and never blocks; below the 1,000 m2 floor the existing `too_small` refusal is shown INSTEAD of the note. Thresholds and words are an open item to settle with the owner (about 1 ha for a site and about 20 m for a corridor were suggested); the three example sentences are in the design doc.

- [ ] **Step 1: Failing tests:** the arithmetic at the boundaries (just above the floor, at the threshold, large), the road case, that the refusal replaces the note, that the note never disables Next, that the words come from `copy-flow` (verdict-word test).
- [ ] **Step 2: Implement; e2e:** a big site, a small site, a narrow corridor at 390 px and 1440 px, both themes, axe.

**Gates:** `npm run check` + e2e green.

---

### Gate G0 (owner decision, no code)

The owner looks at the P11 renders of the worked example and one village (z15-z17, both themes) and answers yes or no: "this 10 m orientation view helps me find the place". Record the answer in `docs/ops/probes.md`. **No:** part 2 is cancelled and B reduces to A. **Yes:** continue.

---

### Task E2: Context loader (one scene; pure, tested, no UI)

**Files:** Create `src/context/{region,rank,load}.ts` with `*.test.ts`; Modify nothing else. Fixtures from `tests/fixtures/scene.ts`.

**Interfaces:**
- `regionFor(view: Bbox, maxKm = 12): { bbox: Bbox; clamped: boolean }`, `gridFor(region, maxSide = 1024): DisplayGrid` (reuses `makeDisplayGrid`, `padFrac = 0`), `levelFor(region): 0 | 1` (P11).
- `rankScenes(items: S2Item[], region: Bbox, now: Date): { pick: S2Item; ageDays: number; widened: boolean } | null`: region coverage >= 90 % first, then lowest cloud over the region, then newest; base window 75 days, extended to 150 then 240 days only while no candidate reaches 80 % clear; never older than 240 days.
- `loadContext(deps: { search; client: ImageryClient; now?: Date }, region, signal: AbortSignal): Promise<ContextResult>` where `ContextResult` is `{ ok: true, image: ContextImage } | { ok: false, reason: 'NO_SCENES' | 'ALL_CLOUDY' | 'OFFLINE' | 'ABORTED' }`; `ALL_CLOUDY` still carries the clearest image, flagged. The loader makes one search and one scene read, uses `coarsenBbox` for the search, and no read after abort.

- [ ] **Step 1: Tests first** (pure, deterministic): `regionFor` clamps to 12 km, keeps the centre, flags `clamped`; `levelFor` switches at 10 km; `rankScenes`: coverage before cloud before recency, the window steps (75 -> 150 -> 240) and the cap, never returns an older scene, stable for equal scores, null when nothing qualifies; `loadContext` with a fake client and search: one read, abort resolves `ABORTED` and stops, all-cloudy returns the clearest flagged, none returns `NO_SCENES`, offline returns `OFFLINE`, the search receives the coarsened bbox.
- [ ] **Step 2: Implement** to green; if P11 says the read must leave the main thread, use the imagery worker's existing `frame` op (same tests, different host).
- [ ] **Step 3: Real-data check** (script, not a test): the worked example and two other regions, reporting scene, age, bytes, time to image, clear %, with screenshots.

**Gates:** `npm run check` green, unit totals reported, real-data numbers inside the budgets, no UI change, entry JS unchanged.

---

### Task E3: Satellite view in the outline step

**Files:** Create `src/map/contextLayer.ts` (+test), `src/new/ContextToggle.tsx`, the allowlist guard test; Modify `src/new/OutlineStep.tsx`, `src/ui/copy-flow.ts`, `src/config.ts` (`contextImagery` flag), `tests/fixtures/server.ts` if the fixture STAC needs a region search; Test `tests/e2e/context-view.spec.ts`.

**Interfaces:**
- `setContextLayer(map, image: ContextImage | null)`: adds/updates image source `gs-context` and a raster layer placed per P12(b) (below the first road layer if that works; else the hide-and-restore overlay with an exact-restore unit test), using the route P12(a) found; `removeContextLayer(map)`. Idempotent; installed through `installLayers('context', ...)` so it survives a theme switch; drawn with default linear resampling, no sharpening.
- `<ContextToggle region onImage />`: a labelled "Map | Satellite" control in a row ABOVE the map at every width (never floating over the drawing area), a live status line, "Update for this view" (re-plans from the current viewport, clamped) and "Cancel" while loading; default Map; states as in the design doc (off, loading, on, older scene, all cloudy, nothing usable, offline).

- [ ] **Step 1: Tests first.** Unit: layer order; idempotent installs; removal leaves no source or layer; the allowlist guard; the attribution lists the Copernicus credit when on. e2e (tier 2, fixture imagery): switching on adds `gs-context` within the budget and the status line names date and age; off removes it; a theme switch keeps it; leaving the step removes it and aborts the read (no request after unmount); all-cloudy fixture shows the explanation; nothing-usable and offline show their lines; the choice is remembered; axe in both themes with the view on; the controls row never overlaps the drawing area at 390 px and 1440 px.
- [ ] **Step 2: Implement** `contextLayer.ts`, the toggle, the OutlineStep integration (region = the current viewport bbox clamped, planned when the switch turns on and on "Update"), copy, config flag.
- [ ] **Step 3: Real-data check** on a hook build (tier 2, real services): the worked example and one village: time to picture, bytes, long tasks (0), memory; screenshots dark and light, map and satellite, z13/z15/z17, with an outline drawn on top (E3's report).
- [ ] **Step 4: CSP.** If P12(a) chose a route that needs a CSP change, add exactly that to the C11 generator and `check-csp`; otherwise state "no change".

**Gates:** `npm run check` + whole e2e (all three projects) green, bundle guard green (Phase D dormancy unchanged), budgets met, entry JS <= 150 KB.

---

### Task E7: Copy, limits page, docs, final sweep

**Files:** Modify `src/ui/copy-flow.ts`, the `/limits` screen copy, `README.md`, `docs/ops/probes.md`, the design spec §7.2/§9/§10 (a dated addendum, not a rewrite).

- [ ] Limits page: the size note's idea (a house is 1-3 pixels; the satellite view is a 10 m orientation aid, not evidence); verify the accounts sentence is gone from the dormant build (D8a). Spec addendum: the layer table gains the satellite view and the readable-map patch.
- [ ] README: feature list and roadmap row. Probes: P11-P16 final rows.
- [ ] Sweep: axe on every screen touched in both themes, T0 journey unchanged, Phase D dormancy guard and `dormant.spec.ts` green, bundle budget, whole e2e on all three projects.

---

## Deferred tasks (specifications kept; each starts only when The Gate releases it)

- **E2b: multi-scene compositor.** `matchBands`, `Compositor` (base = best scene, holes filled from later scenes after per-band mean/std matching), progressive emit. Brought forward only if P11 fails its pass rule or the Gate names it. Seams between scenes of different dates can look like change: the label would carry the date range.
- **E4: pick a building.** `ringFromFeature`, `simplifyRing`, `pickAt` over the vector-tile `building` layer or Overpass (probe P10 decides), a confirm gate, never applied silently.
- **E5: photo viewer zoom, pan, enhance.** CSS-variable gestures (no React state per gesture), joint-stretch "Enhance" (display only, never in the report or hashes), synchronized side-by-side, keyboard and touch.
- **E6: keyed high-resolution backdrop (OWNER-GATED).** Needs the owner's provider, terms and key in writing; dormant like accounts (absent when the variables are unset; a bundle guard).
- **The satellite view on the workbench mini map**, with its own layer order, label and guard coverage.

## Test plan summary

| Unit | Kind | Cases (all RED first) |
|---|---|---|
| `readable.ts` | unit on vendored styles | ids exist; contrast >= 3:1 / 4.5:1; idempotent; unknown layers untouched |
| `sizeNote` | unit | arithmetic at boundaries, road case, refusal replaces note, never blocks |
| `regionFor/gridFor/levelFor` | unit | clamp, centre kept, level switch |
| `rankScenes` | unit | coverage > cloud > recency, window steps and cap, stable, null |
| `loadContext` | unit with fakes | one read, abort, all-cloudy, none, offline, coarsened bbox |
| import guard | unit | only `src/map/` and `src/new/` import `src/context/`; no sha identifiers; export never reads the layer |
| `contextLayer` | unit with fake map | layer order, idempotent, no leftovers (exact restore if hide-and-restore) |
| readable map + drawing aids | e2e | patch applied, loading and failure lines, attribution collapsed, hint, Undo/Finish or fallback |
| size note | e2e | big, small, narrow corridor, both widths and themes, axe |
| satellite switch | e2e (fixtures, tier 2) | on/off, dates and age in status, theme switch, abort on leave, all-cloudy, nothing, offline, remembered choice, Copernicus credit, controls never cover the outline, axe |
| real-data scripts | manual, numbers in reports | time to picture, bytes, long tasks, memory, screenshots (G0 material) |

## Risks and answers

- **A context image mistaken for evidence** (Review Focus 1): label, date, age, allowlist guard, no export path, no mini-map exposure.
- **10 m disappoints the owner:** G0 shows a real render before part 2 is built.
- **Heavy first load on mobile data:** opt-in everywhere, cost shown, abortable, one scene only.
- **OpenFreeMap style drift** reverts the patch silently: vendored fixtures, the P13 probe read by the controller session, the light theme stays readable; a pinned copy if it warns twice.
- **Single scene cloudy or with blank corners:** P11's pass rule; E2b is the answer if it fails.
- **Scope:** part 1 (E0, E1, E1b) and part 2 (E2, E3, E7) are the phase; everything else is behind The Gate.

## Execution notes

Each task gets RED tests first, gates (`npm run check`, e2e, prettier), a real-data script where named, and an independent review when the owner allows workers; otherwise the controller reviews its own diff and says so. Part 1 may ship alone as soon as it is green. Deploys follow the standing rule (gates + live smoke), never with Phase D's flag on.

---

## Engineering review record (/plan-eng-review, 2026-10-09)

Target (fixed): this plan, `docs/superpowers/plans/2026-10-08-grahsaboot-phase-e-clear-imagery.md`, as revised on 2026-10-09 from the approved design doc `docs/designs/phase-e-clear-imagery.md` (office-hours, status APPROVED at D16). Report file: this file. Method note: the owner asked for no more subagents (credits), so the outside-voice step is skipped and every check below was done by the review session itself against the repo.

### Scope record

Scope Challenge result: scope accepted as-is.
feature answers: none asked (no cut proposed; part 1, G0, part 2 and the deferred list stand as the design doc approved them); structure: A, Original arrangement (answer to D17, 2026-10-09: `src/context/{region,rank,load}.ts`, `src/new/{sizeNote.ts,SizeNote.tsx}` stay as written); accepted scope: E0 (reduced), E1, E1b, G0, E2, E3, E7 with every deferred task behind The Gate; pending remedies: none yet (Sections 1-4 follow).

## Decision ledger

### R1: wide-viewport rule for the satellite switch
Finding: A4 [P2] (confidence 8/10) `src/map/createMap.ts:30` `const start = { center: [78.96, 21.5] as [number, number], zoom: opts.tier >= 2 ? fit : 3.6 }`; reviewer: this eng review.
Plan baseline: original proposal, nothing approved: E3's `regionFor` clamps to a 12 km box around the viewport centre; the states table has no wording or state for a wider view.
Runtime evidence: the shared map starts at country zoom (`createMap.ts:30`) and a person can reach the outline step zoomed out; the switch does not exist yet, so this is read from the code, not reproduced.
Comparison grid:

| Choice | Current (plan) | A | B | C |
|---|---|---|---|---|
| R1 switch when the view is wider than 12 km | enabled; region silently clamped to 12 km around the centre; pending | disabled, with "Zoom in to your place to use the satellite view." | enabled; region clamped; status adds "Showing the central 12 km; zoom in for your place." | unchanged: enabled, clamped, no wording |
| Every other approved value (opt-in default, labels, G0, budgets, states table) | as approved at D16 | unchanged | unchanged | unchanged |

Question D18:
D18 — Section 1: what should the satellite switch do when the map view is wider than 12 km?
Project/branch/task: main, /plan-eng-review of the Phase E plan (tasks E2 and E3).
ELI10: The satellite picture can cover at most a 12 km square. The map is shared across the whole site and starts at country zoom, so someone can turn the switch on while zoomed far out. As written, the plan would quietly cut a 12 km square from the middle of that view: a picture of a place the person is not looking at, with no word of explanation. The choice is what the switch should do then.
Stakes if we pick wrong: a person sees a satellite patch that does not match the map, or a switch that seems to do nothing, and decides the feature is broken.
Recommendation: A, disable with a reason, because it is the simplest to explain and test, and it ties the picture to the zoom where 10 m detail is meaningful.
Completeness: A=9/10, B=8/10, C=4/10
Pros / cons:
A) Disable with a reason (recommended)
  ✅ One clear rule: the switch works only when the view is 12 km across or less, and says how to get there.
  ✅ No picture of the wrong place can appear, and the rule is a one-line pure check to test.
  ❌ A person who wants the satellite at country zoom is told to zoom in first.
B) Clamp and say so
  ✅ The switch always responds, and the status line explains the central 12 km.
  ✅ A person at country zoom still gets something to look at.
  ❌ Still shows a patch of a place the person may not care about, and needs more wording and tests.
C) Leave as planned
  ✅ Nothing extra to build or word.
  ✅ The plan's tests and states table stay exactly as written.
  ❌ A silent wrong-place picture at wide zoom, with no explanation of why it looks that way.
Net: a clear rule that is easy to test, against a switch that always reacts but can mislead.
Header: Wide view
Options:
A) Disable with a reason (Recommended)
The switch is disabled when the map view is wider than 12 km, with the text "Zoom in to your place to use the satellite view."; enabled otherwise. Everything else as approved.
B) Clamp and say so
The switch stays enabled at any zoom; the region is clamped to 12 km around the centre and the status adds "Showing the central 12 km; zoom in for your place." Everything else as approved.
C) Leave as planned
No special handling: the region is silently clamped to 12 km around the centre at any zoom. Everything else as approved.

State: approved
Actual answer: A) Disable with a reason (Recommended), answer to D18, 2026-10-09
Accepted scope: E3 only: a pure check `viewTooWide(bounds, maxKm = 12)` (the larger of the view's width and height at its centre) drives the switch's disabled state and one status sentence, "Zoom in to your place to use the satellite view."; enabled otherwise; unit tests either side of the threshold (11 km, 13 km) and an e2e at country zoom; a state row added to the states table. Every other approved value unchanged.
History: none

### R2: TODO, move the C8 photo layer off PNG data URLs before C11
Finding: S1 [P3] (confidence 9/10) `src/map/frameLayer.ts:4` `// MapLibre 6.12 loads an image source with fetch(), data: URLs included, so the CSP's connect-src has to allow data: (C11).` and `maplibre-gl.d.ts` `ImageSource.updateImage` (`image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | ImageData`, "without a network request"); reviewer: this eng review.
Plan baseline: nothing approved; the Phase E plan does not touch `frameLayer.ts`; C11 (CSP) is not written yet.
Runtime evidence: the installed MapLibre 6.12 types declare `updateImage({ image })` and an image source without a url; the live code still goes through `canvas.toDataURL`/PNG and `data:` (C8 report: PNG encode 50-300 ms at 1024 px).
Comparison grid:

| Choice | Current | A | B | C |
|---|---|---|---|---|
| R2 frameLayer image route | PNG data URL, `data:` needed in C11's `connect-src` | unchanged now; TODO recorded in TODOS.md | unchanged; nothing recorded | carry-in to C11's addendum: migrate to `updateImage({ image })` before the CSP generator, so `data:` never enters the CSP |
| Phase E scope, G0, budgets, every approved value | as approved | unchanged | unchanged | unchanged |

Question D19:
D19 — TODO: move the C8 photo layer off PNG data URLs before the CSP is written?
Project/branch/task: main, /plan-eng-review of the Phase E plan (found while reading MapLibre 6.12's image-source API).
ELI10: The photo on the mini map is handed to the map as a PNG file turned into text (a data URL). That costs 50-300 ms every time the slider rests, and it forces the security policy (CSP) that task C11 writes to allow data URLs for fetching. MapLibre 6.12 can take the picture directly with no file and no fetch. Changing it before C11 means the policy never needs the data-URL exception.
Stakes if we pick wrong: skip it and the CSP ships with a wider hole and the slow encode stays; do it carelessly and the mini-map photo could break on a browser this machine cannot test (WebKit).
Recommendation: C, do it before C11, because it is a small local change that removes a security exception and a per-rest cost, and the existing map specs already cover the photo layer.
Completeness: A=6/10, B=3/10, C=9/10
Pros / cons:
A) Add to TODOS.md
  ✅ Keeps the idea on record without touching live code now.
  ✅ No new risk to the shipped mini map.
  ❌ Creates a TODOS.md nobody reads and the CSP will most likely ship with the data: exception first.
B) Skip
  ✅ Zero work and zero risk now.
  ✅ Nothing to maintain.
  ❌ The data-URL exception goes into the CSP and the PNG encode stays on every rest.
C) Do it before C11 (recommended)
  ✅ Removes the data: exception from the CSP before it is written, and drops the 50-300 ms encode.
  ✅ Small and local: frameLayer.ts, its unit test and the workbench-map spec.
  ❌ Touches live C8 code and cannot be proven on WebKit from this machine; needs Firefox and Chromium runs.
Net: a safer CSP and a faster rest for a small change to live code, against leaving it as is.
Header: TODO
Options:
A) Add to TODOS.md
Record the idea in a new TODOS.md (What, Why, Pros, Cons, Context, Depends on) and change no code or plan.
B) Skip
Not valuable enough now: nothing recorded, nothing changed.
C) Do it before C11 (Recommended)
Record accepted scope as a carry-in to C11's addendum in the Phase C ledger: migrate `src/map/frameLayer.ts` to `ImageSource.updateImage({ image })` (ImageData) before the CSP generator; unit test updated; workbench-map spec stays green; `data:` not added to `connect-src`. No product code is edited in this review.

State: approved
Actual answer: C) Do it before C11 (Recommended), answer to D19, 2026-10-10
Accepted scope: carry-in to C11's addendum (Phase C ledger): migrate `src/map/frameLayer.ts` to `ImageSource.updateImage({ image })` with `ImageData` before the CSP generator is written; `frameLayer.test.ts` and the workbench-map spec updated and green on chromium + firefox + mobile; `data:` is not added to `connect-src`; WebKit cannot be run on the build VM (owner action). No product code is edited by this review, and nothing in the Phase E tasks changes.
History: none

Approval readiness: PASS. Checked: R1 (D18 = A, 2026-10-09), R2 (D19 = C, 2026-10-10). Corrections carried without a new choice, because the behaviour was approved at D16 and D17: F1, F2, F4, F5, F6, Q1, Q3, Q5, P1. No remedy is pending.

## Review findings and dispositions (2026-10-10)

| # | Sev / conf | Where | Finding | Disposition |
|---|---|---|---|---|
| F1 | P2 / 9 | `src/stac/types.ts:15` `cloudCover: number \| null` | "Lowest cloud over the region" is not computable by a pure `rankScenes`: STAC has only scene-level cloud; the region's clear fraction needs an SCL read (`runQuality`, `imagery-core.ts:117`) | accepted, A-6 |
| F2 | P2 / 8 | `src/map/createMap.ts:115` `'fill-extrusion-color': theme === 'dark' ? '#27272a' : '#e4e4e7'` | tier-3 dark buildings are ~1.3:1 against `rgb(12,12,12)` and sit outside the style JSON the contrast test checks | accepted, A-3 |
| F3 | P2 / 8 | `src/map/createMap.ts:30` start zoom | switch on at country zoom would show a clamped patch of another place | accepted, D18 = A, A-9 |
| F4 | P3 / 7 | `src/workers/imagery-client.ts:27` `TIMEOUT_MS = 120_000` | no owner for the Worker lifecycle; a stalled read shows "Finding..." up to 2 min; no generic failure reason | accepted, A-7, A-10 |
| F5 | P3 / 7 | `src/map/createMap.ts:42-43` `compact: true, customAttribution` | credit is constructor-only; image sources have no attribution field; `compact: true` is why the control starts expanded | accepted, A-2 |
| F6 | P3 / 6 | `src/map/MapStage.tsx` provider | `mapReady`/`mapFailed` must reset on rebuild and on `setStyle` | accepted, A-4 |
| Q1 | P2 / 8 | `tests/fixtures/server.ts:12-20` | fixture style has only `bg` + `labels`: E1/E3 e2e assertions cannot run | accepted, A-12 |
| Q2 | P3 / 7 | `src/stac/select.ts:4-34` | reuse `selectPerDate` + `pointInRing` (9x9 point grid), no clipping dependency | accepted (What already exists) |
| Q3 | P3 / 6 | design doc states table "about 8 MB" | constant unmeasured; a 12 km window is ~1-3 MB (estimate) | accepted, A-11 |
| Q4 | P3 / 7 | `frameLayer.ts:5-23` vs proposed `contextLayer.ts` | shared image-layer helper: callers differ, ~8 net lines, touches live C8 code | rejected (revisit at a third image layer) |
| Q5 | P3 / 5 | `MapStage.tsx` `[tier]` effect | toggle effect must depend on `map` or a rebuilt map loses the layer | accepted, A-10 |
| P1 | P3 / 8 | plan E2 `gridFor(region, 1024)`, `display.ts:4` | small views are 8x oversampled (1.2 m/px from 10 m) | accepted, A-8 |
| P2 | P3 / 7 | `imagery-core.ts:181-206` `runFrame` | hashes the window and posts back `native.rgb` (<= 4.3 MB) the loader never reads; est. +40-100 ms worker CPU | no change; P11 records it; lean op only if the budget breaks |
| P3 | P3 / 6 | `src/stac/search.ts` | one 240-day search is 1-2 pages + the empty trailing page, ~2-3 s | no change; P11 measures |
| S1 | P3 / 9 | `src/map/frameLayer.ts:4` | `data:` exception in C11's CSP is avoidable with `updateImage({ image })` | accepted, D19 = C, A-14 |

## Accepted amendments (override the task text above where they differ)

- **A-1 (E0, P11):** also measures the two-stage selection (<= 3 SCL checks + 1 frame read) and bytes per stage. "One scene" in the budgets means one picture shown, not one read.
- **A-2 (E0, P12):** (a) is answered by the installed 6.12 types: `ImageSource.updateImage({ image })` takes `ImageData | ImageBitmap | HTMLCanvasElement | HTMLImageElement` with no network request and no `url`; verify on Chromium and Firefox. (d) `compact: true` makes the control start expanded; find the supported way to start collapsed. Add (e): how the Copernicus credit is added and removed with the layer (re-creating the attribution control on toggle is the expected route).
- **A-3 (E1):** the building colours at `createMap.ts:115` move into the same table the contrast test checks; `gs-building-outline` is added only where no `fill-extrusion` layer exists (the condition at `createMap.ts:105`).
- **A-4 (E1 Step 3):** `mapReady` = first `idle` after the current style loaded, false again on `setStyle` and on map rebuild; `mapFailed` = style or tiles erroring for > 10 s after a style load; both per map instance.
- **A-5 (E1 Step 6):** uses the extended fixture style (A-12).
- **A-6 (E2):** `rankScenes` is metadata-only: per-date best item and coverage via `selectPerDate` and a 9x9 `pointInRing` grid, scene cloud, recency, window steps 75/150/240 d applied in the rank (one STAC search for 240 days, never re-searched). `loadContext` then runs `client.quality` on the top <= 3 (two at a time), picks the first >= 80 % clear else the clearest, and reads one `client.frame`.
- **A-7 (E2):** reasons are `NO_SCENES | ALL_CLOUDY | OFFLINE | ABORTED | FAILED`; worker crash, `IMAGERY_TIMEOUT`, `AOI_OUTSIDE_SCENE` and a 45 s loader deadline end in `FAILED`.
- **A-8 (E2):** `gridFor` caps the grid side at about `2 x extentMetres / 10` (never above 1024).
- **A-9 (E3, D18 = A):** `viewTooWide(bounds, 12)` disables the switch with "Zoom in to your place to use the satellite view."; states-table row added.
- **A-10 (E3):** the toggle creates the imagery client lazily on switch-on and `dispose()`s it on switch-off, place change and unmount; its install effect depends on `map` so a rebuilt map re-installs the layer and keeps the status.
- **A-11 (E3):** the cost text comes from P11's median bytes per level, not a constant.
- **A-12 (tests):** `tests/fixtures/server.ts` style gains ordered real ids (`landuse_residential`, `water`, `building`, `highway_minor`, `highway_name_minor`, `labels`) over an inline GeoJSON source.
- **A-13 (tests):** added cases: quality selection (>= 80 %, fallback to the clearest, all three fail -> `FAILED`); abort on switch-off / theme switch / Back during the load; double toggle or Update twice keeps one load in flight; rebuilt map while on; Worker disposed after leaving; the attribution lists the Copernicus credit only while the view is on.
- **A-14 (C11 carry-in, D19 = C):** `frameLayer.ts` moves to `updateImage({ image })` before the CSP generator; `data:` never enters `connect-src`. Recorded in `task-C11-addendum.md`.

## NOT in scope

- E2b compositor, E4 building pick, E5 photo zoom/pan/enhance, E6 keyed backdrop, satellite view on the workbench mini map: all behind The Gate (design doc).
- A lean `context` worker op (hash-free, no `native.rgb`): only if P11 shows long tasks or a broken budget.
- A pinned copy of the OpenFreeMap styles: fallback only if the P13 probe warns twice.
- A shared image-layer helper (`frameLayer.ts` + `contextLayer.ts`): rejected for ~8 net lines.
- A weekly CI drift job for the styles: the controller session runs P13 instead.
- Real-device Android and WebKit/Safari runs: owner actions (the build VM cannot run WebKit).

## What already exists

- `createMap.ts:53` `style.load` -> `applyBaseLayers` (hook for `applyReadable`); `MapStage.tsx:119` `installLayers` (layer lifecycle across theme switches and rebuilt maps).
- MapLibre 6.12 `ImageSource.updateImage({ image })` and terra-draw 1.36 `TerraDrawModeUndoRedo`; `frameLayer.ts` is the image-layer idiom.
- `searchSentinel2` (+ Planetary Computer fallback), `selectPerDate`/`pointInRing`, `createImageryClient().quality/frame`, `makeDisplayGrid`, `coarsenBbox`, `summarizeAoi`, the `too_small` refusal and `copy.ts:95` 10 m sentence.
- Tests: `new-outline.spec.ts:70/115/143` (drawing, tiles loading, theme switch + rebuilt map), `frameLayer.test.ts:10-28` fake-map pattern, fixture server STAC/COG.

## Diagram: the loader (put as a comment at the top of `src/context/load.ts`)

```
switch on -> viewTooWide?  yes -> disabled + "Zoom in to your place..."
          -> regionFor (<= 12 km) -> coarsenBbox -> searchSentinel2 (240 d, one search)
          -> selectPerDate(items, region corners) -> rank: coverage >= 90 %, scene cloud, recency; steps 75/150/240 d
          -> client.quality x <= 3 (2 at a time, SCL window) -> first >= 80 % clear, else clearest
          -> client.frame (level 0|1, capped grid) -> ImageData
          -> updateImage({ image }) under the first road layer -> status (date, age) + Copernicus credit
any step: abort -> no layer, no worker | NO_SCENES | ALL_CLOUDY (clearest, flagged) | OFFLINE | FAILED (45 s deadline)
```

## Failure modes

| Path | Failure | Test | Handling | User sees |
|---|---|---|---|---|
| search | both STAC providers down | planned (E2) | `OFFLINE` | "Could not reach the photo service..." + Try again |
| select/read | 3 quality checks or the frame read fail, worker crash, timeout | added (A-13) | `FAILED`, worker disposed | message + Try again, never an endless "Finding..." |
| lifecycle | stale result after off / theme switch / Back | added (A-13) | `ABORTED` ignored, layer removed | nothing stale |
| style | OpenFreeMap renames layer ids | vendored-style unit test, P13 probe | patch is a silent no-op | today's dark map; accepted risk, not silent for maintainers |
| API | `updateImage({ image })` unsupported on an untested browser | P12(a) on Chromium + Firefox | canvas/ImageBitmap in the same API | WebKit unverified (owner action) |

Critical gaps: 0.

## Parallelization

Sequential implementation, no parallelization opportunity: E1, E1b and E3 all edit `OutlineStep.tsx`, and part 2 waits for G0.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~1 day / CC: ~40 min)**: E0 probes P11-P16 incl. P12(e), the two-stage measurement and the throttled run. Surfaced by: Section 1 F1, F5. Files: `scripts/probe-e/*`, `docs/ops/probes.md`. Verify: probe rows recorded with numbers.
- [ ] **T2 (P1, human: ~1 day / CC: ~30 min)**: E1 readable map with the shared building colours, reset rules and the extended fixture style. Surfaced by: F2, F6, Q1. Files: `src/map/readable.ts`, `createMap.ts`, `MapStage.tsx`, `draw.ts`, `OutlineStep.tsx`, `tests/fixtures/server.ts`. Verify: `npm run check`, `map-readable.spec.ts`.
- [ ] **T3 (P2, human: ~0.5 day / CC: ~20 min)**: E1b size note. Surfaced by: design doc, Section 3 diagram. Files: `src/new/sizeNote.ts`, `SizeNote.tsx`. Verify: unit boundaries + `size-note.spec.ts`.
- [ ] **T4 (P1, human: ~1.5 days / CC: ~45 min)**: E2 loader: metadata rank, <= 3 SCL checks, one frame, `FAILED`, 45 s deadline, grid cap. Surfaced by: F1, F4, P1. Files: `src/context/{region,rank,load}.ts`. Verify: unit tests + real-data script.
- [ ] **T5 (P1, human: ~1.5 days / CC: ~45 min)**: E3 toggle: `viewTooWide`, worker lifecycle, credit mechanism, map-rebuild dependency, cost text. Surfaced by: F3, F4, F5, Q3, Q5. Files: `src/map/contextLayer.ts`, `src/new/ContextToggle.tsx`. Verify: `context-view.spec.ts` on 3 projects.
- [ ] **T6 (P2, human: ~0.5 day / CC: ~15 min)**: allowlist guard + export test. Surfaced by: design doc review. Files: `src/context/guard.test.ts`. Verify: guard test fails on a deliberate import.
- [ ] **T7 (P1, human: ~0.5 day / CC: ~20 min)**: before C11, migrate `frameLayer.ts` to `updateImage({ image })`. Surfaced by: S1. Files: `src/map/frameLayer.ts`, `frameLayer.test.ts`, `Workbench.tsx` map effect. Verify: `workbench-map.spec.ts` green, no `data:` in the CSP.
- [ ] **T8 (P3, human: ~0.25 day / CC: ~10 min)**: E7 copy, limits page, README, probe rows. Surfaced by: design doc. Files: `src/ui/copy-flow.ts`, `README.md`, `docs/ops/probes.md`. Verify: whole e2e, axe.

## Unresolved decisions

None.

## Completion summary

- Step 0: Scope Challenge: scope accepted as-is (structure: original arrangement, D17)
- Architecture Review: 6 issues found
- Code Quality Review: 5 issues found
- Test Review: diagram produced, 7 gaps identified
- Performance Review: 3 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 1 item proposed (D19 = C, a C11 carry-in; no TODOS.md created)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, skipped (Codex not installed; native fallback not run because the owner asked for no more subagents)
- Parallelization: 1 lane, 0 parallel / 1 sequential
- Lake Score: 0/2 (the best options scored 9/10)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | n/a |
| Outside Review | codex (not installed), `/plan-eng-review` step | Independent 2nd opinion | 1 | skipped | no coverage (owner asked for no more subagents) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 21 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | n/a |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | n/a |

- **OUTSIDE COVERAGE:** codex, plan-review, skipped: Codex is not installed and the native Claude fallback was not run because the owner asked for no more subagents. No findings, no substituted coverage.
- **VERDICT:** no review CLEAR, eng review required: 21 issues mapped to accepted amendments A-1..A-14, 0 unresolved decisions, 0 critical gaps; the amendments are applied when the tasks are implemented.

NO UNRESOLVED DECISIONS
