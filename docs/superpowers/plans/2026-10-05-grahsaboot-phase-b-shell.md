# GrahSaboot Phase B: Design System, Shell, Globe, Search and Live Satellites

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A black-first app shell with the fused design system, a persistent MapLibre globe that degrades by device tier, place search, and live Sentinel-2/Landsat positions with an estimated next pass over the searched place.

**Architecture:** `MapStageProvider` owns one MapLibre map for the whole session; screens set a layout (`globe`, `side`, `mini`, `hidden`) and register idempotent layer installers that re-run on every style load (theme switch). The device tier (T0 static … T3 city) is chosen once at load and only downgrades. Satellite maths runs in a Web Worker from CelesTrak data served by a cached Cloudflare Worker route. All user-visible text lives in `src/ui/copy.ts`.

**Tech Stack:** @types/geojson 7946.0.16 (explicit `import type { FeatureCollection } from 'geojson'`; never the global `GeoJSON` namespace, which strict `types` excludes), React 19.3, Tailwind 4.3 (`@theme` + `[data-theme]`), @base-ui/react 1.8 (Drawer, Toast), motion 14, @phosphor-icons/react 2.1.10 (unsuffixed names: `Moon`, `Sun`, `MagnifyingGlass`, `X`, `Planet`, …), maplibre-gl 6.12 (named exports, explicit `setWorkerUrl`), satellite.js 7.1, Playwright 1.63 + @axe-core/playwright 4.13.0, wrangler 4.147.

**Spec:** `docs/superpowers/specs/2026-10-05-grahsaboot-design.md`: §7.2 globe, §7.3 satellites, §7.4 screens, §7.5 design system, §7.6 tiers, §7.7 accessibility, §8.4 Cloudflare Worker, §14 probe P8. Execution rules: `docs/superpowers/plans/2026-10-05-grahsaboot-plan.md`.

## Global Constraints

- Default `data-theme="dark"`. Light is a persisted toggle (`localStorage['gs-theme']`). Both themes use exactly these tokens:

  | Token | Dark | Light |
  |---|---|---|
  | bg | `#09090b` | `#ffffff` |
  | panel | `#18181b` | `#fafafa` |
  | line | `#27272a` | `#e4e4e7` |
  | control | `#71717a` | `#71717a` |
  | fg | `#f4f4f5` | `#18181b` |
  | fg-2 | `#a1a1aa` | `#52525b` |
  | fg-3 | `#a1a1aa` | `#71717a` |
  | accent | `#e48444` | `#a74e1b` |
  | on-accent | `#09090b` | `#ffffff` |
  | bad | `#f87171` | `#b91c1c` |
  | ok | `#4ade80` | `#15803d` |
  | warn | `#facc15` | `#a16207` |
  | info | `#7dd3fc` | `#0369a1` |

- Fonts: Geist Variable + Geist Mono Variable only. No serif anywhere.
- Radius:

  | Radius | Applies to |
  |---|---|
  | 0 | data surfaces (map, evidence, grids) |
  | 6 px | controls |
  | 12 px | floating panels (`.glass`) |

- Glass: `rgb(panel / 0.92)` + 1 px `white/10` border + inset highlight. Blur only at T2/T3. Solid under `prefers-reduced-transparency`.
- Motion: only `transform`/`opacity`. Press = `scale(0.98)`. Reduced motion means no auto-rotate and `duration: 0` camera moves. No magnetic buttons, custom cursors or infinite loops except the LIVE dot and skeletons.
- Touch targets: ≥ 44 px (`h-11`). Labels above inputs. Every icon has a text label or an `aria-label`.
- MapLibre:
  - Import named exports from `maplibre-gl`. Set the worker with `setWorkerUrl(workerUrl)` from `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`.
  - Custom ids are prefixed `gs-`. Installers must be idempotent: check `getSource`/`getLayer` before adding.
- Main-thread code never imports `src/evidence/index.ts` (it would bundle geotiff). Import specific evidence files.
- Test hooks: in `config.testMode`, `?tier=0..3` forces a tier and `window.__gs.map` exposes the map. Production uses only the "Switch to full" override in `localStorage['gs-tier-override']`.
- Nominatim:
  - Search on submit only (never per keystroke).
  - At most 1 request per second, with results cached.
  - Attribution text shown.
- CelesTrak: one upstream request per 2 hours (edge-cached). Satellites: Sentinel-2A 40697, Sentinel-2B 42063, Sentinel-2C 60989, Landsat 8 39084, Landsat 9 49260.

## Review Focus

1. **No WebGL2 or a software renderer.** The app must still offer search and "Start an investigation" with a plain notice (tests in B4).
2. **Theme switch mid-session** must keep custom map layers (satellite tracks) because installers re-run on `style.load` (test in B7).
3. **Nominatim etiquette.** Repeated or rapid searches must not exceed 1 request per second, and must hit the cache for repeats (test in B5).
4. **CelesTrak outage.** The edge route serves stale data or a 503, and the panel shows a calm "unavailable" state without breaking the globe (tests in B6 and B7).
5. **Antimeridian.** Ground tracks crossing ±180° stay continuous (no line across the globe), and swaths close properly (test in B7).

---

### Task B1: Design tokens, fonts, theme switching and a contrast lock

**Files:**
- Modify: `src/styles.css`
- Create: `src/ui/theme.ts`, `src/ui/contrast.ts`
- Test: `src/ui/contrast.test.ts`

**Interfaces:**
- Produces:
  - Tailwind colour utilities `bg-bg`, `bg-panel`, `border-line`, `border-control`, `text-fg`, `text-fg-2`, `text-fg-3`, `text-accent`, `bg-accent`, `text-on-accent`, `text-bad`, `text-ok`, `text-warn`, `text-info`; classes `.glass`, `.num`, `.no-print`.
  - `type Theme = 'dark' | 'light'`; `currentTheme(): Theme`; `applyTheme(t: Theme): void`; `useTheme(): [Theme, (t: Theme) => void]`.
  - `contrastRatio(a: string, b: string): number`; `readThemeTokens(css: string): Record<'dark' | 'light', Record<string, string>>`.

- [ ] **Step 1: Write the failing test `src/ui/contrast.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, readThemeTokens } from './contrast.ts'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const tokens = readThemeTokens(css)

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#f4f4f5', '#09090b')).toBeCloseTo(18.1, 1)
  })
})

describe.each(['dark', 'light'] as const)('%s theme tokens', (theme) => {
  const t = tokens[theme]
  it('defines every token', () => {
    for (const k of ['bg', 'panel', 'line', 'control', 'fg', 'fg-2', 'fg-3', 'accent', 'on-accent', 'bad', 'ok', 'warn', 'info']) expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it.each([
    ['fg', 'bg', 4.5], ['fg', 'panel', 4.5], ['fg-2', 'bg', 4.5], ['fg-2', 'panel', 4.5], ['fg-3', 'bg', 4.5], ['fg-3', 'panel', 4.5],
    ['accent', 'bg', 4.5], ['accent', 'panel', 4.5], ['on-accent', 'accent', 4.5],
    ['bad', 'bg', 4.5], ['ok', 'bg', 4.5], ['warn', 'bg', 4.5], ['info', 'bg', 4.5],
    ['control', 'bg', 3], ['control', 'panel', 3],
  ] as const)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrastRatio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/contrast.test.ts`
Expected: FAIL, `./contrast.ts` not found.

- [ ] **Step 3: Replace `src/styles.css`**

```css
@import 'tailwindcss' source('../src');
@import '@fontsource-variable/geist';
@import '@fontsource-variable/geist-mono';

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

@theme {
  --font-sans: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono Variable', ui-monospace, monospace;
  --color-bg: var(--gs-bg);
  --color-panel: var(--gs-panel);
  --color-line: var(--gs-line);
  --color-control: var(--gs-control);
  --color-fg: var(--gs-fg);
  --color-fg-2: var(--gs-fg-2);
  --color-fg-3: var(--gs-fg-3);
  --color-accent: var(--gs-accent);
  --color-on-accent: var(--gs-on-accent);
  --color-bad: var(--gs-bad);
  --color-ok: var(--gs-ok);
  --color-warn: var(--gs-warn);
  --color-info: var(--gs-info);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

:root,
[data-theme='dark'] {
  --gs-bg: #09090b;
  --gs-panel: #18181b;
  --gs-line: #27272a;
  --gs-control: #71717a;
  --gs-fg: #f4f4f5;
  --gs-fg-2: #a1a1aa;
  --gs-fg-3: #a1a1aa;
  --gs-accent: #e48444;
  --gs-on-accent: #09090b;
  --gs-bad: #f87171;
  --gs-ok: #4ade80;
  --gs-warn: #facc15;
  --gs-info: #7dd3fc;
  --gs-glass: rgb(24 24 27 / 0.92);
  color-scheme: dark;
}

[data-theme='light'] {
  --gs-bg: #ffffff;
  --gs-panel: #fafafa;
  --gs-line: #e4e4e7;
  --gs-control: #71717a;
  --gs-fg: #18181b;
  --gs-fg-2: #52525b;
  --gs-fg-3: #71717a;
  --gs-accent: #a74e1b;
  --gs-on-accent: #ffffff;
  --gs-bad: #b91c1c;
  --gs-ok: #15803d;
  --gs-warn: #a16207;
  --gs-info: #0369a1;
  --gs-glass: rgb(250 250 250 / 0.92);
  color-scheme: light;
}

@layer base {
  html {
    background: var(--gs-bg);
    color: var(--gs-fg);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  body {
    min-height: 100dvh;
    margin: 0;
  }
  :focus-visible {
    outline: 2px solid var(--gs-accent);
    outline-offset: 2px;
  }
  ::selection {
    background: var(--gs-accent);
    color: var(--gs-on-accent);
  }
}

.num {
  font-variant-numeric: tabular-nums;
}
.glass {
  background: var(--gs-glass);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
  border-radius: 12px;
}
[data-theme='light'] .glass {
  border-color: rgb(0 0 0 / 0.08);
}
.glass[data-blur='on'] {
  backdrop-filter: blur(12px);
}

@media (prefers-reduced-transparency: reduce) {
  .glass {
    background: var(--gs-panel);
    backdrop-filter: none !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
@media print {
  :root,
  [data-theme='dark'],
  [data-theme='light'] {
    --gs-bg: #ffffff;
    --gs-panel: #ffffff;
    --gs-line: #d4d4d8;
    --gs-fg: #000000;
    --gs-fg-2: #3f3f46;
    --gs-fg-3: #3f3f46;
    color-scheme: light;
  }
  .no-print {
    display: none !important;
  }
}
```

- [ ] **Step 4: Implement `src/ui/contrast.ts` and `src/ui/theme.ts`**

`src/ui/contrast.ts`:
```ts
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export function luminance(hex: string): number {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(n.slice(i, i + 2), 16) / 255))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

export function readThemeTokens(css: string): Record<'dark' | 'light', Record<string, string>> {
  const out = { dark: {}, light: {} } as Record<'dark' | 'light', Record<string, string>>
  for (const m of css.matchAll(/\[data-theme='(dark|light)'\]\s*\{([^}]*)\}/g)) {
    for (const v of m[2]!.matchAll(/--gs-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1] as 'dark' | 'light'][v[1]!] = v[2]!
  }
  return out
}
```

`src/ui/theme.ts`:
```ts
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'gs-theme'
const EVENT = 'gs-theme'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* private mode: theme still applies for this session */
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, currentTheme, () => 'dark' as Theme), applyTheme]
}
```

- [ ] **Step 5: Run the tests and the gate**

Run: `npx vitest run src/ui/contrast.test.ts && npm run check`
Expected: PASS (1 + 2 × 16 tests), build green.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/ui
git commit -m "feat(ui): black-first design tokens with light toggle, fonts and contrast lock

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B2: Copy, UI kit, sheet, toasts and the copy rule

**Files:**
- Create: `src/ui/copy.ts`, `src/ui/kit.tsx`, `src/ui/Sheet.tsx`, `src/ui/toast.tsx`, `src/ui/Wordmark.tsx`, `src/screens/KitScreen.tsx`
- Test: `src/ui/copy.test.ts`

**Interfaces:**
- Consumes: `QualityLabel` (`src/evidence/types.ts`), `IssueCode` and `Issue` (`src/geo/aoi.ts`).
- Produces:
  - `copy` (nested object; extended by later tasks only by adding keys).
  - `issueMessage(i: Issue): string`.
  - From `kit.tsx`: `Button` (props `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `size: 'md' | 'sm'`), `IconButton` (`label: string`), `TextField` (`label`, `help?`, `error?`), `Panel` (`title?`, `action?`, `glass?`), `MicroLabel`, `QualityGlyph` (`label`), `QualityTag` (`label`), `Skeleton` (`className`).
  - `Sheet` (`open`, `onOpenChange`, `title`, `children`).
  - `ToastProvider`, `useToast(): (title: string, description?: string) => void`.
  - `Wordmark`.
  - `KitScreen` (default export, dev only).

- [ ] **Step 1: Write the failing test `src/ui/copy.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy, issueMessage } from './copy.ts'

