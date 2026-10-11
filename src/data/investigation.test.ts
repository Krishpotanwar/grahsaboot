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
  setServerId,
  setServerNoteIds,
  setVerification,
  togglePin,
  updateNote,
  verificationFor,
  verificationKey,
  type FrameVerification,
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
  it('applies a known before/after pair at creation and pins both', () => {
    const inv = newInvestigation(
      {
        name: 'x',
        aoi: AOI,
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        before: '2025-01-01',
        after: '2025-12-31',
      },
      T,
      '00000000-0000-4000-8000-000000000001',
    )
    expect(inv).toMatchObject({
      before: '2025-01-01', // the range's own first and last day are inside it
      after: '2025-12-31',
      pinned: ['2025-01-01', '2025-12-31'],
    })
  })
  it.each([
    ['reversed', '2025-12-20', '2025-01-10'],
    ['the same day twice', '2025-06-01', '2025-06-01'],
    ['before the range starts', '2024-12-31', '2025-06-01'],
    ['after the range ends', '2025-06-01', '2026-01-01'],
    ['only half given', '2025-06-01', null],
    ['not given', null, null],
  ])('ignores a pair that is %s, and does not throw', (_why, before, after) => {
    const inv = newInvestigation(
      { name: 'x', aoi: AOI, dateFrom: '2025-01-01', dateTo: '2025-12-31', before, after },
      T,
      '00000000-0000-4000-8000-000000000001',
    )
    expect(inv).toMatchObject({ before: null, after: null, pinned: [] })
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

describe('server verification records', () => {
  const rec = (patch: Partial<FrameVerification> = {}): FrameVerification => ({
    status: 'verified',
    verifiedAt: '2026-10-05T10:00:00Z',
    frameId: 'f1',
    serverSha256: 'a'.repeat(64),
    clientSha256: 'a'.repeat(64),
    itemId: 'S2_A',
    ...patch,
  })
  const key = verificationKey('2025-01-10', 'visual', 0)
  const withRec = (r: FrameVerification) => setVerification(base(), { [key]: r }, T)
  const look = (inv: ReturnType<typeof base>, sha = 'a'.repeat(64), item = 'S2_A') =>
    verificationFor(inv, '2025-01-10', 'visual', 0, sha, item)

  it('keys a record by date, asset and level', () => {
    expect(key).toBe('2025-01-10:visual:0')
    expect(verificationKey('2025-01-10', 'scl', 0)).toBe('2025-01-10:scl:0')
  })
  it('has no verification until a save records one', () => {
    expect(base().verification).toBeUndefined()
    expect(look(base())).toBeNull()
  })
  it('merges records without touching the input, and stamps the edit time', () => {
    const one = withRec(rec())
    const other = verificationKey('2025-01-10', 'scl', 0)
    const two = setVerification(one, { [other]: rec({ frameId: 'f2' }) }, new Date('2026-10-06T00:00:00Z'))
    expect(Object.keys(two.verification!).sort()).toEqual([other, key])
    expect(Object.keys(one.verification!)).toEqual([key])
    expect(two.updatedAt).toBe('2026-10-06T00:00:00.000Z')
  })
  it('shows a verified record only for the pixels and the item on screen', () => {
    const inv = withRec(rec())
    expect(look(inv)).toMatchObject({ status: 'verified', frameId: 'f1' })
    expect(look(inv, 'b'.repeat(64))).toBeNull() // other pixels: the server checked something else
    expect(look(inv, 'a'.repeat(64), 'S2_B')).toBeNull() // another item took the date's place
  })
  it('always shows a mismatch for the item it was recorded for, and for no other item', () => {
    const inv = withRec(rec({ status: 'mismatch', serverSha256: 'c'.repeat(64) }))
    expect(look(inv)).toMatchObject({ status: 'mismatch' })
    expect(look(inv, 'b'.repeat(64))).toMatchObject({ status: 'mismatch' }) // other pixels do not hide it
    expect(look(inv, 'a'.repeat(64), 'S2_B')).toBeNull() // E23: another item's mismatch must not show here
  })
  it('keeps the records of the same server row and drops those of another', () => {
    const saved = { ...withRec(rec()), serverId: 'srv-1' }
    expect(setServerId(saved, 'srv-1', T).verification).toEqual(saved.verification)
    const moved = setServerId(saved, 'srv-2', T) // saved again as a new row: the old row's frames are gone
    expect(moved.serverId).toBe('srv-2')
    expect(moved.verification).toBeUndefined()
    expect(setServerId(base(), 'srv-1', T)).toMatchObject({ serverId: 'srv-1', updatedAt: T.toISOString() })
  })
})

describe('records that follow the row and the pins', () => {
  const rec = (itemId: string) => ({
    status: 'verified' as const,
    verifiedAt: 'x',
    frameId: 'f',
    serverSha256: 'a'.repeat(64),
    clientSha256: 'a'.repeat(64),
    itemId,
  })
  const base = () => {
    let i = newInvestigation(
      {
        name: 'A',
        aoi: {
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
        },
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      },
      new Date('2026-10-05T10:00:00Z'),
      '00000000-0000-4000-8000-000000000001',
    )
    i = togglePin(setBeforeAfter(i, '2025-01-10', '2025-12-20'), '2025-06-15')
    return setVerification(i, {
      '2025-06-15:scl:0': rec('S2_a'),
      '2025-06-15:visual:1': rec('S2_a'),
      '2025-01-10:scl:0': rec('S2_b'),
    })
  }
  it('unpinning a date drops its records and keeps the others (the server prunes its frames)', () => {
    const v = togglePin(base(), '2025-06-15')
    expect(Object.keys(v.verification!)).toEqual(['2025-01-10:scl:0'])
    // counter-case: pinning another date changes no record
    expect(Object.keys(togglePin(base(), '2025-08-01').verification!).sort()).toEqual([
      '2025-01-10:scl:0',
      '2025-06-15:scl:0',
      '2025-06-15:visual:1',
    ])
  })
  it('an investigation that was never checked gains no verification field by unpinning', () => {
    const plain = togglePin(
      togglePin(
        newInvestigation(
          { name: 'A', aoi: base().aoi, dateFrom: '2025-01-01', dateTo: '2025-12-31' },
          new Date('2026-10-05T10:00:00Z'),
          '00000000-0000-4000-8000-000000000002',
        ),
        '2025-03-01',
      ),
      '2025-03-01',
    )
    expect('verification' in plain).toBe(false)
  })
  it('synced note ids follow the server row: kept for the same row, dropped for another', () => {
    const synced = setServerNoteIds(setServerId(base(), 'srv-1'), ['n1', 'n2'])
    expect(setServerId(synced, 'srv-1').serverNoteIds).toEqual(['n1', 'n2'])
    expect('serverNoteIds' in setServerId(synced, 'srv-2')).toBe(false)
  })
})
