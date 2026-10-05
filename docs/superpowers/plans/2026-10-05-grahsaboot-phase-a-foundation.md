# GrahSaboot Phase A: Foundation and Evidence Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested toolchain and a runtime-neutral evidence core that turns an outline plus a Sentinel-2 STAC item into a cloud-checked, hashed, display-aligned frame, plus the probes that prove it works on real data in real browsers.

**Architecture:** `src/evidence/` is pure TypeScript with no DOM imports and `.ts` import extensions, so the Supabase Deno function can reuse it unchanged in Phase D. `src/geo/` (validation) and `src/stac/` (catalogue) are browser-side. The imagery Web Worker wraps `src/evidence/` with geotiff I/O and an IndexedDB byte cache. Test fixtures are generated in code: a tiny tiled-TIFF writer plus a hermetic HTTP fixture server with Range support.

**Tech Stack:** TypeScript 7.0.2 (fallback 6.0.3), Vite 8.3.2, Vitest 5.0.3, geotiff 3.0.5, proj4 2.22.0, Playwright 1.63.0 (live probe only). Node 22.22.1 on this VM is a distro build **without TypeScript support** (`ERR_NO_TYPESCRIPT`), so `.ts` scripts run through `tsx` 4.23.15.

**Spec:** `docs/superpowers/specs/2026-10-05-grahsaboot-design.md`: §5 evidence pipeline, §6 roads, §10 limits, §14 probes P1, P2, P7. Plan index: `docs/superpowers/plans/2026-10-05-grahsaboot-plan.md` (execution rules apply).

## Global Constraints

- Exact versions only (`npm i -E`). Allowed extra dev deps in this phase: `@types/react`, `@types/react-dom`, `@types/node@22`, `prettier`, `tsx@4.23.15`, `@types/geojson@7946.0.16`.
- `src/evidence/**` must not import from `src/geo`, `src/stac`, `src/config`, React or any DOM API. Imports inside it use explicit `.ts` extensions.
- Recipes:

  | Recipe | Definition |
  |---|---|
  | `frame-v1` | SHA-256 hex of the raw `readRasters({ window, samples, interleave: true })` bytes |
  | `scl-v2` | clear view = valid {4,5,6} + uncertain {2,7}; obstructed {1,3,8,9,10,11}; no data {0} |

- Labels: `NOT_COVERED` if total = 0 or no-data ≥ 0.5; else `CLEAR` if clear view ≥ 0.95; `OBSCURED` if clear view ≤ 0.05; else `PARTIAL`. (scl-v2: older processing baselines put most clear construction ground in classes 2/7, so those count as clear view; the split stays visible in Details.)
- Limits:
  - Site: ≤ 200 vertices, ≤ 9 km², ≤ 4.25 km across.
  - Road: ≤ 200 vertices, 0.2–10 km, integer width 5–200 m (default 30), 2 km sections.
  - STAC: ≤ 10 pages.
- Privacy: STAC queries use the AOI bbox snapped outward to 0.1°.
- Earth Search collection `sentinel-2-l2a` only. Items carry `properties["proj:epsg"]` (number), `assets.visual`/`assets.scl` with `proj:transform` (GDAL order `[resX, 0, originX, 0, -resY, originY]`) and `proj:shape` (`[rows, cols]`). TCI no-data is `0`.
- Style: no semicolons, single quotes, 2 spaces, TypeScript strict.

## Review Focus

1. **Swapped coordinates.** "79.0882, 21.1458" parses as a valid Arctic point but must set `swappedHint` (test in A2).
2. **Southern hemisphere and zone edges.** UTM EPSG for lat < 0 must be 327xx with `+south`; round trips hold within 1e-7° (test in A3).
3. **AOI partly outside the scene.** The window is clamped, but the outside area counts as no-data so the stats are not inflated. ≥ 50 % outside gives `NOT_COVERED` (tests in A5 and A10).
4. **Flaky STAC.** A 503 then success retries; three failures fall back to Planetary Computer; an abort is never swallowed or retried (tests in A9).
5. **Cancelled downloads.** An aborted imagery request rejects with `AbortError` and never posts a stale result (tests in A10).

---

### Task A1: Repository scaffold and toolchain smoke (probe P7)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/styles.css`, `src/vite-env.d.ts`, `.prettierrc.json`, `.prettierignore`, `src/env.test.ts`, `docs/ops/probes.md`

**Interfaces:**
- Produces:
  - npm scripts `dev`, `build`, `preview`, `typecheck`, `test`, `check`, `fmt`.
  - Vitest test discovery: `src/**/*.test.ts`, `tests/unit/**/*.test.ts`, `tests/db/**/*.test.ts`, `worker/**/*.test.ts`.
  - Worker build format `es`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "grahsaboot",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "check": "npm run typecheck && npm run test && npm run build",
    "fmt": "prettier --write ."
  }
}
```

- [ ] **Step 2: Install the whole stack at exact versions**

```bash
npm i -E react@19.3.0 react-dom@19.3.0 maplibre-gl@6.12.0 terra-draw@1.36.0 terra-draw-maplibre-gl-adapter@1.4.1 geotiff@3.0.5 proj4@2.22.0 satellite.js@7.1.0 @base-ui/react@1.8.0 motion@14.0.0 @phosphor-icons/react@2.1.10 @fontsource-variable/geist@5.3.0 @fontsource-variable/geist-mono@5.3.0 @supabase/supabase-js@2.117.2
npm i -D -E typescript@7.0.2 vite@8.3.2 @vitejs/plugin-react@6.1.1 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 vitest@5.0.3 @playwright/test@1.63.0 @electric-sql/pglite@0.5.8 @electric-sql/pglite-postgis@0.2.8 deno@2.9.6 wrangler@4.147.0 supabase@2.119.0 @types/react@19.3.0 @types/react-dom @types/node@22 prettier@3.9.9 tsx@4.23.15 @types/geojson@7946.0.16
```

Expected: `added N packages`, no `ERR!`. If the `supabase` postinstall cannot download its binary, record it in `docs/ops/probes.md` and continue (it is needed only in Phase D).

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "scripts", "worker", "dev", "vite.config.ts", "playwright.config.ts"],
  "exclude": ["supabase/functions"]
}
```

- [ ] **Step 4: Write `vite.config.ts`, `src/vite-env.d.ts`, `index.html`, `src/main.tsx`, `src/styles.css`, `.prettierrc.json`, `.prettierignore`**

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    // @tailwindcss/vite emits CSS without a map; its one SOURCEMAP_BROKEN notice is expected noise.
    rolldownOptions: {
      onLog: (level, log, handler) =>
        log.code === 'SOURCEMAP_BROKEN' && log.plugin?.startsWith('@tailwindcss/vite')
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
```
If `/// <reference types="vitest/config" />` does not type the `test` key in Vitest 5, replace the import with `import { defineConfig } from 'vitest/config'`. That is a drift fix; note it in the commit.

`src/vite-env.d.ts` (Vite's client types already declare `*?worker&url` imports):
```ts
/// <reference types="vite/client" />
```

`index.html`:
```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark light" />
    <meta name="description" content="Compare dated Sentinel-2 satellite photos of any site or road. Free." />
    <title>GrahSaboot · Satellite proof for any place</title>
    <script>
      try {
        var t = localStorage.getItem('gs-theme')
        if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
      } catch (e) {}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>GrahSaboot</main>
  </StrictMode>,
)
```

`src/styles.css` (Tailwind scans only `src/`, never the docs or other untracked files):
```css
@import 'tailwindcss' source('../src');
```

`.prettierrc.json`:
```json
{ "semi": false, "singleQuote": true, "printWidth": 110, "trailingComma": "all" }
```

`.prettierignore`:
```
dist
node_modules
docs
.superpowers
output
supabase/.temp
*.tif
```

- [ ] **Step 5: Write the toolchain smoke test `src/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

describe('runtime prerequisites', () => {
  it('has WebCrypto SHA-256 (frame-v1 hashing depends on it)', async () => {
    const d = await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2, 3]))
    expect(new Uint8Array(d).length).toBe(32)
  })
  it('has structuredClone and AbortSignal.timeout (workers and fetch use them)', () => {
    expect(typeof structuredClone).toBe('function')
    expect(typeof AbortSignal.timeout).toBe('function')
  })
})
```

- [ ] **Step 6: Run the gate**

Run: `npm run check`
Expected: typecheck passes, `2 passed`, `vite build` writes `dist/`.

If `tsc` (TypeScript 7.0.2) fails for tooling reasons not caused by our code, run `npm i -D -E typescript@6.0.3` and re-run. This is probe P7's fallback.

- [ ] **Step 7: Record probe P7 in `docs/ops/probes.md`**

```markdown
# Probes (spec §14)

| # | Probe | Date | Result | Evidence / numbers | Decision |
|---|---|---|---|---|---|
| P7 | Toolchain: Vite 8 + React 19.3 + TS 7.0.2 + Tailwind 4.3 | 2026-10-0X | PASS / FALLBACK | `npm run check` output summary | keep TS 7 / use TS 6.0.3 |
| P1 | COG range reads in browsers | | pending | | |
| P2 | Hash determinism (3 browsers + Node + Deno) | | pending | | |
| P3 | Supabase Free + `verify` CPU/RSS | | pending | | |
| P4 | Google sign-in non-team user | | pending | | |
| P5 | Globe FPS at 4x CPU throttle | | pending | | |
| P6 | OpenFreeMap buildings + styles; EOX 2016 layer id | | pending | | |
| P8 | CelesTrak GROUP=resource; Nominatim policy | | pending | | |
```
Fill in the P7 row with the actual result.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src .prettierrc.json .prettierignore docs/ops/probes.md
git commit -m "chore: scaffold GrahSaboot toolchain (probe P7)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A2: Coordinate parsing with swap hint

**Files:**
- Create: `src/geo/coords.ts`, `src/geo/coords.test.ts`

**Interfaces:**
- Produces: `parseCoordinates(input: string): ParsedCoords | null` where `ParsedCoords = { lat: number; lon: number; swappedHint: boolean }`.

- [ ] **Step 1: Write the failing test `src/geo/coords.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { parseCoordinates } from './coords.ts'

describe('parseCoordinates', () => {
  it.each([
    ['21.1458, 79.0882', 21.1458, 79.0882],
    ['21.1458 79.0882', 21.1458, 79.0882],
    ['21.1458,79.0882', 21.1458, 79.0882],
    ['21.1458°N 79.0882°E', 21.1458, 79.0882],
    ['33.86 S, 151.21 E', -33.86, 151.21],
    ['-0.5, -78.5', -0.5, -78.5],
    ['https://www.google.com/maps/@21.1458,79.0882,15z', 21.1458, 79.0882],
    ['https://maps.google.com/?q=21.1458,79.0882', 21.1458, 79.0882],
  ])('parses %s', (input, lat, lon) => {
    expect(parseCoordinates(input)).toEqual({ lat, lon, swappedHint: false })
  })

  it('flags a probable lon/lat swap for India-shaped input', () => {
    expect(parseCoordinates('79.0882, 21.1458')).toEqual({ lat: 79.0882, lon: 21.1458, swappedHint: true })
  })

  it.each(['', 'Nagpur', '91, 0', '0, 181', 'https://maps.app.goo.gl/abc', '21.1, 79.0, 5'])('rejects %s', (input) => {
    expect(parseCoordinates(input)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/geo/coords.test.ts`
Expected: FAIL, `Failed to resolve import "./coords.ts"`.

- [ ] **Step 3: Implement `src/geo/coords.ts`**

```ts
export interface ParsedCoords {
  lat: number
  lon: number
  swappedHint: boolean
}

const NUM = String.raw`([-+]?\d+(?:\.\d+)?)`
const URL_PAIR = new RegExp(String.raw`[@=]${NUM},\s*${NUM}`)
const HEMI = new RegExp(String.raw`^${NUM}\s*°?\s*([NS])[\s,;]+${NUM}\s*°?\s*([EW])$`, 'i')
const PLAIN = new RegExp(String.raw`^${NUM}[\s,;]+${NUM}$`)

export function parseCoordinates(input: string): ParsedCoords | null {
  const s = input.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(URL_PAIR)
    return m ? make(Number(m[1]), Number(m[2])) : null
  }
  const h = s.match(HEMI)
  if (h) {
    const lat = Number(h[1]) * (/s/i.test(h[2]!) ? -1 : 1)
    const lon = Number(h[3]) * (/w/i.test(h[4]!) ? -1 : 1)
    return make(lat, lon)
  }
  const p = s.match(PLAIN)
  return p ? make(Number(p[1]), Number(p[2])) : null
}

function make(lat: number, lon: number): ParsedCoords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  // India-first hint: "79.08, 21.14" is a valid Arctic point but almost always a swapped Indian lon/lat.
  const swappedHint = lat >= 68 && lat <= 98 && lon >= 6 && lon <= 37
  return { lat, lon, swappedHint }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/geo/coords.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/geo
git commit -m "feat(geo): parse coordinates, map links and swapped lon/lat hint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A3: Projections, geodesy, sections and AOI validation

**Files:**
- Create: `src/evidence/types.ts`, `src/evidence/utm.ts`, `src/evidence/geodesy.ts`, `src/geo/limits.ts`, `src/geo/aoi.ts`
- Test: `src/evidence/utm.test.ts`, `src/evidence/geodesy.test.ts`, `src/geo/aoi.test.ts`

**Interfaces:**
- Produces (`src/evidence/types.ts`):
  ```ts
  export type LonLat = [number, number]
  export type XY = [number, number]
  export type Window = [number, number, number, number] // x0, y0, x1, y1 (end-exclusive) in one pyramid level
  export interface LevelInfo { level: number; width: number; height: number; originX: number; originY: number; resX: number; resY: number }
  export type AoiGeometry = { kind: 'site'; rings: LonLat[][] } | { kind: 'road'; line: LonLat[]; widthM: number }
  export interface AoiPart { idx: number; fromM: number; toM: number; geometry: AoiGeometry }
  export type QualityLabel = 'CLEAR' | 'PARTIAL' | 'OBSCURED' | 'NOT_COVERED'
  export interface QualityStats { policy: 'scl-v2'; counts: number[]; total: number; clearFraction: number; validFraction: number; uncertainFraction: number; obstructedFraction: number; nodataFraction: number; label: QualityLabel }
  export interface DisplayGrid { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; cornersLonLat: [LonLat, LonLat, LonLat, LonLat] }
  export const RECIPES: { frame: 'frame-v1'; scl: 'scl-v2'; display: 'display-v1'; diff: 'diff-v1' }
  ```
- `src/evidence/utm.ts`:
  - `utmEpsgFor(lon, lat): number`
  - `utmConverter(epsg): Converter`
  - `toUtm(epsg, p: LonLat): XY`, `fromUtm(epsg, p: XY): LonLat`
  - `toMercator(p: LonLat): XY`, `fromMercator(p: XY): LonLat`
- `src/evidence/geodesy.ts`:
  - `haversineM(a, b): number`, `lineLengthM(line): number`
  - `partsOf(aoi: AoiGeometry, stepM = 2000): AoiPart[]`
- `src/geo/limits.ts`: `LIMITS` (values in Global Constraints).
- `src/geo/aoi.ts`:
  - `type Bbox = [number, number, number, number]`
  - `type AoiInput = { kind: 'site'; geometry: { type: 'Polygon'; coordinates: LonLat[][] } } | { kind: 'road'; geometry: { type: 'LineString'; coordinates: LonLat[] }; widthM: number }`
  - `interface AoiSummary { kind; areaKm2: number; extentKm: number; lengthKm: number | null; bbox: Bbox; parts: AoiPart[] }`
  - `type IssueCode = 'not_closed' | 'too_few_points' | 'too_many_vertices' | 'self_intersects' | 'too_large' | 'too_wide' | 'too_short' | 'too_long' | 'bad_width' | 'out_of_range'`
  - `interface Issue { code: IssueCode; value?: number; limit?: number }`
  - `summarizeAoi(input): { ok: true; summary: AoiSummary } | { ok: false; issues: Issue[] }`
  - `toAoiGeometry(input): AoiGeometry`, `coarsenBbox(b, step = 0.1): Bbox`

- [ ] **Step 1: Write the failing tests**

`src/evidence/utm.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { fromMercator, fromUtm, toMercator, toUtm, utmConverter, utmEpsgFor } from './utm.ts'

describe('utm', () => {
  it('picks zones and hemispheres', () => {
    expect(utmEpsgFor(79.0882, 21.1458)).toBe(32644)
    expect(utmEpsgFor(151.21, -33.86)).toBe(32756)
    expect(utmEpsgFor(-179.9, 10)).toBe(32601)
    expect(utmEpsgFor(180, 0)).toBe(32660)
  })
  it('projects Nagpur into UTM 44N (reference values from proj4, 2026-10-05)', () => {
    const [x, y] = toUtm(32644, [79.0882, 21.1458])
    expect(x).toBeCloseTo(301475.049, 2)
    expect(y).toBeCloseTo(2339478.989, 2)
  })
  it('round-trips in both hemispheres', () => {
    for (const [epsg, p] of [[32644, [79.0882, 21.1458]], [32756, [151.21, -33.86]]] as const) {
      const back = fromUtm(epsg, toUtm(epsg, [p[0], p[1]]))
      expect(back[0]).toBeCloseTo(p[0], 7)
      expect(back[1]).toBeCloseTo(p[1], 7)
    }
  })
  it('projects to and from web mercator', () => {
    const [x, y] = toMercator([79.0882, 21.1458])
    expect(x).toBeCloseTo(8804058.152, 2)
    expect(y).toBeCloseTo(2409272.195, 2)
    const [lon, lat] = fromMercator([x, y])
    expect(lon).toBeCloseTo(79.0882, 9)
    expect(lat).toBeCloseTo(21.1458, 9)
  })
  it('rejects non-UTM EPSG codes', () => {
    expect(() => utmConverter(4326)).toThrow('UNSUPPORTED_EPSG:4326')
  })
})
```

`src/evidence/geodesy.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { haversineM, lineLengthM, partsOf } from './geodesy.ts'

describe('geodesy', () => {
  it('measures one degree of meridian', () => {
    expect(haversineM([0, 0], [0, 1])).toBeCloseTo(111195.08, 1)
  })
  it('splits a 5.56 km line into 2 km parts that join exactly', () => {
    const line: [number, number][] = [[0, 0], [0, 0.05]]
    expect(lineLengthM(line)).toBeCloseTo(5559.754, 2)
    const parts = partsOf({ kind: 'road', line, widthM: 30 })
    expect(parts.map((p) => [p.fromM, Math.round(p.toM)])).toEqual([[0, 2000], [2000, 4000], [4000, 5560]])
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1]!.geometry, cur = parts[i]!.geometry
      if (prev.kind !== 'road' || cur.kind !== 'road') throw new Error('expected road parts')
      expect(cur.line[0]).toEqual(prev.line[prev.line.length - 1])
    }
    const last = parts[2]!.geometry
    expect(last.kind === 'road' && last.line[last.line.length - 1]).toEqual([0, 0.05])
  })
  it('keeps a site as a single part', () => {
    const site = { kind: 'site' as const, rings: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0], [0, 0]] as [number, number][]] }
    expect(partsOf(site)).toEqual([{ idx: 0, fromM: 0, toM: 0, geometry: site }])
  })
})
```

`src/geo/aoi.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { coarsenBbox, summarizeAoi, type AoiInput } from './aoi.ts'
import type { LonLat } from '../evidence/types.ts'