const SOURCE = readFileSync(new URL('./copy.ts', import.meta.url), 'utf8')
const BANNED = [/\bconstructed\b/i, /\bcomplete(d)?\b/i, /\bverified project\b/i, /\bfraud\b/i, /\babandon(ed)?\b/i, /%\s*complete/i, /\bconfidence\b/i]

describe('copy', () => {
  it('never uses verdict words (spec §2.2)', () => {
    for (const re of BANNED) expect(re.test(SOURCE), String(re)).toBe(false)
  })
  it('has a word and help line for every quality label', () => {
    for (const l of ['CLEAR', 'PARTIAL', 'OBSCURED', 'NOT_COVERED'] as const) {
      expect(copy.quality[l].word.length).toBeGreaterThan(2)
      expect(copy.quality[l].help.length).toBeGreaterThan(10)
    }
  })
  it('explains every AOI issue in plain words', () => {
    expect(issueMessage({ code: 'too_large', value: 12.345, limit: 9 })).toBe('This outline covers 12.3 km². The limit is 9 km².')
    expect(issueMessage({ code: 'bad_width' })).toContain('5 to 200 metres')
    for (const code of ['not_closed', 'too_few_points', 'too_many_vertices', 'self_intersects', 'too_wide', 'too_short', 'too_long', 'out_of_range'] as const) {
      expect(issueMessage({ code, value: 1, limit: 2 }).length).toBeGreaterThan(10)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/copy.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/ui/copy.ts`**

```ts
import type { Issue } from '../geo/aoi.ts'

const km = (v?: number) => (v ?? 0).toFixed(1)

export const copy = {
  app: {
    name: 'GrahSaboot',
    tagline: 'Satellite proof for any place.',
    promise: 'See what changed at a place, with dated satellite photos.',
  },
  common: { close: 'Close', skip: 'Skip to content', loading: 'Loading', retry: 'Try again', back: 'Back', next: 'Continue', cancel: 'Cancel', details: 'Details' },
  nav: {
    home: 'GrahSaboot home',
    newInvestigation: 'Start an investigation',
    startHere: 'Start an investigation here',
    example: 'Try a worked example: Nagpur',
    privacy: 'Privacy',
    limits: 'Limits',
    themeToggle: 'Switch theme',
  },
  footer: { disclaimer: 'Satellite photos show what is visible from above. They are not proof of contracts, payments or quality.' },
  notFound: { title: 'Page not found', body: 'That address does not exist.', home: 'Go to the globe' },
  map: {
    label: 'Map. Use the search box to move it.',
    staticNotice: 'This device cannot show the 3D map. Search, outlines by coordinates, photos and reports still work.',
    lite: 'Lite mode',
    switchFull: 'Switch to full',
  },
  search: {
    label: 'Search a place or paste coordinates',
    placeholder: 'Nagpur, or 21.1458, 79.0882',
    submit: 'Search',
    results: 'Places found',
    none: 'No place found. Try a city name, or coordinates like 21.1458, 79.0882.',
    failed: 'Search is unavailable right now. Paste coordinates instead.',
    swapped: (lat: number, lon: number) => `These look reversed. Did you mean ${lon}, ${lat}?`,
    useSwapped: 'Use the reversed coordinates',
    coordsResult: (lat: number, lon: number) => `Point at ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    attribution: 'Search by OpenStreetMap Nominatim',
  },
  sats: {
    title: 'Live satellites',
    live: 'Live',
    unavailable: 'Satellite positions are unavailable right now. Everything else works.',
    loading: 'Finding satellites',
    nextLook: (place: string) => `Next look at ${place}`,
    estimated: 'Estimated from orbit data. A pass is not a usable photo; clouds can block it.',
    noPass: 'No pass in the next 10 days',
    position: (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`,
    status: { 40697: 'Extended operations', 42063: 'Operational', 60989: 'Operational', 39084: 'Operational', 49260: 'Operational' } as Record<number, string>,
  },
  quality: {
    CLEAR: { word: 'Clear', help: 'At least 95% of your outline is visible in this photo.' },
    PARTIAL: { word: 'Partly clear', help: 'Clouds, haze or shadows hide part of your outline.' },
    OBSCURED: { word: 'Obscured', help: 'Clouds hide almost all of your outline.' },
    NOT_COVERED: { word: 'Not covered', help: 'This photo does not cover your outline.' },
  },
  attribution: {
    osm: '© OpenStreetMap contributors',
    openfreemap: 'OpenFreeMap',
    gibs: 'NASA GIBS Blue Marble',
    sentinel: (year: number) => `Contains modified Copernicus Sentinel data ${year}`,
  },
  pages: {
    limits: {
      title: 'Limits',
      intro: 'GrahSaboot shows dated 10 metre satellite photos. Here is what that can and cannot tell you.',
      items: [
        'Sites can be up to 9 km² and 4.25 km across. Roads can be up to 10 km long and 5 to 200 metres wide; they are checked in 2 km sections.',
        'Photos go back to 2017. Sentinel-2 passes every few days, but clouds often block the view, especially in the monsoon.',
        'At 10 metres per pixel, large buildings, roads and land clearing are visible. Small or narrow features may not be.',
        '"No clear visible change" does not prove that nothing happened. Roofs hide interiors, and work can happen between photos.',
        'Photos cannot show quality, payments, contracts or who did the work.',
        'The next-pass time is an estimate from orbit data. A pass is not a guaranteed usable photo.',
        'Verified means the pictures match the public source file at the time of checking. It does not prove any claim about a project.',
        'Signed-in accounts can save 50 investigations and verify 600 frames per day.',
      ],
    },
    privacy: {
      title: 'Privacy',
      intro: 'Plain-language summary of what GrahSaboot does with your data.',
      items: [
        'You can explore and investigate without an account. Unsaved work stays in this browser.',
        'Place searches are sent to OpenStreetMap Nominatim.',
        'Satellite photos are read directly from public Sentinel-2 files on Amazon Web Services. Those requests reveal an approximate area, never your name or email.',
        'Satellite positions come through our server from CelesTrak; nothing about you is sent.',
        'If you sign in to save, we store your Google name and email, your outlines, dates, notes and claims, and a log of actions with IDs only.',
        'You can delete any investigation, or your whole account, at any time. Saved data is removed 12 months after your last sign-in.',
      ],
    },
  },
} as const

export function issueMessage(i: Issue): string {
  switch (i.code) {
    case 'not_closed': return 'Close the outline by clicking its first point again.'
    case 'too_few_points': return 'Add at least three corners for a site, or two points for a road.'
    case 'too_many_vertices': return `This outline has ${i.value} points. The limit is ${i.limit}.`
    case 'self_intersects': return 'The outline crosses itself. Redraw it as a simple shape.'
    case 'too_large': return `This outline covers ${km(i.value)} km². The limit is ${i.limit} km².`
    case 'too_wide': return `This outline is ${km(i.value)} km across. The limit is ${i.limit} km.`
    case 'too_short': return `This road is ${km(i.value)} km long. It must be at least ${i.limit} km.`
    case 'too_long': return `This road is ${km(i.value)} km long. The limit is ${i.limit} km.`
    case 'bad_width': return 'Road width must be a whole number from 5 to 200 metres.'
    case 'out_of_range': return 'A point is outside the map. Check the coordinates.'
  }
}
```

- [ ] **Step 4: Implement the kit, sheet, toast and wordmark**

`src/ui/kit.tsx`:
```tsx
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import type { QualityLabel } from '../evidence/types.ts'
import { copy } from './copy.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:opacity-90',
  secondary: 'border border-control text-fg hover:bg-panel',
  ghost: 'text-fg-2 hover:bg-panel hover:text-fg',
  danger: 'border border-bad text-bad hover:bg-panel',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-[6px] font-medium transition-transform duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${size === 'md' ? 'h-11 px-4 text-[0.9375rem]' : 'h-8 px-3 text-sm'} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
})

export function IconButton({ label, className = '', ...rest }: ButtonProps & { label: string }) {
  return <Button variant="ghost" aria-label={label} title={label} className={`w-11 px-0 ${className}`} {...rest} />
}

export function MicroLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2 ${className}`}>[ {children} ]</span>
}

export function Panel({ title, action, children, glass = false, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; glass?: boolean; className?: string }) {
  return (
    <section aria-label={title} className={`${glass ? 'glass' : 'border border-line bg-panel'} ${className}`}>
      {title && (
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <MicroLabel>{title}</MicroLabel>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string; error?: string | null }
export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField({ label, help, error, id, className = '', ...rest }, ref) {
  const auto = useId()
  const fid = id ?? auto
  const helpId = help ? `${fid}-help` : undefined
  const errId = error ? `${fid}-error` : undefined
  return (
    <div className={`grid gap-2 ${className}`}>
      <label htmlFor={fid} className="text-sm font-medium text-fg">{label}</label>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helpId, errId].filter(Boolean).join(' ') || undefined}
        className="h-11 w-full rounded-[6px] border border-control bg-bg px-3 text-fg placeholder:text-fg-2 focus:border-accent"
        {...rest}
      />
      {help && <p id={helpId} className="text-sm text-fg-2">{help}</p>}
      {error && <p id={errId} role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  )
})

export function QualityGlyph({ label, size = 14 }: { label: QualityLabel; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true, className: 'shrink-0' } as const
  if (label === 'CLEAR') return <svg {...p}><rect x="1" y="1" width="12" height="12" fill="currentColor" /></svg>
  if (label === 'PARTIAL') return <svg {...p}><rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" /><path d="M1 13 L13 1 L13 13 Z" fill="currentColor" /></svg>
  if (label === 'OBSCURED') return <svg {...p}><rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" /><path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" strokeWidth="1.5" /></svg>
  return <svg {...p}><rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" strokeDasharray="2 2" /></svg>
}

export function QualityTag({ label }: { label: QualityLabel }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.75rem] uppercase tracking-[0.06em]" title={copy.quality[label].help}>
      <QualityGlyph label={label} />
      {copy.quality[label].word}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse bg-line ${className}`} />
}
```

`src/ui/Sheet.tsx`:
```tsx
import { Drawer } from '@base-ui/react/drawer'
import type { ReactNode } from 'react'

export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange(open: boolean): void; title: string; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Drawer.Popup className="glass fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-auto rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-control" />
          <Drawer.Title className="mb-3 text-lg font-semibold">{title}</Drawer.Title>
          {children}
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

`src/ui/toast.tsx`:
```tsx
import { Toast } from '@base-ui/react/toast'
import { X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { copy } from './copy.ts'

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className="glass relative grid gap-1 p-3 pr-10">
      <Toast.Title className="font-medium text-fg" />
      <Toast.Description className="text-sm text-fg-2" />
      <Toast.Close aria-label={copy.common.close} className="absolute right-2 top-2 grid h-8 w-8 place-items-center text-fg-2">
        <X size={16} weight="bold" />
      </Toast.Close>
    </Toast.Root>
  ))
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-50 grid w-[min(92vw,380px)] gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

export function useToast(): (title: string, description?: string) => void {
  const m = Toast.useToastManager()
  return (title, description) => {
    m.add({ title, description })
  }
}
```

`src/ui/Wordmark.tsx`:
```tsx
import { copy } from './copy.ts'

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-fg">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="4" fill="currentColor" />
        <ellipse cx="11" cy="11" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.2" transform="rotate(-24 11 11)" />
        <circle cx="19.4" cy="7.3" r="1.6" fill="var(--gs-accent)" />
      </svg>
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">{copy.app.name}</span>
    </span>
  )
}
```

`src/screens/KitScreen.tsx` (dev-only gallery used by accessibility tests):
```tsx
import { useState } from 'react'
import { Button, IconButton, Panel, QualityTag, Skeleton, TextField } from '../ui/kit.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { useToast } from '../ui/toast.tsx'
import { Planet } from '@phosphor-icons/react'

export default function KitScreen() {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  return (
    <div className="mx-auto grid max-w-[1200px] gap-6 p-6">
      <h1 className="text-2xl font-semibold">Kit</h1>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
        <IconButton label="Satellites"><Planet size={20} weight="bold" /></IconButton>
      </div>
      <TextField label="Place" help="A city or coordinates" placeholder="Nagpur" />
      <TextField label="Road width (metres)" error="Road width must be a whole number from 5 to 200 metres." defaultValue="4" />
      <Panel title="Evidence">
        <div className="flex flex-wrap gap-4">
          <QualityTag label="CLEAR" />
          <QualityTag label="PARTIAL" />
          <QualityTag label="OBSCURED" />
          <QualityTag label="NOT_COVERED" />
        </div>
      </Panel>
      <Panel title="Glass" glass>Floating panel</Panel>
      <Skeleton className="h-24 w-full" />
      <div className="flex gap-3">
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
        <Button onClick={() => toast('Saved', 'Your investigation is stored.')}>Show toast</Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Sheet">
        <p className="text-fg-2">Sheet content</p>
      </Sheet>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests and the gate**

Run: `npx vitest run src/ui && npm run check`
Expected: PASS. If Base UI or Phosphor props do not type-check (for example `swipeDirection` or `Toast.Root` props), read the installed `.d.ts` and adjust the call without changing the component's public props.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/screens
git commit -m "feat(ui): copy dictionary with verdict-word guard, UI kit, sheet, toasts and wordmark

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B3: Router, app shell, text pages and the E2E harness

**Files:**
- Create: `src/lib/router.tsx`, `src/ui/Shell.tsx`, `src/app.tsx`, `src/screens/GlobeScreen.tsx`, `src/screens/TextPage.tsx`, `src/screens/NotFound.tsx`, `.env.e2e`, `tests/e2e/shell.spec.ts`
- Modify: `src/main.tsx`, `playwright.config.ts`, `package.json` (add `@axe-core/playwright@4.13.0`)
- Test: `src/lib/router.test.ts` (imports `./router.tsx`)

**Interfaces:**
- Produces:
  - `type Route = { name: 'globe' } | { name: 'new' } | { name: 'investigation'; id: string } | { name: 'report'; id: string } | { name: 'privacy' } | { name: 'limits' } | { name: 'kit' } | { name: 'notFound' }`
  - `matchRoute(path: string): Route`
  - `navigate(to: string, opts?: { replace?: boolean }): void`
  - `useRoute(): Route`, `useSearchParams(): URLSearchParams`
  - `Link` (anchor that pushes history for plain left clicks)
  - `App` with a `screenFor(route)` switch that later tasks extend
  - `Shell`
- E2E harness:
  - `npm run e2e` builds with `--mode e2e` against the fixture server on `:4300` and serves the preview on `:4173`.
  - Browser projects come from `E2E_BROWSERS` (default `chromium,firefox,webkit`) plus `mobile` (Pixel 7, Chromium).

- [ ] **Step 1: Write the failing router test `src/lib/router.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { matchRoute } from './router.tsx'

describe('matchRoute', () => {
  it.each([
    ['/', { name: 'globe' }],
    ['/new', { name: 'new' }],
    ['/new/', { name: 'new' }],
    ['/privacy', { name: 'privacy' }],
    ['/limits', { name: 'limits' }],
    ['/dev/kit', { name: 'kit' }],
    ['/i/local-5f2b9c1e-1111-4222-8333-444455556666', { name: 'investigation', id: 'local-5f2b9c1e-1111-4222-8333-444455556666' }],
    ['/i/5f2b9c1e-1111-4222-8333-444455556666/report', { name: 'report', id: '5f2b9c1e-1111-4222-8333-444455556666' }],
    ['/i/../etc', { name: 'notFound' }],
    ['/i/' + 'a'.repeat(65), { name: 'notFound' }],
    ['/nope', { name: 'notFound' }],
  ])('%s', (path, route) => {
    expect(matchRoute(path)).toEqual(route)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/router.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/router.tsx`**

```tsx
import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

export type Route =
  | { name: 'globe' } | { name: 'new' } | { name: 'investigation'; id: string } | { name: 'report'; id: string }
  | { name: 'privacy' } | { name: 'limits' } | { name: 'kit' } | { name: 'notFound' }

const ID = '([A-Za-z0-9-]{1,64})'

export function matchRoute(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return { name: 'globe' }
  if (p === '/new') return { name: 'new' }
  if (p === '/privacy') return { name: 'privacy' }
  if (p === '/limits') return { name: 'limits' }
  if (p === '/dev/kit') return { name: 'kit' }
  let m = p.match(new RegExp(`^/i/${ID}$`))
  if (m) return { name: 'investigation', id: m[1]! }
  m = p.match(new RegExp(`^/i/${ID}/report$`))
  if (m) return { name: 'report', id: m[1]! }
  return { name: 'notFound' }
}

const EVENT = 'gs-navigate'
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', to)
  window.dispatchEvent(new Event(EVENT))
  window.scrollTo(0, 0)
}

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(EVENT, cb)
  }
}
const snapshot = () => location.pathname + location.search

export function useRoute(): Route {
  const href = useSyncExternalStore(subscribe, snapshot, () => '/')
  return useMemo(() => matchRoute(href.split('?')[0]!), [href])
}

export function useSearchParams(): URLSearchParams {
  const href = useSyncExternalStore(subscribe, snapshot, () => '/')
  return useMemo(() => new URLSearchParams(href.split('?')[1] ?? ''), [href])
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}
```

- [ ] **Step 4: Implement the shell, screens and app**

`src/ui/Shell.tsx`:
```tsx
import { Moon, Sun } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link, type Route } from '../lib/router.tsx'
import { copy } from './copy.ts'
import { IconButton } from './kit.tsx'
import { useTheme } from './theme.ts'
import { Wordmark } from './Wordmark.tsx'

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const [theme, setTheme] = useTheme()
  return (
    {/* Not positioned: a positioned root would paint and hit-test above the fixed map stage. */}
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only z-50 bg-fg px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:left-2 focus:top-2">{copy.common.skip}</a>
      <header className="no-print relative z-30 flex h-14 items-center justify-between border-b border-line bg-bg px-4 lg:px-6">
        <Link to="/" aria-label={copy.nav.home} className="rounded-[6px]"><Wordmark /></Link>
        <nav className="flex items-center gap-1">
          {route.name !== 'new' && (
            <Link to="/new" className="hidden h-11 items-center rounded-[6px] px-4 text-[0.9375rem] font-medium text-fg hover:bg-panel sm:inline-flex">{copy.nav.newInvestigation}</Link>
          )}
          <IconButton label={copy.nav.themeToggle} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
          </IconButton>
        </nav>
      </header>
      {/* Over the map, empty parts of the page must let pointer input through; screens re-enable it on their panels. */}
      <main id="main" className={route.name === 'globe' || route.name === 'new' ? 'pointer-events-none relative z-10' : 'relative z-10'}>{children}</main>
      {route.name !== 'investigation' && (
        <footer className="no-print relative z-10 border-t border-line bg-bg px-4 py-6 text-sm text-fg-2 lg:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[65ch]">{copy.footer.disclaimer}</p>
            <div className="flex gap-4">
              <Link to="/privacy" className="underline-offset-4 hover:underline">{copy.nav.privacy}</Link>
              <Link to="/limits" className="underline-offset-4 hover:underline">{copy.nav.limits}</Link>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
```

`src/screens/TextPage.tsx`:
```tsx
export default function TextPage({ page }: { page: { title: string; intro: string; items: readonly string[] } }) {
  return (
    <article className="mx-auto max-w-[70ch] px-4 py-12 lg:py-20">
      <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold leading-none tracking-[-0.04em]">{page.title}</h1>
      <p className="mt-4 text-lg text-fg-2">{page.intro}</p>
      <ul className="mt-10 grid gap-px border border-line bg-line">
        {page.items.map((t) => (
          <li key={t} className="bg-bg p-4 leading-relaxed">{t}</li>
        ))}
      </ul>
    </article>
  )
}
```

`src/screens/NotFound.tsx`:
```tsx
import { Link } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[65ch] px-4 py-20">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{copy.notFound.title}</h1>
      <p className="mt-3 text-fg-2">{copy.notFound.body}</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-[6px] border border-control px-4">{copy.notFound.home}</Link>
    </div>
  )
}
```

`src/screens/GlobeScreen.tsx` (static first version; B4, B5 and B7 extend it):
```tsx
import { Link } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'

export default function GlobeScreen() {
  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[38%_1fr]">
      <section className="pointer-events-auto relative z-10 flex flex-col justify-end gap-6 bg-bg p-6 pb-10 lg:justify-center lg:p-12">
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.04em]">{copy.app.promise}</h1>
        <div className="flex flex-wrap gap-3">
          <Link to="/new" className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg">{copy.nav.newInvestigation}</Link>
          <Link to="/new?example=nagpur" className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg">{copy.nav.example}</Link>
        </div>
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}
```

`src/app.tsx`:
```tsx
import { lazy, Suspense, type ReactNode } from 'react'
import { config } from './config.ts'
import { useRoute, type Route } from './lib/router.tsx'
import { copy } from './ui/copy.ts'
import { Skeleton } from './ui/kit.tsx'
import { Shell } from './ui/Shell.tsx'
import { ToastProvider } from './ui/toast.tsx'
import NotFound from './screens/NotFound.tsx'
import TextPage from './screens/TextPage.tsx'

const GlobeScreen = lazy(() => import('./screens/GlobeScreen.tsx'))
const KitScreen = lazy(() => import('./screens/KitScreen.tsx'))

export function screenFor(r: Route): ReactNode {
  switch (r.name) {
    case 'globe': return <GlobeScreen />
    case 'privacy': return <TextPage page={copy.pages.privacy} />
    case 'limits': return <TextPage page={copy.pages.limits} />
    case 'kit': return config.testMode ? <KitScreen /> : <NotFound />
    default: return <NotFound />
  }
}

export function App() {
  const route = useRoute()
  return (
    <ToastProvider>
      <Shell route={route}>
        <Suspense fallback={<Skeleton className="m-6 h-40" />}>{screenFor(route)}</Suspense>
      </Shell>
    </ToastProvider>
  )
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Set up the E2E harness**

```bash
npm i -D -E @axe-core/playwright@4.13.0
```

`.env.e2e` (committed; no secrets):
```
VITE_STAC_URL=http://127.0.0.1:4300/stac
VITE_PC_STAC_URL=http://127.0.0.1:4300/stac
VITE_NOMINATIM_URL=http://127.0.0.1:4300/nominatim
VITE_TLE_URL=http://127.0.0.1:4300/tle
VITE_STYLE_DARK=http://127.0.0.1:4300/style/dark.json
VITE_STYLE_LIGHT=http://127.0.0.1:4300/style/light.json
VITE_GIBS_TILES=http://127.0.0.1:4300/tiles/{z}/{y}/{x}.png
VITE_TERRAIN_TILES=http://127.0.0.1:4300/tiles/{z}/{x}/{y}.png
VITE_TEST_HOOKS=1
```
In `.gitignore`, add the line `!.env.e2e` after `.env.*`.

`playwright.config.ts` (replace):
```ts
import { defineConfig, devices } from '@playwright/test'

const live = process.env.LIVE === '1'
const browsers = (process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit').split(',')
const desktop = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
].filter((p) => browsers.includes(p.name))

export default defineConfig({
  testDir: 'tests',
  testMatch: live ? ['live/**/*.spec.ts'] : ['e2e/**/*.spec.ts'],
  timeout: live ? 120_000 : 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: live ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: live ? desktop : [...desktop, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: live
    ? [{ command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true }]
    : [
        { command: 'npx tsx tests/fixtures/server.ts', url: 'http://127.0.0.1:4300/tle', env: { PORT: '4300' }, reuseExistingServer: true },
        { command: 'npx vite build --mode e2e && npx vite preview --port 4173 --strictPort', url: 'http://127.0.0.1:4173', timeout: 180_000, reuseExistingServer: false },
      ],
})
```

`tests/e2e/shell.spec.ts`:
```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('navigates with history and links', async ({ page }) => {
  await page.goto('/limits')
  await expect(page.getByRole('heading', { level: 1, name: 'Limits' })).toBeVisible()
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/limits$/)
})

test('dark by default, light toggle persists across reloads', async ({ page }) => {
  await page.goto('/limits')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('unknown routes render not found', async ({ page }) => {
  await page.goto('/definitely/not/here')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

for (const path of ['/limits', '/privacy', '/dev/kit']) {
  test(`${path} passes axe in both themes`, async ({ page }) => {
    await page.goto(path)
    for (let i = 0; i < 2; i++) {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
      await page.getByRole('button', { name: 'Switch theme' }).click()
    }
  })
}
```

- [ ] **Step 6: Run unit tests, the gate and the E2E suite**

Run: `npx vitest run src/lib && npm run check && npm run e2e`
Expected: router 11 PASS. E2E passes on all available projects (6 tests × projects). If a browser engine is unavailable on this VM (recorded in A11), run with `E2E_BROWSERS=chromium,firefox`.

- [ ] **Step 7: Commit**

```bash
git add src tests/e2e playwright.config.ts .env.e2e .gitignore package.json package-lock.json
git commit -m "feat(shell): router, app shell, limits/privacy pages and hermetic e2e harness with axe

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B4: Device tiers and the persistent map stage (globe)

**Files:**
- Create: `src/map/tier.ts`, `src/map/createMap.ts`, `src/map/MapStage.tsx`
- Modify: `src/app.tsx` (wrap in `MapStageProvider`), `src/screens/GlobeScreen.tsx`, `src/styles.css` (stage layouts)
- Test: `src/map/tier.test.ts`, `tests/e2e/globe.spec.ts`

**Interfaces:**
- Produces:
  - `type Tier = 0 | 1 | 2 | 3`
  - `interface TierSignals { webgl2: boolean; renderer: string; saveData: boolean; effectiveType: string | null; deviceMemory: number | null; cores: number | null }`
  - `chooseTier(s: TierSignals): Tier`, `readSignals(): TierSignals`, `downgrade(t: Tier): Tier`, `probeFrameMs(ms = 1500): Promise<number>`
  - `type Layout = 'globe' | 'side' | 'mini' | 'hidden'`
  - `MapStageProvider`
  - `useMapStage(): { map: MlMap | null; tier: Tier; layout: Layout; setLayout(l: Layout): void; setTierOverride(t: Tier | null): void; installLayers(id: string, install: (m: MlMap) => void, uninstall: (m: MlMap) => void): () => void }`
  - `useMapLayout(l: Layout): void`
  - `createMap(container, { tier, getTheme: () => Theme }): MlMap`, `styleUrl(theme): string`

- [ ] **Step 1: Write the failing unit test `src/map/tier.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { chooseTier, downgrade, type TierSignals } from './tier.ts'

const base: TierSignals = { webgl2: true, renderer: 'ANGLE (NVIDIA)', saveData: false, effectiveType: '4g', deviceMemory: 8, cores: 8 }

describe('chooseTier', () => {
  it.each([
    [{}, 3],
    [{ webgl2: false }, 0],
    [{ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' }, 0],
    [{ renderer: 'llvmpipe (LLVM 17.0.6, 256 bits)' }, 0],
    [{ saveData: true }, 1],
    [{ effectiveType: '3g' }, 1],
    [{ deviceMemory: 2 }, 1],
    [{ cores: 4 }, 2],
    [{ deviceMemory: 3 }, 2],
    [{ deviceMemory: null, cores: null }, 3],
  ] as const)('%j → T%s', (over, tier) => {
    expect(chooseTier({ ...base, ...over })).toBe(tier)
  })
  it('only ever downgrades by one', () => {
    expect([3, 2, 1, 0].map((t) => downgrade(t as 0 | 1 | 2 | 3))).toEqual([2, 1, 0, 0])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/map/tier.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/map/tier.ts`**

```ts
export type Tier = 0 | 1 | 2 | 3

export interface TierSignals {
  webgl2: boolean
  renderer: string
  saveData: boolean
  effectiveType: string | null
  deviceMemory: number | null
  cores: number | null
}

export function chooseTier(s: TierSignals): Tier {
  if (!s.webgl2 || /swiftshader|llvmpipe|software/i.test(s.renderer)) return 0
  if (s.saveData || (s.effectiveType !== null && /^(slow-2g|2g|3g)$/.test(s.effectiveType))) return 1
  if (s.deviceMemory !== null && s.deviceMemory <= 2) return 1
  if ((s.cores !== null && s.cores <= 4) || (s.deviceMemory !== null && s.deviceMemory < 4)) return 2
  return 3
}

export const downgrade = (t: Tier): Tier => (t > 0 ? ((t - 1) as Tier) : 0)

export function readSignals(): TierSignals {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
  let webgl2 = false
  let renderer = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (gl) {
      webgl2 = true
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    webgl2 = false
  }
  return {
    webgl2,
    renderer,
    saveData: !!nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    cores: nav.hardwareConcurrency || null,
  }
}

/** Median frame time over `ms` milliseconds of requestAnimationFrame. */
export function probeFrameMs(ms = 1500): Promise<number> {
  return new Promise((resolve) => {
    const deltas: number[] = []
    const start = performance.now()
    let last = start
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve(deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] ?? 16)
    }
    requestAnimationFrame(tick)
  })
}
```

- [ ] **Step 4: Implement `src/map/createMap.ts`**

```ts
import { AttributionControl, Map as MlMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { config } from '../config.ts'
import { copy } from '../ui/copy.ts'
import type { Theme } from '../ui/theme.ts'
import type { Tier } from './tier.ts'

setWorkerUrl(workerUrl)

export const styleUrl = (theme: Theme) => (theme === 'dark' ? config.styleDark : config.styleLight)

export function createMap(container: HTMLElement, opts: { tier: Tier; getTheme: () => Theme }): MlMap {
  const map = new MlMap({
    container,
    style: styleUrl(opts.getTheme()),
    center: [78.96, 21.5],
    zoom: opts.tier >= 2 ? 1.6 : 3.6,
    maxPitch: 70,
    attributionControl: false,
    pixelRatio: opts.tier <= 1 ? 1 : undefined,
    canvasContextAttributes: { antialias: opts.tier >= 3, failIfMajorPerformanceCaveat: false },
  })
  map.addControl(new AttributionControl({ compact: true, customAttribution: [copy.attribution.osm, copy.attribution.openfreemap, copy.attribution.gibs] }), 'bottom-right')
  map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')
  map.on('style.load', () => applyBaseLayers(map, opts.tier, opts.getTheme()))
  if (opts.tier >= 3) {
    const updateTerrain = () => {
      if (!map.getSource('gs-terrain')) return
      const want = map.getZoom() >= 9
      if (want && !map.getTerrain()) map.setTerrain({ source: 'gs-terrain', exaggeration: 1.3 })
      if (!want && map.getTerrain()) map.setTerrain(null)
    }
    map.on('zoomend', updateTerrain)
    map.on('style.load', updateTerrain)
  }
  return map
}

/** Idempotent base layers on top of any OpenFreeMap style. Called on every style load. */
export function applyBaseLayers(map: MlMap, tier: Tier, theme: Theme) {
  map.setProjection({ type: tier >= 2 ? 'globe' : 'mercator' })
  if (tier >= 2) {
    map.setSky({
      'sky-color': theme === 'dark' ? '#09090b' : '#ffffff',
      'horizon-color': theme === 'dark' ? '#18181b' : '#e4e4e7',
      'fog-color': theme === 'dark' ? '#09090b' : '#ffffff',
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 5, 0.25, 7, 0],
    })
  }
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  if (!map.getSource('gs-gibs')) map.addSource('gs-gibs', { type: 'raster', tiles: [config.gibsTiles], tileSize: 256, maxzoom: 8 })
  if (!map.getLayer('gs-gibs')) {
    map.addLayer({ id: 'gs-gibs', type: 'raster', source: 'gs-gibs', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 1, 6, 0], 'raster-fade-duration': 0 } }, firstSymbol)
  }
  if (tier >= 3) {
    if (!map.getSource('gs-terrain')) map.addSource('gs-terrain', { type: 'raster-dem', tiles: [config.terrainTiles], encoding: 'terrarium', tileSize: 256, maxzoom: 15 })
    const hasBuildings = map.getStyle().layers.some((l) => l.type === 'fill-extrusion')
    if (!hasBuildings && map.getSource('openmaptiles') && !map.getLayer('gs-buildings')) {
      map.addLayer(
        {
          id: 'gs-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
          paint: {
            'fill-extrusion-color': theme === 'dark' ? '#27272a' : '#e4e4e7',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.9,
          },
        },
        firstSymbol,
      )
    }
  }
}
```

- [ ] **Step 5: Implement `src/map/MapStage.tsx`, layouts CSS, and wire the app**

`src/map/MapStage.tsx`:
```tsx
import type { Map as MlMap } from 'maplibre-gl'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { config } from '../config.ts'
import { copy } from '../ui/copy.ts'
import { currentTheme, useTheme } from '../ui/theme.ts'
import { chooseTier, downgrade, probeFrameMs, readSignals, type Tier } from './tier.ts'

export type Layout = 'globe' | 'side' | 'mini' | 'hidden'
type Installer = { install(m: MlMap): void; uninstall(m: MlMap): void }
interface MapStageValue {
  map: MlMap | null
  tier: Tier
  layout: Layout
  setLayout(l: Layout): void
  setTierOverride(t: Tier | null): void
  installLayers(id: string, install: (m: MlMap) => void, uninstall: (m: MlMap) => void): () => void
}

const Ctx = createContext<MapStageValue | null>(null)
const OVERRIDE = 'gs-tier-override'

function overrideTier(): Tier | null {
  const q = config.testMode ? new URLSearchParams(location.search).get('tier') : null
  let v: string | null = q
  if (v === null) {
    try { v = localStorage.getItem(OVERRIDE) } catch { v = null }
  }
  return v !== null && /^[0-3]$/.test(v) ? (Number(v) as Tier) : null
}

export function MapStageProvider({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const installers = useRef(new Map<string, Installer>())
  const [tier, setTier] = useState<Tier>(() => overrideTier() ?? chooseTier(readSignals()))
  const [map, setMap] = useState<MlMap | null>(null)
  const [layout, setLayout] = useState<Layout>('hidden')
  const [theme] = useTheme()
  const appliedTheme = useRef(currentTheme())

  useEffect(() => {
    if (tier === 0 || !container.current) return
    let cancelled = false
    let m: MlMap | null = null
    import('./createMap.ts').then(({ createMap }) => {
      if (cancelled || !container.current) return
      try {
        m = createMap(container.current, { tier, getTheme: () => appliedTheme.current })
      } catch {
        setTier(0)
        return
      }
      const map = m
      map.on('style.load', () => { for (const i of installers.current.values()) i.install(map) })
      map.getCanvas().addEventListener('webglcontextlost', () => setTier((t) => downgrade(t)), { once: true })
      map.once('idle', () => {
        probeFrameMs().then((ms) => { if (!cancelled && ms > 42 && overrideTier() === null) setTier((t) => downgrade(t)) })
      })
      if (config.testMode) (window as unknown as { __gs?: object }).__gs = { ...((window as unknown as { __gs?: object }).__gs ?? {}), map }
      setMap(map)
    })
    return () => {
      cancelled = true
      m?.remove()
      setMap(null)
    }
  }, [tier])

  useEffect(() => {
    if (!map || theme === appliedTheme.current) return
    appliedTheme.current = theme
    import('./createMap.ts').then(({ styleUrl }) => map.setStyle(styleUrl(theme)))
  }, [theme, map])

  useEffect(() => {
    if (!map) return
    const id = requestAnimationFrame(() => map.resize())
    return () => cancelAnimationFrame(id)
  }, [layout, map])

  const installLayers = useCallback(
    (id: string, install: (m: MlMap) => void, uninstall: (m: MlMap) => void) => {
      installers.current.set(id, { install, uninstall })
      if (map?.isStyleLoaded()) install(map)
      return () => {
        installers.current.delete(id)
        if (map && map.getStyle()) uninstall(map)
      }
    },
    [map],
  )

  const setTierOverride = useCallback((t: Tier | null) => {
    try {
      if (t === null) localStorage.removeItem(OVERRIDE)
      else localStorage.setItem(OVERRIDE, String(t))
    } catch { /* storage unavailable: still apply for this session */ }
    setTier(t ?? chooseTier(readSignals()))
  }, [])

  const value = useMemo(() => ({ map, tier, layout, setLayout, setTierOverride, installLayers }), [map, tier, layout, setTierOverride, installLayers])
  return (
    <Ctx.Provider value={value}>
      <div className="map-stage" data-layout={tier === 0 ? 'hidden' : layout} role="region" aria-label={copy.map.label}>
        {/* MapLibre's CSS sets position: relative on its container, so it gets this full-size child, never the fixed stage. */}
        <div ref={container} className="h-full w-full" />
      </div>
      {children}
    </Ctx.Provider>
  )
}

export function useMapStage(): MapStageValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMapStage outside MapStageProvider')
  return v
}

export function useMapLayout(l: Layout) {
  const { setLayout } = useMapStage()
  useEffect(() => {
    setLayout(l)
    return () => setLayout('hidden')
  }, [l, setLayout])
}
```

Append to `src/styles.css`:
```css
.map-stage {
  position: fixed;
  z-index: 0;
  inset: 56px 0 0 0;
  background: var(--gs-bg);
}
.map-stage[data-layout='hidden'] {
  visibility: hidden;
  pointer-events: none;
}
.map-stage[data-layout='globe'] {
  bottom: 45dvh;
}
.map-stage[data-layout='side'] {
  bottom: 50dvh;
}
.map-stage[data-layout='mini'] {
  inset: auto 16px 16px auto;
  width: min(360px, calc(100vw - 32px));
  height: 240px;
  border: 1px solid var(--gs-line);
  border-radius: 12px;
  overflow: hidden;
  z-index: 25;
}
@media (min-width: 1024px) {
  .map-stage[data-layout='globe'] {
    inset: 56px 0 0 38%;
  }
  .map-stage[data-layout='side'] {
    inset: 56px 0 0 45%;
  }
}
@media print {
  .map-stage {
    display: none;
  }
}
```

Replace `src/app.tsx`. `MapStageProvider` wraps `Shell`, inside `ToastProvider`:
```tsx
import { lazy, Suspense, type ReactNode } from 'react'
import { config } from './config.ts'
import { useRoute, type Route } from './lib/router.tsx'
import { MapStageProvider } from './map/MapStage.tsx'
import { copy } from './ui/copy.ts'
import { Skeleton } from './ui/kit.tsx'
import { Shell } from './ui/Shell.tsx'
import { ToastProvider } from './ui/toast.tsx'
import NotFound from './screens/NotFound.tsx'
import TextPage from './screens/TextPage.tsx'

const GlobeScreen = lazy(() => import('./screens/GlobeScreen.tsx'))
const KitScreen = lazy(() => import('./screens/KitScreen.tsx'))

export function screenFor(r: Route): ReactNode {
  switch (r.name) {
    case 'globe':
      return <GlobeScreen />
    case 'privacy':
      return <TextPage page={copy.pages.privacy} />
    case 'limits':
      return <TextPage page={copy.pages.limits} />
    case 'kit':
      return config.testMode ? <KitScreen /> : <NotFound />
    default:
      return <NotFound />
  }
}

export function App() {
  const route = useRoute()
  return (
    <ToastProvider>
      <MapStageProvider>
        <Shell route={route}>
          <Suspense fallback={<Skeleton className="m-6 h-40" />}>{screenFor(route)}</Suspense>
        </Shell>
      </MapStageProvider>
    </ToastProvider>
  )
}
```

Replace `src/screens/GlobeScreen.tsx`:
```tsx
import { useEffect } from 'react'
import { Link } from '../lib/router.tsx'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { copy } from '../ui/copy.ts'
import { Button } from '../ui/kit.tsx'

export default function GlobeScreen() {
  useMapLayout('globe')
  const { map, tier, setTierOverride } = useMapStage()

  useEffect(() => {
    if (!map || tier < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let stopped = false
    let last = performance.now()
    const started = last
    const stop = () => { stopped = true; cancelAnimationFrame(raf) }
    const tick = (now: number) => {
      if (stopped) return
      if (now - started > 30_000 || map.getZoom() > 3) return stop()
      const c = map.getCenter()
      map.setCenter([c.lng + ((now - last) / 1000) * 2, c.lat])
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    map.on('mousedown', stop)
    map.on('touchstart', stop)
    map.on('wheel', stop)
    return () => {
      stop()
      map.off('mousedown', stop)
      map.off('touchstart', stop)
      map.off('wheel', stop)
    }
  }, [map, tier])

  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[38%_1fr]">
      <section className="pointer-events-auto relative z-10 mt-[calc(55dvh-56px)] flex flex-col justify-end gap-6 bg-bg p-6 pb-10 lg:mt-0 lg:justify-center lg:p-12">
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.04em]">{copy.app.promise}</h1>
        <div className="flex flex-wrap gap-3">
          <Link to="/new" className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg">{copy.nav.newInvestigation}</Link>
          <Link to="/new?example=nagpur" className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg">{copy.nav.example}</Link>
        </div>
        {tier === 0 && <p className="max-w-[60ch] text-sm text-fg-2" role="status">{copy.map.staticNotice}</p>}
        {(tier === 1 || tier === 2) && (
          <div className="flex items-center gap-3 text-sm text-fg-2">
            <span className="font-mono uppercase tracking-[0.06em]">{copy.map.lite}</span>
            <Button size="sm" variant="ghost" onClick={() => setTierOverride(3)}>{copy.map.switchFull}</Button>
          </div>
        )}
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}
```
On mobile, the map stage covers the top 55 dvh; the content section starts below it.

- [ ] **Step 6: Write the E2E test `tests/e2e/globe.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

const hasWebgl2 = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
const styleReady = (page: Page) => page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())

test('globe renders at tier 2 with attribution', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await styleReady(page)
  expect(await page.evaluate(() => (window as any).__gs.map.getProjection().type)).toBe('globe')
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap')
})

// Pins two real failures: MapLibre's CSS collapsing the fixed stage to 0 px, and page layers swallowing map input.
test('the globe fills its area, receives pointer input and zooms with the wheel', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  const box = (await page.locator('.map-stage canvas').boundingBox())!
  expect(box.height).toBeGreaterThan(300)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [cx, cy])).toBe('CANVAS')
  const z0 = await page.evaluate(() => (window as any).__gs.map.getZoom())
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -600)
  await expect.poll(() => page.evaluate(() => (window as any).__gs.map.getZoom())).toBeGreaterThan(z0 + 0.2)
})

