# GrahSaboot Implementation Plan (index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship GrahSaboot v1, a black-first, god's-eye web app that turns a site outline or road line plus dates into dated, cloud-checked, server-verifiable Sentinel-2 evidence, at ₹0 cash.

**Architecture:**
- **Browser:** React 19 + Vite 8 + TypeScript SPA on a persistent MapLibre 6.12 globe. Web Workers read public Sentinel-2 COGs from AWS (geotiff 3.0.5 + proj4) through a shared, runtime-neutral evidence module (`src/evidence/`).
- **Cloudflare Worker:** serves the static app and a cached CelesTrak `/api/tle` route.
- **Supabase (Mumbai):** Google auth, Postgres + PostGIS + RLS, and one Deno Edge Function (`verify`) that re-reads every saved frame with the same evidence module and stores only manifests.

**Tech Stack:** react 19.3.0, vite 8.3.2, typescript 7.0.2 (fallback 6.0.3), tailwindcss 4.3.3, @base-ui/react 1.8.0, motion 14.0.0, @phosphor-icons/react 2.1.10, maplibre-gl 6.12.0, terra-draw 1.36.0 (+ maplibre adapter 1.4.1), geotiff 3.0.5, proj4 2.22.0, satellite.js 7.1.0, @supabase/supabase-js 2.117.2.
- Tests: vitest 5.0.3, @playwright/test 1.63.0, @electric-sql/pglite 0.5.8 + pglite-postgis 0.2.8.
- Tooling: deno 2.9.6 (npm), wrangler 4.147.0, supabase CLI 2.119.0.

**Spec:** `docs/superpowers/specs/2026-10-05-grahsaboot-design.md` (approved D13/D14). Research behind every choice: `docs/geoverify/research/2026-10-05-r3-*.md`.

## Phases (execute in order; each ends with working, tested software)

| Phase | File | Delivers | Human gate before it |
|---|---|---|---|
| A | `2026-10-05-grahsaboot-phase-a-foundation.md` | Toolchain, geo + evidence core (windows, SHA-256, cloud stats, reprojection, difference), fixtures, COG + STAC clients, imagery worker, probes P1/P2/P7 | none |
| B | `2026-10-05-grahsaboot-phase-b-shell.md` | Design system (black default + light), router/shell, persistent globe with tiers, place search, live satellites + next pass | none |
| C | `2026-10-05-grahsaboot-phase-c-workbench.md` | New-investigation flow, workbench (swipe/side-by-side/difference, timeline, road grid, notes, claim), report export, lite mode, a11y; first public preview deploy | **G1** Cloudflare account (before task C11 only) |
| D | `2026-10-05-grahsaboot-phase-d-backend.md` | Supabase schema/RLS/rules, `verify` function, Google sign-in, save + verify-all, privacy/consent, hardening, production launch | **G0** Supabase dev+prod (Mumbai) + Google OAuth client (needed from D4; D1–D3, D5, D6, D8–D10 run locally meanwhile) |

The product works anonymously and fully locally after Phase C (explore, investigate, export). Phase D adds accounts, saving and server verification.

## Execution rules for every task (controller and workers)

