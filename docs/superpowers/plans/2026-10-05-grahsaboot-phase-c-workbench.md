# GrahSaboot Phase C: Investigation Flow, Evidence Workbench, Report and First Preview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete anonymous product. A user outlines a site or road, picks dates, sees every Sentinel-2 pass cloud-checked on a timeline, compares two dates (swipe / side by side / difference), reads a road section × date grid, writes notes and an optional claim, and exports a self-contained evidence report. It works on every device tier, and ships as a public preview.

**Architecture:** Investigations are plain objects changed only through pure functions (`src/data/investigation.ts`) and persisted in IndexedDB. A framework-free evidence runner (`src/workbench/runner.ts`) searches STAC, then schedules quality checks (both ends of the range first), thumbnails and full frames through the Phase A imagery worker with bounded concurrency and one abort. React screens render its state. The report is one HTML string built from the same state, previewed in a sandboxed iframe, downloaded as a file or printed.

**Tech Stack:** React 19.3, terra-draw 1.36 + MapLibre adapter 1.4.1, motion 14 (`animate` from `motion/react`), Base UI 1.8 (already used), Phase A evidence core and imagery worker, Phase B shell, map stage and copy, Playwright 1.63 + axe 4.13, wrangler 4.147.

**Spec:** `docs/superpowers/specs/2026-10-05-grahsaboot-design.md`: §2 promise and wording, §3 journeys, §5 evidence pipeline, §6 roads, §7.4 screens, §7.5 design, §7.6 tiers, §7.7 accessibility, §9 privacy, §10 limits. Execution rules: `docs/superpowers/plans/2026-10-05-grahsaboot-plan.md`.

**Visual target (approved 2026-10-06):** `docs/design/README.md` and `docs/design/mockups/`. Mockups win on looks; this plan wins on behaviour, copy, tokens and accessibility. Also apply `docs/superpowers/plans/2026-10-06-phase-a-carry-forward.md`.

## Global Constraints

- All user-visible text lives in `src/ui/copy.ts` (Phase B) or `src/ui/copy-flow.ts` (this phase). The verdict-word test covers both files.
- STAC searches use `coarsenBbox(summary.bbox)`. The exact outline never leaves the browser in Phase C.
- Evidence ordering:
  - Quality checks run both ends of the date range first (`interleaveEnds`).
  - Concurrency is 4.
  - Thumbnails (level 1, 256 px grid) only for `CLEAR`/`PARTIAL`.
  - Full frames (level 0) only for before/after or the selected date.
  - Everything aborts on unmount.
- Default before/after: the clearest `CLEAR`/`PARTIAL` pass in the first 25 % of the range and in the last 25 %. They are applied only when the investigation has none yet and both quartiles are checked.
- Pins: ≤ 24 dates; before/after are always pinned. Notes: non-empty, ≤ 2000 characters, ≤ 200 per investigation. Claim text ≤ 2000, criterion ≤ 500.
- Swipe is a native `<input type="range">` (keyboard works). Side by side is the default under 600 px wide. The difference view always shows its caption.
- Every map-only action has a form alternative: square around a point for sites; start/end coordinates for roads. T0 (no WebGL) must complete the whole journey.
- Exported HTML:
  - Escape all user text.
  - Embed images as data URLs; no remote requests.
  - Include the provenance JSON and the attribution line "Contains modified Copernicus Sentinel data YEAR".
  - Print is white paper.
- Main-thread code imports specific evidence files, never `src/evidence/index.ts`.
- Bundle budget: entry JS ≤ 150 KB gzip (checked by `scripts/check-bundle.ts` inside `npm run check`).

## Review Focus

1. **A date range where every pass is cloudy or not covered.** The workbench says so plainly and still allows notes and a report. It must never show a blank viewer or "no change" (tests in C4, C5).
2. **Notes/claims containing HTML or script.** These render as text in the UI, the exported HTML and the provenance, and never execute (tests in C7, C9).
3. **Leaving the workbench mid-load.** Navigating away aborts all imagery and search work, and no state updates after unmount (test in C4).
4. **The 25th pin.** It is refused with a clear message. Unpinning before/after is impossible; changing them keeps the old ones pinned (test in C1).
5. **No WebGL (T0).** Every step, the workbench and the report work through forms and DOM only (test in C10).

---

### Task C1: Investigation model, local store and flow copy

**Files:**
- Create: `src/data/investigation.ts`, `src/data/store.ts`, `src/data/useInvestigation.ts`, `src/ui/copy-flow.ts`
- Modify: `src/ui/copy.test.ts` (scan every `src/ui/copy*.ts`)
- Test: `src/data/investigation.test.ts`, `src/data/store.test.ts`

**Interfaces:**
- Consumes: `AoiInput` (A3), `LIMITS` (A3), idb helpers (A10).
- Produces:
  - `type NoteKind = 'change' | 'no_clear_change' | 'unsure'`
  - `interface Note { id; kind: NoteKind; body; date: string | null; sectionIdx: number | null; createdAt; updatedAt }`
  - `interface Claim { text: string; date: string | null; criterion: string }`
  - `interface Investigation { id; serverId: string | null; name; aoi: AoiInput; dateFrom; dateTo; before: string | null; after: string | null; pinned: string[]; notes: Note[]; claim: Claim | null; createdAt; updatedAt }`
  - `class InvestigationError extends Error` with message code `'NOTE_EMPTY' | 'NOTE_TOO_LONG' | 'TOO_MANY_NOTES' | 'TOO_MANY_PINS' | 'BAD_ORDER' | 'CLAIM_TOO_LONG'`
  - Pure functions (each returns a new object):
    - `newInvestigation(input, now?, uuid?)`, `renameInvestigation(inv, name, now?)`
    - `setBeforeAfter(inv, before, after, now?)`, `togglePin(inv, date, now?)`
    - `addNote(inv, n, now?, id?)`, `updateNote(inv, id, patch, now?)`, `removeNote(inv, id, now?)`, `restoreNote(inv, note, now?)`
    - `setClaim(inv, claim | null, now?)`
  - `interface InvestigationStore { list(); get(id); put(inv); remove(id) }`, `memoryStore()`, `idbStore(name?)`, `getStore()`, `setStoreForTests(s)`
  - `useInvestigation(id): { inv: Investigation | null | undefined; update(fn: (i: Investigation) => Investigation): void; error: string | null }` (`undefined` = loading, `null` = not found)
  - `flow` copy object (exact text below)

- [ ] **Step 1: Write the failing tests**

`src/data/investigation.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { addNote, InvestigationError, newInvestigation, removeNote, renameInvestigation, restoreNote, setBeforeAfter, setClaim, togglePin, updateNote } from './investigation.ts'
import type { AoiInput } from '../geo/aoi.ts'

const AOI: AoiInput = { kind: 'site', geometry: { type: 'Polygon', coordinates: [[[79.08, 21.14], [79.09, 21.14], [79.09, 21.15], [79.08, 21.14]]] } }
const T = new Date('2026-10-05T10:00:00Z')
const base = () => newInvestigation({ name: '  Nagpur yard  ', aoi: AOI, dateFrom: '2025-01-01', dateTo: '2025-12-31' }, T, '00000000-0000-4000-8000-000000000001')
const code = (f: () => unknown) => { try { f(); return null } catch (e) { return e instanceof InvestigationError ? e.message : String(e) } }

describe('investigation model', () => {
  it('creates a local investigation with a trimmed name', () => {
    const inv = base()
    expect(inv).toMatchObject({ id: 'local-00000000-0000-4000-8000-000000000001', serverId: null, name: 'Nagpur yard', pinned: [], notes: [], claim: null, createdAt: T.toISOString() })
    expect(renameInvestigation(inv, ' x'.repeat(100), T).name.length).toBe(120)
    expect(renameInvestigation(inv, '   ', T).name).toBe('Untitled investigation')
  })
  it('sets before/after in order and always pins them', () => {
    const inv = setBeforeAfter(base(), '2025-01-10', '2025-12-20', T)
    expect(inv.pinned).toEqual(['2025-01-10', '2025-12-20'])
    expect(code(() => setBeforeAfter(inv, '2025-12-20', '2025-01-10', T))).toBe('BAD_ORDER')
    const moved = setBeforeAfter(inv, '2025-03-05', '2025-12-20', T)
    expect(moved.pinned).toEqual(['2025-01-10', '2025-03-05', '2025-12-20'])
  })
  it('refuses to unpin before/after and refuses the 25th pin', () => {
    let inv = setBeforeAfter(base(), '2025-01-01', '2025-12-31', T)
    expect(togglePin(inv, '2025-01-01', T)).toBe(inv)
    for (let d = 2; inv.pinned.length < 24; d++) inv = togglePin(inv, `2025-02-${String(d).padStart(2, '0')}`, T)
    expect(code(() => togglePin(inv, '2025-03-01', T))).toBe('TOO_MANY_PINS')
    expect(togglePin(inv, '2025-02-02', T).pinned).not.toContain('2025-02-02')
  })
  it('validates, edits, removes and restores notes', () => {
    expect(code(() => addNote(base(), { kind: 'change', body: '   ', date: null, sectionIdx: null }, T))).toBe('NOTE_EMPTY')
    expect(code(() => addNote(base(), { kind: 'change', body: 'x'.repeat(2001), date: null, sectionIdx: null }, T))).toBe('NOTE_TOO_LONG')
    let inv = addNote(base(), { kind: 'change', body: ' New roof ', date: '2025-12-20', sectionIdx: null }, T, 'n1')
    expect(inv.notes[0]).toMatchObject({ id: 'n1', body: 'New roof', kind: 'change' })
    inv = updateNote(inv, 'n1', { kind: 'unsure', body: 'Maybe a roof' }, T)
    expect(inv.notes[0]).toMatchObject({ kind: 'unsure', body: 'Maybe a roof' })
    const note = inv.notes[0]!
    inv = removeNote(inv, 'n1', T)
    expect(inv.notes).toEqual([])
    expect(restoreNote(inv, note, T).notes).toEqual([note])
  })
  it('caps notes at 200', () => {
    let inv = base()
    for (let i = 0; i < 200; i++) inv = addNote(inv, { kind: 'unsure', body: `n${i}`, date: null, sectionIdx: null }, T, `id${i}`)
    expect(code(() => addNote(inv, { kind: 'unsure', body: 'one more', date: null, sectionIdx: null }, T))).toBe('TOO_MANY_NOTES')
  })
  it('validates claims', () => {
    expect(setClaim(base(), { text: 'Road laid by June', date: '2025-06-30', criterion: 'Dark surface along the line' }, T).claim?.text).toBe('Road laid by June')
    expect(code(() => setClaim(base(), { text: 'x'.repeat(2001), date: null, criterion: '' }, T))).toBe('CLAIM_TOO_LONG')
    expect(setClaim(base(), null, T).claim).toBeNull()
  })
})
```

`src/data/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { memoryStore } from './store.ts'
import { newInvestigation } from './investigation.ts'

const inv = (n: number, t: string) => newInvestigation({ name: `I${n}`, aoi: { kind: 'road', geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0.01]] }, widthM: 30 }, dateFrom: '2025-01-01', dateTo: '2025-02-01' }, new Date(t), `00000000-0000-4000-8000-00000000000${n}`)

describe('memoryStore', () => {
  it('round-trips copies and lists newest first', async () => {
    const s = memoryStore()
    const a = inv(1, '2026-01-01T00:00:00Z'), b = inv(2, '2026-02-01T00:00:00Z')
    await s.put(a)
    await s.put(b)
    expect((await s.list()).map((x) => x.name)).toEqual(['I2', 'I1'])
    const got = await s.get(a.id)
    got!.name = 'mutated'
    expect((await s.get(a.id))!.name).toBe('I1')
    await s.remove(a.id)
    expect(await s.get(a.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/data`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/data/investigation.ts`**

```ts
import type { AoiInput } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'

export type NoteKind = 'change' | 'no_clear_change' | 'unsure'
export interface Note { id: string; kind: NoteKind; body: string; date: string | null; sectionIdx: number | null; createdAt: string; updatedAt: string }
export interface Claim { text: string; date: string | null; criterion: string }
export interface Investigation {
  id: string
  serverId: string | null
  name: string
  aoi: AoiInput
  dateFrom: string
  dateTo: string
  before: string | null
  after: string | null
  pinned: string[]
  notes: Note[]
  claim: Claim | null
  createdAt: string
  updatedAt: string
}

export class InvestigationError extends Error {}

const iso = (d: Date) => d.toISOString()
const uniqSorted = (xs: string[]) => [...new Set(xs)].sort()
const cleanName = (name: string) => name.trim().slice(0, 120) || 'Untitled investigation'

export function newInvestigation(input: Pick<Investigation, 'name' | 'aoi' | 'dateFrom' | 'dateTo'>, now = new Date(), uuid: string = crypto.randomUUID()): Investigation {
  return {
    id: `local-${uuid}`, serverId: null, name: cleanName(input.name), aoi: input.aoi, dateFrom: input.dateFrom, dateTo: input.dateTo,
    before: null, after: null, pinned: [], notes: [], claim: null, createdAt: iso(now), updatedAt: iso(now),
  }
}

export const renameInvestigation = (inv: Investigation, name: string, now = new Date()): Investigation => ({ ...inv, name: cleanName(name), updatedAt: iso(now) })

export function setBeforeAfter(inv: Investigation, before: string, after: string, now = new Date()): Investigation {
  if (before >= after) throw new InvestigationError('BAD_ORDER')
  const pinned = uniqSorted([...inv.pinned, before, after])
  if (pinned.length > LIMITS.pinnedDates) throw new InvestigationError('TOO_MANY_PINS')
  return { ...inv, before, after, pinned, updatedAt: iso(now) }
}

export function togglePin(inv: Investigation, date: string, now = new Date()): Investigation {
  if (date === inv.before || date === inv.after) return inv
  if (inv.pinned.includes(date)) return { ...inv, pinned: inv.pinned.filter((d) => d !== date), updatedAt: iso(now) }
  if (inv.pinned.length >= LIMITS.pinnedDates) throw new InvestigationError('TOO_MANY_PINS')
  return { ...inv, pinned: uniqSorted([...inv.pinned, date]), updatedAt: iso(now) }
}

function cleanBody(body: string): string {
  const b = body.trim()
  if (!b) throw new InvestigationError('NOTE_EMPTY')
  if (b.length > LIMITS.notes.maxChars) throw new InvestigationError('NOTE_TOO_LONG')
  return b
}

export function addNote(inv: Investigation, n: Pick<Note, 'kind' | 'body' | 'date' | 'sectionIdx'>, now = new Date(), id: string = crypto.randomUUID()): Investigation {
  if (inv.notes.length >= LIMITS.notes.maxPerInvestigation) throw new InvestigationError('TOO_MANY_NOTES')
  const note: Note = { id, kind: n.kind, body: cleanBody(n.body), date: n.date, sectionIdx: n.sectionIdx, createdAt: iso(now), updatedAt: iso(now) }
  return { ...inv, notes: [...inv.notes, note], updatedAt: iso(now) }
}

export function updateNote(inv: Investigation, id: string, patch: Partial<Pick<Note, 'kind' | 'body' | 'date' | 'sectionIdx'>>, now = new Date()): Investigation {
  return {
    ...inv,
    notes: inv.notes.map((n) => (n.id === id ? { ...n, ...patch, body: patch.body === undefined ? n.body : cleanBody(patch.body), updatedAt: iso(now) } : n)),
    updatedAt: iso(now),
  }
}

export const removeNote = (inv: Investigation, id: string, now = new Date()): Investigation => ({ ...inv, notes: inv.notes.filter((n) => n.id !== id), updatedAt: iso(now) })

export const restoreNote = (inv: Investigation, note: Note, now = new Date()): Investigation =>
  inv.notes.some((n) => n.id === note.id) ? inv : { ...inv, notes: [...inv.notes, note].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), updatedAt: iso(now) }

export function setClaim(inv: Investigation, claim: Claim | null, now = new Date()): Investigation {
  if (claim && (claim.text.length > 2000 || claim.criterion.length > 500)) throw new InvestigationError('CLAIM_TOO_LONG')
  return { ...inv, claim: claim ? { text: claim.text.trim(), date: claim.date, criterion: claim.criterion.trim() } : null, updatedAt: iso(now) }
}
```

- [ ] **Step 4: Implement `src/data/store.ts` and `src/data/useInvestigation.ts`**

`src/data/store.ts`:
```ts
import { idbAll, idbDelete, idbGet, idbPut, openDb } from '../lib/idb.ts'
import type { Investigation } from './investigation.ts'

export interface InvestigationStore {
  list(): Promise<Investigation[]>
  get(id: string): Promise<Investigation | undefined>
  put(inv: Investigation): Promise<void>
  remove(id: string): Promise<void>
}

const newestFirst = (a: Investigation, b: Investigation) => b.updatedAt.localeCompare(a.updatedAt)

export function memoryStore(): InvestigationStore {
  const m = new Map<string, Investigation>()
  return {
    list: async () => [...m.values()].map((i) => structuredClone(i)).sort(newestFirst),
    get: async (id) => (m.has(id) ? structuredClone(m.get(id)!) : undefined),
    put: async (inv) => { m.set(inv.id, structuredClone(inv)) },
    remove: async (id) => { m.delete(id) },
  }
}

export function idbStore(name = 'gs-investigations'): InvestigationStore {
  const db = openDb(name, ['investigations'])
  return {
    list: async () => (await idbAll<Investigation>(await db, 'investigations')).sort(newestFirst),
    get: async (id) => idbGet<Investigation>(await db, 'investigations', id),
    put: async (inv) => idbPut(await db, 'investigations', inv.id, inv),
    remove: async (id) => idbDelete(await db, 'investigations', id),
  }
}

let current: InvestigationStore | null = null
export const getStore = (): InvestigationStore => (current ??= typeof indexedDB === 'undefined' ? memoryStore() : idbStore())
export const setStoreForTests = (s: InvestigationStore) => { current = s }
```

`src/data/useInvestigation.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import { InvestigationError, type Investigation } from './investigation.ts'
import { getStore } from './store.ts'