test('tier 0 shows a plain notice and no map, but the main actions still work', async ({ page }) => {
  await page.goto('/?tier=0')
  await expect(page.getByText(copy.map.staticNotice)).toBeVisible()
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0)
  await expect(page.getByRole('link', { name: copy.nav.newInvestigation }).first()).toBeVisible()
})

test('reduced motion disables auto-rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  const a = await page.evaluate(() => (window as any).__gs.map.getCenter().lng)
  await page.waitForTimeout(1500)
  const b = await page.evaluate(() => (window as any).__gs.map.getCenter().lng)
  expect(Math.abs(b - a)).toBeLessThan(0.01)
})

test('theme toggle swaps the map style', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await hasWebgl2(page)), 'no WebGL2 in this engine')
  await styleReady(page)
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(() => (window as any).__gs.map.getStyle().layers.find((l: any) => l.id === 'bg')?.paint?.['background-color'] === '#FFFFFF')
  await page.waitForFunction(() => !!(window as any).__gs.map.getLayer('gs-gibs'))
})
```

- [ ] **Step 7: Run unit tests, gate and E2E**

Run: `npx vitest run src/map && npm run check && npm run e2e`
Expected: tier 11 PASS; E2E green (WebGL tests may skip on engines without WebGL2; the tier-0 test must pass everywhere). Confirm the build splits MapLibre out of the entry: `ls -la dist/assets` shows a separate large `createMap-*.js` chunk and the entry chunk stays small.

- [ ] **Step 8: Commit**

```bash
git add src tests/e2e
git commit -m "feat(map): persistent MapLibre globe stage with device tiers, layouts and theme-aware styles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B5: Place search (Nominatim + coordinates) and camera moves

