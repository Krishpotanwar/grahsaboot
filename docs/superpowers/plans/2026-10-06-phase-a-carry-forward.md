# Phase A carry-forward (apply to the B/C/D plans before those tasks run)

Phase A was built and reviewed task by task (commits 08d7bcf..11c706f), and its final whole-phase review was clean.

The changes below are what Phase A's code now does differently from the original B/C/D plan text, or problems its reviews found for later phases.

## Phase B
- `issueMessage` in `src/ui/copy.ts` needs `case 'too_small'` (sites under 1000 m², `LIMITS.site.minAreaKm2`). The switch has no default, so typecheck fails without it.
  - Suggested copy: "This outline is too small to see from orbit. Draw an area of at least about 1000 m²."
- The `out_of_range` copy must also cover outlines that cross the 180° line or have holes.
  - Suggested copy: "Check the coordinates: the outline must be one shape that does not cross the 180° line."
- The swapped-coordinates hint also fires for real Arctic points. Word it as a question ("Did you mean …?"), never an automatic correction.
- `src/styles.css` starts `@import 'tailwindcss' source('../src');`. The B6 `vite.config.ts` keeps the rolldown `onLog` filter for the expected @tailwindcss/vite SOURCEMAP_BROKEN notice. Both are already in the plan.
- `npm run e2e` reports "No tests found" until `tests/e2e` exists. B3 adds `E2E_BROWSERS` to `playwright.config.ts`.

## Phase C
- C4 `useEvidence`: when `summarizeAoi` rejects a stored outline (crossing ±180°, holes, too small), show an error state, never an endless "Searching".
- Cloud policy is `scl-v2`. Captions, the timeline and default picks use `clearFraction` (already in the plan).
- `src/workers/imagery-client.ts` now has these behaviours. The runner should surface `TimeoutError` as a retryable per-date error.
  - a 120 s per-request deadline;
  - `onerror` fails pending calls;
  - calls after `dispose()` reject at once;
  - the abort listener is removed when a request settles.
- The byte-cache key drops the URL query, so Planetary Computer SAS tokens never reach IndexedDB.

## Phase D
- Make the D2 trigger and `verify.toAoi` reject multi-ring polygons, matching the browser. Optionally add a server-side minimum area (0.001 km²).
- Tighten D6 `parseStacItem` `allowed()` to the exact Azure host `sentinel2l2a01.blob.core.windows.net`. The browser already uses it.
- The Supabase Edge deploy needs the `deno.json` import map for `geotiff` and `proj4` (already in D5). Verifying `pc:` items needs a server-side SAS token (already in D7 `signed()`).

## Environment
- `node_modules` in the shared folder is built for linux-arm64. Running the app on the Mac needs its own `npm ci`.
- WebKit cannot launch on the VM because of missing system libraries. Probes P1/P2 are PARTIAL until they are run in Safari on the Mac or in CI.
