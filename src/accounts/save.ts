import {
  verificationKey,
  type FrameVerification,
  type Investigation,
  type Note,
} from '../data/investigation.ts'
import type { Window } from '../evidence/types.ts'
import type { S2Item } from '../stac/types.ts'
import type { DateEntry } from '../workbench/runner.ts'

// The request and answer are supabase/functions/verify/handler.ts's: its field names and status codes are the contract.
export interface VerifyFrameIn {
  asset: 'visual' | 'scl'
  level: 0 | 1
  window: Window
  sha256: string
}
export interface VerifyFrameOut {
  asset: 'visual' | 'scl'
  level: 0 | 1
  status: 'verified' | 'mismatch'
  server_sha256: string
  frame_id: string
  verified_at: string
  quality: unknown
}
export interface VerifyBody {
  investigation_id: string
  item: { collection: S2Item['collection']; id: string }
  frames: VerifyFrameIn[]
}
export type VerifyResult =
  { ok: true; frames: VerifyFrameOut[] } | { ok: false; status: number; error: string }

export interface SaveDeps {
  saveInvestigation(inv: Investigation): Promise<string>
  /** `known`: the note ids this copy last synced; only those are deleted from the server when the copy no longer has them. */
  replaceNotes(serverId: string, notes: Note[], known?: string[]): Promise<void>
  verify(body: VerifyBody): Promise<VerifyResult>
  sleep?(ms: number): Promise<void>
}
export interface SaveProgress {
  total: number
  done: number
}
export interface SaveOutcome {
  serverId: string
  /** The note ids now synced with the server row: store them with setServerNoteIds. */
  noteIds: string[]
  /** The checks made in this run. Merge them into the investigation with setVerification. */
  verification: Record<string, FrameVerification>
  verified: number
  mismatched: number
  failed: number
  /** Why the run ended before the last date: the daily limit, the 50-frame cap, or the session. */
  stoppedBy: 'RATE_LIMITED' | 'FRAME_LIMIT' | 'SESSION_EXPIRED' | null
}

/** The session is gone: the caller signs in again and resumes the save (`?save=1`). */
export class SessionExpiredError extends Error {
  constructor() {
    super('SESSION_EXPIRED')
  }
}

const nonEmpty = (w: Window) => w[2] > w[0] && w[3] > w[1]

/**
 * The frames a save can send for one date (spec 8.2): the SCL window of a checked pinned date, the preview (level 1) and, for
 * before and after, the full photo (level 0), each as the browser holds it. Nothing for any other date.
 */
function candidates(inv: Investigation, e: DateEntry): VerifyFrameIn[] {
  // An unchecked date has nothing to send; a [0,0,0,0] window is a scene that does not cover the outline (the server refuses it).
  if (!inv.pinned.includes(e.date) || e.status !== 'checked' || !e.quality || !nonEmpty(e.quality.window))
    return []
  const held: VerifyFrameIn[] = [
    { asset: 'scl', level: 0, window: e.quality.window, sha256: e.quality.sha256 },
  ]
  // The full photo only for before and after. The mini map loads one for whatever date the slider rests on, and sending it
  // would push a 24-pin investigation past the 50-frame cap.
  const full = e.date === inv.before || e.date === inv.after ? e.full : null
  for (const f of [e.thumb, full])
    if (f && nonEmpty(f.window))
      held.push({ asset: 'visual', level: f.level, window: f.window, sha256: f.sha256 })
  return held
}

/** The record that speaks for `f` of `e`: for the same item and the same pixels the browser sent. Null when there is none. */
function recorded(inv: Investigation, e: DateEntry, f: VerifyFrameIn): FrameVerification | null {
  const v = inv.verification?.[verificationKey(e.date, f.asset, f.level)]
  return v && v.itemId === e.candidate.item.id && v.clientSha256 === f.sha256 ? v : null
}

/**
 * What to send for the pinned dates: `candidates` of each, less the frames already recorded as verified for the same item and
 * the same pixels.
 */
export function framesToVerify(
  inv: Investigation,
  entries: DateEntry[],
): Array<{ date: string; item: S2Item; frames: VerifyFrameIn[] }> {
  const jobs: Array<{ date: string; item: S2Item; frames: VerifyFrameIn[] }> = []
  for (const e of entries) {
    // Only a "verified" record is final: a mismatch is checked again (the cause may have been a failed read).
    const frames = candidates(inv, e).filter((f) => recorded(inv, e, f)?.status !== 'verified')
    if (frames.length) jobs.push({ date: e.date, item: e.candidate.item, frames })
  }
  return jobs
}