**Files:**
- Create: `src/search/nominatim.ts`, `src/ui/SearchBox.tsx`, `src/map/camera.ts`
- Modify: `src/screens/GlobeScreen.tsx`
- Test: `src/search/nominatim.test.ts`, `tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes: `parseCoordinates` (A2), `useMapStage` (B4), `navigate` (B3).
- Produces:
  - `interface Place { name: string; lat: number; lon: number; bbox: [number, number, number, number] | null }`
  - `createNominatim(opts?: { baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; minIntervalMs?: number }): { search(q: string, signal?: AbortSignal): Promise<Place[]> }`
  - `nominatim` (app singleton)
  - `SearchBox({ onSelect(place: Place): void })`
  - `flyToPlace(map, place, reducedMotion: boolean): void`
  - `placeToQuery(place): string` (builds `/new?lat=…&lon=…&name=…`)

- [ ] **Step 1: Write the failing test `src/search/nominatim.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createNominatim } from './nominatim.ts'

const ROW = { display_name: 'Nagpur, Maharashtra, India', lat: '21.1458', lon: '79.0882', boundingbox: ['20.9', '21.3', '78.9', '79.3'] }
const ok = (rows: unknown[]) => new Response(JSON.stringify(rows), { status: 200 })

describe('nominatim', () => {
  it('parses results into places with [w,s,e,n] bboxes', async () => {
    const n = createNominatim({ baseUrl: 'https://x', fetchImpl: vi.fn().mockResolvedValue(ok([ROW])), sleep: async () => {} })
    expect(await n.search('Nagpur')).toEqual([{ name: 'Nagpur, Maharashtra, India', lat: 21.1458, lon: 79.0882, bbox: [78.9, 20.9, 79.3, 21.3] }])
  })
  it('caches repeated queries (case and space insensitive)', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok([ROW]))
    const n = createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} })
    await n.search('Nagpur')
    await n.search('  nagpur ')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('waits so requests are at least 1 s apart', async () => {
    let t = 1000
    const waits: number[] = []
    const n = createNominatim({ baseUrl: 'https://x', fetchImpl: vi.fn().mockImplementation(async () => ok([])), now: () => t, sleep: async (ms) => { waits.push(ms); t += ms } })
    await n.search('a')
    t += 200
    await n.search('b')
    expect(waits).toEqual([800])
  })
  it('throws on HTTP errors and drops malformed rows', async () => {
    const bad = createNominatim({ baseUrl: 'https://x', fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })), sleep: async () => {} })
    await expect(bad.search('x')).rejects.toThrow('NOMINATIM_503')
    const odd = createNominatim({ baseUrl: 'https://x', fetchImpl: vi.fn().mockResolvedValue(ok([{ display_name: 1 }, ROW])), sleep: async () => {} })
    expect(await odd.search('y')).toHaveLength(1)
  })
  it('sends the query encoded and asks for English names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]))
    await createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} }).search('Sitabuldi & Fort')
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://x/search?format=jsonv2&limit=5&q=Sitabuldi%20%26%20Fort')
    expect(fetchImpl.mock.calls[0]![1].headers['Accept-Language']).toBe('en')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/search/nominatim.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/search/nominatim.ts` and `src/map/camera.ts`**

`src/search/nominatim.ts`:
```ts
import { config } from '../config.ts'