const NAGPUR_SQUARE: LonLat[] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]
const ROAD: LonLat[] = [[79.07698, 21.138637], [79.095988, 21.157819]]
const site = (ring: LonLat[]): AoiInput => ({ kind: 'site', geometry: { type: 'Polygon', coordinates: [ring] } })
const road = (line: LonLat[], widthM = 30): AoiInput => ({ kind: 'road', geometry: { type: 'LineString', coordinates: line }, widthM })
const codes = (r: ReturnType<typeof summarizeAoi>) => (r.ok ? [] : r.issues.map((i) => i.code))

describe('summarizeAoi', () => {
  it('accepts the Nagpur square with exact measures', () => {
    const r = summarizeAoi(site(NAGPUR_SQUARE))
    if (!r.ok) throw new Error(JSON.stringify(r.issues))
    expect(r.summary.areaKm2).toBeCloseTo(1.15023, 4)
    expect(r.summary.extentKm).toBeCloseTo(1.52051, 4)
    expect(r.summary.bbox).toEqual([79.0832, 21.1408, 79.0932, 21.1508])
    expect(r.summary.parts).toHaveLength(1)
  })
  it('rejects open, tiny, self-intersecting and out-of-range polygons', () => {
    expect(codes(summarizeAoi(site(NAGPUR_SQUARE.slice(0, 4))))).toContain('not_closed')
    expect(codes(summarizeAoi(site([[79, 21], [79.01, 21], [79, 21]])))).toContain('too_few_points')
    const bowtie: LonLat[] = [[79, 21], [79.01, 21.01], [79.01, 21], [79, 21.01], [79, 21]]
    expect(codes(summarizeAoi(site(bowtie)))).toContain('self_intersects')
    expect(codes(summarizeAoi(site([[79, 95], [79.01, 95], [79.01, 95.01], [79, 95]])))).toContain('out_of_range')
  })
  it('rejects too large, too wide and too many vertices', () => {
    const big: LonLat[] = [[79, 21], [79.05, 21], [79.05, 21.05], [79, 21.05], [79, 21]]
    expect(codes(summarizeAoi(site(big)))).toEqual(expect.arrayContaining(['too_large', 'too_wide']))
    const circle: LonLat[] = Array.from({ length: 201 }, (_, i) => {
      const a = (i / 201) * 2 * Math.PI
      return [79.0882 + 0.002 * Math.cos(a), 21.1458 + 0.002 * Math.sin(a)] as LonLat
    })
    circle.push(circle[0]!)
    expect(codes(summarizeAoi(site(circle)))).toContain('too_many_vertices')
  })
  it('accepts the 2.9 km fixture road and splits it into two parts', () => {
    const r = summarizeAoi(road(ROAD))
    if (!r.ok) throw new Error(JSON.stringify(r.issues))
    expect(r.summary.lengthKm).toBeCloseTo(2.90436, 4)
    expect(r.summary.parts.map((p) => [p.fromM, Math.round(p.toM)])).toEqual([[0, 2000], [2000, 2904]])
    expect(r.summary.bbox[0]).toBeLessThan(79.07698)
  })
  it('rejects bad road lengths and widths', () => {
    expect(codes(summarizeAoi(road([[79, 21], [79, 21.0005]])))).toContain('too_short')
    expect(codes(summarizeAoi(road([[79, 21], [79, 21.11]])))).toContain('too_long')
    expect(codes(summarizeAoi(road(ROAD, 4)))).toContain('bad_width')
    expect(codes(summarizeAoi(road(ROAD, 30.5)))).toContain('bad_width')
  })
  it('accepts a southern-hemisphere site', () => {
    const syd: LonLat[] = [[151.2, -33.87], [151.21, -33.87], [151.21, -33.86], [151.2, -33.86], [151.2, -33.87]]
    const r = summarizeAoi(site(syd))
    expect(r.ok && r.summary.areaKm2).toBeGreaterThan(1)
  })
})

describe('coarsenBbox', () => {
  it('snaps outward to 0.1 degrees for privacy', () => {
    expect(coarsenBbox([79.0832, 21.1408, 79.0932, 21.1508])).toEqual([79, 21.1, 79.1, 21.2])
    expect(coarsenBbox([-0.05, -0.05, 0.05, 0.05])).toEqual([-0.1, -0.1, 0.1, 0.1])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/evidence src/geo/aoi.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/evidence/types.ts`**

```ts
export type LonLat = [number, number]
export type XY = [number, number]
/** x0, y0, x1, y1 in pixels of one pyramid level; x1/y1 exclusive. */
export type Window = [number, number, number, number]

export interface LevelInfo {
  level: number
  width: number
  height: number
  /** Top-left corner of pixel (0,0) in the scene CRS (metres). */
  originX: number
  originY: number
  /** Positive pixel sizes in metres. */
  resX: number
  resY: number
}

export type AoiGeometry = { kind: 'site'; rings: LonLat[][] } | { kind: 'road'; line: LonLat[]; widthM: number }

export interface AoiPart {
  idx: number
  fromM: number
  toM: number
  geometry: AoiGeometry
}

export type QualityLabel = 'CLEAR' | 'PARTIAL' | 'OBSCURED' | 'NOT_COVERED'

export interface QualityStats {
  policy: 'scl-v2'
  /** Sub-pixel counts per SCL class 0..11 (outside-scene area counted as class 0). */
  counts: number[]
  total: number
  /** Ground visible from above: validFraction + uncertainFraction. Labels and "clear view %" use this. */
  clearFraction: number
  validFraction: number
  uncertainFraction: number
  obstructedFraction: number
  nodataFraction: number
  label: QualityLabel
}

/** Shared EPSG:3857 output grid; corners are TL, TR, BR, BL in lon/lat. */
export interface DisplayGrid {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  cornersLonLat: [LonLat, LonLat, LonLat, LonLat]
}

export const RECIPES = { frame: 'frame-v1', scl: 'scl-v2', display: 'display-v1', diff: 'diff-v1' } as const
```

- [ ] **Step 4: Implement `src/evidence/utm.ts`**

```ts
import proj4 from 'proj4'
import type { Converter } from 'proj4'
import type { LonLat, XY } from './types.ts'

const cache = new Map<number, Converter>()

export function utmEpsgFor(lon: number, lat: number): number {
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1))
  return (lat < 0 ? 32700 : 32600) + zone
}

export function utmConverter(epsg: number): Converter {
  const hit = cache.get(epsg)
  if (hit) return hit
  const north = epsg >= 32601 && epsg <= 32660
  const south = epsg >= 32701 && epsg <= 32760
  if (!north && !south) throw new Error(`UNSUPPORTED_EPSG:${epsg}`)
  const def = `+proj=utm +zone=${epsg % 100}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`
  const conv = proj4('EPSG:4326', def)
  cache.set(epsg, conv)
  return conv
}

export const toUtm = (epsg: number, p: LonLat): XY => utmConverter(epsg).forward([p[0], p[1]]) as XY
export const fromUtm = (epsg: number, p: XY): LonLat => utmConverter(epsg).inverse([p[0], p[1]]) as LonLat

const R = 6378137
const MAX_LAT = 85.0511287798066

export function toMercator([lon, lat]: LonLat): XY {
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180
  return [(R * lon * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + phi / 2))]
}

export function fromMercator([x, y]: XY): LonLat {
  return [((x / R) * 180) / Math.PI, ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI]
}
```

- [ ] **Step 5: Implement `src/evidence/geodesy.ts`**

```ts
import type { AoiGeometry, AoiPart, LonLat } from './types.ts'

const EARTH_R = 6371008.8
const RAD = Math.PI / 180

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLon = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function lineLengthM(line: LonLat[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += haversineM(line[i - 1]!, line[i]!)
  return total
}

function lerp(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Site = one part. Road = consecutive sub-lines of `stepM` metres (last one shorter), sharing their cut points. */
export function partsOf(aoi: AoiGeometry, stepM = 2000): AoiPart[] {
  if (aoi.kind === 'site') return [{ idx: 0, fromM: 0, toM: 0, geometry: aoi }]
  const pts = aoi.line
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + haversineM(pts[i - 1]!, pts[i]!))
  const total = cum[cum.length - 1]!
  const pointAt = (d: number): LonLat => {
    let i = 1
    while (i < pts.length - 1 && cum[i]! < d) i++
    const seg = cum[i]! - cum[i - 1]!
    return seg > 0 ? lerp(pts[i - 1]!, pts[i]!, (d - cum[i - 1]!) / seg) : pts[i]!
  }
  const parts: AoiPart[] = []
  for (let from = 0, idx = 0; from < total - 1e-6; from += stepM, idx++) {
    const to = Math.min(total, from + stepM)
    const line: LonLat[] = [from === 0 ? pts[0]! : pointAt(from)]
    for (let i = 1; i < pts.length - 1; i++) if (cum[i]! > from && cum[i]! < to) line.push(pts[i]!)
    line.push(to === total ? pts[pts.length - 1]! : pointAt(to))
    parts.push({ idx, fromM: from, toM: to, geometry: { kind: 'road', line, widthM: aoi.widthM } })
  }
  return parts
}
```

- [ ] **Step 6: Implement `src/geo/limits.ts` and `src/geo/aoi.ts`**

`src/geo/limits.ts`:
```ts
export const LIMITS = {
  site: { maxAreaKm2: 9, maxExtentKm: 4.25, maxVertices: 200 },
  road: { minLengthKm: 0.2, maxLengthKm: 10, minWidthM: 5, maxWidthM: 200, defaultWidthM: 30, sectionM: 2000, maxVertices: 200 },
  dates: { earliest: '2017-01-01', defaultMonths: 24 },
  pinnedDates: 24,
  notes: { maxChars: 2000, maxPerInvestigation: 200 },
  investigationsPerUser: 50,
  verifiedFramesPerDay: 600,
  stacMaxPages: 10,
} as const
```

`src/geo/aoi.ts`:
```ts
import { LIMITS } from './limits.ts'
import { haversineM, lineLengthM, partsOf } from '../evidence/geodesy.ts'
import { toUtm, utmEpsgFor } from '../evidence/utm.ts'
import type { AoiGeometry, AoiPart, LonLat, XY } from '../evidence/types.ts'

export type Bbox = [number, number, number, number]
export type AoiInput =
  | { kind: 'site'; geometry: { type: 'Polygon'; coordinates: LonLat[][] } }
  | { kind: 'road'; geometry: { type: 'LineString'; coordinates: LonLat[] }; widthM: number }
export interface AoiSummary {
  kind: 'site' | 'road'
  areaKm2: number
  extentKm: number
  lengthKm: number | null
  bbox: Bbox
  parts: AoiPart[]
}
export type IssueCode =
  | 'not_closed' | 'too_few_points' | 'too_many_vertices' | 'self_intersects' | 'too_large'
  | 'too_wide' | 'too_short' | 'too_long' | 'bad_width' | 'out_of_range'
export interface Issue { code: IssueCode; value?: number; limit?: number }
export type AoiResult = { ok: true; summary: AoiSummary } | { ok: false; issues: Issue[] }

export function toAoiGeometry(input: AoiInput): AoiGeometry {
  return input.kind === 'site'
    ? { kind: 'site', rings: input.geometry.coordinates }
    : { kind: 'road', line: input.geometry.coordinates, widthM: input.widthM }
}

export function bboxOf(points: LonLat[]): Bbox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [x, y] of points) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y) }
  return [w, s, e, n]
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
export function coarsenBbox(b: Bbox, step = 0.1): Bbox {
  return [
    round6(Math.max(-180, Math.floor(round6(b[0] / step)) * step)),
    round6(Math.max(-90, Math.floor(round6(b[1] / step)) * step)),
    round6(Math.min(180, Math.ceil(round6(b[2] / step)) * step)),
    round6(Math.min(90, Math.ceil(round6(b[3] / step)) * step)),
  ]
}

const inRange = ([lon, lat]: LonLat) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90

function maxPairwiseKm(points: LonLat[]): number {
  let m = 0
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) m = Math.max(m, haversineM(points[i]!, points[j]!))
  return m / 1000
}

function cross(o: XY, a: XY, b: XY) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]) }
function onSeg(p: XY, q: XY, r: XY) { return Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]) }
function segmentsIntersect(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return (d1 === 0 && onSeg(p3, p1, p4)) || (d2 === 0 && onSeg(p3, p2, p4)) || (d3 === 0 && onSeg(p1, p3, p2)) || (d4 === 0 && onSeg(p1, p4, p2))
}

function selfIntersects(ring: XY[]): boolean {
  const n = ring.length - 1 // closed ring: n segments
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue // adjacent segments share a vertex
      if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!)) return true
    }
  }
  return false
}

function shoelaceKm2(ring: XY[]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1]
  return Math.abs(a / 2) / 1e6
}

