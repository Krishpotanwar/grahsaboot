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

export function newInvestigation(
  input: Pick<Investigation, 'name' | 'aoi' | 'dateFrom' | 'dateTo'>,
  now = new Date(),
  uuid: string = crypto.randomUUID(),
): Investigation {
  return {
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
  if (inv.pinned.includes(date))
    return { ...inv, pinned: inv.pinned.filter((d) => d !== date), updatedAt: iso(now) }
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