export interface Place { name: string; lat: number; lon: number; bbox: [number, number, number, number] | null }

export function createNominatim(opts: { baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; minIntervalMs?: number } = {}) {
  const base = opts.baseUrl ?? config.nominatimUrl
  const f = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const gap = opts.minIntervalMs ?? 1000
  const cache = new Map<string, Place[]>()
  let last = -Infinity
  return {
    async search(q: string, signal?: AbortSignal): Promise<Place[]> {
      const key = q.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!key) return []
      const hit = cache.get(key)
      if (hit) return hit
      const wait = last + gap - now()
      if (wait > 0) await sleep(wait)
      last = now()
      const res = await f(`${base}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q.trim())}`, { headers: { 'Accept-Language': 'en' }, signal })
      if (!res.ok) throw new Error(`NOMINATIM_${res.status}`)
      const rows = (await res.json()) as unknown[]
      const places = (Array.isArray(rows) ? rows : []).flatMap((r): Place[] => {
        const o = r as { display_name?: unknown; lat?: unknown; lon?: unknown; boundingbox?: unknown }
        const lat = Number(o.lat), lon = Number(o.lon)
        if (typeof o.display_name !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon)) return []
        const bb = Array.isArray(o.boundingbox) && o.boundingbox.length === 4 ? o.boundingbox.map(Number) : null
        return [{ name: o.display_name, lat, lon, bbox: bb && bb.every(Number.isFinite) ? [bb[2]!, bb[0]!, bb[3]!, bb[1]!] : null }]
      })
      cache.set(key, places)
      return places
    },
  }
}

export const nominatim = createNominatim()
```

`src/map/camera.ts`:
```ts
import type { Map as MlMap } from 'maplibre-gl'
import type { Place } from '../search/nominatim.ts'

export function flyToPlace(map: MlMap, p: Place, reducedMotion: boolean) {
  const duration = reducedMotion ? 0 : 4000
  if (p.bbox && p.bbox[2] - p.bbox[0] < 5) {
    map.fitBounds([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]], { padding: 48, maxZoom: 14, duration, pitch: 50, bearing: -12 })
  } else {
    map.flyTo({ center: [p.lon, p.lat], zoom: 13, pitch: 55, bearing: -12, duration, curve: 1.4, essential: true })
  }
}

export const placeToQuery = (p: Place) => `/new?lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}&name=${encodeURIComponent(p.name.split(',')[0]!)}`
```

- [ ] **Step 4: Implement `src/ui/SearchBox.tsx` and wire it into the globe screen**

`src/ui/SearchBox.tsx`:
```tsx
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useRef, useState, type FormEvent } from 'react'
import { parseCoordinates } from '../geo/coords.ts'
import { nominatim, type Place } from '../search/nominatim.ts'
import { copy } from './copy.ts'
import { Button, TextField } from './kit.tsx'

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'results'; places: Place[] } | { kind: 'swapped'; lat: number; lon: number } | { kind: 'error' }