export function summarizeAoi(input: AoiInput): AoiResult {
  const issues: Issue[] = []
  if (input.kind === 'site') {
    const ring = input.geometry.coordinates[0] ?? []
    const L = LIMITS.site
    if (!ring.every(inRange)) return { ok: false, issues: [{ code: 'out_of_range' }] }
    const first = ring[0], last = ring[ring.length - 1]
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) issues.push({ code: 'not_closed' })
    if (ring.length < 4) issues.push({ code: 'too_few_points', value: ring.length, limit: 4 })
    if (ring.length - 1 > L.maxVertices) issues.push({ code: 'too_many_vertices', value: ring.length - 1, limit: L.maxVertices })
    if (issues.length) return { ok: false, issues }
    const c = ring.reduce<LonLat>((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0])
    const epsg = utmEpsgFor(c[0], c[1])
    const utm = ring.map((p) => toUtm(epsg, p))
    if (selfIntersects(utm)) issues.push({ code: 'self_intersects' })
    const areaKm2 = shoelaceKm2(utm)
    const extentKm = maxPairwiseKm(ring)
    if (areaKm2 > L.maxAreaKm2) issues.push({ code: 'too_large', value: areaKm2, limit: L.maxAreaKm2 })
    if (extentKm > L.maxExtentKm) issues.push({ code: 'too_wide', value: extentKm, limit: L.maxExtentKm })
    if (issues.length) return { ok: false, issues }
    const geometry = toAoiGeometry(input)
    return { ok: true, summary: { kind: 'site', areaKm2, extentKm, lengthKm: null, bbox: bboxOf(ring), parts: partsOf(geometry) } }
  }
  const line = input.geometry.coordinates
  const L = LIMITS.road
  if (!line.every(inRange)) return { ok: false, issues: [{ code: 'out_of_range' }] }
  if (line.length < 2) issues.push({ code: 'too_few_points', value: line.length, limit: 2 })
  if (line.length > L.maxVertices) issues.push({ code: 'too_many_vertices', value: line.length, limit: L.maxVertices })
  if (!Number.isInteger(input.widthM) || input.widthM < L.minWidthM || input.widthM > L.maxWidthM) issues.push({ code: 'bad_width', value: input.widthM })
  const lengthKm = lineLengthM(line) / 1000
  if (lengthKm < L.minLengthKm) issues.push({ code: 'too_short', value: lengthKm, limit: L.minLengthKm })
  if (lengthKm > L.maxLengthKm) issues.push({ code: 'too_long', value: lengthKm, limit: L.maxLengthKm })
  if (issues.length) return { ok: false, issues }
  const [w, s, e, n] = bboxOf(line)
  const midLat = (s + n) / 2
  const dLat = input.widthM / 2 / 111320
  const dLon = dLat / Math.max(0.01, Math.cos((midLat * Math.PI) / 180))
  const geometry = toAoiGeometry(input)
  return {
    ok: true,
    summary: {
      kind: 'road',
      areaKm2: (lengthKm * input.widthM) / 1000,
      extentKm: maxPairwiseKm(line),
      lengthKm,
      bbox: [w - dLon, s - dLat, e + dLon, n + dLat],
      parts: partsOf(geometry, L.sectionM),
    },
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/evidence src/geo`
Expected: PASS (utm 5, geodesy 3, aoi 7, coords 15).

- [ ] **Step 8: Commit**

```bash
git add src/evidence src/geo
git commit -m "feat(geo): UTM/mercator projections, 2 km road parts, AOI validation and bbox coarsening

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A4: Frame windows and SHA-256 (`frame-v1`)

**Files:**
- Create: `src/evidence/frame.ts`
- Test: `src/evidence/frame.test.ts`

**Interfaces:**
- Consumes: `types.ts` and `utm.ts` from A3.
- Produces:
  - `levelFromTransform(transform: number[], shape: [number, number], level: number, width: number, height: number): LevelInfo`
  - `aoiPointsUtm(aoi: AoiGeometry, epsg: number): XY[]`
  - `aoiPixelWindow(points: XY[], lvl: LevelInfo, pad = 2): { clamped: Window; full: Window } | null`
  - `windowSize(w: Window): { width: number; height: number }`
  - `windowCovers(win: Window, points: XY[], lvl: LevelInfo, tol = 2): boolean`
  - `MAX_WINDOW_PX = 1100`
  - `sha256Hex(bytes: Uint8Array): Promise<string>`

- [ ] **Step 1: Write the failing test `src/evidence/frame.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { aoiPixelWindow, aoiPointsUtm, levelFromTransform, sha256Hex, windowCovers } from './frame.ts'
import type { XY } from './types.ts'

// UTM 44N ring of the Nagpur ±0.005° square (proj4 2.22.0, 2026-10-05)
const RING_UTM: XY[] = [[300949.012, 2338931.647], [301987.753, 2338919.142], [302001.051, 2340026.345], [300962.38, 2340038.855], [300949.012, 2338931.647]]
const REAL = [10, 0, 199980, 0, -10, 2400000]
const FIXTURE = [10, 0, 300000, 0, -10, 2341000]

describe('levelFromTransform', () => {
  it('reads GDAL-order transforms and scales overviews', () => {
    expect(levelFromTransform(REAL, [10980, 10980], 0, 10980, 10980)).toEqual({ level: 0, width: 10980, height: 10980, originX: 199980, originY: 2400000, resX: 10, resY: 10 })
    expect(levelFromTransform(REAL, [10980, 10980], 1, 5490, 5490).resX).toBe(20)
  })
})

describe('aoiPixelWindow', () => {
  it('matches the real tile 44QKJ at 10 m and 20 m', () => {
    expect(aoiPixelWindow(RING_UTM, levelFromTransform(REAL, [10980, 10980], 0, 10980, 10980))?.clamped).toEqual([10094, 5994, 10205, 6111])
    expect(aoiPixelWindow(RING_UTM, levelFromTransform(REAL, [10980, 10980], 1, 5490, 5490))?.clamped).toEqual([5046, 2996, 5104, 3057])
  })
  it('matches the fixture scene', () => {
    expect(aoiPixelWindow(RING_UTM, levelFromTransform(FIXTURE, [256, 256], 0, 256, 256))?.clamped).toEqual([92, 94, 203, 211])
  })
  it('clamps partial overlap and returns null when fully outside', () => {
    const lvl = levelFromTransform(FIXTURE, [256, 256], 0, 256, 256)
    const shifted: XY[] = RING_UTM.map(([x, y]) => [x + 1500, y])
    const w = aoiPixelWindow(shifted, lvl)!
    expect(w.clamped[2]).toBe(256)
    expect(w.full[2]).toBeGreaterThan(256)
    expect(aoiPixelWindow(RING_UTM.map(([x, y]) => [x + 9000, y] as XY), lvl)).toBeNull()
  })
})

describe('windowCovers', () => {
  const lvl = levelFromTransform(FIXTURE, [256, 256], 0, 256, 256)
  it('accepts the exact window and rejects shifted or oversized ones', () => {
    expect(windowCovers([92, 94, 203, 211], RING_UTM, lvl)).toBe(true)
    expect(windowCovers([97, 94, 208, 211], RING_UTM, lvl)).toBe(false)
    expect(windowCovers([92, 94, 300, 211], RING_UTM, lvl)).toBe(false)
  })
})

describe('aoiPointsUtm', () => {
  it('expands road vertices by half the width', () => {
    const pts = aoiPointsUtm({ kind: 'road', line: [[79.0882, 21.1458], [79.09, 21.15]], widthM: 30 }, 32644)
    const xs = pts.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30)
    expect(pts).toHaveLength(8)
  })
})

describe('sha256Hex', () => {
  it('matches reference vectors', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex(Uint8Array.from({ length: 256 }, (_, i) => i))).toBe('40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/evidence/frame.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/evidence/frame.ts`**

```ts
import { toUtm } from './utm.ts'
import type { AoiGeometry, LevelInfo, Window, XY } from './types.ts'

export const MAX_WINDOW_PX = 1100

/** `transform` is a STAC proj:transform in GDAL order [resX, 0, originX, 0, -resY, originY]; `shape` is [rows, cols] of level 0. */
export function levelFromTransform(transform: number[], shape: [number, number], level: number, width: number, height: number): LevelInfo {
  const [a, , c, , e, f] = transform
  if (a === undefined || c === undefined || e === undefined || f === undefined || a <= 0 || e >= 0) throw new Error('BAD_TRANSFORM')
  return { level, width, height, originX: c, originY: f, resX: a * (shape[1] / width), resY: -e * (shape[0] / height) }
}

export function aoiPointsUtm(aoi: AoiGeometry, epsg: number): XY[] {
  if (aoi.kind === 'site') return aoi.rings.flat().map((p) => toUtm(epsg, p))
  const hw = aoi.widthM / 2
  return aoi.line.flatMap((p) => {
    const [x, y] = toUtm(epsg, p)
    return [[x - hw, y - hw], [x + hw, y - hw], [x + hw, y + hw], [x - hw, y + hw]] as XY[]
  })
}

export function aoiPixelWindow(points: XY[], lvl: LevelInfo, pad = 2): { clamped: Window; full: Window } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const full: Window = [
    Math.floor((minX - lvl.originX) / lvl.resX) - pad,
    Math.floor((lvl.originY - maxY) / lvl.resY) - pad,
    Math.ceil((maxX - lvl.originX) / lvl.resX) + pad,
    Math.ceil((lvl.originY - minY) / lvl.resY) + pad,
  ]
  const clamped: Window = [Math.max(0, full[0]), Math.max(0, full[1]), Math.min(lvl.width, full[2]), Math.min(lvl.height, full[3])]
  if (clamped[2] <= clamped[0] || clamped[3] <= clamped[1]) return null
  return { clamped, full }
}

export function windowSize(w: Window): { width: number; height: number } {
  return { width: w[2] - w[0], height: w[3] - w[1] }
}

/** Server-side check of a client-declared window: inside the level, not oversized, and covering the AOI within `tol` px. */
export function windowCovers(win: Window, points: XY[], lvl: LevelInfo, tol = 2): boolean {
  const need = aoiPixelWindow(points, lvl, 0)
  if (!need) return false
  const n = need.clamped
  const { width, height } = windowSize(win)
  return (
    win[0] >= 0 && win[1] >= 0 && win[2] <= lvl.width && win[3] <= lvl.height &&
    width > 0 && height > 0 && width <= MAX_WINDOW_PX && height <= MAX_WINDOW_PX &&
    win[0] <= n[0] + tol && win[1] <= n[1] + tol && win[2] >= n[2] - tol && win[3] >= n[3] - tol &&
    win[0] >= n[0] - 10 && win[1] >= n[1] - 10 && win[2] <= n[2] + 10 && win[3] <= n[3] + 10
  )
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/evidence/frame.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/evidence/frame.ts src/evidence/frame.test.ts
git commit -m "feat(evidence): frame-v1 pixel windows, coverage check and SHA-256

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A5: AOI rasterisation and cloud-check statistics (`scl-v2`)

**Files:**
- Create: `src/evidence/mask.ts`, `src/evidence/scl.ts`
- Test: `src/evidence/mask.test.ts`, `src/evidence/scl.test.ts`

**Interfaces:**
- Consumes: A3 types/utm, A4 `levelFromTransform`.
- Produces:
  - `rasterizeAoi(aoi: AoiGeometry, epsg: number, win: Window, lvl: LevelInfo, sub = 1): Uint8Array`: 1 = sub-cell centre inside. Sites use even-odd scanline fill; roads use distance ≤ width/2 with flat end caps.
  - `countMask(mask: Uint8Array): number`
  - `sclStats(classes: Uint8Array, winW: number, winH: number, mask: Uint8Array, sub: number, outsideCount = 0): QualityStats`
  - `labelFor(clear: number, nodata: number, total: number): QualityLabel`
  - `isClearClass(c: number): boolean` (true for 2, 4, 5, 6, 7: ground the eye can see)

- [ ] **Step 1: Write the failing tests**

`src/evidence/mask.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { countMask, rasterizeAoi } from './mask.ts'
import { levelFromTransform } from './frame.ts'
import type { LonLat } from './types.ts'

const LVL10 = levelFromTransform([10, 0, 300000, 0, -10, 2341000], [256, 256], 0, 256, 256)
const SQUARE: LonLat[] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]

describe('rasterizeAoi', () => {
  it('fills the Nagpur square with area within 1 %', () => {
    const mask = rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 1)
    const km2 = (countMask(mask) * 100) / 1e6
    expect(km2).toBeGreaterThan(1.15023 * 0.99)
    expect(km2).toBeLessThan(1.15023 * 1.01)
  })
  it('leaves holes empty (even-odd)', () => {
    const hole: LonLat[] = [[79.0857, 21.1433], [79.0907, 21.1433], [79.0907, 21.1483], [79.0857, 21.1483], [79.0857, 21.1433]]
    const solid = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10))
    const holed = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE, hole] }, 32644, [0, 0, 256, 256], LVL10))
    expect(solid - holed).toBeGreaterThan(2500)
  })
  it('fills a 1 km x 30 m corridor with flat caps', () => {
    // straight east-west line in UTM 44N, 1 km long, inside the fixture extent
    const line: LonLat[] = [[79.0800, 21.1450], [79.08965, 21.1450]]
    const n = countMask(rasterizeAoi({ kind: 'road', line, widthM: 30 }, 32644, [0, 0, 256, 256], LVL10, 2))
    expect(n * 25).toBeGreaterThan(1000 * 30 * 0.93) // sub=2 → 5 m cells → 25 m² each
    expect(n * 25).toBeLessThan(1000 * 30 * 1.07)
  })
  it('respects sub-sampling (4x cells at sub=2)', () => {
    const a = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 1))
    const b = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 2))
    expect(b / a).toBeGreaterThan(3.9)
    expect(b / a).toBeLessThan(4.1)
  })
})
```

`src/evidence/scl.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isClearClass, labelFor, sclStats } from './scl.ts'

const grid = (w: number, h: number, f: (x: number, y: number) => number) =>
  Uint8Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)))
const all = (w: number, h: number, sub: number) => new Uint8Array(w * sub * h * sub).fill(1)

describe('labelFor', () => {
  it.each([
    [0.95, 0, 10, 'CLEAR'],
    [0.9499, 0, 10, 'PARTIAL'],
    [0.05, 0, 10, 'OBSCURED'],
    [0.5, 0.5, 10, 'NOT_COVERED'],
    [1, 0, 0, 'NOT_COVERED'],
  ] as const)('clear=%s nodata=%s total=%s → %s', (c, n, t, label) => {
    expect(labelFor(c, n, t)).toBe(label)
  })
})

describe('isClearClass', () => {
  it('is true for ground the eye can see: 2, 4, 5, 6, 7', () => {
    expect([...Array(12).keys()].filter(isClearClass)).toEqual([2, 4, 5, 6, 7])
  })
})

describe('sclStats', () => {
  it('counts classes per sub-cell and labels a clear scene', () => {
    const s = sclStats(grid(4, 4, () => 5), 4, 4, all(4, 4, 2), 2)
    expect(s.total).toBe(64)
    expect(s.counts[5]).toBe(64)
    expect(s.clearFraction).toBe(1)
    expect(s.label).toBe('CLEAR')
    expect(s.policy).toBe('scl-v2')
  })
  it('splits half cloud into PARTIAL', () => {
    const s = sclStats(grid(10, 4, (x) => (x >= 5 ? 9 : 4)), 10, 4, all(10, 4, 1), 1)
    expect(s.clearFraction).toBeCloseTo(0.5, 6)
    expect(s.obstructedFraction).toBeCloseTo(0.5, 6)
    expect(s.label).toBe('PARTIAL')
  })
  it('counts unclassified and dark ground as clear view (older baselines label clear construction ground 7)', () => {
    // Real case: Navi Mumbai, 22 Feb 2018, baseline 00.01 — 63% class 7 and 14% class 2 on a cloud-free photo.
    const s = sclStats(grid(4, 4, (x) => (x === 0 ? 2 : 7)), 4, 4, all(4, 4, 1), 1)
    expect(s.validFraction).toBe(0)
    expect(s.uncertainFraction).toBe(1)
    expect(s.clearFraction).toBe(1)
    expect(s.label).toBe('CLEAR')
  })
  it('treats cloud shadow and cirrus as obstruction', () => {
    const s = sclStats(grid(4, 4, (x) => (x < 2 ? 3 : 10)), 4, 4, all(4, 4, 1), 1)
    expect(s.obstructedFraction).toBe(1)
    expect(s.label).toBe('OBSCURED')
  })
  it('counts the outside-scene area as no-data', () => {
    const s = sclStats(grid(4, 4, (x) => (x === 0 ? 7 : 4)), 4, 4, all(4, 4, 1), 1, 16)
    expect(s.uncertainFraction).toBeCloseTo(4 / 32, 6)
    expect(s.clearFraction).toBeCloseTo(0.5, 6)
    expect(s.nodataFraction).toBeCloseTo(0.5, 6)
    expect(s.label).toBe('NOT_COVERED')
  })
  it('ignores cells outside the mask', () => {
    const mask = new Uint8Array(16)
    mask[0] = 1
    expect(sclStats(grid(4, 4, () => 9), 4, 4, mask, 1).total).toBe(1)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/evidence/mask.test.ts src/evidence/scl.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/evidence/mask.ts`**

```ts
import { toUtm } from './utm.ts'
import type { AoiGeometry, LevelInfo, Window, XY } from './types.ts'

/**
 * Rasterise an AOI onto `sub`×`sub` cells per pixel of `win` (pixel-centre rule).
 * Sites: even-odd scanline fill (holes respected). Roads: distance to the centreline ≤ width/2, flat end caps.
 * Works for windows that extend outside the scene (pure geometry).
 */
export function rasterizeAoi(aoi: AoiGeometry, epsg: number, win: Window, lvl: LevelInfo, sub = 1): Uint8Array {
  const w = (win[2] - win[0]) * sub
  const h = (win[3] - win[1]) * sub
  const mask = new Uint8Array(Math.max(0, w * h))
  const cellX = lvl.resX / sub
  const cellY = lvl.resY / sub
  const x0 = lvl.originX + win[0] * lvl.resX
  const y0 = lvl.originY - win[1] * lvl.resY
  if (aoi.kind === 'site') {
    fillEvenOdd(mask, w, h, x0, y0, cellX, cellY, aoi.rings.map((r) => r.map((p) => toUtm(epsg, p))))
  } else {
    fillCorridor(mask, w, h, x0, y0, cellX, cellY, aoi.line.map((p) => toUtm(epsg, p)), aoi.widthM / 2)
  }
  return mask
}

export function countMask(mask: Uint8Array): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]!
  return n
}

function fillEvenOdd(mask: Uint8Array, w: number, h: number, x0: number, y0: number, cellX: number, cellY: number, rings: XY[][]) {
  const xs: number[] = []
  for (let r = 0; r < h; r++) {
    const cy = y0 - (r + 0.5) * cellY
    xs.length = 0
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!
        const [xj, yj] = ring[j]!
        if (yi > cy !== yj > cy) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cStart = Math.max(0, Math.ceil((xs[k]! - x0) / cellX - 0.5))
      const cEnd = Math.min(w - 1, Math.ceil((xs[k + 1]! - x0) / cellX - 0.5) - 1)
      for (let c = cStart; c <= cEnd; c++) mask[r * w + c] = 1
    }
  }
}

function fillCorridor(mask: Uint8Array, w: number, h: number, x0: number, y0: number, cellX: number, cellY: number, line: XY[], hw: number) {
  const last = line.length - 2
  for (let s = 0; s <= last; s++) {
    const [ax, ay] = line[s]!
    const [bx, by] = line[s + 1]!
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - x0) / cellX))
    const c1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + hw - x0) / cellX))
    const r0 = Math.max(0, Math.floor((y0 - Math.max(ay, by) - hw) / cellY))
    const r1 = Math.min(h - 1, Math.ceil((y0 - Math.min(ay, by) + hw) / cellY))
    for (let r = r0; r <= r1; r++) {
      const py = y0 - (r + 0.5) * cellY
      for (let c = c0; c <= c1; c++) {
        const idx = r * w + c
        if (mask[idx]) continue
        const px = x0 + (c + 0.5) * cellX
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
        if ((s === 0 && t < 0) || (s === last && t > 1)) continue // flat caps at both ends of the line
        t = t < 0 ? 0 : t > 1 ? 1 : t // round joins between segments
        const ex = ax + t * dx - px
        const ey = ay + t * dy - py
        if (ex * ex + ey * ey <= hw * hw) mask[idx] = 1
      }
    }
  }
}
```

- [ ] **Step 4: Implement `src/evidence/scl.ts`**

```ts
import type { QualityLabel, QualityStats } from './types.ts'

const VALID = [4, 5, 6]
/** 2 dark area / topographic shadow, 7 unclassified: visible ground the classifier could not name. Older processing
 * baselines (Earth Search 2017–21) put most clear, bright construction ground here, so it counts as clear view. */
