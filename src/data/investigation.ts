import type { AoiInput } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'

export type NoteKind = 'change' | 'no_clear_change' | 'unsure'
export interface Note {
  id: string
  kind: NoteKind
  body: string
  date: string | null
  sectionIdx: number | null
  createdAt: string
  updatedAt: string
}
export interface Claim {
  text: string
  date: string | null
  criterion: string
}
/**
 * What the server's check of one frame found. `itemId` and `clientSha256` say which file and which pixels the browser sent,
 * so a record never speaks for another item or for different pixels.
 */
export interface FrameVerification {
  status: 'verified' | 'mismatch'
  verifiedAt: string
  frameId: string
  serverSha256: string
  clientSha256: string
  itemId: string
}
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
  /** The server's check per frame, keyed by verificationKey(). Absent until a save has verified something. */
  verification?: Record<string, FrameVerification>
  /**
   * The note ids this copy has synced with its server row: the ones it was loaded with or last saved. A save deletes from the
   * server only the notes it knew and no longer has, so a note written on another device is never removed by a stale copy.
   */
  serverNoteIds?: string[]
  createdAt: string
  updatedAt: string
}

export class InvestigationError extends Error {}

const iso = (d: Date) => d.toISOString()
const uniqSorted = (xs: string[]) => [...new Set(xs)].sort()
const cleanName = (name: string) => name.trim().slice(0, 120) || 'Untitled investigation'

export function newInvestigation(
  input: Pick<Investigation, 'name' | 'aoi' | 'dateFrom' | 'dateTo'> &
    Partial<Pick<Investigation, 'before' | 'after'>>,
  now = new Date(),
  uuid: string = crypto.randomUUID(),
): Investigation {
  const inv: Investigation = {
    id: `local-${uuid}`,
    serverId: null,
    name: cleanName(input.name),
    aoi: input.aoi,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    before: null,
    after: null,
    pinned: [],
    notes: [],
    claim: null,
    createdAt: iso(now),
    updatedAt: iso(now),
  }
  // A known pair (a worked example's) is applied, and pinned, only when both are in order and inside the dates; otherwise it is dropped, never an error.
  const { before, after } = input
  return before && after && before < after && before >= input.dateFrom && after <= input.dateTo
    ? setBeforeAfter(inv, before, after, now)
    : inv
}

export const renameInvestigation = (inv: Investigation, name: string, now = new Date()): Investigation => ({
  ...inv,
  name: cleanName(name),
  updatedAt: iso(now),
})

export function setBeforeAfter(
  inv: Investigation,
  before: string,
  after: string,
  now = new Date(),
): Investigation {
  if (before >= after) throw new InvestigationError('BAD_ORDER')
  const pinned = uniqSorted([...inv.pinned, before, after])
  if (pinned.length > LIMITS.pinnedDates) throw new InvestigationError('TOO_MANY_PINS')
  return { ...inv, before, after, pinned, updatedAt: iso(now) }
}

export function togglePin(inv: Investigation, date: string, now = new Date()): Investigation {
  if (date === inv.before || date === inv.after) return inv
  if (inv.pinned.includes(date)) {
    // The server drops an unpinned date's frames on the next verify, so this copy must not go on saying they are checked.
    const { verification, ...rest } = inv
    const kept = Object.entries(verification ?? {}).filter(([k]) => !k.startsWith(`${date}:`))
    return {
      ...rest,
      ...(verification ? { verification: Object.fromEntries(kept) } : {}),
      pinned: inv.pinned.filter((d) => d !== date),
      updatedAt: iso(now),
    }
  }
  if (inv.pinned.length >= LIMITS.pinnedDates) throw new InvestigationError('TOO_MANY_PINS')
  return { ...inv, pinned: uniqSorted([...inv.pinned, date]), updatedAt: iso(now) }
}