export function useInvestigation(id: string) {
  const [inv, setInv] = useState<Investigation | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setInv(undefined)
    getStore().get(id).then((v) => { if (live) setInv(v ?? null) })
    return () => { live = false }
  }, [id])
  const update = useCallback((fn: (i: Investigation) => Investigation) => {
    setInv((prev) => {
      if (!prev) return prev
      try {
        const next = fn(prev)
        if (next !== prev) void getStore().put(next)
        setError(null)
        return next
      } catch (e) {
        if (e instanceof InvestigationError) { setError(e.message); return prev }
        throw e
      }
    })
  }, [])
  return { inv, update, error }
}
```

- [ ] **Step 5: Create `src/ui/copy-flow.ts` and widen the copy test**

`src/ui/copy-flow.ts`:
```ts
import type { NoteKind } from '../data/investigation.ts'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const flow = {
  stepOf: (n: number) => `Step ${n} of 4`,
  steps: ['Place', 'Outline', 'Dates', 'Review'],
  place: { title: 'Where is it?', chosen: (name: string) => `Chosen: ${name}`, need: 'Search for a place or paste coordinates to continue.' },
  outline: {
    title: 'What are we looking at?',
    kindLegend: 'Kind of place',
    site: 'A building or site',
    siteHelp: 'Draw around the whole site.',
    road: 'A road',
    roadHelp: 'Draw along the centre of the road.',
    width: 'Road width (metres)',
    widthHelp: 'Full width including shoulders, 5 to 200. It decides which pixels count as road.',
    drawSite: 'Click on the map to place corners. Click the first corner again to finish.',
    drawRoad: 'Click along the road. Click the last point again to finish.',
    redraw: 'Draw again',
    byCoords: 'Enter by coordinates instead',
    centre: 'Centre (lat, lon)',
    side: 'Square side (metres)',
    sideHelp: 'From 100 to 3000 metres.',
    useSquare: 'Use this square',
    start: 'Start point (lat, lon)',
    end: 'End point (lat, lon)',
    useLine: 'Use this line',
    badPoint: 'Enter coordinates like 21.1458, 79.0882.',
    summarySite: (km2: number, km: number) => `Area ${km2.toFixed(2)} km² · ${km.toFixed(2)} km across`,
    summaryRoad: (km: number, n: number) => `Length ${km.toFixed(2)} km · ${plural(n, 'section', 'sections')} of up to 2 km`,
    none: 'No outline yet.',
  },
  dates: {
    title: 'Which dates?',
    from: 'From',
    to: 'To',
    help: 'Photos exist from 2017. Shorter ranges load faster.',
    order: 'The start date must be before the end date.',
    early: 'Photos start in 2017. Choose 1 Jan 2017 or later.',
    future: 'The end date cannot be in the future.',
    estimate: (dates: number, mb: number) => `About ${dates} satellite passes. The first view uses about ${mb} MB of data.`,
  },
  review: {
    title: 'Review',
    name: 'Name',
    open: 'Open the workbench',
    privacy: 'Nothing is uploaded. Photos are read from public Sentinel-2 files, and your outline stays in this browser until you choose to save.',
    kind: { site: 'Site', road: 'Road' },
    range: (from: string, to: string) => `${from} to ${to}`,
    labels: { kind: 'Kind', size: 'Size', dates: 'Dates', data: 'Data' },
  },
  workbench: {
    searching: 'Finding satellite passes',
    none: 'No Sentinel-2 photos cover this outline in these dates. Try a longer date range.',
    allCloudy: 'Every photo in these dates is obscured or does not cover your outline. Try other dates; notes and the report still work.',
    searchFailed: 'Could not reach the satellite catalogue. Check your connection and try again.',
    limited: 'Search limited to 1,000 passes. Narrow the dates to see them all.',
    catalogueNote: 'The catalogue may omit a few passes.',
    before: 'Before',
    after: 'After',
    pickPair: 'Pick a clear "before" and "after" date on the timeline.',
    view: 'View',
    modes: { swipe: 'Swipe', side: 'Side by side', diff: 'Difference' },
    swipeLabel: 'Reveal the after photo',
    diffCaption: 'Brightness difference between these two dates. Season, moisture, shadows and clouds also cause differences. This is not a construction detector.',
    caption: (date: string, clearPct: number) => `${date} · Sentinel-2 · 10 m · ${clearPct}% clear view`,
    photoAlt: (role: string, date: string) => `${role} photo, ${date}, Sentinel-2 true colour`,
    timeline: 'Timeline',
    timelineLabel: 'Satellite pass',
    passes: (n: number) => plural(n, 'pass', 'passes'),
    useBefore: 'Use as before',
    useAfter: 'Use as after',
    pin: 'Pin to report',
    unpin: 'Unpin',
    pinLimit: 'You can pin up to 24 dates.',
    legend: 'Each mark shows how clearly that photo sees your outline.',
    grid: 'Sections × dates',
    section: (from: number, to: number) => `${(from / 1000).toFixed(1)}–${(to / 1000).toFixed(1)} km`,
    cell: (section: string, date: string, word: string) => `${section}, ${date}: ${word}`,
    showMap: 'Show map',
    hideMap: 'Hide map',
    report: 'Report',
    notSaved: 'Not saved',
    loadingPhoto: 'Loading photo',
    notFound: 'This investigation is not in this browser. It may have been deleted, or saved on another device.',
    disclaimer: '"No clear visible change" does not prove nothing happened. Roofs hide interiors.',
    errors: {
      BAD_ORDER: 'The before date must be earlier than the after date.',
      TOO_MANY_PINS: 'You can pin up to 24 dates.',
      NOTE_EMPTY: 'Write what you see before adding the note.',
      NOTE_TOO_LONG: 'Notes can be up to 2000 characters.',
      TOO_MANY_NOTES: 'An investigation can hold up to 200 notes.',
      CLAIM_TOO_LONG: 'The claim is too long.',
    } as Record<string, string>,
  },
  notes: {
    title: 'Notes',
    what: 'What do you see?',
    kindLegend: 'Your reading',
    kinds: { change: 'Visible change', no_clear_change: 'No clear visible change', unsure: 'Not sure' } satisfies Record<NoteKind, string>,
    forDate: 'Photo date',
    anyDate: 'No specific date',
    forSection: 'Section',
    anySection: 'Whole road',
    add: 'Add note',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    deleted: 'Note deleted.',
    undo: 'Undo',
    count: (n: number) => `${n} / 2000`,
    none: 'No notes yet.',
  },
  claim: {
    title: 'Claim (optional)',
    help: 'A statement you want to compare with the photos, for example "Road surface laid by June 2025". GrahSaboot shows it next to the evidence and does not judge it.',
    text: 'Claim',
    date: 'Claimed date',
    criterion: 'What would be visible from above if it were true?',
    save: 'Save claim',
    remove: 'Remove claim',
  },
  report: {
    title: 'Evidence report',
    preparing: 'Preparing the report',
    needPair: 'Choose a before and an after date in the workbench first. The report is built from them.',
    preparedBy: 'Prepared by (optional)',
    download: 'Download HTML',
    provenance: 'Download provenance JSON',
    print: 'Print or save as PDF',
    back: 'Back to the workbench',
    sections: {
      looked: 'What was looked at',
      evidence: 'Evidence',
      timeline: 'Pinned dates',
      grid: 'Sections × dates',
      notes: 'Notes',
      claim: 'Claim',
      gaps: 'Gaps and limits',
      provenance: 'Provenance',
      attribution: 'Attribution',
    },
    generated: 'Generated',
    unverified: 'Not verified. This investigation is not saved. The pictures were derived in a browser from the public Sentinel-2 files listed in the provenance.',
    noNotes: 'No notes.',
    noClaim: 'No claim was entered.',
    obscured: (n: number, total: number) => `${n} of ${total} pinned dates are obscured or not covered.`,
    nativeNote: 'Source pixels exactly as hashed (native 10 m grid, before reprojection).',
  },
}
```

Replace `src/ui/copy.test.ts` so it scans every copy file:
```ts
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy, issueMessage } from './copy.ts'

const dir = new URL('./', import.meta.url)
const SOURCE = readdirSync(dir)
  .filter((f) => /^copy.*\.ts$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(new URL(f, dir), 'utf8'))
  .join('\n')
const BANNED = [/\bconstructed\b/i, /\bcomplete(d)?\b/i, /\bverified project\b/i, /\bfraud\b/i, /\babandon(ed)?\b/i, /%\s*complete/i, /\bconfidence\b/i]