const UNCERTAIN = [2, 7]
const OBSTRUCTED = [1, 3, 8, 9, 10, 11]

export const isClearClass = (c: number) => c === 2 || (c >= 4 && c <= 7)

export function labelFor(clear: number, nodata: number, total: number): QualityLabel {
  if (total === 0 || nodata >= 0.5) return 'NOT_COVERED'
  if (clear >= 0.95) return 'CLEAR'
  if (clear <= 0.05) return 'OBSCURED'
  return 'PARTIAL'
}

/** `classes` is the SCL window (winW×winH); `mask` is rasterizeAoi(..., sub) for the same window. */
export function sclStats(classes: Uint8Array, winW: number, winH: number, mask: Uint8Array, sub: number, outsideCount = 0): QualityStats {
  const counts = new Array<number>(12).fill(0)
  const mw = winW * sub
  for (let r = 0; r < winH * sub; r++) {
    const rowBase = Math.floor(r / sub) * winW
    for (let c = 0; c < mw; c++) {
      if (!mask[r * mw + c]) continue
      const cls = classes[rowBase + Math.floor(c / sub)]!
      counts[cls < 12 ? cls : 0] += 1
    }
  }
  counts[0] += outsideCount
  const total = counts.reduce((a, b) => a + b, 0)
  const frac = (ids: number[]) => (total ? ids.reduce((a, i) => a + counts[i]!, 0) / total : 0)
  const validFraction = frac(VALID)
  const uncertainFraction = frac(UNCERTAIN)
  const clearFraction = validFraction + uncertainFraction
  const nodataFraction = frac([0])
  return {
    policy: 'scl-v2',
    counts,
    total,
    clearFraction,
    validFraction,
    uncertainFraction,
    obstructedFraction: frac(OBSTRUCTED),
    nodataFraction,
    label: labelFor(clearFraction, nodataFraction, total),
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/evidence`
Expected: PASS (mask 4, scl 9, plus earlier evidence tests).

- [ ] **Step 6: Commit**

```bash
git add src/evidence/mask.ts src/evidence/scl.ts src/evidence/mask.test.ts src/evidence/scl.test.ts
git commit -m "feat(evidence): scanline/corridor rasteriser and scl-v2 cloud-check stats

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A6: Display grid reprojection and brightness difference

**Files:**
- Create: `src/evidence/display.ts`, `src/evidence/diff.ts`, `src/evidence/index.ts`
- Test: `src/evidence/display.test.ts`, `src/evidence/diff.test.ts`

**Interfaces:**
- Consumes: A3 `utm.ts`, A4 `levelFromTransform`.
- Produces:
  - `makeDisplayGrid(bbox: [number, number, number, number], maxSide: number, padFrac = 0.1): DisplayGrid`
  - `interface SourceRaster { data: Uint8Array; width: number; height: number; samples: 1 | 3; win: Window; lvl: LevelInfo; epsg: number; nodataZero: boolean }`
  - `sourceCoordMapper(grid: DisplayGrid, src: Pick<SourceRaster, 'win' | 'lvl' | 'epsg'>): (x: number, y: number) => [number, number]` (mesh-interpolated, 16 px cells)
  - `reprojectToGrid(src: SourceRaster, grid: DisplayGrid, mode: 'bilinear' | 'nearest'): Uint8ClampedArray` (RGBA; samples=1 writes the class code into R, G and B)
  - `brightnessDiff(a, b, invalid?: Uint8Array, rgb = [228, 132, 68]): Uint8ClampedArray`
  - `src/evidence/index.ts` re-exports every evidence module.

- [ ] **Step 1: Write the failing tests**

`src/evidence/display.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { makeDisplayGrid, reprojectToGrid, sourceCoordMapper } from './display.ts'
import { levelFromTransform } from './frame.ts'
import { fromMercator, toUtm } from './utm.ts'

const BBOX: [number, number, number, number] = [79.0832, 21.1408, 79.0932, 21.1508]
const LVL = levelFromTransform([10, 0, 300000, 0, -10, 2341000], [256, 256], 0, 256, 256)
const WIN: [number, number, number, number] = [92, 94, 203, 211]
const W = WIN[2] - WIN[0], H = WIN[3] - WIN[1]

function exact(grid: ReturnType<typeof makeDisplayGrid>, x: number, y: number): [number, number] {
  const sx = (grid.maxX - grid.minX) / grid.width
  const lonlat = fromMercator([grid.minX + x * sx, grid.maxY - y * sx])
  const [ux, uy] = toUtm(32644, lonlat)
  return [(ux - LVL.originX) / LVL.resX - WIN[0], (LVL.originY - uy) / LVL.resY - WIN[1]]
}

describe('makeDisplayGrid', () => {
  it('builds square pixels with the longest side = maxSide and padded corners', () => {
    const g = makeDisplayGrid(BBOX, 512)
    expect(Math.max(g.width, g.height)).toBe(512)
    expect((g.maxX - g.minX) / g.width).toBeCloseTo((g.maxY - g.minY) / g.height, 6)
    expect(g.cornersLonLat[0][0]).toBeLessThan(BBOX[0])
    expect(g.cornersLonLat[2][1]).toBeLessThan(BBOX[1])
  })
})

describe('sourceCoordMapper', () => {
  it('stays within 0.05 px of exact proj4 everywhere', () => {
    const g = makeDisplayGrid(BBOX, 512)
    const map = sourceCoordMapper(g, { win: WIN, lvl: LVL, epsg: 32644 })
    for (const [x, y] of [[0.5, 0.5], [255.5, 300.5], [511.5, 20.5], [100.5, 470.5], [333.5, 333.5]] as const) {
      const [ex, ey] = exact(g, x, y)
      const [mx, my] = map(x, y)
      expect(Math.abs(mx - ex)).toBeLessThan(0.05)
      expect(Math.abs(my - ey)).toBeLessThan(0.05)
    }
  })
})

describe('reprojectToGrid', () => {
  const rgb = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set([x % 256, y % 256, 77], (y * W + x) * 3)

  it('samples the expected source pixel at the grid centre (bilinear)', () => {
    const g = makeDisplayGrid(BBOX, 256)
    const out = reprojectToGrid({ data: rgb, width: W, height: H, samples: 3, win: WIN, lvl: LVL, epsg: 32644, nodataZero: true }, g, 'bilinear')
    const cx = Math.floor(g.width / 2), cy = Math.floor(g.height / 2)
    const [sx, sy] = exact(g, cx + 0.5, cy + 0.5)
    const o = (cy * g.width + cx) * 4
    expect(Math.abs(out[o]! - (sx - 0.5))).toBeLessThanOrEqual(1)
    expect(Math.abs(out[o + 1]! - (sy - 0.5))).toBeLessThanOrEqual(1)
    expect(out[o + 3]).toBe(255)
  })
  it('keeps class codes exact in nearest mode and marks outside pixels transparent', () => {
    const cls = Uint8Array.from({ length: W * H }, (_, i) => ((i % W) < W / 2 ? 4 : 9))
    const g = makeDisplayGrid([79.07, 21.13, 79.11, 21.17], 128)
    const out = reprojectToGrid({ data: cls, width: W, height: H, samples: 1, win: WIN, lvl: LVL, epsg: 32644, nodataZero: false }, g, 'nearest')
    const seen = new Set<number>()
    let transparent = 0
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) transparent++
      else seen.add(out[i]!)
    }
    expect([...seen].sort()).toEqual([4, 9])
    expect(transparent).toBeGreaterThan(0)
  })
  it('makes TCI no-data (0,0,0) transparent', () => {
    const g = makeDisplayGrid(BBOX, 64)
    const out = reprojectToGrid({ data: new Uint8Array(W * H * 3), width: W, height: H, samples: 3, win: WIN, lvl: LVL, epsg: 32644, nodataZero: true }, g, 'bilinear')
    expect(out.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true)
  })
})
```

`src/evidence/diff.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { brightnessDiff } from './diff.ts'

const px = (...v: number[]) => Uint8ClampedArray.from(v)

describe('brightnessDiff', () => {
  it('is transparent for identical frames', () => {
    const a = px(10, 20, 30, 255, 200, 200, 200, 255)
    expect([...brightnessDiff(a, a)].filter((_, i) => i % 4 === 3)).toEqual([0, 0])
  })
  it('is opaque accent for black vs white', () => {
    const out = brightnessDiff(px(0, 0, 0, 255), px(255, 255, 255, 255))
    expect([...out]).toEqual([228, 132, 68, 255])
  })
  it('masks invalid pixels and transparent inputs', () => {
    const a = px(0, 0, 0, 255, 0, 0, 0, 0)
    const b = px(255, 255, 255, 255, 255, 255, 255, 255)
    expect(brightnessDiff(a, b, Uint8Array.from([1, 0]))[3]).toBe(0)
    expect(brightnessDiff(a, b)[7]).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/evidence/display.test.ts src/evidence/diff.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/evidence/display.ts`**

```ts
import { fromMercator, toMercator, utmConverter } from './utm.ts'
import type { DisplayGrid, LevelInfo, Window } from './types.ts'

export function makeDisplayGrid(bbox: [number, number, number, number], maxSide: number, padFrac = 0.1): DisplayGrid {
  const [x0, y0] = toMercator([bbox[0], bbox[1]])
  const [x1, y1] = toMercator([bbox[2], bbox[3]])
  const padX = (x1 - x0) * padFrac
  const padY = (y1 - y0) * padFrac
  const spanX = x1 - x0 + 2 * padX
  const spanY = y1 - y0 + 2 * padY
  const scale = Math.max(spanX, spanY) / maxSide
  const width = Math.max(1, Math.round(spanX / scale))
  const height = Math.max(1, Math.round(spanY / scale))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const minX = cx - (width * scale) / 2, maxX = cx + (width * scale) / 2
  const minY = cy - (height * scale) / 2, maxY = cy + (height * scale) / 2
  return {
    minX, minY, maxX, maxY, width, height,
    cornersLonLat: [fromMercator([minX, maxY]), fromMercator([maxX, maxY]), fromMercator([maxX, minY]), fromMercator([minX, minY])],
  }
}

export interface SourceRaster {
  data: Uint8Array
  width: number
  height: number
  samples: 1 | 3
  win: Window
  lvl: LevelInfo
  epsg: number
  nodataZero: boolean
}

const MESH = 16

/** Maps an output position (pixel units, centres at k+0.5) to continuous source-window coordinates. Exact at 16 px mesh nodes, bilinear between. */
export function sourceCoordMapper(grid: DisplayGrid, src: Pick<SourceRaster, 'win' | 'lvl' | 'epsg'>): (x: number, y: number) => [number, number] {
  const conv = utmConverter(src.epsg)
  const sx = (grid.maxX - grid.minX) / grid.width
  const sy = (grid.maxY - grid.minY) / grid.height
  const mw = Math.ceil(grid.width / MESH) + 1
  const mh = Math.ceil(grid.height / MESH) + 1
  const mx = new Float64Array(mw * mh)
  const my = new Float64Array(mw * mh)
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const lonlat = fromMercator([grid.minX + i * MESH * sx, grid.maxY - j * MESH * sy])
      const [ux, uy] = conv.forward([lonlat[0], lonlat[1]]) as [number, number]
      mx[j * mw + i] = (ux - src.lvl.originX) / src.lvl.resX - src.win[0]
      my[j * mw + i] = (src.lvl.originY - uy) / src.lvl.resY - src.win[1]
    }
  }
  return (x, y) => {
    const u = x / MESH, v = y / MESH
    const i = Math.min(mw - 2, Math.max(0, Math.floor(u)))
    const j = Math.min(mh - 2, Math.max(0, Math.floor(v)))
    const fu = u - i, fv = v - j
    const k = j * mw + i
    const lerp2 = (a: Float64Array) =>
      a[k]! * (1 - fu) * (1 - fv) + a[k + 1]! * fu * (1 - fv) + a[k + mw]! * (1 - fu) * fv + a[k + mw + 1]! * fu * fv
    return [lerp2(mx), lerp2(my)]
  }
}

export function reprojectToGrid(src: SourceRaster, grid: DisplayGrid, mode: 'bilinear' | 'nearest'): Uint8ClampedArray {
  const out = new Uint8ClampedArray(grid.width * grid.height * 4)
  const map = sourceCoordMapper(grid, src)
  const { data, width: W, height: H, samples: S } = src
  const isNodata = (o: number) => src.nodataZero && data[o] === 0 && (S === 1 || (data[o + 1] === 0 && data[o + 2] === 0))
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const [fx, fy] = map(x + 0.5, y + 0.5)
      if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue
      const o = (y * grid.width + x) * 4
      const ni = Math.floor(fx), nj = Math.floor(fy)
      const nearest = (nj * W + ni) * S
      if (isNodata(nearest)) continue
      if (mode === 'nearest' || S === 1) {
        const r = data[nearest]!
        out[o] = r
        out[o + 1] = S === 3 ? data[nearest + 1]! : r
        out[o + 2] = S === 3 ? data[nearest + 2]! : r
        out[o + 3] = 255
        continue
      }
      const gx = fx - 0.5, gy = fy - 0.5
      const i0 = Math.floor(gx), j0 = Math.floor(gy)
      const ax = gx - i0, ay = gy - j0
      const corners = [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]].map(([i, j]) => (Math.min(H - 1, Math.max(0, j!)) * W + Math.min(W - 1, Math.max(0, i!))) * S)
      if (corners.some(isNodata)) {
        out.set([data[nearest]!, data[nearest + 1]!, data[nearest + 2]!, 255], o)
        continue
      }
      const wts = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay]
      for (let b = 0; b < 3; b++) out[o + b] = corners.reduce((acc, c, k) => acc + data[c + b]! * wts[k]!, 0)
      out[o + 3] = 255
    }
  }
  return out
}
```

- [ ] **Step 4: Implement `src/evidence/diff.ts` and `src/evidence/index.ts`**

`src/evidence/diff.ts`:
```ts
/** diff-v1: per-pixel |ΔY| (Rec. 709 luma) as accent-coloured alpha; masked where either input is transparent or `invalid[i]` is set. */
export function brightnessDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, invalid?: Uint8Array, rgb: [number, number, number] = [228, 132, 68]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length)
  for (let i = 0, p = 0; p < a.length; i++, p += 4) {
    if (a[p + 3] === 0 || b[p + 3] === 0 || (invalid && invalid[i])) continue
    const ya = 0.2126 * a[p]! + 0.7152 * a[p + 1]! + 0.0722 * a[p + 2]!
    const yb = 0.2126 * b[p]! + 0.7152 * b[p + 1]! + 0.0722 * b[p + 2]!
    out[p] = rgb[0]
    out[p + 1] = rgb[1]
    out[p + 2] = rgb[2]
    out[p + 3] = Math.min(255, Math.round(Math.abs(ya - yb) * 4))
  }
  return out
}
```

`src/evidence/index.ts`:
```ts
export * from './types.ts'
export * from './utm.ts'
export * from './geodesy.ts'
export * from './frame.ts'
export * from './mask.ts'
export * from './scl.ts'
export * from './display.ts'
export * from './diff.ts'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/evidence`
Expected: PASS. All evidence tests are green.

- [ ] **Step 6: Commit**

```bash
git add src/evidence
git commit -m "feat(evidence): display-v1 mesh reprojection and diff-v1 brightness difference

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A7: Test fixtures (tiled TIFF writer, synthetic scene, fixture server)

**Files:**
- Create: `tests/fixtures/tiff.ts`, `tests/fixtures/scene.ts`, `tests/fixtures/tle.json`, `tests/fixtures/server.ts`
- Test: `tests/unit/fixtures.test.ts`

**Interfaces:**
- Produces:
  - `writeTiledTiff(levels: TiffLevel[], geo: GeoInfo): Uint8Array`
  - scene constants `TCI_TRANSFORM`, `SCL_TRANSFORM`, `TCI_SHAPE`, `SCL_SHAPE`, `FIXTURE_EPSG`, `FIXTURE_DATES`, `NAGPUR_SQUARE`, `FIXTURE_ROAD`
  - `tciPixel(x, y, roof)`, `makeTci(roof)`, `makeScl(fn)`, `fixtureItem(base, d)`, `itemId(date)`, `toArrayBuffer(u8)`
  - `startFixtureServer(port = 0): Promise<{ url: string; close(): Promise<void> }>`
  - Run with `PORT=4300 npx tsx tests/fixtures/server.ts`.

Fixture server routes:

| Route | Response |
|---|---|
| `POST /stac/search` | Items filtered by the body's datetime range |
| `GET /stac/collections/sentinel-2-l2a/items/:id` | One item |
| `GET\|HEAD /cog/:date/TCI.tif\|SCL.tif` | Range → 206, CORS `*`, no exposed headers (mimics S3) |
| `GET /tle` | `tle.json` |
| `GET /nominatim/search?q=` | Canned Nagpur result |
| `GET /style/dark.json`, `/style/light.json` | Minimal background-only styles |
| `GET /tiles/blank.png` | 1×1 transparent PNG |
| `OPTIONS *` | CORS preflight |

- [ ] **Step 1: Write the failing test `tests/unit/fixtures.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fromArrayBuffer } from 'geotiff'
import { FIXTURE_DATES, makeScl, makeTci, tciPixel, toArrayBuffer } from '../fixtures/scene.ts'
import { startFixtureServer } from '../fixtures/server.ts'

describe('tiled TIFF fixtures', () => {
  it('writes a two-level georeferenced TCI readable by geotiff', async () => {
    const tiff = await fromArrayBuffer(toArrayBuffer(makeTci(true)))
    expect(await tiff.getImageCount()).toBe(2)
    const im0 = await tiff.getImage(0)
    expect([im0.getWidth(), im0.getHeight(), im0.getSamplesPerPixel()]).toEqual([256, 256, 3])
    expect(im0.getOrigin().slice(0, 2)).toEqual([300000, 2341000])
    expect(im0.getResolution().slice(0, 2)).toEqual([10, -10])
    const px = (await im0.readRasters({ window: [150, 150, 151, 151], interleave: true })) as Uint8Array
    expect([...px]).toEqual(tciPixel(150, 150, true))
    const im1 = await tiff.getImage(1)
    expect([im1.getWidth(), im1.getHeight()]).toEqual([128, 128])
  })
  it('writes a single-level SCL with the class function', async () => {
    const tiff = await fromArrayBuffer(toArrayBuffer(makeScl(FIXTURE_DATES[1]!.scl)))
    const im = await tiff.getImage(0)
    const v = (await im.readRasters({ window: [80, 60, 81, 61], interleave: true })) as Uint8Array
    expect(v[0]).toBe(8)
  })
})

describe('fixture server', () => {
  let srv: { url: string; close(): Promise<void> }
  beforeAll(async () => { srv = await startFixtureServer(0) })
  afterAll(async () => { await srv.close() })

  it('answers STAC searches filtered by date', async () => {
    const r = await fetch(`${srv.url}/stac/search`, { method: 'POST', body: JSON.stringify({ datetime: '2025-01-01T00:00:00Z/2025-06-30T23:59:59Z' }) })
    const j = await r.json()
    expect(j.features.map((f: { id: string }) => f.id)).toEqual(['S2B_44QKJ_20250110_0_L2A', 'S2B_44QKJ_20250305_0_L2A', 'S2B_44QKJ_20250615_0_L2A'])
  })
  it('serves byte ranges with CORS like S3', async () => {
    const r = await fetch(`${srv.url}/cog/2025-01-10/TCI.tif`, { headers: { Range: 'bytes=0-7' } })
    expect(r.status).toBe(206)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
    expect([...new Uint8Array(await r.arrayBuffer())].slice(0, 4)).toEqual([0x49, 0x49, 42, 0])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/fixtures.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `tests/fixtures/tiff.ts`**

```ts
export interface TiffLevel { width: number; height: number; samples: 1 | 3; data: Uint8Array; tile: number }
export interface GeoInfo { epsg: number; originX: number; originY: number; resX: number; resY: number }

type Entry = [tag: number, type: 3 | 4 | 12, values: number[]]
const TYPE_SIZE = { 3: 2, 4: 4, 12: 8 } as const

/** Minimal little-endian, uncompressed, tiled, multi-IFD GeoTIFF writer (level 0 carries the georeferencing). */
export function writeTiledTiff(levels: TiffLevel[], geo: GeoInfo): Uint8Array {
  const chunks: Uint8Array[] = []
  const header = new Uint8Array(8)
  header.set([0x49, 0x49, 42, 0])
  chunks.push(header)
  let offset = 8
  const ifdOffsets: number[] = []
  const nextPointers: number[] = []
  levels.forEach((L, li) => {
    const tilesX = Math.ceil(L.width / L.tile)
    const tilesY = Math.ceil(L.height / L.tile)
    const tileBytes = L.tile * L.tile * L.samples
    const offsets: number[] = []
    const counts: number[] = []
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const t = new Uint8Array(tileBytes)
        for (let y = 0; y < L.tile && ty * L.tile + y < L.height; y++) {
          for (let x = 0; x < L.tile && tx * L.tile + x < L.width; x++) {
            const src = ((ty * L.tile + y) * L.width + tx * L.tile + x) * L.samples
            t.set(L.data.subarray(src, src + L.samples), (y * L.tile + x) * L.samples)
          }
        }
        offsets.push(offset)
        counts.push(tileBytes)
        chunks.push(t)
        offset += tileBytes
      }
    }
    const entries: Entry[] = [
      [254, 4, [li === 0 ? 0 : 1]],
      [256, 4, [L.width]],
      [257, 4, [L.height]],
      [258, 3, Array(L.samples).fill(8)],
      [259, 3, [1]],
      [262, 3, [L.samples === 3 ? 2 : 1]],
      [277, 3, [L.samples]],
      [284, 3, [1]],
      [322, 4, [L.tile]],
      [323, 4, [L.tile]],
      [324, 4, offsets],
      [325, 4, counts],
      [339, 3, Array(L.samples).fill(1)],
    ]
    if (li === 0) {
      entries.push([33550, 12, [geo.resX, geo.resY, 0]])
      entries.push([33922, 12, [0, 0, 0, geo.originX, geo.originY, 0]])
      entries.push([34735, 3, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, geo.epsg]])
    }
    entries.sort((a, b) => a[0] - b[0])
    const ifdSize = 2 + entries.length * 12 + 4
    const ifdStart = offset
    let extra = ifdStart + ifdSize
    const ifd = new Uint8Array(ifdSize)
    const dv = new DataView(ifd.buffer)
    const extras: Uint8Array[] = []
    dv.setUint16(0, entries.length, true)
    entries.forEach(([tag, type, values], k) => {
      const p = 2 + k * 12
      dv.setUint16(p, tag, true)
      dv.setUint16(p + 2, type, true)
      dv.setUint32(p + 4, values.length, true)
      const size = TYPE_SIZE[type] * values.length
      const write = (view: DataView, at: number) =>
        values.forEach((v, i) => {
          if (type === 3) view.setUint16(at + i * 2, v, true)
          else if (type === 4) view.setUint32(at + i * 4, v, true)
          else view.setFloat64(at + i * 8, v, true)
        })
      if (size <= 4) {
        write(dv, p + 8)
      } else {
        const buf = new Uint8Array(size + (size % 2))
        write(new DataView(buf.buffer), 0)
        dv.setUint32(p + 8, extra, true)
        extras.push(buf)
        extra += buf.length
      }
    })
    ifdOffsets.push(ifdStart)
    nextPointers.push(ifdStart + ifdSize - 4)
    chunks.push(ifd, ...extras)
    offset = extra
  })
  const out = new Uint8Array(offset)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  const view = new DataView(out.buffer)
  view.setUint32(4, ifdOffsets[0]!, true)
  nextPointers.forEach((p, i) => view.setUint32(p, ifdOffsets[i + 1] ?? 0, true))
  return out
}
```

- [ ] **Step 4: Implement `tests/fixtures/scene.ts` and `tests/fixtures/tle.json`**

`tests/fixtures/scene.ts`:
```ts
import { writeTiledTiff } from './tiff.ts'
import type { LonLat } from '../../src/evidence/types.ts'

export const FIXTURE_EPSG = 32644
export const TCI_TRANSFORM = [10, 0, 300000, 0, -10, 2341000]
export const SCL_TRANSFORM = [20, 0, 300000, 0, -20, 2341000]
export const TCI_SHAPE: [number, number] = [256, 256]
export const SCL_SHAPE: [number, number] = [128, 128]

export interface FixtureDate { date: string; scl: (x: number, y: number) => number; roof: boolean; cloud: number }
export const FIXTURE_DATES: FixtureDate[] = [
  { date: '2025-01-10', scl: (x, y) => (x < 16 && y < 16 ? 3 : 5), roof: false, cloud: 1.2 },
  { date: '2025-03-05', scl: (x) => (x >= 74 ? 8 : 5), roof: false, cloud: 48.0 },
  { date: '2025-06-15', scl: () => 9, roof: false, cloud: 99.1 },
  { date: '2025-12-20', scl: () => 4, roof: true, cloud: 0.4 },
]

/** The Nagpur ±0.005° square used across tests (fully inside the fixture extent). */
export const NAGPUR_SQUARE: LonLat[] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]
/** 2.90436 km fixture road = UTM 44N (300300, 2338700) → (302300, 2340800). */
export const FIXTURE_ROAD: LonLat[] = [[79.07698, 21.138637], [79.095988, 21.157819]]

export function tciPixel(x: number, y: number, roof: boolean): [number, number, number] {
  if (roof && x >= 140 && x < 170 && y >= 140 && y < 170) return [230, 230, 230]
  return [60 + (x % 32), 90 + (y % 32), 50]
}

export function makeTci(roof: boolean): Uint8Array {
  const [h, w] = TCI_SHAPE
  const l0 = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l0.set(tciPixel(x, y, roof), (y * w + x) * 3)
  const w1 = w / 2, h1 = h / 2
  const l1 = new Uint8Array(w1 * h1 * 3)
  for (let y = 0; y < h1; y++) for (let x = 0; x < w1; x++) l1.set(tciPixel(x * 2, y * 2, roof), (y * w1 + x) * 3)
  return writeTiledTiff(
    [{ width: w, height: h, samples: 3, data: l0, tile: 128 }, { width: w1, height: h1, samples: 3, data: l1, tile: 128 }],
    { epsg: FIXTURE_EPSG, originX: 300000, originY: 2341000, resX: 10, resY: 10 },
  )
}

export function makeScl(fn: (x: number, y: number) => number): Uint8Array {
  const [h, w] = SCL_SHAPE
  const d = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = fn(x, y)
  return writeTiledTiff([{ width: w, height: h, samples: 1, data: d, tile: 128 }], { epsg: FIXTURE_EPSG, originX: 300000, originY: 2341000, resX: 20, resY: 20 })
}

export const itemId = (date: string) => `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`

export function fixtureItem(base: string, d: FixtureDate) {
  return {
    type: 'Feature',
    stac_version: '1.0.0',
    id: itemId(d.date),
    collection: 'sentinel-2-l2a',
    geometry: { type: 'Polygon', coordinates: [[[78.9, 21.0], [79.3, 21.0], [79.3, 21.3], [78.9, 21.3], [78.9, 21.0]]] },
    properties: {
      datetime: `${d.date}T05:30:00.000000Z`,
      'proj:epsg': FIXTURE_EPSG,
      'eo:cloud_cover': d.cloud,
      's2:processing_baseline': '05.11',
      's2:nodata_pixel_percentage': 0,
    },
    assets: {
      visual: { href: `${base}/cog/${d.date}/TCI.tif`, 'proj:transform': TCI_TRANSFORM, 'proj:shape': TCI_SHAPE, type: 'image/tiff; application=geotiff; profile=cloud-optimized' },
      scl: { href: `${base}/cog/${d.date}/SCL.tif`, 'proj:transform': SCL_TRANSFORM, 'proj:shape': SCL_SHAPE, type: 'image/tiff; application=geotiff; profile=cloud-optimized' },
    },
    links: [],
  }
}

export const toArrayBuffer = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
```

`tests/fixtures/tle.json`: copy this exact array (CelesTrak GP JSON for the five satellites, epoch 2026-10-04; also used for the satellite vectors in B7):
```json
[{"OBJECT_NAME":"SENTINEL-2A","OBJECT_ID":"2015-028A","EPOCH":"2026-10-04T22:26:18.504960","MEAN_MOTION":14.3081859,"ECCENTRICITY":0.0001079,"INCLINATION":98.5647,"RA_OF_ASC_NODE":351.1863,"ARG_OF_PERICENTER":91.1343,"MEAN_ANOMALY":268.9963,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":40697,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":58942,"BSTAR":-0.000079481503,"MEAN_MOTION_DOT":-0.00000252,"MEAN_MOTION_DDOT":0},{"OBJECT_NAME":"SENTINEL-2B","OBJECT_ID":"2017-013A","EPOCH":"2026-10-04T22:16:00.790752","MEAN_MOTION":14.30816991,"ECCENTRICITY":0.00011603,"INCLINATION":98.5691,"RA_OF_ASC_NODE":351.1251,"ARG_OF_PERICENTER":90.987,"MEAN_ANOMALY":269.1446,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":42063,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":50033,"BSTAR":-0.000094344857,"MEAN_MOTION_DOT":-0.00000291,"MEAN_MOTION_DDOT":0},{"OBJECT_NAME":"SENTINEL-2C","OBJECT_ID":"2024-157A","EPOCH":"2026-10-04T19:44:59.904384","MEAN_MOTION":14.30817279,"ECCENTRICITY":0.00011498,"INCLINATION":98.5702,"RA_OF_ASC_NODE":351.0282,"ARG_OF_PERICENTER":81.8474,"MEAN_ANOMALY":278.2839,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":60989,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":10866,"BSTAR":0.000034955683,"MEAN_MOTION_DOT":4.8e-7,"MEAN_MOTION_DDOT":0},{"OBJECT_NAME":"LANDSAT 8","OBJECT_ID":"2013-008A","EPOCH":"2026-10-04T21:31:02.655264","MEAN_MOTION":14.57108312,"ECCENTRICITY":0.00013124,"INCLINATION":98.2195,"RA_OF_ASC_NODE":346.6655,"ARG_OF_PERICENTER":94.3314,"MEAN_ANOMALY":265.8034,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":39084,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":71387,"BSTAR":0.000050328547,"MEAN_MOTION_DOT":0.00000181,"MEAN_MOTION_DDOT":0},{"OBJECT_NAME":"LANDSAT 9","OBJECT_ID":"2021-088A","EPOCH":"2026-10-04T19:02:48.202080","MEAN_MOTION":14.57106696,"ECCENTRICITY":0.00014344,"INCLINATION":98.2175,"RA_OF_ASC_NODE":346.5817,"ARG_OF_PERICENTER":89.553,"MEAN_ANOMALY":270.5833,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":49260,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":26696,"BSTAR":0.00004571202,"MEAN_MOTION_DOT":0.00000161,"MEAN_MOTION_DDOT":0}]
```

- [ ] **Step 5: Implement `tests/fixtures/server.ts`**

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { FIXTURE_DATES, fixtureItem, itemId, makeScl, makeTci } from './scene.ts'

const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const TLE = readFileSync(new URL('./tle.json', import.meta.url))
const style = (bg: string) => JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': bg } }] })

const files = new Map<string, Buffer>()
for (const d of FIXTURE_DATES) {
  files.set(`/cog/${d.date}/TCI.tif`, Buffer.from(makeTci(d.roof)))
  files.set(`/cog/${d.date}/SCL.tif`, Buffer.from(makeScl(d.scl)))
}

const CORS = { 'access-control-allow-origin': '*' }

function send(res: ServerResponse, status: number, body: Buffer | string, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { ...CORS, 'content-type': type, 'content-length': String(Buffer.byteLength(body)), ...extra })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = []
  for await (const c of req) parts.push(c as Buffer)
  return Buffer.concat(parts).toString('utf8')
}

function handler(base: () => string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...CORS, 'access-control-allow-methods': 'GET,POST,HEAD,OPTIONS', 'access-control-allow-headers': 'content-type,range' })
      return res.end()
    }
    if (url.pathname === '/stac/search' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { datetime?: string }
      const [from, to] = (body.datetime ?? '0000/9999').split('/')
      const feats = FIXTURE_DATES.filter((d) => `${d.date}T05:30:00Z` >= from! && `${d.date}T05:30:00Z` <= to!).map((d) => fixtureItem(base(), d))
      return send(res, 200, JSON.stringify({ type: 'FeatureCollection', features: feats, links: [], context: { returned: feats.length } }), 'application/geo+json')
    }
    const itemMatch = url.pathname.match(/^\/stac\/collections\/sentinel-2-l2a\/items\/(.+)$/)
    if (itemMatch) {
      const d = FIXTURE_DATES.find((x) => itemId(x.date) === itemMatch[1])
      return d ? send(res, 200, JSON.stringify(fixtureItem(base(), d)), 'application/geo+json') : send(res, 404, '{}', 'application/json')
    }
    const file = files.get(url.pathname)
    if (file) {
      const common = { 'accept-ranges': 'bytes', etag: `"${url.pathname}"`, 'last-modified': 'Sat, 04 Oct 2026 00:00:00 GMT' }
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if (req.method === 'HEAD') {
        res.writeHead(200, { ...CORS, ...common, 'content-type': 'image/tiff', 'content-length': String(file.length) })
        return res.end()
      }
      if (range) {
        const start = Number(range[1])
        const end = Math.min(file.length - 1, range[2] ? Number(range[2]) : file.length - 1)
        return send(res, 206, file.subarray(start, end + 1), 'image/tiff', { ...common, 'content-range': `bytes ${start}-${end}/${file.length}` })
      }
      return send(res, 200, file, 'image/tiff', common)
    }
    if (url.pathname === '/tle') return send(res, 200, TLE, 'application/json')
    if (url.pathname === '/nominatim/search') {
      const hit = /nagpur/i.test(url.searchParams.get('q') ?? '')
        ? [{ place_id: 1, display_name: 'Nagpur, Maharashtra, India', lat: '21.1458', lon: '79.0882', boundingbox: ['20.9', '21.3', '78.9', '79.3'], type: 'city' }]
        : []
      return send(res, 200, JSON.stringify(hit), 'application/json')
    }
    if (url.pathname === '/style/dark.json') return send(res, 200, style('#09090B'), 'application/json')
    if (url.pathname === '/style/light.json') return send(res, 200, style('#FFFFFF'), 'application/json')
    if (url.pathname.startsWith('/tiles/')) return send(res, 200, BLANK_PNG, 'image/png')
    return send(res, 404, 'not found', 'text/plain')
  }
}

