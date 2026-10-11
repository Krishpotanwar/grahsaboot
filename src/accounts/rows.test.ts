import { describe, expect, it } from 'vitest'
import type { Investigation } from '../data/investigation.ts'
import { newInvestigation, setBeforeAfter, setClaim, addNote } from '../data/investigation.ts'
import { ewkt, investigationRow, newInvestigationRow, noteRows, rowToInvestigation } from './rows.ts'

const T = new Date('2026-10-05T10:00:00Z')
const RING = [
  [79.08, 21.14],
  [79.09, 21.14],
  [79.09, 21.15],
  [79.08, 21.14],
] as [number, number][]
const LINE = [
  [79.07, 21.13],
  [79.09, 21.15],
] as [number, number][]
const site = () =>
  newInvestigation(
    {
      name: 'Yard',
      aoi: { kind: 'site', geometry: { type: 'Polygon', coordinates: [RING] } },
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    },
    T,
    '00000000-0000-4000-8000-000000000001',
  )
const road = () =>
  newInvestigation(
    {
      name: 'Bypass',
      aoi: { kind: 'road', geometry: { type: 'LineString', coordinates: LINE }, widthM: 30 },
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    },
    T,
    '00000000-0000-4000-8000-000000000002',
  )

describe('ewkt', () => {
  it('writes a site as its one ring and a road as its line, in WGS 84', () => {
    expect(ewkt(site())).toBe('SRID=4326;POLYGON((79.08 21.14,79.09 21.14,79.09 21.15,79.08 21.14))')
    expect(ewkt(road())).toBe('SRID=4326;LINESTRING(79.07 21.13,79.09 21.15)')
  })
})

describe('investigationRow', () => {
  it('holds only the columns that may change after the first save (no geometry, no dates)', () => {
    let inv = setBeforeAfter(site(), '2025-01-10', '2025-12-20', T)
    inv = setClaim(inv, { text: 'Road laid by June', date: '2025-06-30', criterion: 'Dark surface' }, T)
    expect(investigationRow(inv)).toEqual({
      name: 'Yard',
      before_date: '2025-01-10',
      after_date: '2025-12-20',
      pinned: ['2025-01-10', '2025-12-20'],
      claim_text: 'Road laid by June',
      claim_date: '2025-06-30',
      claim_criterion: 'Dark surface',
    })
  })
  it('sends a null claim as three nulls', () => {
    expect(investigationRow(site())).toMatchObject({
      before_date: null,
      claim_text: null,
      claim_date: null,
      claim_criterion: null,
      pinned: [],
    })
  })
})

describe('newInvestigationRow', () => {
  it('adds kind, geometry, road width and the date range for the first save', () => {
    expect(newInvestigationRow(site())).toMatchObject({
      name: 'Yard',
      kind: 'site',
      geom: ewkt(site()),
      road_width_m: null,
      date_from: '2025-01-01',
      date_to: '2025-12-31',
    })
    expect(newInvestigationRow(road())).toMatchObject({ kind: 'road', road_width_m: 30 })
  })
  it('never names the owner or the id: the server fills both from the session', () => {
    expect(Object.keys(newInvestigationRow(site()))).not.toContain('owner')
    expect(Object.keys(newInvestigationRow(site()))).not.toContain('id')
  })
})

describe('noteRows', () => {
  it('maps each note to an annotations row keyed by its own id, under the server investigation', () => {
    const inv = addNote(
      site(),
      { kind: 'change', body: 'New roof', date: '2025-12-20', sectionIdx: 2 },
      T,
      '00000000-0000-4000-8000-0000000000a1',
    )
    expect(noteRows('srv-1', inv.notes)).toEqual([
      {
        id: '00000000-0000-4000-8000-0000000000a1',
        investigation_id: 'srv-1',
        kind: 'change',
        body: 'New roof',
        frame_date: '2025-12-20',
        section_idx: 2,
        created_at: T.toISOString(),
      },
    ])
    expect(noteRows('srv-1', [])).toEqual([])
  })
})