export function SearchBox({ onSelect }: { onSelect(place: Place): void }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const ac = useRef<AbortController | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const c = parseCoordinates(q)
    if (c) {
      if (c.swappedHint) return setState({ kind: 'swapped', lat: c.lat, lon: c.lon })
      setState({ kind: 'idle' })
      return onSelect({ name: copy.search.coordsResult(c.lat, c.lon), lat: c.lat, lon: c.lon, bbox: null })
    }
    ac.current?.abort()
    ac.current = new AbortController()
    setState({ kind: 'busy' })
    try {
      setState({ kind: 'results', places: await nominatim.search(q, ac.current.signal) })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setState({ kind: 'error' })
    }
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={submit} className="flex items-end gap-2" role="search">
        <TextField className="flex-1" label={copy.search.label} placeholder={copy.search.placeholder} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" inputMode="search" />
        <Button type="submit" variant="primary" aria-label={copy.search.submit} disabled={state.kind === 'busy'}>
          <MagnifyingGlass size={20} weight="bold" />
          <span className="hidden sm:inline">{copy.search.submit}</span>
        </Button>
      </form>
      <div aria-live="polite">
        {state.kind === 'results' && state.places.length === 0 && <p className="text-sm text-fg-2">{copy.search.none}</p>}
        {state.kind === 'results' && state.places.length > 0 && (
          <ul aria-label={copy.search.results} className="grid gap-px border border-line bg-line">
            {state.places.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button type="button" className="w-full bg-bg px-3 py-3 text-left hover:bg-panel" onClick={() => { setState({ kind: 'idle' }); onSelect(p) }}>{p.name}</button>
              </li>
            ))}
          </ul>
        )}
        {state.kind === 'swapped' && (
          <div className="grid gap-2 text-sm">
            <p className="text-warn">{copy.search.swapped(state.lat, state.lon)}</p>
            <Button size="sm" onClick={() => { setState({ kind: 'idle' }); onSelect({ name: copy.search.coordsResult(state.lon, state.lat), lat: state.lon, lon: state.lat, bbox: null }) }}>{copy.search.useSwapped}</Button>
          </div>
        )}
        {state.kind === 'error' && <p className="text-sm text-bad">{copy.search.failed}</p>}
        <p className="mt-2 text-xs text-fg-2">{copy.search.attribution}</p>
      </div>
    </div>
  )
}
```

Replace `src/screens/GlobeScreen.tsx` (adds search and fly-to; B7 adds satellites):
```tsx
import { useEffect, useState } from 'react'
import { Link } from '../lib/router.tsx'
import { flyToPlace, placeToQuery } from '../map/camera.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import type { Place } from '../search/nominatim.ts'
import { copy } from '../ui/copy.ts'
import { Button } from '../ui/kit.tsx'
import { SearchBox } from '../ui/SearchBox.tsx'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function GlobeScreen() {
  useMapLayout('globe')
  const { map, tier, setTierOverride } = useMapStage()
  const [place, setPlace] = useState<Place | null>(null)

  // Slow auto-rotation on the landing globe: stops on interaction, after 30 s, past zoom 3, or under reduced motion.
  useEffect(() => {
    if (!map || tier < 2 || reducedMotion()) return
    let raf = 0
    let stopped = false
    let last = performance.now()
    const started = last
    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
    const tick = (now: number) => {
      if (stopped) return
      if (now - started > 30_000 || map.getZoom() > 3) return stop()
      const c = map.getCenter()
      map.setCenter([c.lng + ((now - last) / 1000) * 2, c.lat])
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    map.on('mousedown', stop)
    map.on('touchstart', stop)
    map.on('wheel', stop)
    return () => {
      stop()
      map.off('mousedown', stop)
      map.off('touchstart', stop)
      map.off('wheel', stop)
    }
  }, [map, tier])


  const select = (p: Place) => {
    setPlace(p)
    if (map) flyToPlace(map, p, reducedMotion())
  }

  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[38%_1fr]">
      <section className="pointer-events-auto relative z-10 mt-[calc(55dvh-56px)] flex flex-col justify-end gap-6 bg-bg p-6 pb-10 lg:mt-0 lg:justify-center lg:p-12">
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.04em]">{copy.app.promise}</h1>
        <SearchBox onSelect={select} />
        <div className="flex flex-wrap gap-3">
          <Link to={place ? placeToQuery(place) : '/new'} className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg">
            {place ? copy.nav.startHere : copy.nav.newInvestigation}
          </Link>
          <Link to="/new?example=nagpur" className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg">
            {copy.nav.example}
          </Link>
        </div>
        {tier === 0 && (
          <p className="max-w-[60ch] text-sm text-fg-2" role="status">
            {copy.map.staticNotice}
          </p>
        )}
        {(tier === 1 || tier === 2) && (
          <div className="flex items-center gap-3 text-sm text-fg-2">
            <span className="font-mono uppercase tracking-[0.06em]">{copy.map.lite}</span>
            <Button size="sm" variant="ghost" onClick={() => setTierOverride(3)}>
              {copy.map.switchFull}
            </Button>
          </div>
        )}
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}
```

- [ ] **Step 5: Write the E2E test `tests/e2e/search.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

test('search Nagpur, pick it, and start an investigation there', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('Nagpur')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.getByRole('button', { name: 'Nagpur, Maharashtra, India' }).click()
  await expect(page.getByRole('link', { name: copy.nav.startHere })).toHaveAttribute('href', '/new?lat=21.145800&lon=79.088200&name=Nagpur')
})

test('swapped Indian coordinates get a hint and a one-tap fix', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('79.0882, 21.1458')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect(page.getByText(copy.search.swapped(79.0882, 21.1458))).toBeVisible()
  await page.getByRole('button', { name: copy.search.useSwapped }).click()
  await expect(page.getByRole('link', { name: copy.nav.startHere })).toHaveAttribute('href', /lat=21\.145800&lon=79\.088200/)
})

test('unknown places say so plainly', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('Zzzxq')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await expect(page.getByText(copy.search.none)).toBeVisible()
})

test('selecting a place flies the globe there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tier=2')
  test.skip(!(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))), 'no WebGL2')
  await page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  await page.waitForFunction(() => Math.abs((window as any).__gs.map.getCenter().lng - 79.0882) < 0.01)
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/search && npm run check && npm run e2e`
Expected: nominatim 5 PASS, E2E green.

- [ ] **Step 7: Commit**

```bash
git add src tests/e2e
git commit -m "feat(search): Nominatim on submit with 1 req/s throttle and cache, coordinate fast path, fly-to

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B6: CelesTrak edge route (Cloudflare Worker) with dev/preview middleware

**Files:**
- Create: `worker/tle.ts`, `worker/index.ts`, `wrangler.jsonc`
- Modify: `vite.config.ts` (dev/preview middleware for `/api/tle`)
- Test: `worker/tle.test.ts`

**Interfaces:**
- Produces:
  - `SAT_IDS: number[]`, `UPSTREAM: string`
  - `interface TleCache { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> }`
  - `handleTle(req: Request, deps: { fetch: typeof fetch; cache: TleCache; upstream?: string; now?: () => number }): Promise<Response>` (fresh for 2 h, stale on error with `x-gs-stale: 1`, else 503)
  - Worker default export `{ fetch(req, env) }` with assets binding `ASSETS`.

- [ ] **Step 1: Write the failing test `worker/tle.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { handleTle, SAT_IDS, type TleCache } from './tle.ts'

const SATS = JSON.parse(readFileSync(new URL('../tests/fixtures/tle.json', import.meta.url), 'utf8')) as Array<{ NORAD_CAT_ID: number }>
const NOISE = [{ OBJECT_NAME: 'OTHER', NORAD_CAT_ID: 1 }]
const memCache = (): TleCache => {
  const m = new Map<string, Response>()
  return { match: async (r) => m.get(r.url)?.clone(), put: async (r, res) => { m.set(r.url, res.clone()) } }
}
const REQ = new Request('https://app.example/api/tle')

describe('handleTle', () => {
  it('fetches upstream once and returns only our five satellites', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([...NOISE, ...SATS])))
    const res = await handleTle(REQ, { fetch: fetchImpl, cache: memCache(), now: () => 0 })
    const body = (await res.json()) as Array<{ NORAD_CAT_ID: number }>
    expect(body.map((o) => o.NORAD_CAT_ID).sort()).toEqual([...SAT_IDS].sort())
    expect(res.headers.get('content-type')).toContain('application/json')
  })
  it('serves from cache for 2 hours, then refreshes', async () => {
    const cache = memCache()
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify(SATS)))
    await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 0 })
    await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 7_199_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 7_201_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('serves stale data when upstream fails, 503 when nothing is cached', async () => {
    const cache = memCache()
    await handleTle(REQ, { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(SATS))), cache, now: () => 0 })
    const stale = await handleTle(REQ, { fetch: vi.fn().mockResolvedValue(new Response('', { status: 502 })), cache, now: () => 9e9 })
    expect(stale.status).toBe(200)
    expect(stale.headers.get('x-gs-stale')).toBe('1')
    const none = await handleTle(REQ, { fetch: vi.fn().mockRejectedValue(new Error('down')), cache: memCache(), now: () => 0 })
    expect(none.status).toBe(503)
  })
  it('treats an upstream list without our satellites as a failure', async () => {
    const res = await handleTle(REQ, { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(NOISE))), cache: memCache(), now: () => 0 })
    expect(res.status).toBe(503)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run worker/tle.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `worker/tle.ts`, `worker/index.ts`, `wrangler.jsonc`**

`worker/tle.ts`:
```ts
export const SAT_IDS = [40697, 42063, 60989, 39084, 49260]
export const UPSTREAM = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json'
const FRESH_MS = 2 * 60 * 60 * 1000

export interface TleCache {
  match(req: Request): Promise<Response | undefined>
  put(req: Request, res: Response): Promise<void>
}

const json = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } })

export async function handleTle(req: Request, deps: { fetch: typeof fetch; cache: TleCache; upstream?: string; now?: () => number }): Promise<Response> {
  const now = deps.now ?? Date.now
  const key = new Request(new URL('/api/tle?v=1', req.url).toString())
  const cached = await deps.cache.match(key)
  const cachedBody = cached ? await cached.text() : null
  const fetchedAt = Number(cached?.headers.get('x-gs-fetched') ?? -Infinity)
  if (cachedBody && now() - fetchedAt < FRESH_MS) return json(cachedBody, 200, { 'cache-control': 'public, max-age=600' })
  try {
    const up = await deps.fetch(deps.upstream ?? UPSTREAM, { headers: { 'user-agent': 'GrahSaboot/1.0' } })
    if (!up.ok) throw new Error(`UPSTREAM_${up.status}`)
    const all = (await up.json()) as Array<{ NORAD_CAT_ID?: number }>
    const subset = Array.isArray(all) ? all.filter((o) => SAT_IDS.includes(Number(o.NORAD_CAT_ID))) : []
    if (subset.length === 0) throw new Error('UPSTREAM_EMPTY')
    const body = JSON.stringify(subset)
    await deps.cache.put(key, json(body, 200, { 'cache-control': 'public, max-age=86400', 'x-gs-fetched': String(now()) }))
    return json(body, 200, { 'cache-control': 'public, max-age=600' })
  } catch {
    if (cachedBody) return json(cachedBody, 200, { 'x-gs-stale': '1', 'cache-control': 'public, max-age=300' })
    return json(JSON.stringify({ error: 'TLE_UNAVAILABLE' }), 503)
  }
}
```

`worker/index.ts`:
```ts
import { handleTle, type TleCache } from './tle.ts'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/tle') {
      const cache = (caches as unknown as { default: TleCache }).default
      return handleTle(req, { fetch, cache })
    }
    return env.ASSETS.fetch(req)
  },
}
```

`wrangler.jsonc`:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "grahsaboot",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

- [ ] **Step 4: Replace `vite.config.ts` with the dev/preview middleware version**

```ts
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
  const mw = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/tle')) return next()
    const r = await handleTle(new Request(`http://localhost${req.url}`), { fetch, cache })
    res.statusCode = r.status
    r.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(Buffer.from(await r.arrayBuffer()))
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

- [ ] **Step 5: Run tests and check the Worker bundles**

Run: `npx vitest run worker && npm run check && npx wrangler deploy --dry-run --outdir /tmp/gs-worker-dry`
Expected: tle 4 PASS. Wrangler dry run bundles `worker/index.ts` without errors (no deploy, no login needed).

- [ ] **Step 6: Probe P8 (live, read-only) and record it**

```bash
node -e "fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json').then(async (r) => { const all = await r.json(); console.log(r.status, [40697, 42063, 60989, 39084, 49260].map((id) => id + ':' + all.some((s) => s.NORAD_CAT_ID === id)).join(' ')) })"
```
Expected: `200` and all five IDs `true` (Sentinel-2A/2B/2C, Landsat 8/9).

Then read the Nominatim usage policy at `https://operations.osmfoundation.org/policies/nominatim/`. Confirm that it still allows search on submit at most once per second, with the browser's Referer identifying the app, no autocomplete, and attribution shown. Never put a personal email in a User-Agent or URL.

In `docs/ops/probes.md`, mark P8 `pass` with today's date and both results. If any of the five IDs is missing, mark P8 `fail` and stop: the satellite catalogue in Task B7 depends on them.

- [ ] **Step 7: Commit**

```bash
git add worker wrangler.jsonc vite.config.ts docs/ops/probes.md
git commit -m "feat(edge): cached CelesTrak /api/tle route on Cloudflare Workers with stale fallback

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task B7: Live satellites (orbit maths, worker, map layers, panel, next pass)

**Files:**
- Create: `src/sats/catalog.ts`, `src/sats/orbit.ts`, `src/sats/sats.worker.ts`, `src/sats/useSatellites.ts`, `src/map/satLayers.ts`, `src/ui/SatellitesPanel.tsx`, `src/lib/useMediaQuery.ts`
- Modify: `src/screens/GlobeScreen.tsx`, `src/styles.css` (`.sat-dot`)
- Test: `src/sats/orbit.test.ts`, `tests/e2e/sats.spec.ts`

**Interfaces:**
- Consumes: fixture `tests/fixtures/tle.json`, `useMapStage` (B4), `Place` (B5).
- Produces:
  - `SATELLITES: SatDef[]` (`{ norad, name, short, swathKm, family: 'sentinel-2' | 'landsat' }`)
  - `type Omm = Parameters<typeof json2satrec>[0]`
  - `subPoint(rec, t): { lon; lat; heightKm } | null`
  - `groundTrack(rec, center: Date, minutes = 45, stepS = 30): LonLat[]` (longitudes unwrapped, so they are continuous)
  - `swathRing(track: LonLat[], halfKm: number): LonLat[]` (closed)
  - `nextPasses(rec, target: LonLat, halfKm: number, from: Date, days = 10, stepS = 60): Array<{ time: Date; distanceKm: number }>`
  - `useSatellites(enabled: boolean): { status: 'loading' | 'ready' | 'unavailable'; sats: SatPosition[]; tracks: FeatureCollection | null; swaths: FeatureCollection | null; passes(target: LonLat): Promise<PassSummary[]> }`
  - `installSatLayers(map)` / `uninstallSatLayers(map)` / `updateSatLayers(map, tracks, swaths)`
  - `SatellitesPanel({ place, sats, status, passes })`

- [ ] **Step 1: Write the failing test `src/sats/orbit.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { groundTrack, nextPasses, subPoint, swathRing, toSatrec, type Omm } from './orbit.ts'
import { SATELLITES } from './catalog.ts'