export function startFixtureServer(port = 0): Promise<{ url: string; close(): Promise<void> }> {
  let url = ''
  const server = createServer(handler(() => url))
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}`
      resolve({ url, close: () => new Promise<void>((r) => server.close(() => r())) })
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startFixtureServer(Number(process.env.PORT ?? 4300)).then((s) => console.log(`fixture server on ${s.url}`))
}
```

- [ ] **Step 6: Run the tests to verify they pass, and check the server boots under plain Node**

Run: `npx vitest run tests/unit/fixtures.test.ts`
Expected: PASS, 4 tests.

Run: `PORT=4300 timeout 8 npx tsx tests/fixtures/server.ts; echo exit=$?`
Expected: prints `fixture server on http://127.0.0.1:4300`, then `exit=124` (killed by timeout). Validated in planning on this VM, 2026-10-05.

- [ ] **Step 7: Commit**

```bash
git add tests
git commit -m "test: tiled GeoTIFF writer, synthetic Nagpur scene and hermetic fixture server

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A8: COG I/O

**Files:**
- Create: `src/evidence/cog.ts`
- Modify: `src/evidence/index.ts` (add `export * from './cog.ts'`)
- Test: `src/evidence/cog.test.ts`

**Interfaces:**
- Consumes: A4 `levelFromTransform`, A7 fixtures.
- Produces:
  - `interface Cog { sizes: Array<{ width: number; height: number }>; read(level: number, win: Window, samples: number[], signal?: AbortSignal): Promise<Uint8Array> }`
  - `openCogUrl(url: string, signal?: AbortSignal): Promise<Cog>`
  - `openCogBuffer(buf: ArrayBuffer): Promise<Cog>`
  - `levelInfoFor(asset: { transform: number[]; shape: [number, number] }, cog: Cog, level: number): LevelInfo` (throws `COG_LAYOUT` when the pyramid is not ~2× per level)

- [ ] **Step 1: Write the failing test `src/evidence/cog.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levelInfoFor, openCogBuffer, openCogUrl } from './cog.ts'
import { sha256Hex } from './frame.ts'
import { TCI_SHAPE, TCI_TRANSFORM, makeTci, tciPixel, toArrayBuffer } from '../../tests/fixtures/scene.ts'
import { startFixtureServer } from '../../tests/fixtures/server.ts'