function cleanBody(body: string): string {
  const b = body.trim()
  if (!b) throw new InvestigationError('NOTE_EMPTY')
  if (b.length > LIMITS.notes.maxChars) throw new InvestigationError('NOTE_TOO_LONG')
  return b
}

export function addNote(
  inv: Investigation,
  n: Pick<Note, 'kind' | 'body' | 'date' | 'sectionIdx'>,
  now = new Date(),
  id: string = crypto.randomUUID(),
): Investigation {
  if (inv.notes.length >= LIMITS.notes.maxPerInvestigation) throw new InvestigationError('TOO_MANY_NOTES')
  const note: Note = {
    id,
    kind: n.kind,
    body: cleanBody(n.body),
    date: n.date,
    sectionIdx: n.sectionIdx,
    createdAt: iso(now),
    updatedAt: iso(now),
  }
  return { ...inv, notes: [...inv.notes, note], updatedAt: iso(now) }
}

export function updateNote(
  inv: Investigation,
  id: string,
  patch: Partial<Pick<Note, 'kind' | 'body' | 'date' | 'sectionIdx'>>,
  now = new Date(),
): Investigation {
  return {
    ...inv,
    notes: inv.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            ...patch,
            body: patch.body === undefined ? n.body : cleanBody(patch.body),
            updatedAt: iso(now),
          }
        : n,
    ),
    updatedAt: iso(now),
  }
}

export const removeNote = (inv: Investigation, id: string, now = new Date()): Investigation => ({
  ...inv,
  notes: inv.notes.filter((n) => n.id !== id),
  updatedAt: iso(now),
})

export const restoreNote = (inv: Investigation, note: Note, now = new Date()): Investigation =>
  inv.notes.some((n) => n.id === note.id)
    ? inv
    : {
        ...inv,
        notes: [...inv.notes, note].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        updatedAt: iso(now),
      }

export function setClaim(inv: Investigation, claim: Claim | null, now = new Date()): Investigation {
  if (claim && (claim.text.length > 2000 || claim.criterion.length > 500))
    throw new InvestigationError('CLAIM_TOO_LONG')
  return {
    ...inv,
    claim: claim ? { text: claim.text.trim(), date: claim.date, criterion: claim.criterion.trim() } : null,
    updatedAt: iso(now),
  }
}

export const verificationKey = (date: string, asset: 'visual' | 'scl', level: number) =>
  `${date}:${asset}:${level}`

export const setVerification = (
  inv: Investigation,
  v: Record<string, FrameVerification>,
  now = new Date(),
): Investigation => ({ ...inv, verification: { ...inv.verification, ...v }, updatedAt: iso(now) })

/**
 * A different server row has none of the old row's frames and notes, so its records and synced note ids would claim things
 * that do not exist there.
 */
export function setServerId(inv: Investigation, id: string, now = new Date()): Investigation {
  const { verification, serverNoteIds, ...rest } = inv
  const same = id === inv.serverId
  return {
    ...rest,
    ...(verification && same ? { verification } : {}),
    ...(serverNoteIds && same ? { serverNoteIds } : {}),
    serverId: id,
    updatedAt: iso(now),
  }
}

export const setServerNoteIds = (inv: Investigation, ids: string[], now = new Date()): Investigation => ({
  ...inv,
  serverNoteIds: ids,
  updatedAt: iso(now),
})

/**
 * The record that speaks for the photo on screen, or null. It must be for this item. A "verified" record counts only for the
 * pixels the browser holds now (the server's hash is the hash of those pixels); a mismatch for this item always shows.
 */
export function verificationFor(
  inv: Investigation,
  date: string,
  asset: 'visual' | 'scl',
  level: number,
  sha256: string,
  itemId: string,
): FrameVerification | null {
  const v = inv.verification?.[verificationKey(date, asset, level)]
  if (!v || v.itemId !== itemId) return null
  return v.status === 'mismatch' || v.serverSha256 === sha256 ? v : null
}
