import {
  verificationKey,
  type FrameVerification,
  type Investigation,
  type Note,
  type NoteKind,
} from '../data/investigation.ts'

// Pure: the mapping between an Investigation and the rows of supabase/migrations/20261005000001_core.sql. No supabase-js and no
// React, so the tests need neither.

type Pt = [number, number]
const pts = (xs: Pt[]) => xs.map(([x, y]) => `${x} ${y}`).join(',')

/** The outline as the EWKT the geography column reads: WGS 84, one ring for a site, one line for a road. */
export const ewkt = (inv: Investigation): string =>
  inv.aoi.kind === 'site'
    ? `SRID=4326;POLYGON((${pts(inv.aoi.geometry.coordinates[0]!)}))`
    : `SRID=4326;LINESTRING(${pts(inv.aoi.geometry.coordinates)})`

/** The columns that may change after the first save. The outline and the dates are frozen once a frame is verified. */
export const investigationRow = (inv: Investigation) => ({
  name: inv.name,
  before_date: inv.before,
  after_date: inv.after,
  pinned: inv.pinned,
  claim_text: inv.claim?.text ?? null,
  claim_date: inv.claim?.date ?? null,
  claim_criterion: inv.claim?.criterion ?? null,
})

/** A new row. `owner` and `id` are filled by the database from the session. */
export const newInvestigationRow = (inv: Investigation) => ({
  ...investigationRow(inv),
  kind: inv.aoi.kind,
  geom: ewkt(inv),
  road_width_m: inv.aoi.kind === 'road' ? inv.aoi.widthM : null,
  date_from: inv.dateFrom,
  date_to: inv.dateTo,
})

/** Note ids are made by the browser and are unique per investigation (the table's key is (investigation_id, id)). */
export const noteRows = (serverId: string, notes: Note[]) =>
  notes.map((n) => ({
    id: n.id,
    investigation_id: serverId,
    kind: n.kind,
    body: n.body,
    frame_date: n.date,
    section_idx: n.sectionIdx,
    created_at: n.createdAt,
  }))

// What PostgREST returns is JSON from the network: typed loosely and read with checks.
export interface InvestigationRowIn {
  id: string
  name: string
  kind: string
  geom_geojson: { type?: string; coordinates?: unknown } | null
  road_width_m: number | null
  date_from: string
  date_to: string
  before_date: string | null
  after_date: string | null
  pinned: string[] | null
  claim_text: string | null
  claim_date: string | null
  claim_criterion: string | null
  created_at: string
  updated_at: string
}
export interface AnnotationRowIn {
  id: string
  kind: string
  body: string
  frame_date: string | null
  section_idx: number | null
  created_at: string
  updated_at: string
}
export interface FrameRowIn {
  id: string
  frame_date: string
  asset: string
  level: number
  status: string
  server_sha256: string
  client_sha256: string
  item_id: string
  verified_at: string
}

/** A server row as an investigation whose `id` and `serverId` are the row id, or null when its outline cannot be read. */
export function rowToInvestigation(
  r: InvestigationRowIn,
  notes: AnnotationRowIn[],
  frames: FrameRowIn[],
): Investigation | null {
  const c = r.geom_geojson?.coordinates
  if (!Array.isArray(c)) return null
  let aoi: Investigation['aoi']
  if (r.kind === 'site') aoi = { kind: 'site', geometry: { type: 'Polygon', coordinates: c as Pt[][] } }
  else if (r.kind === 'road' && r.road_width_m != null)
    aoi = { kind: 'road', geometry: { type: 'LineString', coordinates: c as Pt[] }, widthM: r.road_width_m }
  else return null
  // A date, asset and level held by two items (an alternate was picked since): the most recent check speaks.
  const verification: Record<string, FrameVerification> = {}
  for (const f of [...frames].sort((a, b) => Date.parse(a.verified_at) - Date.parse(b.verified_at)))
    verification[verificationKey(f.frame_date, f.asset as 'visual' | 'scl', f.level)] = {
      status: f.status as FrameVerification['status'],
      verifiedAt: f.verified_at,
      frameId: f.id,
      serverSha256: f.server_sha256,
      clientSha256: f.client_sha256,
      itemId: f.item_id,
    }
  return {
    id: r.id,
    serverId: r.id,
    name: r.name,
    aoi,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    before: r.before_date,
    after: r.after_date,
    pinned: r.pinned ?? [],
    notes: notes.map((n) => ({
      id: n.id,
      kind: n.kind as NoteKind,
      body: n.body,
      date: n.frame_date,
      sectionIdx: n.section_idx,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    })),
    claim: r.claim_text
      ? { text: r.claim_text, date: r.claim_date, criterion: r.claim_criterion ?? '' }
      : null,
    verification,
    serverNoteIds: notes.map((n) => n.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