const OMM = JSON.parse(readFileSync(new URL('../../tests/fixtures/tle.json', import.meta.url), 'utf8')) as Omm[]
const rec = (norad: number) => toSatrec(OMM.find((o) => Number(o.NORAD_CAT_ID) === norad)!)
const NAGPUR: [number, number] = [79.0882, 21.1458]

describe('orbit maths (vectors computed in planning, 2026-10-05)', () => {
  it('places Sentinel-2C at its sub-satellite point', () => {
    const p = subPoint(rec(60989), new Date('2026-10-05T05:30:00Z'))!
    expect(p.lat).toBeCloseTo(-67.09, 1)
    expect(p.lon).toBeCloseTo(-84.207, 1)
    expect(p.heightKm).toBeGreaterThan(810)
    expect(p.heightKm).toBeLessThan(820)
  })
  it('builds a continuous ±45 min track (no antimeridian jumps)', () => {
    const t = groundTrack(rec(42063), new Date('2026-10-05T05:30:00Z'))
    expect(t).toHaveLength(181)
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i]![0] - t[i - 1]![0])).toBeLessThan(30)
  })
  it('closes the swath ring around the track', () => {
    const t = groundTrack(rec(42063), new Date('2026-10-05T05:30:00Z'))
    const ring = swathRing(t, 145)
    expect(ring).toHaveLength(t.length * 2 + 1)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
  it('finds the next daylight descending passes over Nagpur', () => {
    const from = new Date('2026-10-05T00:00:00Z')
    const s2b = nextPasses(rec(42063), NAGPUR, 145, from)
    expect(s2b[0]!.time.getTime()).toBeGreaterThan(Date.parse('2026-10-09T05:21:00Z'))
    expect(s2b[0]!.time.getTime()).toBeLessThan(Date.parse('2026-10-09T05:26:00Z'))
    expect(s2b[0]!.distanceKm).toBeGreaterThan(90)
    expect(s2b[0]!.distanceKm).toBeLessThan(120)
    const s2c = nextPasses(rec(60989), NAGPUR, 145, from)
    expect(s2c[0]!.time.toISOString().slice(0, 13)).toBe('2026-10-14T05')
    expect(nextPasses(rec(40697), NAGPUR, 145, from)).toEqual([])
  })
  it('knows every catalogued satellite', () => {
    expect(SATELLITES.map((s) => s.norad).sort()).toEqual(OMM.map((o) => Number(o.NORAD_CAT_ID)).sort())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/sats/orbit.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/sats/catalog.ts` and `src/sats/orbit.ts`**

`src/sats/catalog.ts`:
```ts
export interface SatDef { norad: number; name: string; short: string; swathKm: number; family: 'sentinel-2' | 'landsat' }

export const SATELLITES: SatDef[] = [
  { norad: 40697, name: 'Sentinel-2A', short: 'S2A', swathKm: 290, family: 'sentinel-2' },
  { norad: 42063, name: 'Sentinel-2B', short: 'S2B', swathKm: 290, family: 'sentinel-2' },
  { norad: 60989, name: 'Sentinel-2C', short: 'S2C', swathKm: 290, family: 'sentinel-2' },
  { norad: 39084, name: 'Landsat 8', short: 'L8', swathKm: 185, family: 'landsat' },
  { norad: 49260, name: 'Landsat 9', short: 'L9', swathKm: 185, family: 'landsat' },
]
```

`src/sats/orbit.ts`:
```ts
import { degreesLat, degreesLong, eciToGeodetic, gstime, json2satrec, propagate, type SatRec } from 'satellite.js'
import type { LonLat } from '../evidence/types.ts'

export type Omm = Parameters<typeof json2satrec>[0]
const R = 6371.0088
const RAD = Math.PI / 180

export const toSatrec = (o: Omm): SatRec => json2satrec(o)

export function subPoint(rec: SatRec, t: Date): { lon: number; lat: number; heightKm: number } | null {
  const pv = propagate(rec, t)
  if (!pv) return null
  const g = eciToGeodetic(pv.position, gstime(t))
  return { lon: degreesLong(g.longitude), lat: degreesLat(g.latitude), heightKm: g.height }
}

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLon = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearing(a: LonLat, b: LonLat): number {
  const φ1 = a[1] * RAD, φ2 = b[1] * RAD, Δλ = (b[0] - a[0]) * RAD
  return Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)) / RAD
}

function destination([lon, lat]: LonLat, brgDeg: number, km: number): LonLat {
  const δ = km / R, θ = brgDeg * RAD, φ1 = lat * RAD
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = lon * RAD + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return [λ2 / RAD, φ2 / RAD]
}

/** Track over [center - minutes, center + minutes]; longitudes are unwrapped so lines never jump across ±180°. */
export function groundTrack(rec: SatRec, center: Date, minutes = 45, stepS = 30): LonLat[] {
  const out: LonLat[] = []
  for (let s = -minutes * 60; s <= minutes * 60; s += stepS) {
    const p = subPoint(rec, new Date(center.getTime() + s * 1000))
    if (!p) continue
    let lon = p.lon
    const prev = out[out.length - 1]
    if (prev) {
      while (lon - prev[0] > 180) lon -= 360
      while (lon - prev[0] < -180) lon += 360
    }
    out.push([lon, p.lat])
  }
  return out
}

export function swathRing(track: LonLat[], halfKm: number): LonLat[] {
  const left: LonLat[] = []
  const right: LonLat[] = []
  track.forEach((p, i) => {
    const b = bearing(track[Math.max(0, i - 1)]!, track[Math.min(track.length - 1, i + 1)]!)
    const l = destination(p, b - 90, halfKm)
    const r = destination(p, b + 90, halfKm)
    // keep ring longitudes in the same unwrapped frame as the track
    left.push([l[0] + Math.round((p[0] - l[0]) / 360) * 360, l[1]])
    right.push([r[0] + Math.round((p[0] - r[0]) / 360) * 360, r[1]])
  })
  const ring = [...left, ...right.reverse()]
  ring.push(ring[0]!)
  return ring
}

/** Local minima of distance to `target` that are descending (north to south), in local solar daytime (08–14 h), within the half swath. */
export function nextPasses(rec: SatRec, target: LonLat, halfKm: number, from: Date, days = 10, stepS = 60): Array<{ time: Date; distanceKm: number }> {
  const out: Array<{ time: Date; distanceKm: number }> = []
  let prev: { t: Date; lat: number; lon: number; d: number } | null = null
  let prevPrevD = Infinity
  for (let s = 0; s <= days * 86400; s += stepS) {
    const t = new Date(from.getTime() + s * 1000)
    const p = subPoint(rec, t)
    if (!p) continue
    const d = haversineKm(target, [p.lon, p.lat])
    if (prev && prev.d < prevPrevD && prev.d <= d) {
      const descending = p.lat < prev.lat
      const solar = (((prev.t.getUTCHours() + prev.t.getUTCMinutes() / 60 + prev.lon / 15) % 24) + 24) % 24
      if (descending && solar >= 8 && solar <= 14 && prev.d <= halfKm) out.push({ time: prev.t, distanceKm: prev.d })
    }
    prevPrevD = prev?.d ?? Infinity
    prev = { t, lat: p.lat, lon: p.lon, d }
  }
  return out
}
```

- [ ] **Step 4: Implement the worker, hook, map layers, panel and wiring**

`src/sats/sats.worker.ts`:
```ts
import type { FeatureCollection } from 'geojson'
import { SATELLITES } from './catalog.ts'
import { groundTrack, nextPasses, subPoint, swathRing, toSatrec, type Omm } from './orbit.ts'
import type { SatRec } from 'satellite.js'
import type { LonLat } from '../evidence/types.ts'

const ctx = self as unknown as Worker
let recs: Array<{ def: (typeof SATELLITES)[number]; rec: SatRec }> = []

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data as { op: 'init'; omm: Omm[] } | { op: 'tick'; t: number; withTracks: boolean } | { op: 'passes'; id: number; target: LonLat; from: number }
  if (msg.op === 'init') {
    recs = SATELLITES.flatMap((def) => {
      const o = msg.omm.find((x) => Number(x.NORAD_CAT_ID) === def.norad)
      return o ? [{ def, rec: toSatrec(o) }] : []
    })
    return
  }
  if (msg.op === 'tick') {
    const t = new Date(msg.t)
    const sats = recs.flatMap(({ def, rec }) => {
      const p = subPoint(rec, t)
      return p ? [{ norad: def.norad, name: def.name, short: def.short, lon: p.lon, lat: p.lat }] : []
    })
    let tracks: FeatureCollection | undefined
    let swaths: FeatureCollection | undefined
    if (msg.withTracks) {
      const lines = recs.map(({ def, rec }) => ({ def, track: groundTrack(rec, t) }))
      tracks = { type: 'FeatureCollection', features: lines.map(({ def, track }) => ({ type: 'Feature', properties: { norad: def.norad }, geometry: { type: 'LineString', coordinates: track } })) }
      swaths = { type: 'FeatureCollection', features: lines.map(({ def, track }) => ({ type: 'Feature', properties: { norad: def.norad }, geometry: { type: 'Polygon', coordinates: [swathRing(track, def.swathKm / 2)] } })) }
    }
    ctx.postMessage({ op: 'tick', sats, tracks, swaths })
    return
  }
  const from = new Date(msg.from)
  const passes = recs.map(({ def, rec }) => ({ norad: def.norad, name: def.name, family: def.family, times: nextPasses(rec, msg.target, def.swathKm / 2, from).map((p) => ({ time: p.time.getTime(), distanceKm: p.distanceKm })) }))
  ctx.postMessage({ op: 'passes', id: msg.id, passes })
}
```

`src/sats/useSatellites.ts`:
```ts
import type { FeatureCollection } from 'geojson'
import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config.ts'
import type { LonLat } from '../evidence/types.ts'

export interface SatPosition { norad: number; name: string; short: string; lon: number; lat: number }
export interface PassSummary { norad: number; name: string; family: 'sentinel-2' | 'landsat'; times: Array<{ time: number; distanceKm: number }> }

export function useSatellites(enabled: boolean) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [sats, setSats] = useState<SatPosition[]>([])
  const [tracks, setTracks] = useState<FeatureCollection | null>(null)
  const [swaths, setSwaths] = useState<FeatureCollection | null>(null)
  const worker = useRef<Worker | null>(null)
  const waiting = useRef(new Map<number, (p: PassSummary[]) => void>())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0
    const w = new Worker(new URL('./sats.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { op: 'tick'; sats: SatPosition[]; tracks?: FeatureCollection; swaths?: FeatureCollection } | { op: 'passes'; id: number; passes: PassSummary[] }
      if (m.op === 'tick') {
        setSats(m.sats)
        if (m.tracks) setTracks(m.tracks)
        if (m.swaths) setSwaths(m.swaths)
      } else {
        waiting.current.get(m.id)?.(m.passes)
        waiting.current.delete(m.id)
      }
    }
    fetch(config.tleUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`TLE_${r.status}`))))
      .then((omm: unknown) => {
        if (cancelled || !Array.isArray(omm) || omm.length === 0) throw new Error('TLE_EMPTY')
        w.postMessage({ op: 'init', omm })
        setStatus('ready')
        let n = 0
        const tick = () => {
          if (document.visibilityState === 'visible') w.postMessage({ op: 'tick', t: Date.now(), withTracks: n % 30 === 0 })
          n++
        }
        tick()
        timer = window.setInterval(tick, 1000)
      })
      .catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => {
      cancelled = true
      clearInterval(timer)
      w.terminate()
      worker.current = null
    }
  }, [enabled])

  const passes = useCallback((target: LonLat) => new Promise<PassSummary[]>((resolve) => {
    const id = Math.random()
    waiting.current.set(id, resolve)
    worker.current?.postMessage({ op: 'passes', id, target, from: Date.now() })
  }), [])

  return { status, sats, tracks, swaths, passes }
}
```

`src/map/satLayers.ts`:
```ts
import type { FeatureCollection } from 'geojson'
import { Marker, type GeoJSONSource, type Map as MlMap } from 'maplibre-gl'
import type { SatPosition } from '../sats/useSatellites.ts'

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function installSatLayers(map: MlMap) {
  if (!map.getSource('gs-sat-swath')) map.addSource('gs-sat-swath', { type: 'geojson', data: EMPTY })
  if (!map.getSource('gs-sat-track')) map.addSource('gs-sat-track', { type: 'geojson', data: EMPTY })
  if (!map.getLayer('gs-sat-swath')) map.addLayer({ id: 'gs-sat-swath', type: 'fill', source: 'gs-sat-swath', paint: { 'fill-color': '#e48444', 'fill-opacity': 0.08 } })
  if (!map.getLayer('gs-sat-track')) map.addLayer({ id: 'gs-sat-track', type: 'line', source: 'gs-sat-track', paint: { 'line-color': '#a1a1aa', 'line-width': 1, 'line-dasharray': [2, 2] } })
}