const ASSET = { transform: TCI_TRANSFORM, shape: TCI_SHAPE }

describe('cog', () => {
  let srv: { url: string; close(): Promise<void> }
  beforeAll(async () => { srv = await startFixtureServer(0) })
  afterAll(async () => { await srv.close() })

  it('exposes level sizes and reads an exact window', async () => {
    const cog = await openCogBuffer(toArrayBuffer(makeTci(false)))
    expect(cog.sizes).toEqual([{ width: 256, height: 256 }, { width: 128, height: 128 }])
    const bytes = await cog.read(0, [92, 94, 203, 211], [0, 1, 2])
    expect(bytes.length).toBe(111 * 117 * 3)
    expect([...bytes.subarray(0, 3)]).toEqual(tciPixel(92, 94, false))
  })
  it('derives level geometry from STAC transform plus real sizes', async () => {
    const cog = await openCogBuffer(toArrayBuffer(makeTci(false)))
    expect(levelInfoFor(ASSET, cog, 0)).toMatchObject({ originX: 300000, originY: 2341000, resX: 10, resY: 10 })
    expect(levelInfoFor(ASSET, cog, 1).resX).toBe(20)
    expect(() => levelInfoFor({ transform: TCI_TRANSFORM, shape: [1000, 1000] }, cog, 1)).toThrow('COG_LAYOUT')
    expect(() => levelInfoFor(ASSET, cog, 3)).toThrow('NO_LEVEL:3')
  })
  it('reads identical bytes over HTTP range requests', async () => {
    const local = await openCogBuffer(toArrayBuffer(makeTci(true)))
    const remote = await openCogUrl(`${srv.url}/cog/2025-12-20/TCI.tif`)
    const win: [number, number, number, number] = [92, 94, 203, 211]
    expect(await sha256Hex(await remote.read(0, win, [0, 1, 2]))).toBe(await sha256Hex(await local.read(0, win, [0, 1, 2])))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/evidence/cog.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/evidence/cog.ts`**

```ts
import { fromArrayBuffer, fromUrl, type GeoTIFF } from 'geotiff'
import { levelFromTransform } from './frame.ts'
import type { LevelInfo, Window } from './types.ts'

export interface Cog {
  sizes: Array<{ width: number; height: number }>
  read(level: number, win: Window, samples: number[], signal?: AbortSignal): Promise<Uint8Array>
}

async function wrap(tiff: GeoTIFF): Promise<Cog> {
  const n = await tiff.getImageCount()
  const images = await Promise.all(Array.from({ length: n }, (_, i) => tiff.getImage(i)))
  return {
    sizes: images.map((im) => ({ width: im.getWidth(), height: im.getHeight() })),
    async read(level, win, samples, signal) {
      const im = images[level]
      if (!im) throw new Error(`NO_LEVEL:${level}`)
      signal?.throwIfAborted()
      const data = await im.readRasters({ window: win, samples, interleave: true, signal })
      signal?.throwIfAborted()
      if (!(data instanceof Uint8Array)) throw new Error('NOT_UINT8')
      return data
    },
  }
}

export async function openCogUrl(url: string, signal?: AbortSignal): Promise<Cog> {
  return wrap(await fromUrl(url, { allowFullFile: false }, signal))
}

export async function openCogBuffer(buf: ArrayBuffer): Promise<Cog> {
  return wrap(await fromArrayBuffer(buf))
}

export function levelInfoFor(asset: { transform: number[]; shape: [number, number] }, cog: Cog, level: number): LevelInfo {
  const size = cog.sizes[level]
  if (!size) throw new Error(`NO_LEVEL:${level}`)
  const expectW = asset.shape[1] / 2 ** level
  if (Math.abs(size.width - expectW) > 1) throw new Error('COG_LAYOUT')
  return levelFromTransform(asset.transform, asset.shape, level, size.width, size.height)
}
```

Then append `export * from './cog.ts'` to `src/evidence/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/evidence/cog.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/evidence
git commit -m "feat(evidence): COG level access and window reads over HTTP ranges

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A9: STAC client (search, paging, retry, fallback, per-date selection)

**Files:**
- Create: `src/config.ts`, `src/stac/types.ts`, `src/stac/parse.ts`, `src/stac/search.ts`, `src/stac/select.ts`, `src/stac/pc.ts`
- Test: `src/stac/parse.test.ts`, `src/stac/search.test.ts`, `src/stac/select.test.ts`

**Interfaces:**
- Consumes: `Bbox` (A3), `LonLat` (A3).
- Produces:
  - `config` (`src/config.ts`) with env-overridable endpoints.
  - `type Collection = 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'`
  - `interface AssetRef { href: string; transform: number[]; shape: [number, number] }`
  - `interface S2Item { id; collection; datetime; date; epsg; cloudCover: number | null; baseline: string | null; nodataPct: number | null; footprint: LonLat[][]; visual: AssetRef; scl: AssetRef }`
  - `parseItem(raw: unknown, collection: Collection): S2Item | null`
  - `searchSentinel2(args: SearchArgs): Promise<{ items: S2Item[]; limited: boolean; source: Collection }>`
  - `class StacError extends Error { status: number }`
  - `interface DateCandidate { date: string; item: S2Item; alternates: S2Item[]; coversAoi: boolean }`
  - `selectPerDate(items, aoiPoints: LonLat[]): DateCandidate[]`
  - `pointInRing(p, ring): boolean`
  - `signPcHref(href, fetchImpl?): Promise<string>`, `resolveItemHrefs(item): Promise<S2Item>`

- [ ] **Step 1: Write the failing tests**

`src/stac/parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseItem } from './parse.ts'

// Trimmed real Earth Search item (2026-10-05 response for Nagpur).
const REAL = {
  id: 'S2B_44QKJ_20260902_0_L2A',
  collection: 'sentinel-2-l2a',
  geometry: { type: 'Polygon', coordinates: [[[78.0, 20.6], [79.2, 20.6], [79.2, 21.7], [78.0, 21.7], [78.0, 20.6]]] },
  properties: { 'proj:epsg': 32644, datetime: '2026-09-02T05:32:56.964000Z', 'eo:cloud_cover': 99.363446, 's2:processing_baseline': '05.12', 's2:nodata_pixel_percentage': 12.416402 },
  assets: {
    visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/44/Q/KJ/2026/9/S2B_44QKJ_20260902_0_L2A/TCI.tif', 'proj:shape': [10980, 10980], 'proj:transform': [10, 0, 199980, 0, -10, 2400000] },
    scl: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/44/Q/KJ/2026/9/S2B_44QKJ_20260902_0_L2A/SCL.tif', 'proj:shape': [5490, 5490], 'proj:transform': [20, 0, 199980, 0, -20, 2400000] },
  },
}

describe('parseItem', () => {
  it('parses a real Earth Search item', () => {
    const it = parseItem(REAL, 'sentinel-2-l2a')
    expect(it).toMatchObject({ id: REAL.id, date: '2026-09-02', epsg: 32644, cloudCover: 99.363446, baseline: '05.12', nodataPct: 12.416402 })
    expect(it?.visual.transform).toEqual([10, 0, 199980, 0, -10, 2400000])
    expect(it?.scl.shape).toEqual([5490, 5490])
  })
  it('accepts proj:code and uppercase SCL (Planetary Computer)', () => {
    const pc = structuredClone(REAL) as Record<string, any>
    delete pc.properties['proj:epsg']
    pc.properties['proj:code'] = 'EPSG:32644'
    pc.assets.SCL = pc.assets.scl
    delete pc.assets.scl
    pc.assets.visual.href = 'https://sentinel2l2a01.blob.core.windows.net/sentinel2-l2/44/Q/KJ/x/TCI.tif'
    pc.assets.SCL.href = 'https://sentinel2l2a01.blob.core.windows.net/sentinel2-l2/44/Q/KJ/x/SCL.tif'
    expect(parseItem(pc, 'pc:sentinel-2-l2a')?.epsg).toBe(32644)
  })
  it('rejects items without assets, with bad dates, or with non-allowlisted hosts', () => {
    expect(parseItem({ ...REAL, assets: {} }, 'sentinel-2-l2a')).toBeNull()
    expect(parseItem({ ...REAL, properties: { ...REAL.properties, datetime: 'nope' } }, 'sentinel-2-l2a')).toBeNull()
    const evil = structuredClone(REAL)
    evil.assets.visual.href = 'https://evil.example.com/TCI.tif'
    expect(parseItem(evil, 'sentinel-2-l2a')).toBeNull()
  })
})
```

`src/stac/search.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { searchSentinel2 } from './search.ts'

const item = (id: string, date: string) => ({
  id, collection: 'sentinel-2-l2a',
  geometry: { type: 'Polygon', coordinates: [[[78, 20], [80, 20], [80, 22], [78, 22], [78, 20]]] },
  properties: { 'proj:epsg': 32644, datetime: `${date}T05:30:00Z` },
  assets: {
    visual: { href: `https://sentinel-cogs.s3.us-west-2.amazonaws.com/${id}/TCI.tif`, 'proj:shape': [10980, 10980], 'proj:transform': [10, 0, 199980, 0, -10, 2400000] },
    scl: { href: `https://sentinel-cogs.s3.us-west-2.amazonaws.com/${id}/SCL.tif`, 'proj:shape': [5490, 5490], 'proj:transform': [20, 0, 199980, 0, -20, 2400000] },
  },
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const args = { bbox: [79, 21.1, 79.1, 21.2] as [number, number, number, number], from: '2025-01-01', to: '2025-12-31', sleep: async () => {} }

describe('searchSentinel2', () => {
  it('follows POST next links with their body', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ features: [item('A', '2025-01-01')], links: [{ rel: 'next', method: 'POST', href: 'https://earth-search.aws.element84.com/v1/search', body: { next: 'tok' } }] }))
      .mockResolvedValueOnce(json({ features: [item('B', '2025-01-06')], links: [] }))
    const r = await searchSentinel2({ ...args, fetchImpl })
    expect(r.items.map((i) => i.id)).toEqual(['A', 'B'])
    expect(r.limited).toBe(false)
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body)).toEqual({ next: 'tok' })
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).bbox).toEqual([79, 21.1, 79.1, 21.2])
  })
  it('stops at maxPages and reports limited', async () => {
    const page = () => json({ features: [item('X', '2025-02-01')], links: [{ rel: 'next', method: 'POST', href: 'https://earth-search.aws.element84.com/v1/search', body: {} }] })
    const fetchImpl = vi.fn().mockImplementation(async () => page())
    const r = await searchSentinel2({ ...args, fetchImpl, maxPages: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(r.limited).toBe(true)
  })
  it('retries a 503 then succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ features: [item('A', '2025-01-01')], links: [] }))
    const r = await searchSentinel2({ ...args, fetchImpl })
    expect(r.source).toBe('sentinel-2-l2a')
    expect(r.items).toHaveLength(1)
  })
  it('falls back to Planetary Computer after 3 failures', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) =>
      url.includes('planetarycomputer') ? json({ features: [{ ...item('P', '2025-03-01'), assets: { ...item('P', '2025-03-01').assets, visual: { ...item('P', '2025-03-01').assets.visual, href: 'https://sentinel2l2a01.blob.core.windows.net/P/TCI.tif' }, scl: { ...item('P', '2025-03-01').assets.scl, href: 'https://sentinel2l2a01.blob.core.windows.net/P/SCL.tif' } } }], links: [] }) : json({}, 502),
    )
    const r = await searchSentinel2({ ...args, fetchImpl })
    expect(r.source).toBe('pc:sentinel-2-l2a')
    expect(r.items[0]?.collection).toBe('pc:sentinel-2-l2a')
  })
  it('never swallows an abort', async () => {
    const ac = new AbortController()
    ac.abort()
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(searchSentinel2({ ...args, fetchImpl, signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
```

`src/stac/select.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pointInRing, selectPerDate } from './select.ts'
import type { S2Item } from './types.ts'

const base = (id: string, datetime: string, over: Partial<S2Item> = {}): S2Item => ({
  id, collection: 'sentinel-2-l2a', datetime, date: datetime.slice(0, 10), epsg: 32644, cloudCover: 10, baseline: '05.11', nodataPct: 0,
  footprint: [[[79, 21], [79.2, 21], [79.2, 21.2], [79, 21.2], [79, 21]]],
  visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/v', transform: [10, 0, 0, 0, -10, 0], shape: [1, 1] },
  scl: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/s', transform: [20, 0, 0, 0, -20, 0], shape: [1, 1] },
  ...over,
})
const AOI: [number, number][] = [[79.08, 21.14], [79.09, 21.14], [79.09, 21.15]]

describe('selectPerDate', () => {
  it('groups by UTC date and prefers covering, low-nodata, low-cloud items', () => {
    const items = [
      base('b2', '2025-01-10T05:31:00Z', { cloudCover: 5 }),
      base('b1', '2025-01-10T05:30:00Z', { cloudCover: 50 }),
      base('edge', '2025-01-10T05:32:00Z', { cloudCover: 0, footprint: [[[79.085, 21], [79.3, 21], [79.3, 21.3], [79.085, 21.3], [79.085, 21]]] }),
      base('c', '2025-02-01T05:30:00Z'),
    ]
    const c = selectPerDate(items, AOI)
    expect(c.map((x) => x.date)).toEqual(['2025-01-10', '2025-02-01'])
    expect(c[0]!.item.id).toBe('b2')
    expect(c[0]!.alternates.map((a) => a.id)).toEqual(['b1', 'edge'])
    expect(c[0]!.coversAoi).toBe(true)
  })
  it('marks dates whose best item does not contain the AOI', () => {
    const c = selectPerDate([base('x', '2025-03-01T05:30:00Z', { footprint: [[[80, 22], [81, 22], [81, 23], [80, 22]]] })], AOI)
    expect(c[0]!.coversAoi).toBe(false)
  })
  it('pointInRing handles inside/outside', () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
    expect(pointInRing([0.5, 0.5], ring)).toBe(true)
    expect(pointInRing([1.5, 0.5], ring)).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/stac`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/config.ts`**

```ts
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>
const pick = (k: string, d: string) => env[k] || d

export const config = {
  stacUrl: pick('VITE_STAC_URL', 'https://earth-search.aws.element84.com/v1'),
  pcStacUrl: pick('VITE_PC_STAC_URL', 'https://planetarycomputer.microsoft.com/api/stac/v1'),
  pcSasUrl: pick('VITE_PC_SAS_URL', 'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a'),
  nominatimUrl: pick('VITE_NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
  tleUrl: pick('VITE_TLE_URL', '/api/tle'),
  styleDark: pick('VITE_STYLE_DARK', 'https://tiles.openfreemap.org/styles/dark'),
  styleLight: pick('VITE_STYLE_LIGHT', 'https://tiles.openfreemap.org/styles/positron'),
  gibsTiles: pick('VITE_GIBS_TILES', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'),
  terrainTiles: pick('VITE_TERRAIN_TILES', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'),
  supabaseUrl: pick('VITE_SUPABASE_URL', ''),
  supabaseKey: pick('VITE_SUPABASE_PUBLISHABLE_KEY', ''),
  /** Test hooks and localhost data hosts are allowed outside production builds or when explicitly enabled for e2e. */
  testMode: env.MODE !== 'production' || env.VITE_TEST_HOOKS === '1',
} as const

const ASSET_HOSTS = ['sentinel-cogs.s3.us-west-2.amazonaws.com', 'e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com']

export function isAllowedAssetUrl(href: string): boolean {
  try {
    const u = new URL(href)
    if (u.protocol === 'https:' && (ASSET_HOSTS.includes(u.hostname) || u.hostname.endsWith('.blob.core.windows.net'))) return true
    return config.testMode && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Implement `src/stac/types.ts` and `src/stac/parse.ts`**

`src/stac/types.ts`:
```ts
import type { LonLat } from '../evidence/types.ts'

export type Collection = 'sentinel-2-l2a' | 'pc:sentinel-2-l2a'
export interface AssetRef { href: string; transform: number[]; shape: [number, number] }
export interface S2Item {
  id: string
  collection: Collection
  datetime: string
  date: string
  epsg: number
  cloudCover: number | null
  baseline: string | null
  nodataPct: number | null
  footprint: LonLat[][]
  visual: AssetRef
  scl: AssetRef
}
export interface SearchResult { items: S2Item[]; limited: boolean; source: Collection }
export interface DateCandidate { date: string; item: S2Item; alternates: S2Item[]; coversAoi: boolean }
```

`src/stac/parse.ts`:
```ts
import { isAllowedAssetUrl } from '../config.ts'
import type { LonLat } from '../evidence/types.ts'
import type { AssetRef, Collection, S2Item } from './types.ts'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nums = (v: unknown, n: number) => (Array.isArray(v) && v.length >= n && v.every((x) => typeof x === 'number') ? (v as number[]) : null)

function asset(raw: unknown, props: Obj): AssetRef | null {
  if (!isObj(raw)) return null
  const href = str(raw.href)
  const transform = nums(raw['proj:transform'] ?? props['proj:transform'], 6)
  const shape = nums(raw['proj:shape'] ?? props['proj:shape'], 2)
  if (!href || !transform || !shape || !isAllowedAssetUrl(href)) return null
  return { href, transform: transform.slice(0, 6), shape: [shape[0]!, shape[1]!] }
}

function rings(geom: unknown): LonLat[][] | null {
  if (!isObj(geom)) return null
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) return [geom.coordinates[0] as LonLat[]]
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) return (geom.coordinates as LonLat[][][]).map((p) => p[0]!)
  return null
}

export function parseItem(raw: unknown, collection: Collection): S2Item | null {
  if (!isObj(raw) || !isObj(raw.properties) || !isObj(raw.assets)) return null
  const id = str(raw.id)
  const p = raw.properties
  const datetime = str(p.datetime)
  if (!id || !datetime || Number.isNaN(Date.parse(datetime))) return null
  const code = str(p['proj:code'])
  const epsg = num(p['proj:epsg']) ?? (code?.startsWith('EPSG:') ? Number(code.slice(5)) : null)
  const visual = asset(raw.assets.visual, p)
  const scl = asset(raw.assets.scl ?? raw.assets.SCL, p)
  const footprint = rings(raw.geometry)
  if (!epsg || !visual || !scl || !footprint) return null
  return {
    id, collection, datetime, date: new Date(datetime).toISOString().slice(0, 10), epsg,
    cloudCover: num(p['eo:cloud_cover']), baseline: str(p['s2:processing_baseline']), nodataPct: num(p['s2:nodata_pixel_percentage']),
    footprint, visual, scl,
  }
}
```

- [ ] **Step 5: Implement `src/stac/search.ts`, `src/stac/select.ts`, `src/stac/pc.ts`**

`src/stac/search.ts`:
```ts
import { config } from '../config.ts'
import type { Bbox } from '../geo/aoi.ts'
import { parseItem } from './parse.ts'
import type { Collection, S2Item, SearchResult } from './types.ts'

export class StacError extends Error {
  constructor(public status: number, message = `STAC_${status}`) { super(message) }
}

export interface SearchArgs {
  bbox: Bbox
  from: string
  to: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  maxPages?: number
  sleep?: (ms: number) => Promise<void>
}

const FIELDS = ['id', 'collection', 'geometry', 'properties.datetime', 'properties.eo:cloud_cover', 'properties.s2:processing_baseline', 'properties.s2:nodata_pixel_percentage', 'properties.proj:epsg', 'properties.proj:code', 'assets.visual', 'assets.scl']
const BACKOFF = [500, 1500]
const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError'

interface Req { url: string; method: 'GET' | 'POST'; body?: unknown }
type Json = { features?: unknown[]; links?: Array<{ rel?: string; href?: string; method?: string; body?: unknown; merge?: boolean }> }

async function fetchJson(req: Req, a: SearchArgs): Promise<Json> {
  const f = a.fetchImpl ?? fetch
  const sleep = a.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await f(req.url, {
        method: req.method,
        headers: req.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
        signal: a.signal,
      })
      if (res.ok) return (await res.json()) as Json
      last = new StacError(res.status)
      if (res.status !== 429 && res.status < 500) throw last
    } catch (e) {
      if (isAbort(e) || (e instanceof StacError && e.status < 500 && e.status !== 429)) throw e
      last = e
    }
    if (attempt < 2) await sleep(BACKOFF[attempt]!)
  }
  throw last
}

async function searchEndpoint(base: string, collection: Collection, a: SearchArgs, useFields: boolean): Promise<SearchResult> {
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: a.bbox,
    datetime: `${a.from}T00:00:00Z/${a.to}T23:59:59Z`,
    limit: 100,
    sortby: [{ field: 'properties.datetime', direction: 'asc' }],
    ...(useFields ? { fields: { include: FIELDS } } : {}),
  }
  let req: Req = { url: `${base}/search`, method: 'POST', body }
  const items: S2Item[] = []
  for (let pages = 1; ; pages++) {
    const json = await fetchJson(req, a)
    for (const f of json.features ?? []) {
      const it = parseItem(f, collection)
      if (it) items.push(it)
    }
    const next = (json.links ?? []).find((l) => l.rel === 'next' && l.href)
    if (!next) return { items, limited: false, source: collection }
    if (pages >= (a.maxPages ?? 10)) return { items, limited: true, source: collection }
    req = next.method === 'POST'
      ? { url: next.href!, method: 'POST', body: next.merge ? { ...(req.body as object), ...(next.body as object) } : next.body }
      : { url: next.href!, method: 'GET' }
  }
}

export async function searchSentinel2(a: SearchArgs): Promise<SearchResult> {
  try {
    return await searchEndpoint(config.stacUrl, 'sentinel-2-l2a', a, true)
  } catch (e) {
    if (isAbort(e)) throw e
    return await searchEndpoint(config.pcStacUrl, 'pc:sentinel-2-l2a', a, false)
  }
}
```

`src/stac/select.ts`:
```ts
import type { LonLat } from '../evidence/types.ts'
import type { DateCandidate, S2Item } from './types.ts'

export function pointInRing([x, y]: LonLat, ring: LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const covers = (it: S2Item, pts: LonLat[]) => pts.every((p) => it.footprint.some((r) => pointInRing(p, r)))

export function selectPerDate(items: S2Item[], aoiPoints: LonLat[]): DateCandidate[] {
  const groups = new Map<string, S2Item[]>()
  for (const it of items) groups.set(it.date, [...(groups.get(it.date) ?? []), it])
  const out: DateCandidate[] = []
  for (const [date, group] of groups) {
    const sorted = [...group].sort(
      (a, b) =>
        Number(covers(b, aoiPoints)) - Number(covers(a, aoiPoints)) ||
        (a.nodataPct ?? 100) - (b.nodataPct ?? 100) ||
        (a.cloudCover ?? 100) - (b.cloudCover ?? 100) ||
        a.id.localeCompare(b.id),
    )
    out.push({ date, item: sorted[0]!, alternates: sorted.slice(1), coversAoi: covers(sorted[0]!, aoiPoints) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
```

`src/stac/pc.ts`:
```ts
import { config } from '../config.ts'
import type { S2Item } from './types.ts'

let token: { value: string; expiresAt: number } | null = null

export async function signPcHref(href: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!token || token.expiresAt - Date.now() < 60_000) {
    const res = await fetchImpl(config.pcSasUrl)
    if (!res.ok) throw new Error(`PC_SAS_${res.status}`)
    const j = (await res.json()) as { token: string; 'msft:expiry': string }
    token = { value: j.token, expiresAt: Date.parse(j['msft:expiry']) }
  }
  return `${href}${href.includes('?') ? '&' : '?'}${token.value}`
}

/** Planetary Computer assets need a short-lived SAS token; Earth Search assets are public. Provenance keeps the unsigned href. */
export async function resolveItemHrefs(item: S2Item): Promise<S2Item> {
  if (item.collection !== 'pc:sentinel-2-l2a') return item
  return {
    ...item,
    visual: { ...item.visual, href: await signPcHref(item.visual.href) },
    scl: { ...item.scl, href: await signPcHref(item.scl.href) },
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/stac`
Expected: PASS (parse 3, search 5, select 3).

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/stac
git commit -m "feat(stac): Earth Search client with paging cap, retry, PC fallback and per-date selection

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A10: Imagery worker, client and byte cache

**Files:**
- Create: `src/lib/idb.ts`, `src/lib/byte-cache.ts`, `src/workers/imagery-core.ts`, `src/workers/imagery.worker.ts`, `src/workers/imagery-client.ts`
- Test: `src/workers/imagery-core.test.ts`, `src/workers/imagery-client.test.ts`

**Interfaces:**
- Consumes: `src/evidence/index.ts` (A3–A8), `S2Item` and `resolveItemHrefs` (A9).
- Produces:
  - `interface ByteCache { get(key: string): Promise<Uint8Array | undefined>; put(key: string, v: Uint8Array): Promise<void> }`
  - `interface CoreDeps { openCog(href: string, signal?: AbortSignal): Promise<Cog>; cache?: ByteCache }`
  - `interface QualityRequest { item: S2Item; aoi: AoiGeometry; grid?: DisplayGrid }`
  - `interface QualityResult { window: Window; level: 0; sha256: string; stats: QualityStats; parts: Array<{ idx: number; fromM: number; toM: number; stats: QualityStats }>; invalid?: Uint8Array }`
  - `interface FrameRequest { item: S2Item; level: 0 | 1; aoi: AoiGeometry; grid: DisplayGrid }`
  - `interface FrameResult { window: Window; level: 0 | 1; sha256: string; native: { width: number; height: number; rgb: Uint8Array }; display: { width: number; height: number; rgba: Uint8ClampedArray } }`
  - `runQuality(deps, req, signal?)`, `runFrame(deps, req, signal?)`
  - `interface ImageryClient { quality(req, signal?): Promise<QualityResult>; frame(req, signal?): Promise<FrameResult>; dispose(): void }`
  - `createImageryClient(make?: () => WorkerLike): ImageryClient`
  - IndexedDB helpers: `openDb`, `idbGet`, `idbPut`, `idbDelete`, `idbAll`, `idbCount`, `idbClear`

- [ ] **Step 1: Write the failing tests**

`src/workers/imagery-core.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCogCache, runFrame, runQuality, type CoreDeps } from './imagery-core.ts'
import { makeDisplayGrid, openCogBuffer, sha256Hex, type Cog } from '../evidence/index.ts'
import { parseItem } from '../stac/parse.ts'
import { FIXTURE_DATES, FIXTURE_ROAD, NAGPUR_SQUARE, fixtureItem, makeScl, makeTci, toArrayBuffer } from '../../tests/fixtures/scene.ts'

const BASE = 'http://127.0.0.1:9'
const files = new Map<string, Uint8Array>()
for (const d of FIXTURE_DATES) {
  files.set(`${BASE}/cog/${d.date}/TCI.tif`, makeTci(d.roof))
  files.set(`${BASE}/cog/${d.date}/SCL.tif`, makeScl(d.scl))
}
const opened: string[] = []
const deps = (): CoreDeps => ({
  openCog: async (href) => { opened.push(href); return openCogBuffer(toArrayBuffer(files.get(href)!)) },
})
const item = (date: string) => parseItem(fixtureItem(BASE, FIXTURE_DATES.find((d) => d.date === date)!), 'sentinel-2-l2a')!
const SITE = { kind: 'site' as const, rings: [NAGPUR_SQUARE] }
const ROAD = { kind: 'road' as const, line: FIXTURE_ROAD, widthM: 30 }
const GRID = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
beforeEach(() => clearCogCache())

describe('runQuality', () => {
  it('labels the fixture dates', async () => {
    const d = deps()
    expect((await runQuality(d, { item: item('2025-01-10'), aoi: SITE })).stats.label).toBe('CLEAR')
    const partial = await runQuality(d, { item: item('2025-03-05'), aoi: SITE })
    expect(partial.stats.label).toBe('PARTIAL')
    expect(partial.stats.validFraction).toBeGreaterThan(0.47)
    expect(partial.stats.validFraction).toBeLessThan(0.54)
    expect((await runQuality(d, { item: item('2025-06-15'), aoi: SITE })).stats.label).toBe('OBSCURED')
  })
  it('returns the SCL window, its hash and per-part stats for roads', async () => {
    const q = await runQuality(deps(), { item: item('2025-12-20'), aoi: ROAD, grid: GRID })
    expect(q.parts.map((p) => [p.fromM, Math.round(p.toM)])).toEqual([[0, 2000], [2000, 2904]])
    expect(q.parts.every((p) => p.stats.label === 'CLEAR')).toBe(true)
    expect(q.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(q.invalid?.length).toBe(GRID.width * GRID.height)
  })
  it('reports NOT_COVERED when the AOI is outside the scene', async () => {
    const far = { kind: 'site' as const, rings: [NAGPUR_SQUARE.map(([x, y]) => [x + 1, y] as [number, number])] }
    expect((await runQuality(deps(), { item: item('2025-01-10'), aoi: far })).stats.label).toBe('NOT_COVERED')
  })
})

describe('runFrame', () => {
  it('reads the 10 m window, hashes raw bytes and reprojects onto the grid', async () => {
    const f = await runFrame(deps(), { item: item('2025-12-20'), level: 0, aoi: SITE, grid: GRID })
    expect(f.window).toEqual([92, 94, 203, 211])
    expect([f.native.width, f.native.height]).toEqual([111, 117])
    expect(f.sha256).toBe(await sha256Hex(f.native.rgb))
    expect(f.display.rgba.length).toBe(GRID.width * GRID.height * 4)
  })
  it('reads level 1 at half resolution', async () => {
    const f = await runFrame(deps(), { item: item('2025-12-20'), level: 1, aoi: SITE, grid: GRID })
    expect(f.window).toEqual([45, 46, 103, 107])
  })
  it('uses the byte cache on repeat reads', async () => {
    const store = new Map<string, Uint8Array>()
    const reads = vi.fn()
    const d: CoreDeps = {
      openCog: async (href) => {
        const cog = await openCogBuffer(toArrayBuffer(files.get(href)!))
        return { sizes: cog.sizes, read: (...a: Parameters<Cog['read']>) => { reads(); return cog.read(...a) } }
      },
      cache: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v) } },
    }
    const a = await runFrame(d, { item: item('2025-01-10'), level: 0, aoi: SITE, grid: GRID })
    const b = await runFrame(d, { item: item('2025-01-10'), level: 0, aoi: SITE, grid: GRID })
    expect(b.sha256).toBe(a.sha256)
    expect(reads).toHaveBeenCalledTimes(1)
  })
  it('rejects with AbortError when aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(runFrame(deps(), { item: item('2025-01-10'), level: 0, aoi: SITE, grid: GRID }, ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
```

`src/workers/imagery-client.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createImageryClient, type WorkerLike } from './imagery-client.ts'

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null
  sent: any[] = []
  postMessage(msg: any) {
    this.sent.push(msg)
    if (msg.op === 'quality') queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, ok: true, result: { echo: msg.req.item.id } } } as MessageEvent))
  }
  terminate() {}
}
const req = { item: { id: 'X', collection: 'sentinel-2-l2a' }, aoi: { kind: 'site', rings: [] } } as any

describe('imagery client', () => {
  it('correlates responses by id', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    expect(await c.quality(req)).toEqual({ echo: 'X' })
  })
  it('cancels on abort and rejects with AbortError', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    const ac = new AbortController()
    const p = c.frame({ ...req, level: 0, grid: {} }, ac.signal)
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    expect(w.sent.some((m) => m.op === 'cancel')).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/workers`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/lib/idb.ts` and `src/lib/byte-cache.ts`**

`src/lib/idb.ts`:
```ts
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

export function openDb(name: string, stores: string[], version = 1): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, version)
    r.onupgradeneeded = () => { for (const s of stores) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s) }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const store = (db: IDBDatabase, name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name)
export const idbGet = <T>(db: IDBDatabase, s: string, key: string) => req(store(db, s, 'readonly').get(key)) as Promise<T | undefined>
export const idbPut = (db: IDBDatabase, s: string, key: string, value: unknown) => req(store(db, s, 'readwrite').put(value, key)).then(() => undefined)
export const idbDelete = (db: IDBDatabase, s: string, key: string) => req(store(db, s, 'readwrite').delete(key)).then(() => undefined)
export const idbAll = <T>(db: IDBDatabase, s: string) => req(store(db, s, 'readonly').getAll()) as Promise<T[]>
export const idbCount = (db: IDBDatabase, s: string) => req(store(db, s, 'readonly').count())
export const idbClear = (db: IDBDatabase, s: string) => req(store(db, s, 'readwrite').clear()).then(() => undefined)
```

`src/lib/byte-cache.ts`:
```ts
import { idbClear, idbCount, idbGet, idbPut, openDb } from './idb.ts'

export interface ByteCache {
  get(key: string): Promise<Uint8Array | undefined>
  put(key: string, v: Uint8Array): Promise<void>
}

/** Best-effort IndexedDB cache of decoded windows. Failures never break imagery. */
export function idbByteCache(name = 'gs-bytes', max = 300): ByteCache {
  const dbp = openDb(name, ['bytes'])
  let count = -1
  return {
    async get(key) {
      try { return await idbGet<Uint8Array>(await dbp, 'bytes', key) } catch { return undefined }
    },
    async put(key, v) {
      try {
        const db = await dbp
        if (count < 0) count = await idbCount(db, 'bytes')
        // ponytail: whole-store reset at `max` entries; replace with LRU if users report re-download churn
        if (count >= max) { await idbClear(db, 'bytes'); count = 0 }
        await idbPut(db, 'bytes', key, v)
        count++
      } catch { /* cache is optional */ }
    },
  }
}
```

- [ ] **Step 4: Implement `src/workers/imagery-core.ts`**

```ts
import {
  aoiPixelWindow, aoiPointsUtm, countMask, isClearClass, levelInfoFor, partsOf, rasterizeAoi, reprojectToGrid, sclStats, sha256Hex, windowSize,
  type AoiGeometry, type Cog, type DisplayGrid, type QualityStats, type Window,
} from '../evidence/index.ts'
import type { ByteCache } from '../lib/byte-cache.ts'
import type { S2Item } from '../stac/types.ts'

export interface CoreDeps { openCog(href: string, signal?: AbortSignal): Promise<Cog>; cache?: ByteCache }
export interface QualityRequest { item: S2Item; aoi: AoiGeometry; grid?: DisplayGrid }
export interface QualityResult {
  window: Window
  level: 0
  sha256: string
  stats: QualityStats
  parts: Array<{ idx: number; fromM: number; toM: number; stats: QualityStats }>
  invalid?: Uint8Array
}
export interface FrameRequest { item: S2Item; level: 0 | 1; aoi: AoiGeometry; grid: DisplayGrid }
export interface FrameResult {
  window: Window
  level: 0 | 1
  sha256: string
  native: { width: number; height: number; rgb: Uint8Array }
  display: { width: number; height: number; rgba: Uint8ClampedArray }
}

const SUB = 2
const cogs = new Map<string, Promise<Cog>>()

/** Test hook: the opened-COG cache is module-level. */
export function clearCogCache() {
  cogs.clear()
}

function getCog(deps: CoreDeps, href: string, signal?: AbortSignal): Promise<Cog> {
  let p = cogs.get(href)
  if (!p) {
    p = deps.openCog(href, signal)
    p.catch(() => cogs.delete(href))
    cogs.set(href, p)
    if (cogs.size > 12) cogs.delete(cogs.keys().next().value!)
  }
  return p
}

async function readCached(deps: CoreDeps, cog: Cog, href: string, level: number, win: Window, samples: number[], signal?: AbortSignal) {
  const key = `${href}|${level}|${win.join(',')}|${samples.join('')}`
  const hit = await deps.cache?.get(key)
  if (hit) return hit
  const bytes = await cog.read(level, win, samples, signal)
  await deps.cache?.put(key, bytes)
  return bytes
}

const EMPTY_STATS: QualityStats = { policy: 'scl-v2', counts: new Array(12).fill(0), total: 0, clearFraction: 0, validFraction: 0, uncertainFraction: 0, obstructedFraction: 0, nodataFraction: 0, label: 'NOT_COVERED' }

export async function runQuality(deps: CoreDeps, req: QualityRequest, signal?: AbortSignal): Promise<QualityResult> {
  signal?.throwIfAborted()
  // Openers are shared through the cache, so the first caller's abort must not poison later readers: no signal here.
  const cog = await getCog(deps, req.item.scl.href)
  const lvl = levelInfoFor(req.item.scl, cog, 0)
  const wins = aoiPixelWindow(aoiPointsUtm(req.aoi, req.item.epsg), lvl, 2)
  const parts = partsOf(req.aoi)
  if (!wins) {
    return { window: [0, 0, 0, 0], level: 0, sha256: await sha256Hex(new Uint8Array()), stats: EMPTY_STATS, parts: parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM, stats: EMPTY_STATS })) }
  }
  const bytes = await readCached(deps, cog, req.item.scl.href, 0, wins.clamped, [0], signal)
  signal?.throwIfAborted()
  const { width, height } = windowSize(wins.clamped)
  const statsFor = (g: AoiGeometry) => {
    const mask = rasterizeAoi(g, req.item.epsg, wins.clamped, lvl, SUB)
    const outside = countMask(rasterizeAoi(g, req.item.epsg, wins.full, lvl, SUB)) - countMask(mask)
    return sclStats(bytes, width, height, mask, SUB, Math.max(0, outside))
  }
  const stats = statsFor(req.aoi)
  let invalid: Uint8Array | undefined
  if (req.grid) {
    const cls = reprojectToGrid({ data: bytes, width, height, samples: 1, win: wins.clamped, lvl, epsg: req.item.epsg, nodataZero: false }, req.grid, 'nearest')
    invalid = new Uint8Array(req.grid.width * req.grid.height)
    for (let i = 0; i < invalid.length; i++) invalid[i] = cls[i * 4 + 3] === 0 || !isClearClass(cls[i * 4]!) ? 1 : 0
  }
  return {
    window: wins.clamped,
    level: 0,
    sha256: await sha256Hex(bytes),
    stats,
    parts: req.aoi.kind === 'road' ? parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM, stats: statsFor(p.geometry) })) : [{ idx: 0, fromM: 0, toM: 0, stats }],
    invalid,
  }
}

export async function runFrame(deps: CoreDeps, req: FrameRequest, signal?: AbortSignal): Promise<FrameResult> {
  signal?.throwIfAborted()
  const cog = await getCog(deps, req.item.visual.href)
  const lvl = levelInfoFor(req.item.visual, cog, req.level)
  const wins = aoiPixelWindow(aoiPointsUtm(req.aoi, req.item.epsg), lvl, 2)
  if (!wins) throw new Error('AOI_OUTSIDE_SCENE')
  const bytes = await readCached(deps, cog, req.item.visual.href, req.level, wins.clamped, [0, 1, 2], signal)
  signal?.throwIfAborted()
  const { width, height } = windowSize(wins.clamped)
  const rgba = reprojectToGrid({ data: bytes, width, height, samples: 3, win: wins.clamped, lvl, epsg: req.item.epsg, nodataZero: true }, req.grid, 'bilinear')
  return {
    window: wins.clamped,
    level: req.level,
    sha256: await sha256Hex(bytes),
    native: { width, height, rgb: bytes },
    display: { width: req.grid.width, height: req.grid.height, rgba },
  }
}
```

- [ ] **Step 5: Implement `src/workers/imagery.worker.ts` and `src/workers/imagery-client.ts`**

`src/workers/imagery.worker.ts`:
```ts
import { openCogUrl } from '../evidence/cog.ts'
import { idbByteCache } from '../lib/byte-cache.ts'
import { runFrame, runQuality, type CoreDeps, type FrameResult, type QualityResult } from './imagery-core.ts'
import type { WorkerRequest } from './imagery-client.ts'

const ctx = self as unknown as Worker
const deps: CoreDeps = { openCog: openCogUrl, cache: idbByteCache() }
const controllers = new Map<number, AbortController>()

const transferables = (r: QualityResult | FrameResult): Transferable[] =>
  'native' in r ? [r.native.rgb.buffer as ArrayBuffer, r.display.rgba.buffer as ArrayBuffer] : r.invalid ? [r.invalid.buffer as ArrayBuffer] : []

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.op === 'cancel') {
    controllers.get(msg.target)?.abort()
    return
  }
  const ac = new AbortController()
  controllers.set(msg.id, ac)
  try {
    const result = msg.op === 'quality' ? await runQuality(deps, msg.req, ac.signal) : await runFrame(deps, msg.req, ac.signal)
    if (!ac.signal.aborted) ctx.postMessage({ id: msg.id, ok: true, result }, transferables(result))
  } catch (err) {
    const e2 = err as Error
    if (!ac.signal.aborted) ctx.postMessage({ id: msg.id, ok: false, error: { name: e2.name, message: e2.message } })
  } finally {
    controllers.delete(msg.id)
  }
}
```

`src/workers/imagery-client.ts`:
```ts
import { resolveItemHrefs } from '../stac/pc.ts'
import type { FrameRequest, FrameResult, QualityRequest, QualityResult } from './imagery-core.ts'

export type WorkerRequest =
  | { id: number; op: 'quality'; req: QualityRequest }
  | { id: number; op: 'frame'; req: FrameRequest }
  | { id: number; op: 'cancel'; target: number }

export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage(msg: unknown): void
  terminate(): void
}

export interface ImageryClient {
  quality(req: QualityRequest, signal?: AbortSignal): Promise<QualityResult>
  frame(req: FrameRequest, signal?: AbortSignal): Promise<FrameResult>
  dispose(): void
}

const abortError = () => new DOMException('Aborted', 'AbortError')

export function createImageryClient(
  make: () => WorkerLike = () => new Worker(new URL('./imagery.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
): ImageryClient {
  const worker = make()
  let nextId = 1
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: unknown): void }>()
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data as { id: number; ok: boolean; result?: unknown; error?: { name: string; message: string } }
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve(result)
    else p.reject(Object.assign(new Error(error?.message ?? 'IMAGERY_ERROR'), { name: error?.name ?? 'Error' }))
  }
  function call<T>(op: 'quality' | 'frame', req: QualityRequest | FrameRequest, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError())
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      signal?.addEventListener('abort', () => {
        if (!pending.has(id)) return
        pending.delete(id)
        worker.postMessage({ id: 0, op: 'cancel', target: id })
        reject(abortError())
      }, { once: true })
      resolveItemHrefs(req.item)
        .then((item) => { if (pending.has(id)) worker.postMessage({ id, op, req: { ...req, item } }) })
        .catch((e) => { pending.delete(id); reject(e) })
    })
  }
  return {
    quality: (req, signal) => call<QualityResult>('quality', req, signal),
    frame: (req, signal) => call<FrameResult>('frame', req, signal),
    dispose: () => {
      worker.terminate()
      for (const p of pending.values()) p.reject(abortError())
      pending.clear()
    },
  }
}
```

- [ ] **Step 6: Run the tests and the full gate**

Run: `npx vitest run src/workers && npm run check`
Expected: PASS (core 7, client 2), typecheck and build green. The build must emit a separate `imagery.worker-*.js` chunk; check with `ls dist/assets | grep worker`.

- [ ] **Step 7: Commit**

```bash
git add src/lib src/workers
git commit -m "feat(imagery): worker with cloud-check and frame ops, abortable client, IndexedDB byte cache

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task A11: Live probes P1 and P2 (real COGs, three browsers, Node and Deno)

**Files:**
- Create: `scripts/probe-cog.ts`, `dev/probe.html`, `dev/probe.ts`, `playwright.config.ts`, `tests/live/determinism.spec.ts`
- Modify: `package.json` (scripts `probe`, `e2e`, `e2e:live`), `docs/ops/probes.md` (P1, P2 rows)

**Interfaces:**
- Consumes: `src/evidence/index.ts`.
- Produces:
  - `npm run probe [itemId]`: Node (via tsx) prints `{"item","date","sclWindow","sclSha","visualWindow","visualSha","ms"}`. With no argument it picks the clearest Jan–May 2026 scene; the known-good item is `S2B_44QLJ_20260512_0_L2A`.
  - `npx deno run -A scripts/probe-cog.ts`: the same, under Deno.
  - Playwright config with projects `chromium`, `firefox`, `webkit` (reused by Phases B and C).

- [ ] **Step 1: Write `scripts/probe-cog.ts` (Node and Deno compatible)**

```ts
import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogUrl, sha256Hex } from '../src/evidence/index.ts'
import type { LonLat } from '../src/evidence/types.ts'

const SQUARE: LonLat[] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]
const itemId = (globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? (globalThis as { Deno?: { args: string[] } }).Deno?.args[0]

async function pickItem(): Promise<any> {
  if (itemId) {
    const r = await fetch(`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${itemId}`)
    return r.json()
  }
  const r = await fetch('https://earth-search.aws.element84.com/v1/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: [79.0, 21.1, 79.1, 21.2], datetime: '2026-01-01T00:00:00Z/2026-05-31T23:59:59Z', limit: 50, sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }] }),
  })
  return (await r.json()).features[0]
}

const t0 = Date.now()
const it = await pickItem()
const epsg = it.properties['proj:epsg'] as number
const aoi = { kind: 'site' as const, rings: [SQUARE] }
const out: Record<string, unknown> = { item: it.id, date: it.properties.datetime }
for (const [key, samples] of [['scl', [0]], ['visual', [0, 1, 2]]] as const) {
  const asset = { transform: it.assets[key]['proj:transform'], shape: it.assets[key]['proj:shape'] }
  const cog = await openCogUrl(it.assets[key].href)
  const lvl = levelInfoFor(asset, cog, 0)
  const win = aoiPixelWindow(aoiPointsUtm(aoi, epsg), lvl, 2)!.clamped
  const bytes = await cog.read(0, win, [...samples])
  out[`${key}Window`] = win
  out[`${key}Sha`] = await sha256Hex(bytes)
}
out.ms = Date.now() - t0
console.log(JSON.stringify(out))
```

- [ ] **Step 2: Write the browser probe page `dev/probe.html` and `dev/probe.ts`**

`dev/probe.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8" /><title>probe</title></head>
<body><pre id="out">running</pre><script type="module" src="./probe.ts"></script></body></html>
```

`dev/probe.ts`:
```ts
import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogUrl, sha256Hex } from '../src/evidence/index.ts'
import type { LonLat } from '../src/evidence/types.ts'

const SQUARE: LonLat[] = [[79.0832, 21.1408], [79.0932, 21.1408], [79.0932, 21.1508], [79.0832, 21.1508], [79.0832, 21.1408]]
const id = new URLSearchParams(location.search).get('item')!
const el = document.getElementById('out')!
try {
  const it = await (await fetch(`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${id}`)).json()
  const out: Record<string, unknown> = { item: it.id }
  for (const [key, samples] of [['scl', [0]], ['visual', [0, 1, 2]]] as const) {
    const asset = { transform: it.assets[key]['proj:transform'], shape: it.assets[key]['proj:shape'] }
    const cog = await openCogUrl(it.assets[key].href)
    const lvl = levelInfoFor(asset, cog, 0)
    const win = aoiPixelWindow(aoiPointsUtm({ kind: 'site', rings: [SQUARE] }, it.properties['proj:epsg']), lvl, 2)!.clamped
    out[`${key}Window`] = win
    out[`${key}Sha`] = await sha256Hex(await cog.read(0, win, [...samples]))
  }
  el.textContent = JSON.stringify(out)
} catch (e) {
  el.textContent = `ERROR ${(e as Error).message}`
}
```

- [ ] **Step 3: Write `playwright.config.ts` and `tests/live/determinism.spec.ts`; add scripts**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

const live = process.env.LIVE === '1'

export default defineConfig({
  testDir: 'tests',
  testMatch: live ? ['live/**/*.spec.ts'] : ['e2e/**/*.spec.ts'],
  timeout: live ? 120_000 : 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
})
```

`tests/live/determinism.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

// Known-good vector, verified during planning (2026-10-05) in Node twice and Deno 2.9.6 once: identical windows and hashes.
const KNOWN = {
  item: 'S2B_44QLJ_20260512_0_L2A',
  sclWindow: [45, 2996, 103, 3057],
  sclSha: '0a0d8e8379002c01009e064e77b9cd3eac113039738eafbb332c98b9d15c385a',
  visualWindow: [92, 5994, 203, 6111],
  visualSha: 'df3bb3c2ad37aa84ebe93da6fadf485b682be0cc4a2855e7774c63d290826631',
}
const node = JSON.parse(execFileSync('npx', ['tsx', 'scripts/probe-cog.ts', KNOWN.item], { encoding: 'utf8' }).trim().split('\n').pop()!)

test('Node reproduces the planning-time vector (catches upstream file rewrites)', () => {
  expect(node).toMatchObject(KNOWN)
})

test('browser hashes equal the Node hashes for the same windows (P1 + P2)', async ({ page }) => {
  await page.goto(`/dev/probe.html?item=${node.item}`)
  await expect(page.locator('#out')).not.toHaveText('running', { timeout: 90_000 })
  const out = JSON.parse((await page.locator('#out').textContent())!)
  expect(out.sclWindow).toEqual(node.sclWindow)
  expect(out.visualSha).toBe(node.visualSha)
  expect(out.sclSha).toBe(node.sclSha)
})
```

Add to `package.json` scripts:
```json
"probe": "tsx scripts/probe-cog.ts",
"e2e": "playwright test",
"e2e:live": "LIVE=1 playwright test"
```

- [ ] **Step 4: Install browsers and run the live probes**

```bash
npx playwright install chromium firefox webkit
npm run probe
npx deno run -A scripts/probe-cog.ts S2B_44QLJ_20260512_0_L2A
npm run e2e:live
```
Expected:
- `npm run probe` prints JSON with two 64-hex hashes.
- The Deno run prints identical `sclSha` and `visualSha` for the same item.
- `npm run e2e:live` passes in chromium, firefox and webkit.

If Deno cannot resolve `geotiff`/`proj4`, re-run it with `--node-modules-dir=manual` (it reads the existing `node_modules`).

If `webkit` or `firefox` fail only because system libraries are missing (`npx playwright install-deps` needs sudo), record "not runnable on this VM" for that browser. Do not mark P2 PASS for it.

- [ ] **Step 5: Record P1/P2 results in `docs/ops/probes.md`**

Fill each row with the item id, the hashes, the per-browser PASS/FAIL and the `ms` timing from Node. Decisions:
- P1 PASS: keep Earth Search + AWS.
- P1 FAIL in a browser: switch that path to Planetary Computer assets and re-test.
- P2 mismatch in any runtime: client hashes become advisory and the server hash is authoritative (spec §14 fallback). Note it for Phase D.

- [ ] **Step 6: Commit**

```bash
git add scripts dev playwright.config.ts tests/live package.json docs/ops/probes.md
git commit -m "test: live probes P1/P2 for browser COG reads and cross-runtime hash determinism

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase A exit criteria

- `npm run check` is green, with every unit test passing.
- `docs/ops/probes.md` records P7, P1 and P2 with real numbers.
- `src/evidence/` has no imports from `src/geo`, `src/stac`, `src/config`, React or the DOM. Check with: `grep -rnE "from '\.\./(geo|stac|config)|react|document\.|window\." src/evidence | grep -v test` returns nothing.
- Main-thread code (Phases B and C) imports specific evidence modules (for example `../evidence/display.ts`), never `../evidence/index.ts`. The index re-exports `cog.ts`, which would pull geotiff into the main bundle; only workers, scripts and the Deno function may import the index.
