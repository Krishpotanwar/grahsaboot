import { describe, expect, it } from 'vitest'
import {
  addNote,
  InvestigationError,
  newInvestigation,
  removeNote,
  renameInvestigation,
  restoreNote,
  setBeforeAfter,
  setClaim,
  togglePin,
  updateNote,
} from './investigation.ts'
import type { AoiInput } from '../geo/aoi.ts'

const AOI: AoiInput = {
  kind: 'site',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [79.08, 21.14],
        [79.09, 21.14],
        [79.09, 21.15],
        [79.08, 21.14],
      ],
    ],
  },
}
const T = new Date('2026-10-05T10:00:00Z')
const base = () =>
  newInvestigation(
    { name: '  Nagpur yard  ', aoi: AOI, dateFrom: '2025-01-01', dateTo: '2025-12-31' },
    T,
    '00000000-0000-4000-8000-000000000001',
  )
const code = (f: () => unknown) => {
  try {
    f()
    return null
  } catch (e) {
    return e instanceof InvestigationError ? e.message : String(e)
  }
}

describe('investigation model', () => {
  it('creates a local investigation with a trimmed name', () => {
    const inv = base()
    expect(inv).toMatchObject({
      id: 'local-00000000-0000-4000-8000-000000000001',
      serverId: null,
      name: 'Nagpur yard',
      pinned: [],
      notes: [],
      claim: null,
      createdAt: T.toISOString(),
    })
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
    for (let d = 2; inv.pinned.length < 24; d++)
      inv = togglePin(inv, `2025-02-${String(d).padStart(2, '0')}`, T)
    expect(code(() => togglePin(inv, '2025-03-01', T))).toBe('TOO_MANY_PINS')
    expect(togglePin(inv, '2025-02-02', T).pinned).not.toContain('2025-02-02')
  })
  it('validates, edits, removes and restores notes', () => {
    expect(
      code(() => addNote(base(), { kind: 'change', body: '   ', date: null, sectionIdx: null }, T)),
    ).toBe('NOTE_EMPTY')
    expect(
      code(() =>
        addNote(base(), { kind: 'change', body: 'x'.repeat(2001), date: null, sectionIdx: null }, T),
      ),
    ).toBe('NOTE_TOO_LONG')
    let inv = addNote(
      base(),
      { kind: 'change', body: ' New roof ', date: '2025-12-20', sectionIdx: null },
      T,
      'n1',
    )
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
    for (let i = 0; i < 200; i++)
      inv = addNote(inv, { kind: 'unsure', body: `n${i}`, date: null, sectionIdx: null }, T, `id${i}`)
    expect(
      code(() => addNote(inv, { kind: 'unsure', body: 'one more', date: null, sectionIdx: null }, T)),
    ).toBe('TOO_MANY_NOTES')
  })
  it('validates claims', () => {
    expect(
      setClaim(
        base(),
        { text: 'Road laid by June', date: '2025-06-30', criterion: 'Dark surface along the line' },
        T,
      ).claim?.text,
    ).toBe('Road laid by June')
    expect(code(() => setClaim(base(), { text: 'x'.repeat(2001), date: null, criterion: '' }, T))).toBe(
      'CLAIM_TOO_LONG',
    )
    expect(setClaim(base(), null, T).claim).toBeNull()
  })
})