describe('rowToInvestigation', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Yard',
    kind: 'site',
    geom_geojson: { type: 'Polygon', coordinates: [RING] },
    road_width_m: null,
    date_from: '2025-01-01',
    date_to: '2025-12-31',
    before_date: '2025-01-10',
    after_date: '2025-12-20',
    pinned: ['2025-01-10', '2025-12-20'],
    claim_text: 'Road laid by June',
    claim_date: '2025-06-30',
    claim_criterion: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
  }
  const note = {
    id: 'n1',
    kind: 'unsure',
    body: 'Maybe a roof',
    frame_date: null,
    section_idx: null,
    created_at: '2026-10-01T01:00:00Z',
    updated_at: '2026-10-01T02:00:00Z',
  }
  const frame = (patch: Record<string, unknown> = {}) => ({
    id: 'f1',
    frame_date: '2025-01-10',
    asset: 'visual',
    level: 0,
    status: 'verified',
    server_sha256: 'a'.repeat(64),
    client_sha256: 'a'.repeat(64),
    item_id: 'S2_A',
    verified_at: '2026-10-02T03:00:00Z',
    ...patch,
  })

  it('opens a server row as an investigation whose id and server id are the row id', () => {
    const inv = rowToInvestigation(row, [note], [frame()]) as Investigation
    expect(inv).toMatchObject({
      id: row.id,
      serverId: row.id,
      name: 'Yard',
      aoi: { kind: 'site', geometry: { type: 'Polygon', coordinates: [RING] } },
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      before: '2025-01-10',
      after: '2025-12-20',
      pinned: ['2025-01-10', '2025-12-20'],
      claim: { text: 'Road laid by June', date: '2025-06-30', criterion: '' },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
    expect(inv.notes).toEqual([
      {
        id: 'n1',
        kind: 'unsure',
        body: 'Maybe a roof',
        date: null,
        sectionIdx: null,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      },
    ])
  })

  it('reads a road with its width, and a row without a claim or pins', () => {
    const inv = rowToInvestigation(
      {
        ...row,
        kind: 'road',
        geom_geojson: { type: 'LineString', coordinates: LINE },
        road_width_m: 30,
        claim_text: null,
        pinned: null,
      },
      [],
      [],
    ) as Investigation
    expect(inv.aoi).toEqual({ kind: 'road', geometry: { type: 'LineString', coordinates: LINE }, widthM: 30 })
    expect(inv.claim).toBeNull()
    expect(inv.pinned).toEqual([])
    expect(inv.verification).toEqual({})
  })

  it('maps frames to verification records that carry the item and the client hash', () => {
    const inv = rowToInvestigation(row, [], [frame(), frame({ id: 'f2', asset: 'scl', status: 'mismatch' })])!
    expect(inv.verification).toEqual({
      '2025-01-10:visual:0': {
        status: 'verified',
        verifiedAt: '2026-10-02T03:00:00Z',
        frameId: 'f1',
        serverSha256: 'a'.repeat(64),
        clientSha256: 'a'.repeat(64),
        itemId: 'S2_A',
      },
      '2025-01-10:scl:0': expect.objectContaining({ status: 'mismatch', frameId: 'f2' }),
    })
  })

  it('keeps the most recent check when two items hold the same date, asset and level', () => {
    const older = frame({ id: 'old', item_id: 'S2_OLD', verified_at: '2026-10-01T00:00:00Z' })
    const newer = frame({ id: 'new', item_id: 'S2_NEW', verified_at: '2026-10-03T00:00:00Z' })
    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      const inv = rowToInvestigation(row, [], order)!
      expect(inv.verification!['2025-01-10:visual:0']).toMatchObject({ frameId: 'new', itemId: 'S2_NEW' })
    }
  })

  it('returns null for a row whose outline cannot be read', () => {
    expect(rowToInvestigation({ ...row, geom_geojson: null }, [], [])).toBeNull()
    expect(rowToInvestigation({ ...row, kind: 'lake' }, [], [])).toBeNull()
    expect(rowToInvestigation({ ...row, geom_geojson: { type: 'Polygon' } }, [], [])).toBeNull()
  })
})