export function uninstallSatLayers(map: MlMap) {
  for (const id of ['gs-sat-track', 'gs-sat-swath']) {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  }
}

export function updateSatLayers(map: MlMap, tracks: FeatureCollection | null, swaths: FeatureCollection | null) {
  if (tracks) (map.getSource('gs-sat-track') as GeoJSONSource | undefined)?.setData(tracks)
  if (swaths) (map.getSource('gs-sat-swath') as GeoJSONSource | undefined)?.setData(swaths)
}

/** DOM markers survive style reloads; one per satellite. */
export function syncSatMarkers(map: MlMap, markers: Map<number, Marker>, sats: SatPosition[]) {
  for (const s of sats) {
    let m = markers.get(s.norad)
    if (!m) {
      // MapLibre positions the marker element with `transform`; the breathing dot is a child so its animation cannot fight that.
      const el = document.createElement('div')
      el.className = 'sat-marker'
      el.setAttribute('aria-hidden', 'true')
      el.dataset.label = s.short
      const dot = document.createElement('span')
      dot.className = 'sat-dot'
      el.append(dot)
      m = new Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map)
      markers.set(s.norad, m)
    } else m.setLngLat([s.lon, s.lat])
  }
}
```

Append to `src/styles.css`:
```css
.sat-marker {
  position: relative;
  width: 10px;
  height: 10px;
}
.sat-marker::after {
  content: attr(data-label);
  position: absolute;
  left: 14px;
  top: -2px;
  white-space: nowrap;
  font: 500 11px/1 var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--gs-fg);
}
.sat-dot {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: var(--gs-ok);
  box-shadow: 0 0 0 2px var(--gs-bg);
  animation: sat-breathe 2.4s ease-in-out infinite;
}
@keyframes sat-breathe {
  50% {
    transform: scale(1.35);
    opacity: 0.7;
  }
}
```

`src/ui/SatellitesPanel.tsx`:
```tsx
import { useEffect, useState } from 'react'
import type { Place } from '../search/nominatim.ts'
import type { PassSummary, SatPosition } from '../sats/useSatellites.ts'
import { copy } from './copy.ts'
import { MicroLabel } from './kit.tsx'

const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function SatellitesPanel({ sats, status, place, passes }: { sats: SatPosition[]; status: 'loading' | 'ready' | 'unavailable'; place: Place | null; passes(target: [number, number]): Promise<PassSummary[]> }) {
  const [next, setNext] = useState<PassSummary[] | null>(null)
  useEffect(() => {
    setNext(null)
    if (!place || status !== 'ready') return
    let live = true
    passes([place.lon, place.lat]).then((p) => { if (live) setNext(p) })
    return () => { live = false }
  }, [place, status, passes])

  const earliest = (family: PassSummary['family']) =>
    next?.filter((p) => p.family === family).flatMap((p) => p.times.slice(0, 1).map((t) => ({ name: p.name, ...t }))).sort((a, b) => a.time - b.time)[0]

  return (
    <section aria-label={copy.sats.title} className="glass no-print w-full max-w-[360px] p-4 text-sm">
      <header className="mb-3 flex items-center justify-between">
        <MicroLabel>{copy.sats.title}</MicroLabel>
        {status === 'ready' && (
          <span className="inline-flex items-center gap-2 font-mono text-[0.75rem] uppercase tracking-[0.06em] text-ok">
            <span className="sat-dot inline-block" style={{ width: 8, height: 8 }} aria-hidden />
            {copy.sats.live}
          </span>
        )}
      </header>
      {status === 'loading' && <p className="text-fg-2">{copy.sats.loading}</p>}
      {status === 'unavailable' && <p className="text-fg-2" role="status">{copy.sats.unavailable}</p>}
      {status === 'ready' && (
        <ul className="grid gap-1 font-mono num">
          {sats.map((s) => (
            <li key={s.norad} className="flex justify-between gap-3">
              <span>{s.name}</span>
              <span className="text-fg-2">{copy.sats.position(s.lat, s.lon)}</span>
            </li>
          ))}
        </ul>
      )}
      {place && status === 'ready' && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="font-medium">{copy.sats.nextLook(place.name.split(',')[0]!)}</p>
          {next === null ? (
            <p className="text-fg-2">{copy.common.loading}</p>
          ) : (
            <ul className="mt-1 grid gap-1">
              {(['sentinel-2', 'landsat'] as const).map((f) => {
                const e = earliest(f)
                return <li key={f}>{e ? `${e.name}: ${fmt.format(new Date(e.time))}` : `${f === 'sentinel-2' ? 'Sentinel-2' : 'Landsat'}: ${copy.sats.noPass}`}</li>
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-fg-2">{copy.sats.estimated}</p>
        </div>
      )}
    </section>
  )
}
```

`src/lib/useMediaQuery.ts`:
```ts
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
    () => false,
  )
}
```

Replace `src/screens/GlobeScreen.tsx` with the final version (search + satellites + rotation). The satellites panel renders once: in the content column on mobile, and inside the right grid cell on desktop. That cell scrolls with the page, so the panel never covers the footer links:
```tsx
import type { Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { Link } from '../lib/router.tsx'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { flyToPlace, placeToQuery } from '../map/camera.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { installSatLayers, syncSatMarkers, uninstallSatLayers, updateSatLayers } from '../map/satLayers.ts'
import type { Place } from '../search/nominatim.ts'
import { useSatellites } from '../sats/useSatellites.ts'
import { copy } from '../ui/copy.ts'
import { Button } from '../ui/kit.tsx'
import { SatellitesPanel } from '../ui/SatellitesPanel.tsx'
import { SearchBox } from '../ui/SearchBox.tsx'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function GlobeScreen() {
  useMapLayout('globe')
  const { map, tier, setTierOverride, installLayers } = useMapStage()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [place, setPlace] = useState<Place | null>(null)
  const { sats, status, tracks, swaths, passes } = useSatellites(true)
  const markers = useRef(new Map<number, Marker>())
  const latest = useRef({ tracks, swaths })
  latest.current = { tracks, swaths }

  // Slow auto-rotation on the landing globe: stops on interaction, after 30 s, past zoom 3, or under reduced motion.
  useEffect(() => {
    if (!map || tier < 2 || reducedMotion()) return
    let raf = 0
    let stopped = false
    let last = performance.now()
    const started = last
    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
    const tick = (now: number) => {
      if (stopped) return
      if (now - started > 30_000 || map.getZoom() > 3) return stop()
      const c = map.getCenter()
      map.setCenter([c.lng + ((now - last) / 1000) * 2, c.lat])
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    map.on('mousedown', stop)
    map.on('touchstart', stop)
    map.on('wheel', stop)
    return () => {
      stop()
      map.off('mousedown', stop)
      map.off('touchstart', stop)
      map.off('wheel', stop)
    }
  }, [map, tier])

  // Satellite layers (T2+). The installer re-applies the latest data after a style reload (theme switch).
  useEffect(
    () =>
      map && tier >= 2
        ? installLayers(
            'sats',
            (m) => {
              installSatLayers(m)
              updateSatLayers(m, latest.current.tracks, latest.current.swaths)
            },
            uninstallSatLayers,
          )
        : undefined,
    [map, tier, installLayers],
  )
  useEffect(() => {
    if (map && tier >= 2) updateSatLayers(map, tracks, swaths)
  }, [map, tier, tracks, swaths])
  useEffect(() => {
    if (map && tier >= 2) syncSatMarkers(map, markers.current, sats)
  }, [map, tier, sats])
  useEffect(() => {
    const all = markers.current
    return () => {
      for (const m of all.values()) m.remove()
      all.clear()
    }
  }, [map])

  const select = (p: Place) => {
    setPlace(p)
    if (map) flyToPlace(map, p, reducedMotion())
  }
  const panel = <SatellitesPanel sats={sats} status={status} place={place} passes={passes} />

  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[38%_1fr]">
      <section className="pointer-events-auto relative z-10 mt-[calc(55dvh-56px)] flex flex-col justify-end gap-6 bg-bg p-6 pb-10 lg:mt-0 lg:justify-center lg:p-12">
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.04em]">{copy.app.promise}</h1>
        <SearchBox onSelect={select} />
        <div className="flex flex-wrap gap-3">
          <Link to={place ? placeToQuery(place) : '/new'} className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg">
            {place ? copy.nav.startHere : copy.nav.newInvestigation}
          </Link>
          <Link to="/new?example=nagpur" className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg">
            {copy.nav.example}
          </Link>
        </div>
        {tier === 0 && (
          <p className="max-w-[60ch] text-sm text-fg-2" role="status">
            {copy.map.staticNotice}
          </p>
        )}
        {(tier === 1 || tier === 2) && (
          <div className="flex items-center gap-3 text-sm text-fg-2">
            <span className="font-mono uppercase tracking-[0.06em]">{copy.map.lite}</span>
            <Button size="sm" variant="ghost" onClick={() => setTierOverride(3)}>
              {copy.map.switchFull}
            </Button>
          </div>
        )}
        {!desktop && panel}
      </section>
      <div className="relative hidden lg:block">{desktop && <div className="pointer-events-auto absolute bottom-6 right-6 z-20">{panel}</div>}</div>
    </div>
  )
}
```

- [ ] **Step 5: Write the E2E test `tests/e2e/sats.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'

test.use({ viewport: { width: 1440, height: 900 } })

test('lists the five satellites with live positions', async ({ page }) => {
  await page.goto('/?tier=0')
  const panel = page.getByRole('region', { name: copy.sats.title })
  for (const name of ['Sentinel-2A', 'Sentinel-2B', 'Sentinel-2C', 'Landsat 8', 'Landsat 9']) await expect(panel.getByText(name)).toBeVisible()
  await expect(panel.getByText(/\d+\.\d°[NS] \d+\.\d°[EW]/).first()).toBeVisible()
})

test('shows an estimated next look after picking a place', async ({ page }) => {
  await page.goto('/?tier=0')
  await page.getByLabel(copy.search.label).fill('21.1458, 79.0882')
  await page.getByRole('button', { name: copy.search.submit }).click()
  const panel = page.getByRole('region', { name: copy.sats.title })
  await expect(panel.getByText(/^Next look at/)).toBeVisible()
  await expect(panel.getByText(copy.sats.estimated)).toBeVisible()
})

test('stays calm when CelesTrak data is unavailable', async ({ page }) => {
  await page.route('**/tle', (r) => r.fulfill({ status: 503, body: '{}' }))
  await page.goto('/?tier=0')
  await expect(page.getByText(copy.sats.unavailable)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('theme switch keeps satellite map layers', async ({ page }) => {
  await page.goto('/?tier=2')
  test.skip(!(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))), 'no WebGL2')
  await page.waitForFunction(() => !!(window as any).__gs?.map?.getSource('gs-sat-track'))
  await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  await page.waitForFunction(() => (window as any).__gs.map.getStyle().layers.find((l: any) => l.id === 'bg')?.paint?.['background-color'] === '#FFFFFF')
  await page.waitForFunction(() => !!(window as any).__gs.map.getSource('gs-sat-track') && !!(window as any).__gs.map.getLayer('gs-sat-swath'))
})
```
At T0 the panel must still render (text list), so the tests do not depend on WebGL. Make sure `useSatellites(true)` is enabled at every tier and only the map layers are gated by `tier >= 2`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/sats && npm run check && npm run e2e`
Expected: orbit 5 PASS; E2E green.

- [ ] **Step 7: Commit**

```bash
git add src tests/e2e
git commit -m "feat(sats): live Sentinel-2/Landsat positions, tracks, swaths and estimated next pass

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase B exit criteria

- `npm run check` and `npm run e2e` are green on every available engine; the T0 tests pass everywhere.
- Axe reports zero violations on `/limits`, `/privacy` and `/dev/kit` in both themes.
- `dist/` entry JS stays small. MapLibre lives in a lazy chunk; record entry gzip size: `gzip -c dist/assets/index-*.js | wc -c`. Target ≤ 150 KB.
- `docs/ops/probes.md` P5 (globe frame time with 4× CPU throttle in Chromium DevTools on a mid-range profile) and P6 (OpenFreeMap buildings and styles; the EOX 2016 WMTS layer id from `https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml`) are filled in by a human-observed run, or marked "pending device".