describe('copy', () => {
  it('never uses verdict words (spec §2.2) in any copy file', () => {
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

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/data src/ui && npm run check`
Expected: investigation 6 + store 1 PASS; copy tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/data src/ui
git commit -m "feat(data): investigation model with pins/notes/claim rules, IndexedDB store and flow copy

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C2: New investigation, steps 1–2 (place, outline by drawing or coordinates)

**Files:**
- Create: `src/geo/square.ts`, `src/new/draft.ts`, `src/data/examples.ts`, `src/map/draw.ts`, `src/map/aoiLayer.ts`, `src/new/Stepper.tsx`, `src/new/PlaceStep.tsx`, `src/new/OutlineStep.tsx`, `src/screens/NewInvestigation.tsx`
- Modify: `src/app.tsx` (route `new`), `src/ui/copy.ts` (`nav.example` → `'Try a worked example: Navi Mumbai airport'`), `src/screens/GlobeScreen.tsx` (example link → `/new?example=navi-mumbai-airport`)
- Test: `src/new/draft.test.ts`, `tests/e2e/new-outline.spec.ts`, `tests/e2e/helpers.ts`

**Interfaces:**
- Consumes: `summarizeAoi`, `issueMessage`, `parseCoordinates`, `SearchBox`, `useMapStage`, `useMapLayout`, `useSearchParams`.
- Produces:
  - `interface Draft { place: Place | null; kind: 'site' | 'road'; ring: LonLat[] | null; line: LonLat[] | null; widthM: number; dateFrom: string; dateTo: string; name: string }`
  - `squareAround(lon, lat, sideM): LonLat[]`, `ymd(d: Date): string`, `defaultDates(today?)`, `validateDates(from, to, today?)` (returns `'order' | 'early' | 'future' | null`), `draftToAoi(d): AoiInput | null`, `emptyDraft(today?)`, `draftFromParams(p: URLSearchParams, today?): { draft: Draft; step: 1 | 2 | 3 | 4 }`
  - `EXAMPLES: Record<string, { name: string; aoi: AoiInput; dateFrom: string; dateTo: string; place: Place }>`
  - `startDrawing(map, kind, onFinish: (coords: LonLat[]) => void): { stop(): void }`
  - `setAoiLayer(map, aoi: AoiInput | null, accent: string)`, `removeAoiLayer(map)`, `fitAoi(map, bbox, reducedMotion)`, `accentColor(): string`
  - `type StepProps = { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; onBack(): void; onNext(): void }`
  - E2E helpers `outlineSiteByCoords(page, side = 1000)`, `outlineRoadByCoords(page)`, `startAt(page, query)`.

- [ ] **Step 1: Write the failing unit test `src/new/draft.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { defaultDates, draftFromParams, draftToAoi, emptyDraft, squareAround, validateDates } from './draft.ts'
import { summarizeAoi } from '../geo/aoi.ts'

const TODAY = new Date('2026-10-05T10:00:00Z')

describe('draft helpers', () => {
  it('builds a closed square of the requested side', () => {
    const ring = squareAround(79.0882, 21.1458, 1000)
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
    const r = summarizeAoi({ kind: 'site', geometry: { type: 'Polygon', coordinates: [ring] } })
    expect(r.ok && r.summary.areaKm2).toBeGreaterThan(0.99)
    expect(r.ok && r.summary.areaKm2).toBeLessThan(1.01)
  })
  it('defaults to the last 24 months', () => {
    expect(defaultDates(TODAY)).toEqual({ dateFrom: '2024-10-05', dateTo: '2026-10-05' })
    expect(defaultDates(new Date('2018-03-01T00:00:00Z')).dateFrom).toBe('2017-01-01')
  })
  it.each([
    ['2025-01-01', '2025-12-31', null],
    ['2025-12-31', '2025-01-01', 'order'],
    ['2016-12-31', '2025-01-01', 'early'],
    ['2025-01-01', '2026-10-06', 'future'],
  ] as const)('validateDates(%s, %s) = %s', (a, b, r) => {
    expect(validateDates(a, b, TODAY)).toBe(r)
  })
  it('turns drafts into AOI inputs', () => {
    const d = emptyDraft(TODAY)
    expect(draftToAoi(d)).toBeNull()
    expect(draftToAoi({ ...d, kind: 'road', line: [[79, 21], [79.01, 21.01]], widthM: 24 })).toEqual({ kind: 'road', geometry: { type: 'LineString', coordinates: [[79, 21], [79.01, 21.01]] }, widthM: 24 })
  })
  it('reads URL parameters', () => {
    expect(draftFromParams(new URLSearchParams('lat=21.1458&lon=79.0882&name=Nagpur'), TODAY)).toMatchObject({ step: 2, draft: { place: { name: 'Nagpur', lat: 21.1458, lon: 79.0882 } } })
    const ex = draftFromParams(new URLSearchParams('example=navi-mumbai-airport'), TODAY)
    expect(ex.step).toBe(4)
    expect(ex.draft.ring).toHaveLength(5)
    expect(draftFromParams(new URLSearchParams('lat=999&lon=0'), TODAY).step).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/new`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/geo/square.ts`, `src/new/draft.ts` and `src/data/examples.ts`**

`src/geo/square.ts` is its own module: `draft.ts` needs `EXAMPLES`, and `examples.ts` needs the square at load time. Sharing one module would create an import cycle that throws a ReferenceError at startup.
```ts
import type { LonLat } from '../evidence/types.ts'

/** Closed square ring of `sideM` metres centred on (lon, lat), using spherical metres per degree (consistent with geodesy.ts). */
export function squareAround(lon: number, lat: number, sideM: number): LonLat[] {
  const dLat = sideM / 2 / 111195.08
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  const r = (v: number) => Math.round(v * 1e7) / 1e7
  const ring: LonLat[] = [[r(lon - dLon), r(lat - dLat)], [r(lon + dLon), r(lat - dLat)], [r(lon + dLon), r(lat + dLat)], [r(lon - dLon), r(lat + dLat)]]
  return [...ring, ring[0]!]
}
```

`src/new/draft.ts`:
```ts
import type { LonLat } from '../evidence/types.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
import type { Place } from '../search/nominatim.ts'
import { EXAMPLES } from '../data/examples.ts'
export { squareAround } from '../geo/square.ts'

export interface Draft {
  place: Place | null
  kind: 'site' | 'road'
  ring: LonLat[] | null
  line: LonLat[] | null
  widthM: number
  dateFrom: string
  dateTo: string
  name: string
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function defaultDates(today = new Date()): { dateFrom: string; dateTo: string } {
  const from = ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - LIMITS.dates.defaultMonths, today.getUTCDate())))
  return { dateFrom: from < LIMITS.dates.earliest ? LIMITS.dates.earliest : from, dateTo: ymd(today) }
}

export function validateDates(from: string, to: string, today = new Date()): 'order' | 'early' | 'future' | null {
  if (!from || !to || from >= to) return 'order'
  if (from < LIMITS.dates.earliest) return 'early'
  if (to > ymd(today)) return 'future'
  return null
}

export function draftToAoi(d: Draft): AoiInput | null {
  if (d.kind === 'site') return d.ring ? { kind: 'site', geometry: { type: 'Polygon', coordinates: [d.ring] } } : null
  return d.line ? { kind: 'road', geometry: { type: 'LineString', coordinates: d.line }, widthM: d.widthM } : null
}

export function emptyDraft(today = new Date()): Draft {
  return { place: null, kind: 'site', ring: null, line: null, widthM: LIMITS.road.defaultWidthM, ...defaultDates(today), name: '' }
}

export function draftFromParams(p: URLSearchParams, today = new Date()): { draft: Draft; step: 1 | 2 | 3 | 4 } {
  const base = emptyDraft(today)
  const ex = EXAMPLES[p.get('example') ?? '']
  if (ex) {
    return {
      step: 4,
      draft: {
        ...base, place: ex.place, name: ex.name, dateFrom: ex.dateFrom, dateTo: ex.dateTo, kind: ex.aoi.kind,
        ring: ex.aoi.kind === 'site' ? ex.aoi.geometry.coordinates[0]! : null,
        line: ex.aoi.kind === 'road' ? ex.aoi.geometry.coordinates : null,
        widthM: ex.aoi.kind === 'road' ? ex.aoi.widthM : base.widthM,
      },
    }
  }
  const lat = Number(p.get('lat')), lon = Number(p.get('lon'))
  if (p.has('lat') && p.has('lon') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const name = (p.get('name') ?? '').slice(0, 120)
    return { step: 2, draft: { ...base, place: { name: name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, bbox: null }, name } }
  }
  return { step: 1, draft: base }
}
```

`src/data/examples.ts`:
```ts
import type { AoiInput } from '../geo/aoi.ts'
import type { Place } from '../search/nominatim.ts'
import { squareAround } from '../geo/square.ts'

/** Worked examples: real places with large, unambiguous visible change inside the Sentinel-2 archive. */
export const EXAMPLES: Record<string, { name: string; aoi: AoiInput; dateFrom: string; dateTo: string; place: Place }> = {
  'navi-mumbai-airport': {
    name: 'Navi Mumbai airport site',
    // Centre from OpenStreetMap Nominatim (2026-10-05). The 2 km square fits the 9 km² limit.
    aoi: { kind: 'site', geometry: { type: 'Polygon', coordinates: [squareAround(73.06575, 18.99135, 2000)] } },
    dateFrom: '2017-12-01',
    dateTo: '2025-12-31',
    place: { name: 'Navi Mumbai International Airport', lat: 18.99135, lon: 73.06575, bbox: null },
  },
}
```

- [ ] **Step 4: Implement drawing and the AOI layer**

`src/map/draw.ts`:
```ts
import type { Map as MlMap } from 'maplibre-gl'
import { TerraDraw, TerraDrawLineStringMode, TerraDrawPolygonMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { LonLat } from '../evidence/types.ts'

export function startDrawing(map: MlMap, kind: 'site' | 'road', onFinish: (coords: LonLat[]) => void): { stop(): void } {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [new TerraDrawPolygonMode(), new TerraDrawLineStringMode()],
  })
  draw.start()
  draw.setMode(kind === 'site' ? 'polygon' : 'linestring')
  draw.on('finish', (id) => {
    const f = draw.getSnapshot().find((x) => x.id === id)
    if (!f) return
    const g = f.geometry
    if (g.type === 'Polygon') onFinish(g.coordinates[0] as LonLat[])
    else if (g.type === 'LineString') onFinish(g.coordinates as LonLat[])
    draw.clear() // our own gs-aoi layer shows the result
  })
  return { stop: () => draw.stop() }
}
```

`src/map/aoiLayer.ts`:
```ts
import type { FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { AoiInput, Bbox } from '../geo/aoi.ts'

export const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue('--gs-accent').trim() || '#e48444'

function collection(aoi: AoiInput | null): FeatureCollection {
  return aoi ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { kind: aoi.kind }, geometry: aoi.geometry }] } : { type: 'FeatureCollection', features: [] }
}

/** Road corridors are drawn at their true width: pixels per metre doubles with each zoom level. */
function roadWidth(widthM: number, lat: number) {
  const px0 = widthM / ((40075016.686 * Math.cos((lat * Math.PI) / 180)) / 512)
  return ['interpolate', ['exponential', 2], ['zoom'], 0, Math.max(1, px0), 22, Math.max(1, px0 * 2 ** 22)]
}

export function setAoiLayer(map: MlMap, aoi: AoiInput | null, accent: string) {
  const data = collection(aoi)
  const src = map.getSource('gs-aoi') as GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource('gs-aoi', { type: 'geojson', data })
  if (!map.getLayer('gs-aoi-fill')) map.addLayer({ id: 'gs-aoi-fill', type: 'fill', source: 'gs-aoi', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': accent, 'fill-opacity': 0.12 } })
  if (!map.getLayer('gs-aoi-line')) map.addLayer({ id: 'gs-aoi-line', type: 'line', source: 'gs-aoi', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': accent, 'line-width': 2 } })
  map.setPaintProperty('gs-aoi-fill', 'fill-color', accent)
  map.setPaintProperty('gs-aoi-line', 'line-color', accent)
  map.setPaintProperty('gs-aoi-line', 'line-width', aoi?.kind === 'road' ? (roadWidth(aoi.widthM, aoi.geometry.coordinates[0]![1]) as never) : 2)
  map.setPaintProperty('gs-aoi-line', 'line-opacity', aoi?.kind === 'road' ? 0.55 : 1)
}

export function removeAoiLayer(map: MlMap) {
  for (const id of ['gs-aoi-line', 'gs-aoi-fill']) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource('gs-aoi')) map.removeSource('gs-aoi')
}

export function fitAoi(map: MlMap, bbox: Bbox, reducedMotion: boolean) {
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 48, maxZoom: 16, duration: reducedMotion ? 0 : 2500 })
}
```

- [ ] **Step 5: Implement the stepper, place step, outline step and the screen**

`src/new/Stepper.tsx`:
```tsx
import { flow } from '../ui/copy-flow.ts'

export function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label={flow.stepOf(step)} className="mb-8">
      <p className="mb-3 font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2">{flow.stepOf(step)}</p>
      <ol className="grid grid-cols-4 gap-px bg-line">
        {flow.steps.map((label, i) => (
          <li key={label} aria-current={i + 1 === step ? 'step' : undefined} className={`bg-bg px-2 py-2 text-sm ${i + 1 === step ? 'border-b-2 border-accent font-medium text-fg' : i + 1 < step ? 'text-fg' : 'text-fg-2'}`}>
            {label}
          </li>
        ))}
      </ol>
    </nav>
  )
}
```

`src/new/PlaceStep.tsx`:
```tsx
import type { Dispatch, SetStateAction } from 'react'
import { flyToPlace } from '../map/camera.ts'
import { useMapStage } from '../map/MapStage.tsx'
import type { Draft } from './draft.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button } from '../ui/kit.tsx'
import { SearchBox } from '../ui/SearchBox.tsx'

export type StepProps = { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; onBack(): void; onNext(): void }

export function PlaceStep({ draft, setDraft, onNext }: StepProps) {
  const { map } = useMapStage()
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.place.title}</h1>
      <SearchBox
        onSelect={(p) => {
          setDraft((d) => ({ ...d, place: p, name: d.name || p.name.split(',')[0]! }))
          if (map) flyToPlace(map, { ...p, bbox: null }, matchMedia('(prefers-reduced-motion: reduce)').matches)
        }}
      />
      <p className="text-sm text-fg-2" aria-live="polite">{draft.place ? flow.place.chosen(draft.place.name) : flow.place.need}</p>
      <div className="flex justify-end">
        <Button variant="primary" disabled={!draft.place} onClick={onNext}>{copy.common.next}</Button>
      </div>
    </div>
  )
}
```

`src/new/OutlineStep.tsx`:
```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { parseCoordinates } from '../geo/coords.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { startDrawing } from '../map/draw.ts'
import { useMapStage } from '../map/MapStage.tsx'
import { copy, issueMessage } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { draftToAoi } from './draft.ts'
import { squareAround } from '../geo/square.ts'
import type { StepProps } from './PlaceStep.tsx'

export function OutlineStep({ draft, setDraft, onBack, onNext }: StepProps) {
  const { map, tier } = useMapStage()
  const [round, setRound] = useState(0)
  const aoi = draftToAoi(draft)
  const result = aoi ? summarizeAoi(aoi) : null

  useEffect(() => {
    if (!map || tier === 0) return
    let session: { stop(): void } | null = null
    const begin = () => {
      session = startDrawing(map, draft.kind, (coords) => setDraft((d) => (d.kind === 'site' ? { ...d, ring: coords } : { ...d, line: coords })))
    }
    if (map.isStyleLoaded()) begin()
    else map.once('style.load', begin)
    return () => {
      map.off('style.load', begin)
      session?.stop()
    }
  }, [map, tier, draft.kind, round, setDraft])

  const setKind = (kind: 'site' | 'road') => setDraft((d) => ({ ...d, kind, ring: null, line: null }))

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.outline.title}</h1>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{flow.outline.kindLegend}</legend>
        {(['site', 'road'] as const).map((k) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 border border-line p-3 has-[:checked]:border-accent">
            <input type="radio" name="kind" value={k} checked={draft.kind === k} onChange={() => setKind(k)} className="mt-1 accent-[var(--gs-accent)]" />
            <span>
              <span className="block font-medium">{k === 'site' ? flow.outline.site : flow.outline.road}</span>
              <span className="block text-sm text-fg-2">{k === 'site' ? flow.outline.siteHelp : flow.outline.roadHelp}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {draft.kind === 'road' && (
        <TextField
          label={flow.outline.width}
          help={flow.outline.widthHelp}
          type="number"
          inputMode="numeric"
          min={5}
          max={200}
          step={1}
          value={String(draft.widthM)}
          onChange={(e) => setDraft((d) => ({ ...d, widthM: Number(e.target.value) }))}
        />
      )}
      {tier > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
          <p>{draft.kind === 'site' ? flow.outline.drawSite : flow.outline.drawRoad}</p>
          <Button size="sm" onClick={() => { setDraft((d) => ({ ...d, ring: null, line: null })); setRound((r) => r + 1) }}>{flow.outline.redraw}</Button>
        </div>
      )}
      <details open={tier === 0} className="border border-line p-3">
        <summary className="cursor-pointer font-medium">{flow.outline.byCoords}</summary>
        <div className="mt-4">{draft.kind === 'site' ? <SquareForm draft={draft} setDraft={setDraft} /> : <LineForm setDraft={setDraft} />}</div>
      </details>
      <div aria-live="polite" className="text-sm">
        {!result && <p className="text-fg-2">{flow.outline.none}</p>}
        {result?.ok && (
          <p className="font-mono num">
            {result.summary.kind === 'site' ? flow.outline.summarySite(result.summary.areaKm2, result.summary.extentKm) : flow.outline.summaryRoad(result.summary.lengthKm ?? 0, result.summary.parts.length)}
          </p>
        )}
        {result && !result.ok && (
          <ul className="grid gap-1 text-bad" role="alert">
            {result.issues.map((i) => <li key={i.code}>{issueMessage(i)}</li>)}
          </ul>
        )}
      </div>
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" disabled={!result?.ok} onClick={onNext}>{copy.common.next}</Button>
      </div>
    </div>
  )
}

function SquareForm({ draft, setDraft }: Pick<StepProps, 'draft' | 'setDraft'>) {
  const [centre, setCentre] = useState(draft.place ? `${draft.place.lat.toFixed(6)}, ${draft.place.lon.toFixed(6)}` : '')
  const [side, setSide] = useState('500')
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const c = parseCoordinates(centre)
    const s = Number(side)
    if (!c) return setErr(flow.outline.badPoint)
    if (!(s >= 100 && s <= 3000)) return setErr(flow.outline.sideHelp)
    setErr(null)
    setDraft((d) => ({ ...d, ring: squareAround(c.lon, c.lat, s) }))
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <TextField label={flow.outline.centre} value={centre} onChange={(e) => setCentre(e.target.value)} error={err === flow.outline.badPoint ? err : null} />
      <TextField label={flow.outline.side} help={flow.outline.sideHelp} type="number" inputMode="numeric" value={side} onChange={(e) => setSide(e.target.value)} error={err === flow.outline.sideHelp ? err : null} />
      <Button type="submit">{flow.outline.useSquare}</Button>
    </form>
  )
}

function LineForm({ setDraft }: Pick<StepProps, 'setDraft'>) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const p = parseCoordinates(a), q = parseCoordinates(b)
    if (!p || !q) return setErr(flow.outline.badPoint)
    setErr(null)
    setDraft((d) => ({ ...d, line: [[p.lon, p.lat], [q.lon, q.lat]] }))
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <TextField label={flow.outline.start} value={a} onChange={(e) => setA(e.target.value)} />
      <TextField label={flow.outline.end} value={b} onChange={(e) => setB(e.target.value)} error={err} />
      <Button type="submit">{flow.outline.useLine}</Button>
    </form>
  )
}
```

`src/screens/NewInvestigation.tsx` (steps 3 and 4 are added in C3; until then step 3 shows the dates step placeholder from C3. Implement it in C3 and wire it now as shown):
```tsx
import { useEffect, useState } from 'react'
import { summarizeAoi } from '../geo/aoi.ts'
import { useSearchParams } from '../lib/router.tsx'
import { accentColor, fitAoi, removeAoiLayer, setAoiLayer } from '../map/aoiLayer.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { draftFromParams, draftToAoi } from '../new/draft.ts'
import { OutlineStep } from '../new/OutlineStep.tsx'
import { PlaceStep } from '../new/PlaceStep.tsx'
import { Stepper } from '../new/Stepper.tsx'

export default function NewInvestigation() {
  const params = useSearchParams()
  const [{ draft: initial, step: firstStep }] = useState(() => draftFromParams(params))
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(firstStep)
  useMapLayout('side')
  const { map, installLayers } = useMapStage()
  const aoi = draftToAoi(draft)

  useEffect(() => (map ? installLayers('aoi', (m) => setAoiLayer(m, draftToAoi(draft), accentColor()), removeAoiLayer) : undefined), [map, installLayers, draft])
  useEffect(() => {
    if (!map || step < 3 || !aoi) return
    const r = summarizeAoi(aoi)
    if (r.ok) fitAoi(map, r.summary.bbox, matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [map, step]) // eslint-disable-line react-hooks/exhaustive-deps

  const props = { draft, setDraft, onBack: () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s)), onNext: () => setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s)) }
  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[45%_1fr]">
      <section className="pointer-events-auto relative z-10 mt-[calc(50dvh-56px)] bg-bg p-6 lg:mt-0 lg:p-10">
        <Stepper step={step} />
        {step === 1 && <PlaceStep {...props} />}
        {step === 2 && <OutlineStep {...props} />}
        {step === 3 && <DatesStep {...props} />}
        {step === 4 && <ReviewStep {...props} />}
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}
```
Until C3 adds them, temporarily define `const DatesStep = (_: StepProps) => null` and `const ReviewStep = (_: StepProps) => null` at the bottom of the file. C3 replaces both.

In `src/app.tsx`: add `const NewInvestigation = lazy(() => import('./screens/NewInvestigation.tsx'))` and `case 'new': return <NewInvestigation />` in `screenFor`.

- [ ] **Step 6: Write E2E helpers and the outline test**

`tests/e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'

export async function startAt(page: Page, query = 'tier=0&lat=21.1458&lon=79.0882&name=Nagpur') {
  await page.goto(`/new?${query}`)
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
}

export async function outlineSiteByCoords(page: Page, side = 1000) {
  const details = page.locator('details', { hasText: flow.outline.byCoords })
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click()
  await page.getByLabel(flow.outline.centre).fill('21.1458, 79.0882')
  await page.getByLabel(flow.outline.side).fill(String(side))
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
}

export async function outlineRoadByCoords(page: Page) {
  await page.getByRole('radio', { name: new RegExp(flow.outline.road) }).check()
  await page.getByLabel(flow.outline.width).fill('30')
  const details = page.locator('details', { hasText: flow.outline.byCoords })
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click()
  await page.getByLabel(flow.outline.start).fill('21.138637, 79.07698')
  await page.getByLabel(flow.outline.end).fill('21.157819, 79.095988')
  await page.getByRole('button', { name: flow.outline.useLine }).click()
}
```

`tests/e2e/new-outline.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { outlineRoadByCoords, outlineSiteByCoords, startAt } from './helpers.ts'

test('site by coordinates shows area and enables Continue', async ({ page }) => {
  await startAt(page)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await outlineSiteByCoords(page, 1000)
  await expect(page.getByText(/^Area 1\.00 km² · 1\.41 km across$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test('a 3 km square (exactly 9 km²) is accepted at the limit', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page, 3000)
  await expect(page.getByText('This outline covers 9.0 km². The limit is 9 km².')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test('road by coordinates shows length and two sections', async ({ page }) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  await expect(page.getByText(/^Length 2\.90 km · 2 sections of up to 2 km$/)).toBeVisible()
})

test('road width outside 5–200 is refused with a plain message', async ({ page }) => {
  await startAt(page)
  await outlineRoadByCoords(page)
  await page.getByLabel(flow.outline.width).fill('4')
  await expect(page.getByText('Road width must be a whole number from 5 to 200 metres.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('drawing a polygon on the map fills in the outline', async ({ page }) => {
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))), 'no WebGL2')
  await page.waitForFunction(() => (window as any).__gs?.map?.isStyleLoaded())
  await page.evaluate(() => (window as any).__gs.map.jumpTo({ center: [79.0882, 21.1458], zoom: 15, pitch: 0, bearing: 0 }))
  const box = (await page.locator('.map-stage canvas').boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  for (const [dx, dy] of [[-80, -80], [80, -80], [80, 80], [-80, 80], [-80, -80]]) await page.mouse.click(cx + dx!, cy + dy!)
  await expect(page.getByText(/^Area \d+\.\d\d km²/)).toBeVisible()
})
```
The 3 km square is exactly 9 km² (≤ 9 km² and 4.24 km ≤ 4.25 km across), so it passes the inclusive limits. Its test pins the boundary: no error is shown and Continue stays enabled.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/new && npm run check && npm run e2e -- new-outline`
Expected: draft 8 PASS. E2E: coordinate tests pass on every engine; the drawing test runs where WebGL2 exists. If terra-draw needs a double-click or an extra click to finish on this version, adjust only the test's click sequence after reading its docs, and note it in the commit.

- [ ] **Step 8: Commit**

```bash
git add src tests/e2e
git commit -m "feat(new): place and outline steps with terra-draw drawing, coordinate forms and AOI map layer

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C3: New investigation, steps 3–4 (dates, data estimate, review, create)

**Files:**
- Create: `src/geo/estimate.ts`, `src/new/DatesStep.tsx`, `src/new/ReviewStep.tsx`
- Modify: `src/screens/NewInvestigation.tsx` (import the real steps; delete the placeholders)
- Test: `src/geo/estimate.test.ts`, `tests/e2e/new-create.spec.ts`

**Interfaces:**
- Consumes: `newInvestigation`, `getStore`, `navigate`, `validateDates`, `summarizeAoi`.
- Produces: `estimateFirstView(summary, dateFrom, dateTo): { dates: number; mb: number }`; E2E helper `finishDatesAndOpen(page, from, to)` (added to `tests/e2e/helpers.ts`).

- [ ] **Step 1: Write the failing test `src/geo/estimate.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { estimateFirstView } from './estimate.ts'
import type { AoiSummary } from './aoi.ts'

const site = { kind: 'site' } as AoiSummary
const road = { kind: 'road' } as AoiSummary

describe('estimateFirstView', () => {
  it('estimates passes and megabytes from measured per-date sizes', () => {
    expect(estimateFirstView(site, '2025-01-01', '2026-01-01')).toEqual({ dates: 75, mb: 18 })
    expect(estimateFirstView(road, '2024-01-01', '2026-01-01')).toEqual({ dates: 150, mb: 33 })
  })
  it('never returns zero passes', () => {
    expect(estimateFirstView(site, '2025-01-01', '2025-01-02').dates).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/geo/estimate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/geo/estimate.ts`**

```ts
import type { AoiSummary } from './aoi.ts'

/**
 * Per-date sizes measured in R3 (docs/geoverify/research/2026-10-05-r3-imagery.md, round 2):
 * SCL ≈ 0.04 MB (site) / 0.06 MB (road); TCI 20 m thumbnail ≈ 0.75 / 1.25 MB; TCI 10 m ≈ 2.8 / 4.7 MB. About 75 passes a year over India.
 */
export function estimateFirstView(summary: Pick<AoiSummary, 'kind'>, dateFrom: string, dateTo: string): { dates: number; mb: number } {
  const days = Math.max(1, (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000)
  const dates = Math.max(1, Math.round((days / 365) * 75))
  const road = summary.kind === 'road'
  const [scl, thumb, full] = road ? [0.06, 1.25, 4.7] : [0.04, 0.75, 2.8]
  return { dates, mb: Math.round(dates * scl + Math.min(dates, 12) * thumb + 2 * full) }
}
```

- [ ] **Step 4: Implement `src/new/DatesStep.tsx` and `src/new/ReviewStep.tsx`, then wire them**

`src/new/DatesStep.tsx`:
```tsx
import { estimateFirstView } from '../geo/estimate.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { draftToAoi, validateDates, ymd } from './draft.ts'
import type { StepProps } from './PlaceStep.tsx'

export function DatesStep({ draft, setDraft, onBack, onNext }: StepProps) {
  const today = ymd(new Date())
  const problem = validateDates(draft.dateFrom, draft.dateTo)
  const aoi = draftToAoi(draft)
  const r = aoi ? summarizeAoi(aoi) : null
  const est = r?.ok && !problem ? estimateFirstView(r.summary, draft.dateFrom, draft.dateTo) : null
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.dates.title}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={flow.dates.from} type="date" min={LIMITS.dates.earliest} max={today} value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
        <TextField label={flow.dates.to} type="date" min={LIMITS.dates.earliest} max={today} value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
      </div>
      <p className="text-sm text-fg-2">{flow.dates.help}</p>
      <div aria-live="polite" className="text-sm">
        {problem && <p className="text-bad" role="alert">{flow.dates[problem]}</p>}
        {est && <p className="font-mono num">{flow.dates.estimate(est.dates, est.mb)}</p>}
      </div>
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" disabled={!!problem} onClick={onNext}>{copy.common.next}</Button>
      </div>
    </div>
  )
}
```

`src/new/ReviewStep.tsx`:
```tsx
import { newInvestigation } from '../data/investigation.ts'
import { getStore } from '../data/store.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { estimateFirstView } from '../geo/estimate.ts'
import { navigate } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { draftToAoi } from './draft.ts'
import type { StepProps } from './PlaceStep.tsx'

export function ReviewStep({ draft, setDraft, onBack }: StepProps) {
  const aoi = draftToAoi(draft)
  const r = aoi ? summarizeAoi(aoi) : null
  if (!aoi || !r?.ok) return null
  const s = r.summary
  const est = estimateFirstView(s, draft.dateFrom, draft.dateTo)
  const open = async () => {
    const inv = newInvestigation({ name: draft.name || draft.place?.name.split(',')[0] || '', aoi, dateFrom: draft.dateFrom, dateTo: draft.dateTo })
    await getStore().put(inv)
    navigate(`/i/${inv.id}`)
  }
  const rows: Array<[string, string]> = [
    [flow.review.labels.kind, flow.review.kind[s.kind]],
    [flow.review.labels.size, s.kind === 'site' ? flow.outline.summarySite(s.areaKm2, s.extentKm) : flow.outline.summaryRoad(s.lengthKm ?? 0, s.parts.length)],
    [flow.review.labels.dates, flow.review.range(draft.dateFrom, draft.dateTo)],
    [flow.review.labels.data, flow.dates.estimate(est.dates, est.mb)],
  ]
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.review.title}</h1>
      <TextField label={flow.review.name} value={draft.name} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
      <dl className="grid gap-px border border-line bg-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 bg-bg p-3 sm:grid-cols-[10rem_1fr]">
            <dt className="font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2">{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-fg-2">{flow.review.privacy}</p>
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" onClick={() => void open()}>{flow.review.open}</Button>
      </div>
    </div>
  )
}
```

In `src/screens/NewInvestigation.tsx`, import `DatesStep` and `ReviewStep` from `../new/` and delete the two placeholder lines.

Add to `tests/e2e/helpers.ts`:
```ts
export async function finishDatesAndOpen(page: Page, from = '2025-01-01', to = '2025-12-31') {
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(flow.dates.from, { exact: true }).fill(from)
  await page.getByLabel(flow.dates.to, { exact: true }).fill(to)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: flow.review.open }).click()
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
}
```

- [ ] **Step 5: Write `tests/e2e/new-create.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { finishDatesAndOpen, outlineSiteByCoords, startAt } from './helpers.ts'

test('dates validate and show a data estimate', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(flow.dates.from, { exact: true }).fill('2025-12-31')
  await page.getByLabel(flow.dates.to, { exact: true }).fill('2025-01-01')
  await expect(page.getByText(flow.dates.order)).toBeVisible()
  await page.getByLabel(flow.dates.from, { exact: true }).fill('2025-01-01')
  await page.getByLabel(flow.dates.to, { exact: true }).fill('2025-12-31')
  await expect(page.getByText(/^About 75 satellite passes\. The first view uses about 18 MB of data\.$/)).toBeVisible()
})

test('review creates a local investigation and opens it', async ({ page }) => {
  await startAt(page)
  await outlineSiteByCoords(page)
  await finishDatesAndOpen(page)
})

test('the worked example lands on review with the airport prefilled', async ({ page }) => {
  await page.goto('/new?tier=0&example=navi-mumbai-airport')
  await expect(page.getByRole('heading', { name: flow.review.title })).toBeVisible()
  await expect(page.getByLabel(flow.review.name)).toHaveValue('Navi Mumbai airport site')
  await expect(page.getByText(/^Area 3\.99 km²/)).toBeVisible()
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/geo && npm run check && npm run e2e -- new-`
Expected: estimate 2 PASS; E2E green.

- [ ] **Step 7: Commit**

```bash
git add src tests/e2e
git commit -m "feat(new): dates with validation and data estimate, review and local creation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C4: Evidence runner (search → quality → thumbnails → full frames)

**Files:**
- Create: `src/workbench/runner.ts`, `src/workbench/defaults.ts`, `src/workbench/useEvidence.ts`
- Test: `src/workbench/runner.test.ts`, `src/workbench/defaults.test.ts`

**Interfaces:**
- Consumes:
  - `searchSentinel2`, `selectPerDate` (A9); `createImageryClient`, `QualityResult`, `FrameResult` (A10);
  - `makeDisplayGrid` (`src/evidence/display.ts`), `coarsenBbox`, `toAoiGeometry`, `summarizeAoi` (A3).
- Produces:
  - `type EntryStatus = 'queued' | 'checking' | 'checked' | 'error'`
  - `interface DateEntry { date; candidate: DateCandidate; quality: QualityResult | null; thumb: FrameResult | null; full: FrameResult | null; status: EntryStatus; error: string | null }`
  - `interface EvidenceState { phase: 'searching' | 'ready' | 'error'; limited: boolean; source: string | null; entries: DateEntry[]; error: string | null }`
  - `interface RunnerDeps { search(a: { bbox; from; to; signal }): Promise<SearchResult>; select(items, points): DateCandidate[]; quality(req, signal): Promise<QualityResult>; frame(req, signal): Promise<FrameResult> }`
  - `interface RunnerInput { aoi: AoiGeometry; bbox: Bbox; points: LonLat[]; dateFrom; dateTo; grid: DisplayGrid; thumbGrid: DisplayGrid; priority: string[]; only?: string[] }`
  - `createRunner(deps, input, onState, concurrency = 4): { start(): Promise<void>; requestFull(date: string): void; dispose(): void }`
  - `interleaveEnds(dates: string[]): string[]`
  - `pickDefaults(entries, from, to): { before: string | null; after: string | null }`, `quartilesDone(entries, from, to): boolean`, `isUsable(e: DateEntry): boolean`
  - `useEvidence(inv: Investigation | null, maxSide: number, opts?: { only?: string[] }): { state: EvidenceState; grid: DisplayGrid | null; summary: AoiSummary | null; requestFull(date: string): void }`

- [ ] **Step 1: Write the failing tests**

`src/workbench/defaults.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pickDefaults, quartilesDone } from './defaults.ts'
import type { DateEntry } from './runner.ts'

const e = (date: string, label: 'CLEAR' | 'PARTIAL' | 'OBSCURED' | 'NOT_COVERED' | null, valid = 1, status: DateEntry['status'] = 'checked'): DateEntry =>
  ({ date, status, error: null, thumb: null, full: null, candidate: {} as never, quality: label ? ({ stats: { label, clearFraction: valid } } as never) : null })

describe('pickDefaults', () => {
  it('takes the clearest pass in each outer quartile', () => {
    const entries = [e('2025-01-10', 'CLEAR', 1), e('2025-03-05', 'PARTIAL', 0.5), e('2025-06-15', 'OBSCURED', 0), e('2025-12-20', 'CLEAR', 1)]
    expect(pickDefaults(entries, '2025-01-01', '2025-12-31')).toEqual({ before: '2025-01-10', after: '2025-12-20' })
  })
  it('falls back to the earliest and latest usable passes', () => {
    const entries = [e('2025-05-01', 'PARTIAL', 0.6), e('2025-07-01', 'CLEAR', 1)]
    expect(pickDefaults(entries, '2025-01-01', '2025-12-31')).toEqual({ before: '2025-05-01', after: '2025-07-01' })
  })
  it('returns nothing when fewer than two passes are usable', () => {
    expect(pickDefaults([e('2025-05-01', 'CLEAR'), e('2025-06-01', 'OBSCURED', 0)], '2025-01-01', '2025-12-31')).toEqual({ before: null, after: null })
  })
})

describe('quartilesDone', () => {
  it('waits for both outer quartiles only', () => {
    const entries = [e('2025-01-10', 'CLEAR'), e('2025-06-15', null, 0, 'queued'), e('2025-12-20', null, 0, 'checking')]
    expect(quartilesDone(entries, '2025-01-01', '2025-12-31')).toBe(false)
    entries[2] = e('2025-12-20', 'CLEAR')
    expect(quartilesDone(entries, '2025-01-01', '2025-12-31')).toBe(true)
  })
})
```

`src/workbench/runner.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createRunner, interleaveEnds, type EvidenceState, type RunnerDeps } from './runner.ts'
import type { DateCandidate, S2Item } from '../stac/types.ts'

const item = (date: string) => ({ id: date, date }) as unknown as S2Item
const cand = (date: string): DateCandidate => ({ date, item: item(date), alternates: [], coversAoi: true })
const DATES = ['2025-01-10', '2025-03-05', '2025-06-15', '2025-12-20']
const LABEL: Record<string, string> = { '2025-01-10': 'CLEAR', '2025-03-05': 'PARTIAL', '2025-06-15': 'OBSCURED', '2025-12-20': 'CLEAR' }
const grid = { width: 4, height: 4 } as never
const input = { aoi: { kind: 'site', rings: [] } as never, bbox: [0, 0, 1, 1] as [number, number, number, number], points: [], dateFrom: '2025-01-01', dateTo: '2025-12-31', grid, thumbGrid: grid, priority: [] as string[] }

function deps(over: Partial<RunnerDeps> = {}) {
  const calls: string[] = []
  const d: RunnerDeps = {
    search: async () => ({ items: DATES.map(item), limited: false, source: 'sentinel-2-l2a' }),
    select: () => DATES.map(cand),
    quality: async (req) => { calls.push(`q:${req.item.id}`); return { stats: { label: LABEL[req.item.id], validFraction: 1 } } as never },
    frame: async (req) => { calls.push(`f${req.level}:${req.item.id}`); return { level: req.level } as never },
    ...over,
  }
  return { d, calls }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('interleaveEnds', () => {
  it('orders from both ends inward', () => {
    expect(interleaveEnds(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'e', 'b', 'd', 'c'])
  })
})

describe('createRunner', () => {
  it('checks every date, then loads thumbnails only for clear/partial ones', async () => {
    const { d, calls } = deps()
    let last: EvidenceState | null = null
    const r = createRunner(d, input, (s) => (last = s), 1)
    await r.start()
    for (let i = 0; i < 20; i++) await flush()
    expect(calls.filter((c) => c.startsWith('q:'))).toEqual(['q:2025-01-10', 'q:2025-12-20', 'q:2025-03-05', 'q:2025-06-15'])
    expect(calls.filter((c) => c.startsWith('f1:')).sort()).toEqual(['f1:2025-01-10', 'f1:2025-03-05', 'f1:2025-12-20'])
    expect(last!.entries.every((e) => e.status === 'checked')).toBe(true)
  })
  it('honours priority dates and `only`', async () => {
    const { d, calls } = deps()
    const r = createRunner(d, { ...input, priority: ['2025-06-15'], only: ['2025-06-15', '2025-12-20'] }, () => {}, 1)
    await r.start()
    for (let i = 0; i < 20; i++) await flush()
    expect(calls.filter((c) => c.startsWith('q:'))).toEqual(['q:2025-06-15', 'q:2025-12-20'])
  })
  it('loads full frames on request, ahead of queued work', async () => {
    const { d, calls } = deps()
    const r = createRunner(d, input, () => {}, 1)
    await r.start()
    r.requestFull('2025-12-20')
    for (let i = 0; i < 20; i++) await flush()
    expect(calls).toContain('f0:2025-12-20')
    expect(calls.indexOf('f0:2025-12-20')).toBeLessThan(calls.indexOf('q:2025-06-15'))
  })
  it('reports search failures and empty results distinctly', async () => {
    let s: EvidenceState | null = null
    await createRunner(deps({ search: async () => { throw new Error('STAC_502') } }).d, input, (x) => (s = x)).start()
    expect(s).toMatchObject({ phase: 'error', error: 'STAC_502' })
    await createRunner(deps({ select: () => [] }).d, input, (x) => (s = x)).start()
    expect(s).toMatchObject({ phase: 'ready', entries: [] })
  })
  it('stops all work and state updates after dispose', async () => {
    const onState = vi.fn()
    const slow: RunnerDeps['quality'] = (_req, signal) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))
    const r = createRunner(deps({ quality: slow }).d, input, onState, 2)
    await r.start()
    const n = onState.mock.calls.length
    r.dispose()
    for (let i = 0; i < 10; i++) await flush()
    expect(onState.mock.calls.length).toBe(n)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/workbench`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/workbench/runner.ts` and `src/workbench/defaults.ts`**

`src/workbench/runner.ts`:
```ts
import type { AoiGeometry, DisplayGrid, LonLat } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import type { DateCandidate, S2Item, SearchResult } from '../stac/types.ts'
import type { FrameRequest, FrameResult, QualityRequest, QualityResult } from '../workers/imagery-core.ts'

export type EntryStatus = 'queued' | 'checking' | 'checked' | 'error'
export interface DateEntry {
  date: string
  candidate: DateCandidate
  quality: QualityResult | null
  thumb: FrameResult | null
  full: FrameResult | null
  status: EntryStatus
  error: string | null
}
export interface EvidenceState { phase: 'searching' | 'ready' | 'error'; limited: boolean; source: string | null; entries: DateEntry[]; error: string | null }
export interface RunnerDeps {
  search(a: { bbox: Bbox; from: string; to: string; signal: AbortSignal }): Promise<SearchResult>
  select(items: S2Item[], points: LonLat[]): DateCandidate[]
  quality(req: QualityRequest, signal: AbortSignal): Promise<QualityResult>
  frame(req: FrameRequest, signal: AbortSignal): Promise<FrameResult>
}
export interface RunnerInput {
  aoi: AoiGeometry
  bbox: Bbox
  points: LonLat[]
  dateFrom: string
  dateTo: string
  grid: DisplayGrid
  thumbGrid: DisplayGrid
  priority: string[]
  only?: string[]
}

export function interleaveEnds(dates: string[]): string[] {
  const out: string[] = []
  for (let i = 0, j = dates.length - 1; i <= j; i++, j--) {
    out.push(dates[i]!)
    if (i !== j) out.push(dates[j]!)
  }
  return out
}

export function createRunner(deps: RunnerDeps, input: RunnerInput, onState: (s: EvidenceState) => void, concurrency = 4) {
  const ac = new AbortController()
  let state: EvidenceState = { phase: 'searching', limited: false, source: null, entries: [], error: null }
  const emit = (patch: Partial<EvidenceState>) => {
    if (ac.signal.aborted) return
    state = { ...state, ...patch }
    onState(state)
  }
  const patchEntry = (date: string, patch: Partial<DateEntry>) => emit({ entries: state.entries.map((e) => (e.date === date ? { ...e, ...patch } : e)) })
  const entry = (date: string) => state.entries.find((e) => e.date === date)

  const queue: Array<() => Promise<void>> = []
  let active = 0
  const pump = () => {
    while (active < concurrency && queue.length && !ac.signal.aborted) {
      const job = queue.shift()!
      active++
      job().finally(() => { active--; pump() })
    }
  }
  const enqueue = (job: () => Promise<void>, front = false) => {
    if (front) queue.unshift(job)
    else queue.push(job)
    pump()
  }

  const loadFrame = (date: string, level: 0 | 1) => async () => {
    const e = entry(date)
    if (!e || (level === 0 ? e.full : e.thumb)) return
    try {
      const f = await deps.frame({ item: e.candidate.item, level, aoi: input.aoi, grid: level === 0 ? input.grid : input.thumbGrid }, ac.signal)
      patchEntry(date, level === 0 ? { full: f } : { thumb: f })
    } catch (err) {
      if (level === 0) patchEntry(date, { error: (err as Error).message })
    }
  }

  const check = (date: string) => async () => {
    const e = entry(date)
    if (!e || e.quality) return
    patchEntry(date, { status: 'checking' })
    try {
      const q = await deps.quality({ item: e.candidate.item, aoi: input.aoi, grid: input.grid }, ac.signal)
      patchEntry(date, { quality: q, status: 'checked' })
      if (q.stats.label === 'CLEAR' || q.stats.label === 'PARTIAL') enqueue(loadFrame(date, 1))
    } catch (err) {
      patchEntry(date, { status: 'error', error: (err as Error).message })
    }
  }

  return {
    async start() {
      try {
        const res = await deps.search({ bbox: input.bbox, from: input.dateFrom, to: input.dateTo, signal: ac.signal })
        let cands = deps.select(res.items, input.points)
        if (input.only) cands = cands.filter((c) => input.only!.includes(c.date))
        emit({
          phase: 'ready', limited: res.limited, source: res.source,
          entries: cands.map((c) => ({ date: c.date, candidate: c, quality: null, thumb: null, full: null, status: 'queued', error: null })),
        })
        const all = cands.map((c) => c.date)
        const order = [...new Set([...input.priority.filter((d) => all.includes(d)), ...interleaveEnds(all)])]
        for (const d of order) enqueue(check(d))
      } catch (err) {
        emit({ phase: 'error', error: (err as Error).message })
      }
    },
    requestFull(date: string) {
      enqueue(loadFrame(date, 0), true)
    },
    dispose() {
      ac.abort()
      queue.length = 0
    },
  }
}
```

`src/workbench/defaults.ts`:
```ts
import type { DateEntry } from './runner.ts'

export const isUsable = (e: DateEntry) => e.quality?.stats.label === 'CLEAR' || e.quality?.stats.label === 'PARTIAL'

function fraction(date: string, from: string, to: string) {
  const t0 = Date.parse(from)
  return (Date.parse(date) - t0) / Math.max(1, Date.parse(to) - t0)
}

export function quartilesDone(entries: DateEntry[], from: string, to: string): boolean {
  return entries.length > 0 && entries.every((e) => {
    const f = fraction(e.date, from, to)
    return (f > 0.25 && f < 0.75) || e.status === 'checked' || e.status === 'error'
  })
}

export function pickDefaults(entries: DateEntry[], from: string, to: string): { before: string | null; after: string | null } {
  const ok = entries.filter(isUsable)
  if (ok.length < 2) return { before: null, after: null }
  const v = (e: DateEntry) => e.quality!.stats.clearFraction
  const early = ok.filter((e) => fraction(e.date, from, to) <= 0.25).sort((a, b) => v(b) - v(a) || a.date.localeCompare(b.date))
  const late = ok.filter((e) => fraction(e.date, from, to) >= 0.75).sort((a, b) => v(b) - v(a) || b.date.localeCompare(a.date))
  const before = (early[0] ?? ok[0]!).date
  const after = (late[0] ?? ok[ok.length - 1]!).date
  return before < after ? { before, after } : { before: ok[0]!.date, after: ok[ok.length - 1]!.date }
}
```

- [ ] **Step 4: Implement `src/workbench/useEvidence.ts`**

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { DisplayGrid, LonLat } from '../evidence/types.ts'
import { coarsenBbox, summarizeAoi, toAoiGeometry, type AoiInput, type AoiSummary } from '../geo/aoi.ts'
import type { Investigation } from '../data/investigation.ts'
import { searchSentinel2 } from '../stac/search.ts'
import { selectPerDate } from '../stac/select.ts'
import { createImageryClient } from '../workers/imagery-client.ts'
import { createRunner, type EvidenceState } from './runner.ts'

const vertices = (aoi: AoiInput): LonLat[] => (aoi.kind === 'site' ? aoi.geometry.coordinates[0]! : aoi.geometry.coordinates)

export function useEvidence(inv: Investigation | null | undefined, maxSide: number, opts: { only?: string[] } = {}) {
  const [state, setState] = useState<EvidenceState>({ phase: 'searching', limited: false, source: null, entries: [], error: null })
  const runner = useRef<ReturnType<typeof createRunner> | null>(null)
  const summary: AoiSummary | null = useMemo(() => {
    if (!inv) return null
    const r = summarizeAoi(inv.aoi)
    return r.ok ? r.summary : null
  }, [inv?.aoi]) // eslint-disable-line react-hooks/exhaustive-deps
  const grid: DisplayGrid | null = useMemo(() => (summary ? makeDisplayGrid(summary.bbox, maxSide) : null), [summary, maxSide])
  const onlyKey = opts.only?.join(',') ?? ''

  useEffect(() => {
    if (!inv || !summary || !grid) return
    const client = createImageryClient()
    const r = createRunner(
      {
        search: (a) => searchSentinel2({ ...a, bbox: coarsenBbox(a.bbox) }),
        select: selectPerDate,
        quality: (q, s) => client.quality(q, s),
        frame: (f, s) => client.frame(f, s),
      },
      {
        aoi: toAoiGeometry(inv.aoi), bbox: summary.bbox, points: vertices(inv.aoi), dateFrom: inv.dateFrom, dateTo: inv.dateTo,
        grid, thumbGrid: makeDisplayGrid(summary.bbox, 256), priority: [inv.before, inv.after, ...inv.pinned].filter((d): d is string => !!d),
        only: opts.only,
      },
      setState,
    )
    runner.current = r
    void r.start()
    return () => {
      r.dispose()
      client.dispose()
      runner.current = null
    }
  }, [inv?.id, inv?.dateFrom, inv?.dateTo, summary, grid, onlyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, grid, summary, requestFull: (date: string) => runner.current?.requestFull(date) }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/workbench && npm run check`
Expected: defaults 4 + runner 6 PASS. The build now emits `imagery.worker-*.js`, because `useEvidence` imports the client.

- [ ] **Step 6: Commit**

```bash
git add src/workbench
git commit -m "feat(workbench): evidence runner with ends-first quality checks, thumbnails, full frames and abort

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C5: Workbench screen and evidence viewer (swipe, side by side, difference)

**Files:**
- Create: `src/lib/canvas.ts`, `src/workbench/FrameCanvas.tsx`, `src/workbench/EvidenceViewer.tsx`, `src/screens/Workbench.tsx`
- Modify: `src/app.tsx` (route `investigation`), `src/styles.css` (`.swipe-range`)
- Test: `tests/e2e/workbench.spec.ts`, `tests/e2e/helpers.ts` (add `openFixtureSite`, `openFixtureRoad`)

**Interfaces:**
- Consumes: `useInvestigation`, `useEvidence`, `pickDefaults`, `quartilesDone`, `setBeforeAfter`, `brightnessDiff` (`src/evidence/diff.ts`), `useMapStage`, `useMediaQuery`.
- Produces:
  - `rgbaToCanvas(rgba, w, h): HTMLCanvasElement`, `rgbaToPngDataUrl(rgba, w, h): string`, `rgbToRgba(rgb, w, h): Uint8ClampedArray`
  - `FrameCanvas({ rgba, width, height, label, className? })`
  - `EvidenceViewer({ before, after, grid, invalid })` where each slot is `{ date: string; frame: FrameResult | null; stats: QualityStats | null } | null`
  - `Workbench({ id })` (default export), with a right column into which C6–C8 add panels
  - `fmtDate(ymd: string): string` (in `src/lib/canvas.ts`'s sibling `src/lib/format.ts`)

- [ ] **Step 1: Write the E2E test first: `tests/e2e/workbench.spec.ts` (plus helpers)**

Replace `tests/e2e/helpers.ts` with the complete version (C2 + C3 + these two journeys):
```ts
import { expect, type Page } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'

export async function startAt(page: Page, query = 'tier=0&lat=21.1458&lon=79.0882&name=Nagpur') {
  await page.goto(`/new?${query}`)
  await expect(page.getByRole('heading', { name: flow.outline.title })).toBeVisible()
}

async function openCoordsForm(page: Page) {
  const details = page.locator('details', { hasText: flow.outline.byCoords })
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator('summary').click()
}

export async function outlineSiteByCoords(page: Page, side = 1000) {
  await openCoordsForm(page)
  await page.getByLabel(flow.outline.centre).fill('21.1458, 79.0882')
  await page.getByLabel(flow.outline.side).fill(String(side))
  await page.getByRole('button', { name: flow.outline.useSquare }).click()
}

export async function outlineRoadByCoords(page: Page) {
  await page.getByRole('radio', { name: new RegExp(flow.outline.road) }).check()
  await page.getByLabel(flow.outline.width).fill('30')
  await openCoordsForm(page)
  await page.getByLabel(flow.outline.start).fill('21.138637, 79.07698')
  await page.getByLabel(flow.outline.end).fill('21.157819, 79.095988')
  await page.getByRole('button', { name: flow.outline.useLine }).click()
}

export async function finishDatesAndOpen(page: Page, from = '2025-01-01', to = '2025-12-31') {
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(flow.dates.from, { exact: true }).fill(from)
  await page.getByLabel(flow.dates.to, { exact: true }).fill(to)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: flow.review.open }).click()
  await expect(page).toHaveURL(/\/i\/local-[0-9a-f-]{36}$/)
}

export async function openFixtureSite(page: Page) {
  await startAt(page)
  await outlineSiteByCoords(page, 1000)
  await finishDatesAndOpen(page, '2025-01-01', '2025-12-31')
}

/** Both compared photos are on screen, so the before/after pair is chosen and loaded. */
export async function waitForPhotos(page: Page) {
  await expect(page.getByRole('img', { name: /^Before photo/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: /^After photo/ })).toBeVisible({ timeout: 30_000 })
}

export async function openFixtureRoad(page: Page) {
  await startAt(page)
  await outlineRoadByCoords(page)
  await finishDatesAndOpen(page, '2025-01-01', '2025-12-31')
}
```

`tests/e2e/workbench.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureSite } from './helpers.ts'

test('defaults to the clearest early and late passes and shows both photos', async ({ page }) => {
  await openFixtureSite(page)
  await expect(page.getByRole('img', { name: /^Before photo, 10 Jan 2025/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: /^After photo, 20 Dec 2025/ })).toBeVisible()
  await expect(page.getByText(/10 Jan 2025 · Sentinel-2 · 10 m · 100% clear view/)).toBeVisible()
})

test('swipe works from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openFixtureSite(page)
  const slider = page.getByRole('slider', { name: flow.workbench.swipeLabel })
  await expect(slider).toBeVisible({ timeout: 30_000 })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('51')
})

test('difference view always carries its caption', async ({ page }) => {
  await openFixtureSite(page)
  await page.getByRole('radio', { name: flow.workbench.modes.diff }).check({ timeout: 30_000 })
  await expect(page.getByText(flow.workbench.diffCaption)).toBeVisible()
})

test('narrow screens default to side by side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixtureSite(page)
  await expect(page.getByRole('radio', { name: flow.workbench.modes.side })).toBeChecked({ timeout: 30_000 })
})

test('an all-cloudy range says so plainly and keeps the page usable', async ({ page }) => {
  await openFixtureSite(page)
  const id = page.url().split('/i/')[1]!
  await page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('gs-investigations'); r.onsuccess = () => res(r.result) })
    const tx = db.transaction('investigations', 'readwrite')
    const st = tx.objectStore('investigations')
    const inv = await new Promise<any>((res) => { const g = st.get(key); g.onsuccess = () => res(g.result) })
    st.put({ ...inv, dateFrom: '2025-06-01', dateTo: '2025-06-30', before: null, after: null, pinned: [] }, key)
    await new Promise((res) => (tx.oncomplete = res))
  }, id)
  await page.reload()
  await expect(page.getByText(flow.workbench.allCloudy)).toBeVisible({ timeout: 30_000 })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- workbench`
Expected: FAIL (the workbench route renders Not found).

- [ ] **Step 3: Implement `src/lib/canvas.ts`, `src/lib/format.ts` and `src/workbench/FrameCanvas.tsx`**

`src/lib/canvas.ts`:
```ts
export function rgbaToCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  return c
}

export const rgbaToPngDataUrl = (rgba: Uint8ClampedArray, w: number, h: number) => rgbaToCanvas(rgba, w, h).toDataURL('image/png')

/** Native TCI window (interleaved RGB) to RGBA; (0,0,0) is no-data and becomes transparent. */
export function rgbToRgba(rgb: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0, j = 0; i < w * h; i++, j += 3) {
    out[i * 4] = rgb[j]!
    out[i * 4 + 1] = rgb[j + 1]!
    out[i * 4 + 2] = rgb[j + 2]!
    out[i * 4 + 3] = rgb[j]! || rgb[j + 1]! || rgb[j + 2]! ? 255 : 0
  }
  return out
}
```

`src/lib/format.ts`:
```ts
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const fmtDate = (ymd: string) => DATE.format(new Date(`${ymd}T00:00:00Z`))
export const pct = (f: number) => Math.round(f * 100)
```

`src/workbench/FrameCanvas.tsx`:
```tsx
import { useEffect, useRef } from 'react'

export function FrameCanvas({ rgba, width, height, label, className = '' }: { rgba: Uint8ClampedArray; width: number; height: number; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = width
    c.height = height
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  }, [rgba, width, height])
  return <canvas ref={ref} role="img" aria-label={label} className={`block h-auto w-full ${className}`} />
}
```

- [ ] **Step 4: Implement `src/workbench/EvidenceViewer.tsx` and the swipe CSS**

```tsx
import { animate } from 'motion/react'
import { useMemo, useState } from 'react'
import { brightnessDiff } from '../evidence/diff.ts'
import type { DisplayGrid, QualityStats } from '../evidence/types.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { flow } from '../ui/copy-flow.ts'
import { QualityTag, Skeleton } from '../ui/kit.tsx'
import type { FrameResult } from '../workers/imagery-core.ts'
import { FrameCanvas } from './FrameCanvas.tsx'

export type Slot = { date: string; frame: FrameResult | null; stats: QualityStats | null } | null
type Mode = 'swipe' | 'side' | 'diff'

function Caption({ slot }: { slot: NonNullable<Slot> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.75rem] text-fg-2 num">
      <span>{flow.workbench.caption(fmtDate(slot.date), slot.stats ? pct(slot.stats.clearFraction) : 0)}</span>
      {slot.stats && <QualityTag label={slot.stats.label} />}
    </p>
  )
}

function Photo({ slot, role, grid }: { slot: NonNullable<Slot>; role: string; grid: DisplayGrid }) {
  if (!slot.frame) return <Skeleton className="w-full" />
  return <FrameCanvas rgba={slot.frame.display.rgba} width={grid.width} height={grid.height} label={flow.workbench.photoAlt(role, fmtDate(slot.date))} />
}

export function EvidenceViewer({ before, after, grid, invalid }: { before: Slot; after: Slot; grid: DisplayGrid; invalid: Uint8Array | null }) {
  const narrow = useMediaQuery('(max-width: 599px)')
  const [mode, setMode] = useState<Mode>(() => (matchMedia('(max-width: 599px)').matches ? 'side' : 'swipe'))
  const [pos, setPos] = useState(50)
  const diff = useMemo(
    () => (mode === 'diff' && before?.frame && after?.frame ? brightnessDiff(before.frame.display.rgba, after.frame.display.rgba, invalid ?? undefined) : null),
    [mode, before?.frame, after?.frame, invalid],
  )
  const aspect = { aspectRatio: `${grid.width} / ${grid.height}` }
  if (!before || !after) return <p className="border border-line p-6 text-fg-2">{flow.workbench.pickPair}</p>

  const snap = () => {
    const target = [0, 50, 100].find((t) => Math.abs(t - pos) < 4)
    if (target !== undefined && target !== pos) animate(pos, target, { type: 'spring', stiffness: 400, damping: 40, onUpdate: setPos })
  }

  return (
    <div className="grid gap-3">
      <fieldset className="flex w-fit overflow-hidden rounded-[6px] border border-control">
        <legend className="sr-only">{flow.workbench.view}</legend>
        {(['swipe', 'side', 'diff'] as const).map((m) => (
          <label key={m} className="relative">
            <input type="radio" name="view" value={m} checked={mode === m} onChange={() => setMode(m)} className="peer absolute inset-0 cursor-pointer opacity-0" />
            <span className="inline-flex h-11 cursor-pointer items-center px-4 text-sm peer-checked:bg-fg peer-checked:text-bg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {flow.workbench.modes[m]}
            </span>
          </label>
        ))}
      </fieldset>

      {mode === 'swipe' && !narrow && (
        <div className="relative select-none overflow-hidden border border-line" style={aspect}>
          <div className="absolute inset-0"><Photo slot={before} role={flow.workbench.before} grid={grid} /></div>
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}><Photo slot={after} role={flow.workbench.after} grid={grid} /></div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pos}%` }} />
          <input
            type="range" min={0} max={100} step={1} value={Math.round(pos)}
            onChange={(e) => setPos(Number(e.target.value))} onPointerUp={snap}
            aria-label={flow.workbench.swipeLabel} className="swipe-range absolute inset-0 h-full w-full"
          />
        </div>
      )}

      {(mode === 'side' || (mode === 'swipe' && narrow)) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <figure className="grid gap-2"><div className="border border-line" style={aspect}><Photo slot={before} role={flow.workbench.before} grid={grid} /></div><figcaption><Caption slot={before} /></figcaption></figure>
          <figure className="grid gap-2"><div className="border border-line" style={aspect}><Photo slot={after} role={flow.workbench.after} grid={grid} /></div><figcaption><Caption slot={after} /></figcaption></figure>
        </div>
      )}

      {mode === 'diff' && (
        <figure className="grid gap-2">
          <div className="relative border border-line" style={aspect}>
            <div className="absolute inset-0 opacity-50"><Photo slot={before} role={flow.workbench.before} grid={grid} /></div>
            {diff && <div className="absolute inset-0"><FrameCanvas rgba={diff} width={grid.width} height={grid.height} label={flow.workbench.modes.diff} /></div>}
          </div>
          <figcaption className="text-sm text-fg-2">{flow.workbench.diffCaption}</figcaption>
        </figure>
      )}

      {mode !== 'side' && !(mode === 'swipe' && narrow) && (
        <div className="grid gap-1 sm:grid-cols-2">
          <Caption slot={before} />
          <Caption slot={after} />
        </div>
      )}
    </div>
  )
}
```

Append to `src/styles.css`:
```css
.swipe-range {
  appearance: none;
  background: transparent;
  margin: 0;
  cursor: ew-resize;
}
.swipe-range::-webkit-slider-runnable-track {
  background: transparent;
  height: 100%;
}
.swipe-range::-moz-range-track {
  background: transparent;
  height: 100%;
}
.swipe-range::-webkit-slider-thumb {
  appearance: none;
  width: 44px;
  height: 44px;
  margin-top: calc(50% - 22px);
  border-radius: 9999px;
  background: var(--gs-bg);
  border: 2px solid var(--gs-accent);
}
.swipe-range::-moz-range-thumb {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: var(--gs-bg);
  border: 2px solid var(--gs-accent);
}
```

- [ ] **Step 5: Implement `src/screens/Workbench.tsx` and the route**

```tsx
import { useEffect, useMemo } from 'react'
import { setBeforeAfter } from '../data/investigation.ts'
import { useInvestigation } from '../data/useInvestigation.ts'
import { Link } from '../lib/router.tsx'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { flow } from '../ui/copy-flow.ts'
import { MicroLabel, Skeleton } from '../ui/kit.tsx'
import { isUsable, pickDefaults, quartilesDone } from '../workbench/defaults.ts'
import { EvidenceViewer, type Slot } from '../workbench/EvidenceViewer.tsx'
import { useEvidence } from '../workbench/useEvidence.ts'
import type { DateEntry } from '../workbench/runner.ts'

const slot = (e: DateEntry | undefined): Slot => (e ? { date: e.date, frame: e.full, stats: e.quality?.stats ?? null } : null)

export default function Workbench({ id }: { id: string }) {
  const { inv, update, error } = useInvestigation(id)
  const { tier } = useMapStage()
  useMapLayout('hidden')
  const desktop = useMediaQuery('(min-width: 1024px)')
  const maxSide = desktop ? (tier >= 2 ? 1024 : 768) : 512
  const { state, grid, requestFull } = useEvidence(inv, maxSide)
  const entries = state.entries
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])

  useEffect(() => {
    if (!inv || inv.before || !quartilesDone(entries, inv.dateFrom, inv.dateTo)) return
    const d = pickDefaults(entries, inv.dateFrom, inv.dateTo)
    if (d.before && d.after) update((i) => setBeforeAfter(i, d.before!, d.after!))
  }, [inv, entries, update])

  useEffect(() => {
    if (state.phase !== 'ready' || !inv) return
    for (const d of [inv.before, inv.after]) if (d && byDate.get(d) && !byDate.get(d)!.full) requestFull(d)
  }, [state.phase, inv?.before, inv?.after, byDate]) // eslint-disable-line react-hooks/exhaustive-deps

  if (inv === undefined) return <Skeleton className="m-6 h-64" />
  if (inv === null) return <p className="mx-auto max-w-[65ch] px-4 py-20 text-fg-2">{flow.workbench.notFound}</p>

  const checked = entries.filter((e) => e.status === 'checked')
  const allCloudy = state.phase === 'ready' && entries.length > 0 && checked.length === entries.length && !entries.some(isUsable)
  const beforeEntry = inv.before ? byDate.get(inv.before) : undefined
  const afterEntry = inv.after ? byDate.get(inv.after) : undefined
  const invalid = beforeEntry?.quality?.invalid && afterEntry?.quality?.invalid
    ? beforeEntry.quality.invalid.map((v, i) => (v || afterEntry.quality!.invalid![i] ? 1 : 0))
    : null

  return (
    <div className="grid min-h-[calc(100dvh-56px)] gap-px bg-line lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid content-start gap-4 bg-bg p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <MicroLabel>{flow.workbench.notSaved}</MicroLabel>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{inv.name}</h1>
          </div>
          <Link to={`/i/${inv.id}/report`} className="inline-flex h-11 items-center rounded-[6px] border border-control px-4">{flow.workbench.report}</Link>
        </header>
        {error && <p role="alert" className="text-sm text-bad">{flow.workbench.errors[error] ?? error}</p>}
        <div aria-live="polite" className="text-sm text-fg-2">
          {state.phase === 'searching' && <p>{flow.workbench.searching}</p>}
          {state.phase === 'error' && <p className="text-bad">{flow.workbench.searchFailed}</p>}
          {state.phase === 'ready' && entries.length === 0 && <p>{flow.workbench.none}</p>}
          {allCloudy && <p>{flow.workbench.allCloudy}</p>}
          {state.limited && <p>{flow.workbench.limited}</p>}
        </div>
        {grid && !allCloudy && entries.length > 0 && <EvidenceViewer before={slot(beforeEntry)} after={slot(afterEntry)} grid={grid} invalid={invalid} />}
        <p className="text-sm text-fg-2">{flow.workbench.disclaimer} {flow.workbench.catalogueNote}</p>
      </div>
      <aside className="grid content-start gap-6 bg-bg p-4 lg:p-6" aria-label={flow.workbench.timeline} />
    </div>
  )
}
```

In `src/app.tsx`: add `const Workbench = lazy(() => import('./screens/Workbench.tsx'))` and `case 'investigation': return <Workbench key={r.id} id={r.id} />`.

- [ ] **Step 6: Run tests**

Run: `npm run check && npm run e2e -- workbench`
Expected: 5 E2E tests green on every engine (they run at T0 and need no WebGL).

- [ ] **Step 7: Commit**

```bash
git add src tests/e2e
git commit -m "feat(workbench): evidence viewer with keyboard swipe, side by side, captioned difference and honest empty states

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C6: Timeline, pins and the road section × date grid

**Files:**
- Create: `src/workbench/Timeline.tsx`, `src/workbench/SectionGrid.tsx`, `src/workbench/grid-nav.ts`
- Modify: `src/screens/Workbench.tsx` (render both in the aside; track `current` date)
- Test: `src/workbench/grid-nav.test.ts`, `tests/e2e/timeline.spec.ts`

**Interfaces:**
- Consumes: `DateEntry`, `togglePin`, `setBeforeAfter`, `QualityGlyph`, `fmtDate`.
- Produces:
  - `moveFocus(pos: { r: number; c: number }, key: string, rows: number, cols: number): { r: number; c: number }`
  - `Timeline({ entries, from, to, current, before, after, pinned, onSelect, onBefore, onAfter, onPin, thumbGrid })`
  - `SectionGrid({ entries, parts, current, onSelect })` where `parts: Array<{ idx: number; fromM: number; toM: number }>`

- [ ] **Step 1: Write the failing unit test `src/workbench/grid-nav.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { moveFocus } from './grid-nav.ts'

describe('moveFocus', () => {
  it.each([
    ['ArrowRight', { r: 0, c: 0 }, { r: 0, c: 1 }],
    ['ArrowLeft', { r: 0, c: 0 }, { r: 0, c: 0 }],
    ['ArrowDown', { r: 1, c: 2 }, { r: 2, c: 2 }],
    ['ArrowDown', { r: 2, c: 2 }, { r: 2, c: 2 }],
    ['ArrowUp', { r: 1, c: 2 }, { r: 0, c: 2 }],
    ['Home', { r: 1, c: 3 }, { r: 1, c: 0 }],
    ['End', { r: 1, c: 0 }, { r: 1, c: 4 }],
    ['x', { r: 1, c: 1 }, { r: 1, c: 1 }],
  ])('%s from %j → %j', (key, from, to) => {
    expect(moveFocus(from, key, 3, 5)).toEqual(to)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/workbench/grid-nav.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `grid-nav.ts`, `Timeline.tsx`, `SectionGrid.tsx`**

`src/workbench/grid-nav.ts`:
```ts
export function moveFocus(pos: { r: number; c: number }, key: string, rows: number, cols: number): { r: number; c: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v))
  switch (key) {
    case 'ArrowRight': return { r: pos.r, c: clamp(pos.c + 1, cols) }
    case 'ArrowLeft': return { r: pos.r, c: clamp(pos.c - 1, cols) }
    case 'ArrowDown': return { r: clamp(pos.r + 1, rows), c: pos.c }
    case 'ArrowUp': return { r: clamp(pos.r - 1, rows), c: pos.c }
    case 'Home': return { r: pos.r, c: 0 }
    case 'End': return { r: pos.r, c: cols - 1 }
    default: return pos
  }
}
```

`src/workbench/Timeline.tsx`:
```tsx
import type { DisplayGrid } from '../evidence/types.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Panel, QualityGlyph, QualityTag, Skeleton } from '../ui/kit.tsx'
import { FrameCanvas } from './FrameCanvas.tsx'
import type { DateEntry } from './runner.ts'

interface Props {
  entries: DateEntry[]
  from: string
  to: string
  current: string | null
  before: string | null
  after: string | null
  pinned: string[]
  thumbGrid: DisplayGrid | null
  onSelect(date: string): void
  onBefore(date: string): void
  onAfter(date: string): void
  onPin(date: string): void
}

export function Timeline({ entries, from, to, current, before, after, pinned, thumbGrid, onSelect, onBefore, onAfter, onPin }: Props) {
  if (entries.length === 0) return null
  const t0 = Date.parse(from), span = Math.max(1, Date.parse(to) - t0)
  const idx = Math.max(0, entries.findIndex((e) => e.date === current))
  const cur = entries[idx]!
  const word = (e: DateEntry) => (e.quality ? copy.quality[e.quality.stats.label].word : copy.common.loading)
  return (
    <Panel title={`${flow.workbench.timeline} · ${flow.workbench.passes(entries.length)}`}>
      <div className="relative h-10 border-b border-line" aria-hidden>
        {entries.map((e) => {
          const left = ((Date.parse(e.date) - t0) / span) * 100
          const mark = e.date === before || e.date === after
          return (
            <span key={e.date} className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${e.date === cur.date ? 'text-accent' : mark ? 'text-fg' : 'text-fg-2'}`} style={{ left: `${left}%` }}>
              {e.quality ? <QualityGlyph label={e.quality.stats.label} size={mark ? 14 : 10} /> : <span className="block h-2 w-px bg-control" />}
            </span>
          )
        })}
      </div>
      <input
        type="range" min={0} max={entries.length - 1} step={1} value={idx}
        onChange={(e) => onSelect(entries[Number(e.target.value)]!.date)}
        aria-label={flow.workbench.timelineLabel}
        aria-valuetext={`${fmtDate(cur.date)}, ${word(cur)}`}
        className="mt-3 w-full accent-[var(--gs-accent)]"
      />
      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono num">{fmtDate(cur.date)}</p>
          {cur.quality && <QualityTag label={cur.quality.stats.label} />}
        </div>
        {cur.quality && <p className="text-sm text-fg-2">{copy.quality[cur.quality.stats.label].help} {pct(cur.quality.stats.clearFraction)}%.</p>}
        {thumbGrid && (cur.thumb ? <FrameCanvas rgba={cur.thumb.display.rgba} width={thumbGrid.width} height={thumbGrid.height} label={flow.workbench.photoAlt(flow.workbench.timelineLabel, fmtDate(cur.date))} /> : cur.quality && (cur.quality.stats.label === 'CLEAR' || cur.quality.stats.label === 'PARTIAL') ? <Skeleton className="aspect-square w-full" /> : null)}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onBefore(cur.date)} disabled={!after || cur.date >= after}>{flow.workbench.useBefore}</Button>
          <Button size="sm" onClick={() => onAfter(cur.date)} disabled={!before || cur.date <= before}>{flow.workbench.useAfter}</Button>
          <Button size="sm" aria-pressed={pinned.includes(cur.date)} onClick={() => onPin(cur.date)} disabled={cur.date === before || cur.date === after}>
            {pinned.includes(cur.date) ? flow.workbench.unpin : flow.workbench.pin}
          </Button>
        </div>
        <p className="text-xs text-fg-2">{flow.workbench.legend}</p>
      </div>
    </Panel>
  )
}
```

`src/workbench/SectionGrid.tsx`:
```tsx
import { useRef, useState, type KeyboardEvent } from 'react'
import { fmtDate } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Panel, QualityGlyph } from '../ui/kit.tsx'
import { moveFocus } from './grid-nav.ts'
import type { DateEntry } from './runner.ts'

export function SectionGrid({ entries, parts, current, onSelect }: { entries: DateEntry[]; parts: Array<{ idx: number; fromM: number; toM: number }>; current: string | null; onSelect(date: string): void }) {
  const cols = entries.filter((e) => e.quality)
  const [pos, setPos] = useState({ r: 0, c: 0 })
  const cells = useRef(new Map<string, HTMLButtonElement>())
  if (parts.length < 2 || cols.length === 0) return null
  const onKey = (e: KeyboardEvent) => {
    const next = moveFocus(pos, e.key, parts.length, cols.length)
    if (next === pos) return
    e.preventDefault()
    setPos(next)
    cells.current.get(`${next.r}:${next.c}`)?.focus()
  }
  return (
    <Panel title={flow.workbench.grid}>
      <div className="overflow-x-auto">
        <table role="grid" aria-label={flow.workbench.grid} className="border-collapse text-sm" onKeyDown={onKey}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-panel px-2 py-1 text-left font-mono text-[0.75rem] font-medium text-fg-2">km</th>
              {cols.map((e) => <th key={e.date} scope="col" className="px-1 py-1 font-mono text-[0.75rem] font-medium text-fg-2 [writing-mode:vertical-rl]">{fmtDate(e.date)}</th>)}
            </tr>
          </thead>
          <tbody>
            {parts.map((p, r) => {
              const label = flow.workbench.section(p.fromM, p.toM)
              return (
                <tr key={p.idx}>
                  <th scope="row" className="sticky left-0 bg-panel px-2 py-1 text-left font-mono text-[0.75rem] font-medium num">{label}</th>
                  {cols.map((e, c) => {
                    const st = e.quality!.parts.find((x) => x.idx === p.idx)?.stats
                    const word = st ? copy.quality[st.label].word : copy.common.loading
                    return (
                      <td key={e.date} className="p-0">
                        <button
                          ref={(el) => { if (el) cells.current.set(`${r}:${c}`, el); else cells.current.delete(`${r}:${c}`) }}
                          tabIndex={pos.r === r && pos.c === c ? 0 : -1}
                          aria-label={flow.workbench.cell(label, fmtDate(e.date), word)}
                          aria-current={e.date === current ? 'date' : undefined}
                          onClick={() => { setPos({ r, c }); onSelect(e.date) }}
                          className={`grid h-11 w-11 place-items-center ${e.date === current ? 'bg-line text-accent' : 'text-fg'}`}
                        >
                          {st && <QualityGlyph label={st.label} />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
```

In `src/screens/Workbench.tsx`:
- add `const [current, setCurrent] = useState<string | null>(null)`, and in an effect set it to `inv.after ?? entries[entries.length - 1]?.date ?? null` when it is null and entries exist;
- import `togglePin`, `setBeforeAfter`, `Timeline`, `SectionGrid`, `makeDisplayGrid` and `useToast`;
- compute `const thumbGrid = useMemo(() => (grid && summary ? makeDisplayGrid(summary.bbox, 256) : null), [grid, summary])`, taking `summary` from `useEvidence`;
- replace the empty `<aside …/>` with:
```tsx
<aside className="grid content-start gap-6 bg-bg p-4 lg:p-6" aria-label={flow.workbench.timeline}>
  <Timeline
    entries={entries} from={inv.dateFrom} to={inv.dateTo} current={current} before={inv.before} after={inv.after} pinned={inv.pinned} thumbGrid={thumbGrid}
    onSelect={setCurrent}
    onBefore={(d) => update((i) => setBeforeAfter(i, d, i.after!))}
    onAfter={(d) => update((i) => setBeforeAfter(i, i.before!, d))}
    onPin={(d) => update((i) => togglePin(i, d))}
  />
  {summary?.kind === 'road' && <SectionGrid entries={entries} parts={summary.parts} current={current} onSelect={setCurrent} />}
</aside>
```

- [ ] **Step 4: Write `tests/e2e/timeline.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureRoad, openFixtureSite } from './helpers.ts'

test('timeline steps through passes from the keyboard and announces quality', async ({ page }) => {
  await openFixtureSite(page)
  const slider = page.getByRole('slider', { name: flow.workbench.timelineLabel })
  await expect(slider).toHaveAttribute('aria-valuetext', /20 Dec 2025, Clear/, { timeout: 30_000 })
  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveAttribute('aria-valuetext', '15 Jun 2025, Obscured')
  await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveAttribute('aria-valuetext', '5 Mar 2025, Partly clear')
})

test('pin and unpin a date; before/after cannot be unpinned', async ({ page }) => {
  await openFixtureSite(page)
  const slider = page.getByRole('slider', { name: flow.workbench.timelineLabel })
  await expect(slider).toHaveAttribute('aria-valuetext', /Clear/, { timeout: 30_000 })
  // The "after" date is pinned for good: its button reads Unpin and is disabled.
  await expect(page.getByRole('button', { name: flow.workbench.unpin })).toBeDisabled()
  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: flow.workbench.pin }).click()
  await expect(page.getByRole('button', { name: flow.workbench.unpin })).toHaveAttribute('aria-pressed', 'true')
})

test('road grid shows two sections and supports arrow keys', async ({ page }) => {
  await openFixtureRoad(page)
  const grid = page.getByRole('grid', { name: flow.workbench.grid })
  await expect(grid.getByRole('rowheader')).toHaveText(['0.0–2.0 km', '2.0–2.9 km'], { timeout: 30_000 })
  const first = grid.getByRole('button').first()
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^2\.0–2\.9 km, 10 Jan 2025: Clear$/)
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/workbench && npm run check && npm run e2e -- timeline workbench`
Expected: grid-nav 8 PASS; E2E green.

- [ ] **Step 6: Commit**

```bash
git add src tests/e2e
git commit -m "feat(workbench): accessible timeline with pins and a keyboard-navigable road section x date grid

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C7: Notes and the optional claim

**Files:**
- Create: `src/workbench/NotesPanel.tsx`, `src/workbench/ClaimPanel.tsx`
- Modify: `src/screens/Workbench.tsx` (render both panels below the timeline)
- Test: `tests/e2e/notes.spec.ts`

**Interfaces:**
- Consumes: `addNote`, `updateNote`, `removeNote`, `restoreNote`, `setClaim`, `Investigation`, `DateEntry`, `fmtDate`.
- Produces:
  - `NotesPanel({ inv, dates, parts, current, update })`
  - `ClaimPanel({ inv, update })`

- [ ] **Step 1: Write the E2E test first: `tests/e2e/notes.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureSite } from './helpers.ts'

test('add, edit and delete-with-undo a note; text stays text', async ({ page }) => {
  await openFixtureSite(page)
  const panel = page.getByRole('region', { name: flow.notes.title })
  await panel.getByRole('radio', { name: flow.notes.kinds.change, exact: true }).check()
  await panel.getByLabel(flow.notes.what).fill('<img src=x onerror=alert(1)> New roof visible')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expect(panel.getByText('<img src=x onerror=alert(1)> New roof visible')).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  await panel.getByRole('button', { name: flow.notes.edit }).click()
  await panel.getByLabel(flow.notes.edit).fill('Roof visible from March')
  await panel.getByRole('button', { name: flow.notes.save }).click()
  await expect(panel.getByText('Roof visible from March')).toBeVisible()
  await panel.getByRole('button', { name: flow.notes.delete }).click()
  await expect(panel.getByText(flow.notes.deleted)).toBeVisible()
  await panel.getByRole('button', { name: flow.notes.undo }).click()
  await expect(panel.getByText('Roof visible from March')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: flow.notes.title }).getByText('Roof visible from March')).toBeVisible()
})

test('empty notes are refused with a message', async ({ page }) => {
  await openFixtureSite(page)
  const panel = page.getByRole('region', { name: flow.notes.title })
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await expect(page.getByText(flow.workbench.errors.NOTE_EMPTY!)).toBeVisible()
})

test('claim is saved, shown and removable', async ({ page }) => {
  await openFixtureSite(page)
  const panel = page.getByRole('region', { name: flow.claim.title })
  await panel.getByLabel(flow.claim.text, { exact: true }).fill('Warehouse roof finished by December 2025')
  await panel.getByLabel(flow.claim.criterion).fill('A new bright roof inside the outline')
  await panel.getByRole('button', { name: flow.claim.save }).click()
  await page.reload()
  await expect(page.getByRole('region', { name: flow.claim.title }).getByLabel(flow.claim.text, { exact: true })).toHaveValue('Warehouse roof finished by December 2025')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- notes`
Expected: FAIL (no Notes region).

- [ ] **Step 3: Implement `src/workbench/NotesPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { addNote, removeNote, restoreNote, updateNote, type Investigation, type Note, type NoteKind } from '../data/investigation.ts'
import { fmtDate } from '../lib/format.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Panel } from '../ui/kit.tsx'

type Update = (fn: (i: Investigation) => Investigation) => void
const KINDS: NoteKind[] = ['change', 'no_clear_change', 'unsure']

export function NotesPanel({ inv, dates, parts, current, update }: { inv: Investigation; dates: string[]; parts: Array<{ idx: number; fromM: number; toM: number }>; current: string | null; update: Update }) {
  const [kind, setKind] = useState<NoteKind>('change')
  const [body, setBody] = useState('')
  const [date, setDate] = useState<string>(current ?? '')
  const [section, setSection] = useState<string>('')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [lastDeleted, setLastDeleted] = useState<Note | null>(null)
  useEffect(() => { if (current) setDate(current) }, [current])
  useEffect(() => {
    if (!lastDeleted) return
    const t = setTimeout(() => setLastDeleted(null), 6000)
    return () => clearTimeout(t)
  }, [lastDeleted])

  const add = () => {
    // Clear the draft only when the note will be accepted, so a refused note never loses the user's text.
    const accepted = body.trim().length > 0 && body.trim().length <= 2000 && inv.notes.length < 200
    update((i) => addNote(i, { kind, body, date: date || null, sectionIdx: section === '' ? null : Number(section) }))
    if (accepted) setBody('')
  }

  return (
    <Panel title={flow.notes.title}>
      <div className="grid gap-4">
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{flow.notes.kindLegend}</legend>
          {KINDS.map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-3">
              <input type="radio" name="note-kind" checked={kind === k} onChange={() => setKind(k)} className="accent-[var(--gs-accent)]" />
              {flow.notes.kinds[k]}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-2">
          <label htmlFor="note-body" className="text-sm font-medium">{flow.notes.what}</label>
          <textarea id="note-body" value={body} maxLength={2000} rows={3} onChange={(e) => setBody(e.target.value)} className="rounded-[6px] border border-control bg-bg p-3 text-fg focus:border-accent" aria-describedby="note-count" />
          <p id="note-count" className="text-right font-mono text-[0.75rem] text-fg-2 num">{flow.notes.count(body.length)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            {flow.notes.forDate}
            <select value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-[6px] border border-control bg-bg px-2 text-fg">
              <option value="">{flow.notes.anyDate}</option>
              {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
          </label>
          {parts.length > 1 && (
            <label className="grid gap-2 text-sm font-medium">
              {flow.notes.forSection}
              <select value={section} onChange={(e) => setSection(e.target.value)} className="h-11 rounded-[6px] border border-control bg-bg px-2 text-fg">
                <option value="">{flow.notes.anySection}</option>
                {parts.map((p) => <option key={p.idx} value={p.idx}>{flow.workbench.section(p.fromM, p.toM)}</option>)}
              </select>
            </label>
          )}
        </div>
        <Button variant="primary" onClick={add}>{flow.notes.add}</Button>

        {lastDeleted && (
          <div role="status" className="flex items-center justify-between border border-line p-2 text-sm">
            <span>{flow.notes.deleted}</span>
            <Button size="sm" onClick={() => { update((i) => restoreNote(i, lastDeleted)); setLastDeleted(null) }}>{flow.notes.undo}</Button>
          </div>
        )}

        {inv.notes.length === 0 ? (
          <p className="text-sm text-fg-2">{flow.notes.none}</p>
        ) : (
          <ul className="grid gap-px bg-line">
            {inv.notes.map((n) => (
              <li key={n.id} className="grid gap-2 bg-bg p-3">
                <p className="font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2">
                  {flow.notes.kinds[n.kind]}{n.date ? ` · ${fmtDate(n.date)}` : ''}{n.sectionIdx !== null && parts[n.sectionIdx] ? ` · ${flow.workbench.section(parts[n.sectionIdx]!.fromM, parts[n.sectionIdx]!.toM)}` : ''}
                </p>
                {editing?.id === n.id ? (
                  <>
                    <label className="sr-only" htmlFor={`edit-${n.id}`}>{flow.notes.edit}</label>
                    <textarea id={`edit-${n.id}`} value={editing.body} maxLength={2000} rows={3} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} className="rounded-[6px] border border-control bg-bg p-3 text-fg" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => { update((i) => updateNote(i, n.id, { body: editing.body })); setEditing(null) }}>{flow.notes.save}</Button>
                      <Button size="sm" onClick={() => setEditing(null)}>{flow.notes.cancel}</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words">{n.body}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setEditing({ id: n.id, body: n.body })}>{flow.notes.edit}</Button>
                      <Button size="sm" variant="danger" onClick={() => { setLastDeleted(n); update((i) => removeNote(i, n.id)) }}>{flow.notes.delete}</Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
```
Body text renders as a React text node, so it is escaped automatically. Never use `dangerouslySetInnerHTML` anywhere in the app.

- [ ] **Step 4: Implement `src/workbench/ClaimPanel.tsx` and wire both panels**

```tsx
import { useState } from 'react'
import { setClaim, type Investigation } from '../data/investigation.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Panel, TextField } from '../ui/kit.tsx'

export function ClaimPanel({ inv, update }: { inv: Investigation; update: (fn: (i: Investigation) => Investigation) => void }) {
  const [text, setText] = useState(inv.claim?.text ?? '')
  const [date, setDate] = useState(inv.claim?.date ?? '')
  const [criterion, setCriterion] = useState(inv.claim?.criterion ?? '')
  return (
    <Panel title={flow.claim.title}>
      <div className="grid gap-4">
        <p className="text-sm text-fg-2">{flow.claim.help}</p>
        <div className="grid gap-2">
          <label htmlFor="claim-text" className="text-sm font-medium">{flow.claim.text}</label>
          <textarea id="claim-text" value={text} maxLength={2000} rows={2} onChange={(e) => setText(e.target.value)} className="rounded-[6px] border border-control bg-bg p-3 text-fg focus:border-accent" />
        </div>
        <TextField label={flow.claim.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label={flow.claim.criterion} value={criterion} maxLength={500} onChange={(e) => setCriterion(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="primary" disabled={!text.trim()} onClick={() => update((i) => setClaim(i, { text, date: date || null, criterion }))}>{flow.claim.save}</Button>
          {inv.claim && <Button variant="ghost" onClick={() => { setText(''); setDate(''); setCriterion(''); update((i) => setClaim(i, null)) }}>{flow.claim.remove}</Button>}
        </div>
      </div>
    </Panel>
  )
}
```
In `src/screens/Workbench.tsx`, render in the aside, after the timeline and the grid:
```tsx
<NotesPanel inv={inv} dates={entries.map((e) => e.date)} parts={summary?.parts ?? []} current={current} update={update} />
<ClaimPanel inv={inv} update={update} />
```

- [ ] **Step 5: Run tests**

Run: `npm run check && npm run e2e -- notes`
Expected: 3 E2E tests green.

- [ ] **Step 6: Commit**

```bash
git add src tests/e2e
git commit -m "feat(workbench): notes with edit and undo-delete, optional claim, all rendered as text

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C8: Workbench map context (outline + selected photo on the globe)

**Files:**
- Create: `src/map/frameLayer.ts`
- Modify: `src/screens/Workbench.tsx` (map toggle, `mini` layout, AOI and frame layers, fit on open)
- Test: `tests/e2e/workbench-map.spec.ts`

**Interfaces:**
- Consumes: `setAoiLayer`, `removeAoiLayer`, `fitAoi`, `accentColor` (C2), `rgbaToPngDataUrl` (C5).
- Produces: `setFrameLayer(map, url: string | null, grid: DisplayGrid)`, `removeFrameLayer(map)`.

- [ ] **Step 1: Write the E2E test `tests/e2e/workbench-map.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { finishDatesAndOpen, outlineSiteByCoords, startAt } from './helpers.ts'

test('map toggle shows the outline and the selected photo on the map', async ({ page }) => {
  await startAt(page, 'tier=2&lat=21.1458&lon=79.0882&name=Nagpur')
  test.skip(!(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))), 'no WebGL2')
  await outlineSiteByCoords(page, 1000)
  await finishDatesAndOpen(page)
  await page.getByRole('button', { name: flow.workbench.showMap }).click()
  await page.waitForFunction(() => !!(window as any).__gs.map.getSource('gs-aoi'))
  await page.waitForFunction(() => (window as any).__gs.map.getSource('gs-frame')?.type === 'image', null, { timeout: 30_000 })
  await expect(page.locator('.map-stage')).toHaveAttribute('data-layout', 'mini')
  await page.getByRole('button', { name: flow.workbench.hideMap }).click()
  await expect(page.locator('.map-stage')).toHaveAttribute('data-layout', 'hidden')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- workbench-map`
Expected: FAIL (no "Show map" button), or SKIP on engines without WebGL2.

- [ ] **Step 3: Implement `src/map/frameLayer.ts`**

```ts
import type { ImageSource, Map as MlMap } from 'maplibre-gl'
import type { DisplayGrid } from '../evidence/types.ts'

type Corners = [[number, number], [number, number], [number, number], [number, number]]

export function setFrameLayer(map: MlMap, url: string | null, grid: DisplayGrid) {
  if (!url) return removeFrameLayer(map)
  const coordinates = grid.cornersLonLat as Corners
  const src = map.getSource('gs-frame') as ImageSource | undefined
  if (src) {
    src.updateImage({ url, coordinates })
    return
  }
  map.addSource('gs-frame', { type: 'image', url, coordinates })
  map.addLayer({ id: 'gs-frame', type: 'raster', source: 'gs-frame', paint: { 'raster-fade-duration': 0 } }, map.getLayer('gs-aoi-fill') ? 'gs-aoi-fill' : undefined)
}

export function removeFrameLayer(map: MlMap) {
  if (map.getLayer('gs-frame')) map.removeLayer('gs-frame')
  if (map.getSource('gs-frame')) map.removeSource('gs-frame')
}
```

- [ ] **Step 4: Replace `src/screens/Workbench.tsx` with the final version (viewer, timeline, grid, notes, claim, mini map)**

This supersedes the incremental edits from C6 and C7. The validated final file:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { setBeforeAfter, togglePin } from '../data/investigation.ts'
import { useInvestigation } from '../data/useInvestigation.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import { rgbaToPngDataUrl } from '../lib/canvas.ts'
import { Link } from '../lib/router.tsx'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { accentColor, fitAoi, removeAoiLayer, setAoiLayer } from '../map/aoiLayer.ts'
import { removeFrameLayer, setFrameLayer } from '../map/frameLayer.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { flow } from '../ui/copy-flow.ts'
import { Button, MicroLabel, Skeleton } from '../ui/kit.tsx'
import { ClaimPanel } from '../workbench/ClaimPanel.tsx'
import { isUsable, pickDefaults, quartilesDone } from '../workbench/defaults.ts'
import { EvidenceViewer, type Slot } from '../workbench/EvidenceViewer.tsx'
import { NotesPanel } from '../workbench/NotesPanel.tsx'
import type { DateEntry } from '../workbench/runner.ts'
import { SectionGrid } from '../workbench/SectionGrid.tsx'
import { Timeline } from '../workbench/Timeline.tsx'
import { useEvidence } from '../workbench/useEvidence.ts'

const slot = (e: DateEntry | undefined): Slot => (e ? { date: e.date, frame: e.full, stats: e.quality?.stats ?? null } : null)
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Workbench({ id }: { id: string }) {
  const { inv, update, error } = useInvestigation(id)
  const { map, tier, installLayers } = useMapStage()
  const [mapOpen, setMapOpen] = useState(false)
  useMapLayout(mapOpen && tier > 0 ? 'mini' : 'hidden')
  const desktop = useMediaQuery('(min-width: 1024px)')
  const maxSide = desktop ? (tier >= 2 ? 1024 : 768) : 512
  const { state, grid, summary, requestFull } = useEvidence(inv, maxSide)
  const entries = state.entries
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  const thumbGrid = useMemo(() => (summary ? makeDisplayGrid(summary.bbox, 256) : null), [summary])
  const [current, setCurrent] = useState<string | null>(null)

  // Default before/after: clearest pass in each outer quartile, applied once both quartiles are checked.
  useEffect(() => {
    if (!inv || inv.before || !quartilesDone(entries, inv.dateFrom, inv.dateTo)) return
    const d = pickDefaults(entries, inv.dateFrom, inv.dateTo)
    if (d.before && d.after) update((i) => setBeforeAfter(i, d.before!, d.after!))
  }, [inv, entries, update])

  // Full 10 m frames for the compared pair.
  useEffect(() => {
    if (state.phase !== 'ready' || !inv) return
    for (const d of [inv.before, inv.after]) if (d && byDate.get(d) && !byDate.get(d)!.full) requestFull(d)
  }, [state.phase, inv?.before, inv?.after, byDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // The timeline starts at the "after" date (or the latest pass).
  useEffect(() => {
    if (!current && entries.length) setCurrent(inv?.after ?? entries[entries.length - 1]!.date)
  }, [current, entries, inv?.after])

  // Mini map: outline plus the current dated photo draped on the globe.
  useEffect(() => (map && inv ? installLayers('aoi', (m) => setAoiLayer(m, inv.aoi, accentColor()), removeAoiLayer) : undefined), [map, inv?.aoi, installLayers]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = current ? byDate.get(current) : undefined
  const frameUrl = useMemo(() => (shown?.full && grid ? rgbaToPngDataUrl(shown.full.display.rgba, grid.width, grid.height) : null), [shown?.full, grid])
  useEffect(() => (map && grid ? installLayers('frame', (m) => setFrameLayer(m, frameUrl, grid), removeFrameLayer) : undefined), [map, grid, frameUrl, installLayers])
  useEffect(() => {
    if (map && mapOpen && summary) fitAoi(map, summary.bbox, reducedMotion())
  }, [map, mapOpen, summary])
  useEffect(() => {
    if (current && mapOpen && byDate.get(current) && !byDate.get(current)!.full) requestFull(current)
  }, [current, mapOpen, byDate]) // eslint-disable-line react-hooks/exhaustive-deps

  if (inv === undefined) return <Skeleton className="m-6 h-64" />
  if (inv === null) return <p className="mx-auto max-w-[65ch] px-4 py-20 text-fg-2">{flow.workbench.notFound}</p>

  const checked = entries.filter((e) => e.status === 'checked')
  const allCloudy = state.phase === 'ready' && entries.length > 0 && checked.length === entries.length && !entries.some(isUsable)
  const beforeEntry = inv.before ? byDate.get(inv.before) : undefined
  const afterEntry = inv.after ? byDate.get(inv.after) : undefined
  const invalid =
    beforeEntry?.quality?.invalid && afterEntry?.quality?.invalid
      ? beforeEntry.quality.invalid.map((v, i) => (v || afterEntry.quality!.invalid![i] ? 1 : 0))
      : null

  return (
    <div className="grid min-h-[calc(100dvh-56px)] gap-px bg-line lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid content-start gap-4 bg-bg p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <MicroLabel>{flow.workbench.notSaved}</MicroLabel>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{inv.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {tier > 0 && (
              <Button aria-pressed={mapOpen} onClick={() => setMapOpen((o) => !o)}>
                {mapOpen ? flow.workbench.hideMap : flow.workbench.showMap}
              </Button>
            )}
            <Link to={`/i/${inv.id}/report`} className="inline-flex h-11 items-center rounded-[6px] border border-control px-4">
              {flow.workbench.report}
            </Link>
          </div>
        </header>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {flow.workbench.errors[error] ?? error}
          </p>
        )}
        <div aria-live="polite" className="text-sm text-fg-2">
          {state.phase === 'searching' && <p>{flow.workbench.searching}</p>}
          {state.phase === 'error' && <p className="text-bad">{flow.workbench.searchFailed}</p>}
          {state.phase === 'ready' && entries.length === 0 && <p>{flow.workbench.none}</p>}
          {allCloudy && <p>{flow.workbench.allCloudy}</p>}
          {state.limited && <p>{flow.workbench.limited}</p>}
        </div>
        {grid && !allCloudy && entries.length > 0 && <EvidenceViewer before={slot(beforeEntry)} after={slot(afterEntry)} grid={grid} invalid={invalid} />}
        <p className="text-sm text-fg-2">
          {flow.workbench.disclaimer} {flow.workbench.catalogueNote}
        </p>
      </div>
      <aside className="grid content-start gap-6 bg-bg p-4 lg:p-6" aria-label={flow.workbench.timeline}>
        <Timeline
          entries={entries}
          from={inv.dateFrom}
          to={inv.dateTo}
          current={current}
          before={inv.before}
          after={inv.after}
          pinned={inv.pinned}
          thumbGrid={thumbGrid}
          onSelect={setCurrent}
          onBefore={(d) => update((i) => setBeforeAfter(i, d, i.after!))}
          onAfter={(d) => update((i) => setBeforeAfter(i, i.before!, d))}
          onPin={(d) => update((i) => togglePin(i, d))}
        />
        {summary?.kind === 'road' && <SectionGrid entries={entries} parts={summary.parts} current={current} onSelect={setCurrent} />}
        <NotesPanel inv={inv} dates={entries.map((e) => e.date)} parts={summary?.parts ?? []} current={current} update={update} />
        <ClaimPanel inv={inv} update={update} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `npm run check && npm run e2e -- workbench`
Expected: green; the map test runs where WebGL2 exists.

- [ ] **Step 6: Commit**

```bash
git add src tests/e2e
git commit -m "feat(workbench): mini map with the outline and the selected dated photo draped on the globe

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C9: Evidence report: provenance JSON, self-contained HTML, print

**Files:**
- Create: `src/report/escape.ts`, `src/report/provenance.ts`, `src/report/html.ts`, `src/screens/Report.tsx`
- Modify: `src/app.tsx` (route `report`)
- Test: `src/report/report.test.ts`, `tests/e2e/report.spec.ts`

**Interfaces:**
- Consumes: `Investigation`, `AoiSummary`, `DateEntry`, `RECIPES`, `levelFromTransform` (`src/evidence/frame.ts`), `flow`, `copy`.
- Produces:
  - `escapeHtml(s: string): string`
  - `buildProvenance(inv, summary, entries, appVersion, generatedAt?): Provenance` (schema `grahsaboot.provenance/1`)
  - `interface ReportImage { date: string; role: 'before' | 'after'; displayUrl: string; nativeUrl: string; stats: QualityStats | null; sha256: string }`
  - `buildReportHtml(a: { inv; summary; images: ReportImage[]; entries: DateEntry[]; provenance: Provenance; theme: 'dark' | 'light'; preparedBy: string; generatedAt: Date }): string`
  - `Report({ id })` (default export)

- [ ] **Step 1: Write the failing unit test `src/report/report.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape.ts'
import { buildProvenance } from './provenance.ts'
import { buildReportHtml } from './html.ts'
import { addNote, newInvestigation, setBeforeAfter, setClaim } from '../data/investigation.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import type { DateEntry } from '../workbench/runner.ts'

const T = new Date('2026-10-05T10:00:00Z')
let inv = newInvestigation({ name: 'Yard <b>x</b>', aoi: { kind: 'site', geometry: { type: 'Polygon', coordinates: [[[79.08, 21.14], [79.09, 21.14], [79.09, 21.15], [79.08, 21.14]]] } }, dateFrom: '2025-01-01', dateTo: '2025-12-31' }, T, '00000000-0000-4000-8000-000000000001')
inv = setBeforeAfter(inv, '2025-01-10', '2025-12-20', T)
inv = addNote(inv, { kind: 'change', body: '<script>alert(1)</script> roof', date: '2025-12-20', sectionIdx: null }, T, 'n1')
inv = setClaim(inv, { text: 'Done "by" Dec & <ok>', date: '2025-12-01', criterion: 'Roof' }, T)
const summary = { kind: 'site', areaKm2: 1.15, extentKm: 1.52, lengthKm: null, bbox: [79.08, 21.14, 79.09, 21.15], parts: [{ idx: 0, fromM: 0, toM: 0, geometry: { kind: 'site', rings: [] } }] } as AoiSummary
const stats = (label: string, v: number) => ({ policy: 'scl-v2', counts: [], total: 10, clearFraction: v, validFraction: v, uncertainFraction: 0, obstructedFraction: 1 - v, nodataFraction: 0, label }) as never
const entry = (date: string, label: string, v: number): DateEntry => ({
  date, status: 'checked', error: null, thumb: null,
  candidate: { date, coversAoi: true, alternates: [], item: { id: `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`, collection: 'sentinel-2-l2a', datetime: `${date}T05:30:00Z`, date, epsg: 32644, cloudCover: 1, baseline: '05.11', nodataPct: 0, footprint: [], visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/TCI.tif', transform: [10, 0, 300000, 0, -10, 2341000], shape: [256, 256] }, scl: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/SCL.tif', transform: [20, 0, 300000, 0, -20, 2341000], shape: [128, 128] } } },
  quality: { window: [45, 46, 103, 107], level: 0, sha256: 'a'.repeat(64), stats: stats(label, v), parts: [] },
  full: { window: [92, 94, 203, 211], level: 0, sha256: 'b'.repeat(64), native: { width: 111, height: 117, rgb: new Uint8Array() }, display: { width: 1, height: 1, rgba: new Uint8ClampedArray(4) } },
})
const entries = [entry('2025-01-10', 'CLEAR', 1), entry('2025-12-20', 'CLEAR', 0.98)]

describe('escapeHtml', () => {
  it('escapes the five HTML specials', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})

describe('buildProvenance', () => {
  it('records both frames per pinned date with recipes, windows, transforms and hashes', () => {
    const p = buildProvenance(inv, summary, entries, '0.1.0', T)
    expect(p.schema).toBe('grahsaboot.provenance/1')
    expect(p.frames).toHaveLength(4)
    expect(p.frames[0]).toMatchObject({ date: '2025-01-10', asset: 'scl', level: 0, recipe: 'scl-v2', window: [45, 46, 103, 107], sha256: 'a'.repeat(64), crs: 'EPSG:32644', verification: null })
    expect(p.frames[1]).toMatchObject({ asset: 'visual', recipe: 'frame-v1', window: [92, 94, 203, 211], transform: [10, 0, 300000, 0, -10, 2341000] })
    expect(p.notes[0]!.body).toBe('<script>alert(1)</script> roof')
    expect(p.attribution).toContain('Contains modified Copernicus Sentinel data 2025')
  })
})

describe('buildReportHtml', () => {
  const html = buildReportHtml({ inv, summary, entries, images: [], provenance: buildProvenance(inv, summary, entries, '0.1.0', T), theme: 'dark', preparedBy: 'A <tester>', generatedAt: T })
  it('escapes every piece of user text and never includes a raw script tag from notes', () => {
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; roof')
    expect(html).toContain('Yard &lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('Done &quot;by&quot; Dec &amp; &lt;ok&gt;')
    expect(html).toContain('A &lt;tester&gt;')
  })
  it('is self-contained, attributed and print-ready', () => {
    expect(html).not.toMatch(/<(img|link|script)[^>]+(src|href)="https?:/i)
    expect(html).toContain('Contains modified Copernicus Sentinel data 2025')
    expect(html).toContain('@media print')
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('<script type="application/json" id="provenance">')
  })
  it('keeps the provenance JSON inert inside the page', () => {
    expect(html).not.toMatch(/<\/script>[^<]*roof/)
    expect(html).toContain('\\u003cscript\\u003e')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/report`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/report/escape.ts` and `src/report/provenance.ts`**

`src/report/escape.ts`:
```ts
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => MAP[c]!)
/** JSON safe to embed in <script type="application/json">: no `<` can close the element. */
export const jsonForHtml = (v: unknown) => JSON.stringify(v, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
```

`src/report/provenance.ts`:
```ts
import type { Investigation } from '../data/investigation.ts'
import { RECIPES } from '../evidence/types.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { copy } from '../ui/copy.ts'
import type { DateEntry } from '../workbench/runner.ts'

export interface ProvenanceFrame {
  date: string; collection: string; itemId: string; acquiredAt: string; processingBaseline: string | null
  asset: 'visual' | 'scl'; href: string; level: number; window: [number, number, number, number]
  crs: string; transform: number[]; recipe: string; sha256: string
  verification: null | { status: string; verifiedAt: string; serverSha256: string }
  quality?: unknown
}
export interface Provenance {
  schema: 'grahsaboot.provenance/1'
  generatedAt: string
  app: { name: string; version: string }
  investigation: Record<string, unknown>
  parts: Array<{ idx: number; fromM: number; toM: number }>
  recipes: typeof RECIPES
  frames: ProvenanceFrame[]
  notes: Investigation['notes']
  attribution: string[]
}

const scaled = (t: number[], level: number) => [t[0]! * 2 ** level, t[1]!, t[2]!, t[3]!, t[4]! * 2 ** level, t[5]!]

export function buildProvenance(inv: Investigation, summary: AoiSummary, entries: DateEntry[], appVersion: string, generatedAt = new Date()): Provenance {
  const pinned = entries.filter((e) => inv.pinned.includes(e.date))
  const frames: ProvenanceFrame[] = pinned.flatMap((e) => {
    const it = e.candidate.item
    const base = { date: e.date, collection: it.collection, itemId: it.id, acquiredAt: it.datetime, processingBaseline: it.baseline, crs: `EPSG:${it.epsg}`, verification: null }
    const out: ProvenanceFrame[] = []
    if (e.quality) out.push({ ...base, asset: 'scl', href: it.scl.href, level: 0, window: e.quality.window, transform: it.scl.transform, recipe: RECIPES.scl, sha256: e.quality.sha256, quality: { ...e.quality.stats, parts: e.quality.parts.map((p) => ({ idx: p.idx, label: p.stats.label, clearFraction: p.stats.clearFraction, validFraction: p.stats.validFraction })) } })
    const f = e.full ?? e.thumb
    if (f) out.push({ ...base, asset: 'visual', href: it.visual.href, level: f.level, window: f.window, transform: scaled(it.visual.transform, f.level), recipe: RECIPES.frame, sha256: f.sha256 })
    return out
  })
  const years = [...new Set(pinned.map((e) => Number(e.date.slice(0, 4))))].sort()
  return {
    schema: 'grahsaboot.provenance/1',
    generatedAt: generatedAt.toISOString(),
    app: { name: copy.app.name, version: appVersion },
    investigation: {
      id: inv.id, name: inv.name, kind: inv.aoi.kind, geometry: inv.aoi.geometry, roadWidthM: inv.aoi.kind === 'road' ? inv.aoi.widthM : null,
      dateFrom: inv.dateFrom, dateTo: inv.dateTo, before: inv.before, after: inv.after, pinned: inv.pinned, claim: inv.claim,
    },
    parts: summary.parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM })),
    recipes: RECIPES,
    frames,
    notes: inv.notes,
    attribution: [...years.map((y) => copy.attribution.sentinel(y)), copy.attribution.osm],
  }
}
```

- [ ] **Step 4: Implement `src/report/html.ts`**

```ts
import type { Investigation } from '../data/investigation.ts'
import type { QualityStats } from '../evidence/types.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import type { DateEntry } from '../workbench/runner.ts'
import { escapeHtml as e, jsonForHtml } from './escape.ts'
import type { Provenance } from './provenance.ts'

export interface ReportImage { date: string; role: 'before' | 'after'; displayUrl: string; nativeUrl: string; stats: QualityStats | null; sha256: string }

const CSS = `
:root{--bg:#09090b;--panel:#18181b;--line:#27272a;--fg:#f4f4f5;--fg2:#a1a1aa;--accent:#e48444}
[data-theme="light"]{--bg:#fff;--panel:#fafafa;--line:#e4e4e7;--fg:#18181b;--fg2:#52525b;--accent:#a74e1b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 ui-sans-serif,system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 20px}h1{font-size:2.25rem;letter-spacing:-.04em;line-height:1;margin:.5rem 0 1rem}
h2{font-size:.75rem;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:var(--fg2);border-top:1px solid var(--line);padding-top:16px;margin-top:32px}
.mono{font-family:ui-monospace,monospace;font-size:.8rem;color:var(--fg2)}.grid{display:grid;gap:16px}@media(min-width:700px){.two{grid-template-columns:1fr 1fr}}
figure{margin:0}img{width:100%;height:auto;display:block;border:1px solid var(--line)}img.native{width:auto;max-width:100%;image-rendering:pixelated}
table{border-collapse:collapse;width:100%;font-size:.9rem}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left}.note{white-space:pre-wrap;word-break:break-word}
.badge{display:inline-block;border:1px solid var(--line);padding:2px 6px;font-family:ui-monospace,monospace;font-size:.75rem}
details pre{white-space:pre-wrap;word-break:break-all;font-size:.7rem}
@media print{:root,[data-theme="dark"],[data-theme="light"]{--bg:#fff;--panel:#fff;--line:#ccc;--fg:#000;--fg2:#333}main{padding:0}figure,table,tr{break-inside:avoid}details{display:none}}
`

const word = (s: QualityStats | null | undefined) => (s ? copy.quality[s.label].word : '')

export function buildReportHtml(a: { inv: Investigation; summary: AoiSummary; images: ReportImage[]; entries: DateEntry[]; provenance: Provenance; theme: 'dark' | 'light'; preparedBy: string; generatedAt: Date }): string {
  const { inv, summary: s } = a
  const pinned = a.entries.filter((x) => inv.pinned.includes(x.date))
  const obscured = pinned.filter((x) => x.quality && (x.quality.stats.label === 'OBSCURED' || x.quality.stats.label === 'NOT_COVERED')).length
  const looked = s.kind === 'site' ? flow.outline.summarySite(s.areaKm2, s.extentKm) : flow.outline.summaryRoad(s.lengthKm ?? 0, s.parts.length)
  const fig = (img: ReportImage) => `
    <figure class="grid"><img src="${img.displayUrl}" alt="${e(flow.workbench.photoAlt(img.role === 'before' ? flow.workbench.before : flow.workbench.after, fmtDate(img.date)))}">
    <figcaption class="mono">${e(flow.workbench.caption(fmtDate(img.date), img.stats ? pct(img.stats.clearFraction) : 0))} · <span class="badge">${e(word(img.stats))}</span><br>SHA-256 ${e(img.sha256)}</figcaption></figure>`
  const grid = s.kind === 'road' && pinned.length
    ? `<h2>${e(flow.report.sections.grid)}</h2><table><thead><tr><th>km</th>${pinned.map((x) => `<th>${e(fmtDate(x.date))}</th>`).join('')}</tr></thead><tbody>${s.parts
        .map((p) => `<tr><th>${e(flow.workbench.section(p.fromM, p.toM))}</th>${pinned.map((x) => `<td>${e(word(x.quality?.parts.find((q) => q.idx === p.idx)?.stats))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : ''
  return `<!doctype html>
<html lang="en" data-theme="${a.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(flow.report.title)}: ${e(inv.name)}</title><style>${CSS}</style></head>
<body><main>
<p class="mono">${e(copy.app.name.toUpperCase())} · ${e(flow.report.title.toUpperCase())} · ${e(flow.report.generated)} ${e(a.generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC</p>
<h1>${e(inv.name)}</h1>
${a.preparedBy.trim() ? `<p>${e(flow.report.preparedBy.replace(' (optional)', ''))}: ${e(a.preparedBy.trim())}</p>` : ''}
<p class="badge">${e(flow.report.unverified)}</p>
<h2>${e(flow.report.sections.looked)}</h2>
<p>${e(flow.review.kind[s.kind])} · ${e(looked)} · ${e(flow.review.range(inv.dateFrom, inv.dateTo))}</p>
<h2>${e(flow.report.sections.evidence)}</h2>
<div class="grid two">${a.images.map(fig).join('')}</div>
${a.images.length ? `<p class="mono">${e(flow.report.nativeNote)}</p><div class="grid two">${a.images.map((i) => `<img class="native" src="${i.nativeUrl}" alt="">`).join('')}</div>` : ''}
<h2>${e(flow.report.sections.timeline)}</h2>
<table><thead><tr><th>Date</th><th>View</th><th>Clear</th><th>Source</th></tr></thead><tbody>${pinned
    .map((x) => `<tr><td>${e(fmtDate(x.date))}</td><td>${e(word(x.quality?.stats))}</td><td>${x.quality ? pct(x.quality.stats.clearFraction) : 0}%</td><td class="mono">${e(x.candidate.item.id)}</td></tr>`)
    .join('')}</tbody></table>
${grid}
<h2>${e(flow.report.sections.notes)}</h2>
${inv.notes.length ? inv.notes.map((n) => `<p><span class="badge">${e(flow.notes.kinds[n.kind])}</span> ${n.date ? `<span class="mono">${e(fmtDate(n.date))}</span>` : ''}</p><p class="note">${e(n.body)}</p>`).join('') : `<p>${e(flow.report.noNotes)}</p>`}
<h2>${e(flow.report.sections.claim)}</h2>
${inv.claim ? `<p class="note">${e(inv.claim.text)}</p><p class="mono">${e(inv.claim.date ?? '')} · ${e(inv.claim.criterion)}</p>` : `<p>${e(flow.report.noClaim)}</p>`}
<h2>${e(flow.report.sections.gaps)}</h2>
<p>${e(flow.report.obscured(obscured, pinned.length))}</p>
<ul>${copy.pages.limits.items.map((t) => `<li>${e(t)}</li>`).join('')}</ul>
<h2>${e(flow.report.sections.provenance)}</h2>
<details><summary>JSON</summary><pre>${e(JSON.stringify(a.provenance, null, 2))}</pre></details>
<script type="application/json" id="provenance">${jsonForHtml(a.provenance)}</script>
<h2>${e(flow.report.sections.attribution)}</h2>
<p class="mono">${a.provenance.attribution.map(e).join(' · ')}</p>
</main></body></html>`
}
```

- [ ] **Step 5: Implement `src/screens/Report.tsx` and the route**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useInvestigation } from '../data/useInvestigation.ts'
import { Link } from '../lib/router.tsx'
import { rgbaToPngDataUrl, rgbToRgba } from '../lib/canvas.ts'
import { useMapLayout } from '../map/MapStage.tsx'
import { buildReportHtml, type ReportImage } from '../report/html.ts'
import { buildProvenance } from '../report/provenance.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Skeleton, TextField } from '../ui/kit.tsx'
import { useTheme } from '../ui/theme.ts'
import { useEvidence } from '../workbench/useEvidence.ts'

const VERSION = '0.1.0'

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Report({ id }: { id: string }) {
  useMapLayout('hidden')
  const { inv } = useInvestigation(id)
  const [theme] = useTheme()
  const [preparedBy, setPreparedBy] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const only = useMemo(() => inv?.pinned ?? [], [inv?.pinned])
  const { state, grid, summary, requestFull } = useEvidence(inv ?? null, 1024, { only })

  useEffect(() => {
    if (state.phase !== 'ready' || !inv) return
    for (const d of [inv.before, inv.after]) if (d && state.entries.some((x) => x.date === d && !x.full)) requestFull(d)
  }, [state.phase, state.entries.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!inv && !!summary && !!grid && state.phase === 'ready' && [inv.before, inv.after].every((d) => !d || state.entries.find((x) => x.date === d)?.full)
  const provenance = useMemo(() => (ready ? buildProvenance(inv!, summary!, state.entries, VERSION) : null), [ready, inv, summary, state.entries])
  const html = useMemo(() => {
    if (!ready || !provenance) return null
    const images: ReportImage[] = (['before', 'after'] as const).flatMap((role) => {
      const d = role === 'before' ? inv!.before : inv!.after
      const x = state.entries.find((y) => y.date === d)
      if (!x?.full) return []
      return [{ date: x.date, role, displayUrl: rgbaToPngDataUrl(x.full.display.rgba, grid!.width, grid!.height), nativeUrl: rgbaToPngDataUrl(rgbToRgba(x.full.native.rgb, x.full.native.width, x.full.native.height), x.full.native.width, x.full.native.height), stats: x.quality?.stats ?? null, sha256: x.full.sha256 }]
    })
    return buildReportHtml({ inv: inv!, summary: summary!, images, entries: state.entries, provenance, theme, preparedBy, generatedAt: new Date() })
  }, [ready, provenance, theme, preparedBy]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!inv) return <Skeleton className="m-6 h-64" />
  if (!inv.before || !inv.after) {
    return (
      <div className="mx-auto grid max-w-[65ch] gap-4 px-4 py-20">
        <p className="text-fg-2">{flow.report.needPair}</p>
        <Link to={`/i/${inv.id}`} className="inline-flex h-11 w-fit items-center rounded-[6px] border border-control px-4">{flow.report.back}</Link>
      </div>
    )
  }
  const slug = inv.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'report'
  return (
    <div className="mx-auto grid max-w-[1200px] gap-4 p-4 lg:p-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <Link to={`/i/${inv.id}`} className="inline-flex h-11 items-center rounded-[6px] px-3 text-fg-2 hover:bg-panel">{flow.report.back}</Link>
        <TextField className="w-full sm:w-72" label={flow.report.preparedBy} value={preparedBy} maxLength={80} onChange={(e) => setPreparedBy(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!html} onClick={() => html && download(`${slug}.html`, 'text/html', html)}>{flow.report.download}</Button>
          <Button disabled={!provenance} onClick={() => provenance && download(`${slug}.provenance.json`, 'application/json', JSON.stringify(provenance, null, 2))}>{flow.report.provenance}</Button>
          <Button variant="primary" disabled={!html} onClick={() => frame.current?.contentWindow?.print()}>{flow.report.print}</Button>
        </div>
      </div>
      {html ? (
        <iframe ref={frame} title={flow.report.title} srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[80dvh] w-full border border-line bg-bg" />
      ) : (
        <div role="status" className="grid gap-3"><p className="text-fg-2">{flow.report.preparing}</p><Skeleton className="h-[60dvh] w-full" /></div>
      )}
    </div>
  )
}
```
Replace `src/app.tsx` with the final routing (all screens):
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
const NewInvestigation = lazy(() => import('./screens/NewInvestigation.tsx'))
const Workbench = lazy(() => import('./screens/Workbench.tsx'))
const Report = lazy(() => import('./screens/Report.tsx'))

export function screenFor(r: Route): ReactNode {
  switch (r.name) {
    case 'globe':
      return <GlobeScreen />
    case 'new':
      return <NewInvestigation />
    case 'investigation':
      return <Workbench key={r.id} id={r.id} />
    case 'report':
      return <Report key={r.id} id={r.id} />
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

- [ ] **Step 6: Write `tests/e2e/report.spec.ts`**

```ts
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureSite, waitForPhotos } from './helpers.ts'

test('report previews, downloads a self-contained HTML and provenance', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  const panel = page.getByRole('region', { name: flow.notes.title })
  await panel.getByLabel(flow.notes.what).fill('<script>window.pwned=1</script> roof')
  await panel.getByRole('button', { name: flow.notes.add }).click()
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const iframe = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(iframe.locator('p', { hasText: 'Contains modified Copernicus Sentinel data 2025' })).toBeVisible({ timeout: 30_000 })
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: flow.report.download }).click()])
  const html = readFileSync((await dl.path())!, 'utf8')
  expect(html).not.toContain('<script>window.pwned=1</script>')
  expect(html).toContain('&lt;script&gt;window.pwned=1&lt;/script&gt; roof')
  expect(html).toMatch(/<img src="data:image\/png;base64,/)
  expect(html).not.toMatch(/<img src="https?:/)
  const [pj] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: flow.report.provenance }).click()])
  const prov = JSON.parse(readFileSync((await pj.path())!, 'utf8'))
  expect(prov.schema).toBe('grahsaboot.provenance/1')
  expect(prov.frames.map((f: { date: string; asset: string }) => `${f.date}:${f.asset}`)).toEqual(['2025-01-10:scl', '2025-01-10:visual', '2025-12-20:scl', '2025-12-20:visual'])
})

test('printed report is white paper', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  const iframe = page.frameLocator(`iframe[title="${flow.report.title}"]`)
  await expect(iframe.locator('h1')).toBeVisible({ timeout: 30_000 })
  await page.emulateMedia({ media: 'print' })
  const bg = await iframe.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
  expect(bg).toBe('rgb(255, 255, 255)')
})
```

Then, at the end of the test "an all-cloudy range says so plainly and keeps the page usable" in `tests/e2e/workbench.spec.ts`, add:
```ts
  // With no before/after pair, the report explains what to do instead of rendering an empty page.
  await page.getByRole('link', { name: flow.workbench.report }).click()
  await expect(page.getByText(flow.report.needPair)).toBeVisible()
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/report && npm run check && npm run e2e -- report`
Expected: report unit 6 PASS; E2E green.

- [ ] **Step 8: Commit**

```bash
git add src tests/e2e
git commit -m "feat(report): escaped self-contained evidence report with embedded photos, provenance JSON and print

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C10: Lite and no-WebGL path, bundle budget, accessibility sweep

**Files:**
- Create: `scripts/check-bundle.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/t0.spec.ts`
- Modify: `package.json` (`check` adds the bundle budget)

**Interfaces:**
- Produces: `npm run check` fails if any `dist/assets/index-*.js` exceeds 150 KB gzip.

- [ ] **Step 1: Write the budget script and the tests**

`scripts/check-bundle.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const LIMIT = 150 * 1024
let failed = false
for (const f of readdirSync('dist/assets').filter((n) => /^index-.*\.js$/.test(n))) {
  const gz = gzipSync(readFileSync(`dist/assets/${f}`)).length
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gzip`)
  if (gz > LIMIT) {
    console.error(`BUDGET: ${f} exceeds 150 KB gzip`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
```
In `package.json`: `"check": "npm run typecheck && npm run test && npm run build && tsx scripts/check-bundle.ts"`.

`tests/e2e/t0.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureRoad, waitForPhotos } from './helpers.ts'

test('the full road journey works without WebGL (tier 0)', async ({ page }) => {
  await openFixtureRoad(page)
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0)
  await expect(page.getByRole('grid', { name: flow.workbench.grid })).toBeVisible({ timeout: 30_000 })
  await waitForPhotos(page)
  await page.getByRole('link', { name: flow.workbench.report }).click()
  await expect(page.frameLocator(`iframe[title="${flow.report.title}"]`).getByText(flow.report.sections.grid)).toBeVisible({ timeout: 30_000 })
})
```

`tests/e2e/a11y.spec.ts`:
```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copy } from '../../src/ui/copy.ts'
import { openFixtureSite, startAt, waitForPhotos } from './helpers.ts'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
const noViolations = (r: Awaited<ReturnType<AxeBuilder['analyze']>>) =>
  expect(r.violations, JSON.stringify(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([])

async function scanBothThemes(page: Page) {
  for (let i = 0; i < 2; i++) {
    noViolations(await new AxeBuilder({ page }).withTags(TAGS).exclude('.maplibregl-canvas').analyze())
    await page.getByRole('button', { name: copy.nav.themeToggle }).click()
  }
}

test('globe screen', async ({ page }) => {
  await page.goto('/?tier=0')
  await scanBothThemes(page)
})
test('new investigation outline step', async ({ page }) => {
  await startAt(page)
  await scanBothThemes(page)
})
test('workbench', async ({ page }) => {
  await openFixtureSite(page)
  await expect(page.getByRole('slider').first()).toBeVisible({ timeout: 30_000 })
  await scanBothThemes(page)
})
test('report screen', async ({ page }) => {
  await openFixtureSite(page)
  await waitForPhotos(page)
  await page.getByRole('link', { name: 'Report' }).click()
  const frame = page.locator('iframe')
  await expect(frame).toBeVisible({ timeout: 30_000 })
  // Axe cannot run inside the sandboxed (script-free) preview: scan the screen without it, then the report HTML on its own.
  const html = (await frame.getAttribute('srcdoc'))!
  await frame.evaluate((f) => f.remove())
  await scanBothThemes(page)
  await page.setContent(html)
  noViolations(await new AxeBuilder({ page }).withTags(TAGS).analyze())
})
```

- [ ] **Step 2: Run them and fix every finding**

Run: `npm run check && npm run e2e -- t0 a11y`
Expected: the budget passes (entry around 90 KB gzip in planning validation). Fix each axe violation at its source component, such as a missing label, contrast, or a duplicate id. Never disable a rule.

- [ ] **Step 3: Commit**

```bash
git add scripts package.json tests/e2e src
git commit -m "test: no-WebGL journey, axe sweep of every screen in both themes and a 150 KB entry budget

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task C11: First public preview on Cloudflare (human gate G1)

**Files:**
- Create: `docs/ops/deploy.md`, `public/_headers`
- Modify: `docs/ops/probes.md` (P5 and P6 notes from the live preview)

**Interfaces:**
- Produces: a public preview URL serving the app and `/api/tle`. No Supabase involved.

- [ ] **Step 1: Write `public/_headers` (security headers for static assets)**

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(self)
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_THEME_SCRIPT_HASH'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.openfreemap.org https://tiles.openfreemap.org https://gibs.earthdata.nasa.gov https://s3.amazonaws.com https://tiles.maps.eox.at; font-src 'self' data:; connect-src 'self' https://earth-search.aws.element84.com https://planetarycomputer.microsoft.com https://*.blob.core.windows.net https://sentinel-cogs.s3.us-west-2.amazonaws.com https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com https://nominatim.openstreetmap.org https://tiles.openfreemap.org https://gibs.earthdata.nasa.gov https://s3.amazonaws.com https://tiles.maps.eox.at; worker-src 'self' blob:; frame-src 'self' blob: data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```
Compute the hash of the inline theme script in `index.html`, then replace the placeholder:
```bash
node -e "const s=require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];console.log('sha256-'+require('crypto').createHash('sha256').update(s).digest('base64'))"
```
Phase D adds the Supabase origin to `connect-src`.

- [ ] **Step 2: Write `docs/ops/deploy.md`**

```markdown
# Deploying GrahSaboot

## Preview (Phase C, static + /api/tle)
1. Human: create a free Cloudflare account and run `npx wrangler login` on this machine (browser approval).
2. `npm run check` must be green.
3. `npx wrangler deploy`. Prints the `*.workers.dev` URL.
4. Smoke: open the URL, check the globe, search "Nagpur", the worked example, the satellites panel, and `<url>/api/tle` returns JSON with 5 objects.
5. Record the URL and the date in this file.

Agents never run `wrangler deploy` without the user's explicit go-ahead for that specific deploy.
```

- [ ] **Step 3: Human gate G1, then deploy and smoke**

Stop and ask the user to complete G1 (account plus `npx wrangler login`) and to approve this deploy. Then run:
```bash
npm run check && npx wrangler deploy
curl -s "$PREVIEW_URL/api/tle" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).length))'
```
Expected: the deploy prints the URL, and the TLE count prints `5`.

- [ ] **Step 4: Live checks P5/P6 on the preview**

Open the preview in desktop Chrome:
- **P5:** DevTools → Performance → CPU 4× slowdown. Record the median frame time on the globe at tier 2 and tier 3.
- **P6:** at zoom 15 over Nagpur, Delhi and Mumbai, record whether 3D buildings appear.

Write both into `docs/ops/probes.md`. If they were measured by a human, say so.

- [ ] **Step 5: Commit**

```bash
git add public/_headers docs/ops
git commit -m "chore(deploy): security headers, deploy runbook and first preview record

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase C exit criteria

- `npm run check` (including the bundle budget) and `npm run e2e` are green on every available engine.
- The full site and road journeys work at T0.
- Axe reports zero violations on every screen in both themes.
- The preview URL is live (if G1 was granted), and the human assignment from spec §15 can start with it.