/**
 * What the investigation's own records say about the frames a save would consider, for the line under "Save and verify". Counted
 * from the merged records, not from one run: a save that finds everything recorded verifies no new frame, and the line must
 * still say how many are. `latest` is the most recent check (an ISO time), null when none is verified.
 */
export function countVerified(
  inv: Investigation,
  entries: DateEntry[],
): { verified: number; mismatched: number; latest: string | null } {
  let verified = 0
  let mismatched = 0
  let latest: string | null = null
  for (const e of entries)
    for (const f of candidates(inv, e)) {
      const v = recorded(inv, e, f)
      if (!v) continue
      if (v.status === 'mismatch') mismatched++
      else {
        verified++
        // By time: ISO strings with a fraction or a "+00:00" do not sort like the instants they name.
        if (latest === null || Date.parse(v.verifiedAt) > Date.parse(latest)) latest = v.verifiedAt
      }
    }
  return { verified, mismatched, latest }
}

const BACKOFF = [1000, 3000]
const RETRY = [502, 503, 504]

/**
 * Saves the investigation and its notes, then verifies each pinned date with up to three tries. `onSaved` is told the server
 * id as soon as the row exists, before the notes, so a failure after that cannot lose it (the next save updates the row).
 * Errors from the two save steps are thrown; SessionExpiredError means sign in again.
 */
export async function saveAndVerify(
  deps: SaveDeps,
  inv: Investigation,
  entries: DateEntry[],
  onProgress: (p: SaveProgress) => void,
  onSaved?: (serverId: string) => void,
): Promise<SaveOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const serverId = await deps.saveInvestigation(inv)
  onSaved?.(serverId)
  // A new row has no notes of this copy's on the server, so nothing is known there and nothing may be deleted.
  await deps.replaceNotes(serverId, inv.notes, serverId === inv.serverId ? inv.serverNoteIds : undefined)
  // Saved as a new row (the old one was deleted elsewhere): its frames are gone, so nothing is already checked.
  const jobs = framesToVerify(serverId === inv.serverId ? inv : { ...inv, verification: {} }, entries)
  const out: SaveOutcome = {
    serverId,
    noteIds: inv.notes.map((n) => n.id),
    verification: {},
    verified: 0,
    mismatched: 0,
    failed: 0,
    stoppedBy: null,
  }
  onProgress({ total: jobs.length, done: 0 })
  for (const [i, job] of jobs.entries()) {
    let result: VerifyResult | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await deps.verify({
        investigation_id: serverId,
        item: { collection: job.item.collection, id: job.item.id },
        frames: job.frames,
      })
      if (result.ok || !RETRY.includes(result.status)) break
      if (attempt < 2) await sleep(BACKOFF[attempt]!)
    }
    if (result?.ok) {
      for (const f of result.frames) {
        const sent = job.frames.find((x) => x.asset === f.asset && x.level === f.level)
        if (!sent) continue
        // A time the page cannot print would break every screen that shows it: count it as a failed check instead.
        if (typeof f.verified_at !== 'string' || Number.isNaN(Date.parse(f.verified_at))) {
          out.failed++
          continue
        }
        out.verification[verificationKey(job.date, f.asset, f.level)] = {
          status: f.status,
          verifiedAt: f.verified_at,
          frameId: f.frame_id,
          serverSha256: f.server_sha256,
          clientSha256: sent.sha256,
          itemId: job.item.id,
        }
        if (f.status === 'verified') out.verified++
        else out.mismatched++
      }
    } else if (result && !result.ok && [401, 429].includes(result.status)) {
      out.stoppedBy = result.status === 401 ? 'SESSION_EXPIRED' : 'RATE_LIMITED'
      onProgress({ total: jobs.length, done: i })
      break
    } else if (result && !result.ok && result.status === 422 && result.error === 'GS:LIMIT_FRAMES') {
      // The 50-frame cap: every later date would read its files and spend a counted check before failing the same way.
      out.stoppedBy = 'FRAME_LIMIT'
      onProgress({ total: jobs.length, done: i })
      break
    } else {
      out.failed++
    }
    onProgress({ total: jobs.length, done: i + 1 })
  }
  return out
}