1. **Read the spec section the task cites** before coding. The spec wins over this plan if they disagree; report the conflict.
2. **TDD.** Write the failing test, watch it fail, implement, watch it pass. No skipping the red step.
3. **Library drift.** Versions are exact (`npm i -E`). If an API in this plan does not type-check against the installed `.d.ts`, read the package's types and adapt the call, keeping the task's public interface unchanged. Note it in the commit body.
4. **New dependencies** need Opus approval. Nothing outside the Tech Stack list plus: `@types/react`, `@types/react-dom`, `@types/node@22`, `@types/geojson@7946.0.16`, `prettier`, `tsx@4.23.15` (runs `.ts` scripts; this VM's Node has no TypeScript support), `@axe-core/playwright@4.13.0` (Phase B).
5. **Gate.** Each task ends with `npm run check` green. UI tasks also need `npm run e2e` green.
6. **Commit.** One commit per task: `feat(<area>): <what>` or `test|chore|docs(...)`, body optional, last line `Co-Authored-By: Claude <noreply@anthropic.com>`. **Never push.** Never commit `.env*` files with real values.
7. **Secrets** (Supabase keys, OAuth secrets) live only in `.env.local` (git-ignored) and in platform secret stores. Never in code, tests, logs or docs.
8. **Copy rules** (spec §2.2, §7.8): never output "constructed", "completed", "verified project", "fraud", "abandoned", "% complete" or confidence percentages. All user-visible strings live in `src/ui/copy.ts`.
9. Code style: TypeScript strict, no semicolons, single quotes, 2-space indent (Prettier config from Task A1). Files stay focused: one responsibility per file.

## Global Constraints (copied from the spec; every task includes these)

- Imagery: Sentinel-2 L2A from Earth Search `sentinel-2-l2a` (never `sentinel-2-c1-l2a` alone). Planetary Computer is the fallback. Assets `visual` (TCI) and `scl`. No paid imagery, no Sentinel Hub in v1.
- Evidence recipes: `frame-v1` (SHA-256 of raw `readRasters` bytes for an integer window), `scl-v2` (clear view = valid {4,5,6} + uncertain {2,7}; obstructed {1,3,8,9,10,11}; no data {0}; labels below), `display-v1` (shared EPSG:3857 grid), `diff-v1`.
- `scl-v2` labels (computed on the clear-view share):

  | Label | Rule |
  |---|---|
  | `NOT_COVERED` | no-data share ≥ 0.5, or the AOI is fully outside the scene |
  | `CLEAR` | clear view ≥ 0.95 |
  | `OBSCURED` | clear view ≤ 0.05 |
  | `PARTIAL` | anything between |

- Limits:
  - Site polygon: ≤ 200 vertices, ≤ 9 km², ≤ 4.25 km across.
  - Road: ≤ 200 vertices, 0.2–10 km long, width 5–200 m (default 30), 2 km sections.
  - Dates: 2017-01-01 to today (default last 24 months). ≤ 24 pinned dates.
  - Notes: ≤ 2000 chars each, ≤ 200 per investigation.
  - Accounts: 50 investigations per user; 600 verified frames per user per 24 h.
  - STAC: ≤ 10 pages of 100.
- Theme: `data-theme="dark"` is the default (black, zinc-950 `#09090B`); light is a persisted toggle; print is always white paper. Tokens are exactly those in spec §7.5.
- Fonts: Geist Variable + Geist Mono Variable only (no serif). Icons: Phosphor Bold, 20 px, with text labels.
- Radius 0 for data surfaces, 6 px for controls, 12 px for floating panels. Animate only transform/opacity; honour `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Accessibility: WCAG 2.2 AA. Swipe is a native range input. Side-by-side is the default under 600 px. Grids use `role="grid"` and arrow keys. Every map-only action has a keyboard/form alternative.
- Privacy: STAC queries use the AOI bbox snapped outward to 0.1°. Never send email/name to third parties. Audit logs hold IDs only.
- Licences: OSM/OpenFreeMap (ODbL attribution), NASA GIBS, Copernicus Sentinel ("Contains modified Copernicus Sentinel data [year]"), EOX **2016 only**, Nominatim (search on submit only, ≤ 1 req/s, no autocomplete).
- Runtime: Node ≥ 22.12 (VM has 22.22.1 built **without** TypeScript support, npm 9.2.0). Run `.ts` scripts with `npx tsx`. No Docker on the VM: DB tests use PGlite; Deno comes from `npx deno`.

## Review Focus (cross-phase; each line is pinned by a test in the owning task)

1. **Clouds, no-data and partial scenes** must never look like "no change" or render blank. Every gap carries a glyph + word (Tasks A5, C5, C6, C9).
2. **Swapped or odd coordinates.** "79.08, 21.14" for an Indian place, southern-hemisphere/antimeridian sites and a UTM zone boundary must produce a hint or the correct projection, never a silent wrong place (Tasks A2, A4, A6, B7).
3. **Slow or flaky networks and navigation mid-load** must cancel work, retry boundedly, show designed states and never hang a spinner (Tasks A9, A10, C4).
4. **Untrusted text** (notes, claims, names, search results) must be escaped in the UI, the exported HTML and the provenance, with length limits enforced in the browser and the DB (Tasks C7, C9, D2).
5. **Cross-user access.** One user must never read, verify into or delete another user's investigation, frames or notes, including through the `verify` function (Tasks D3, D6).

## Human gates

- **G1 (before C11):**
  1. Create a free Cloudflare account.
  2. Run `npx wrangler login` on this VM (browser approval).
  3. Approve `npx wrangler deploy` for the preview.
- **G0 (before D4, D7 and D11; the other Phase D tasks run locally while the user does this):**
  1. Create two free Supabase projects in region **South Asia (Mumbai)**: `grahsaboot-dev` and `grahsaboot-prod`.
  2. In Google Cloud, create an OAuth client (Web) with authorised redirect `https://<dev-ref>.supabase.co/auth/v1/callback` and the prod equivalent. Use only the scopes `openid`, `email` and `profile`.
  3. Fill `.env.local` from `.env.example` (never committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_REF`, `SUPABASE_DEV_DB_PASSWORD`, `SUPABASE_PROD_REF`, and a dev-only smoke user `DEV_TEST_EMAIL`/`DEV_TEST_PASSWORD`. `npm run env:check` must print `env ok`.
  4. Run `npx supabase login`. The step-by-step list is `docs/ops/accounts.md` (Task D0).
- **Launch (D11):** the user authorises each production command. An optional domain purchase and an IP India trademark search for "GrahSaboot" are recommended before spending.

## After the plan

The human assignment is in spec §15: six contacts and three 20-minute sessions after the first preview deploy (C11). Agents never contact anyone.
