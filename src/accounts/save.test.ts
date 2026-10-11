import { describe, expect, it, vi } from 'vitest'
import {
  newInvestigation,
  setBeforeAfter,
  setVerification,
  togglePin,
  type Investigation,
} from '../data/investigation.ts'
import type { DateEntry } from '../workbench/runner.ts'
import {
  framesToVerify,
  saveAndVerify,
  SessionExpiredError,
  type SaveDeps,
  type VerifyBody,
  type VerifyResult,
} from './save.ts'

const T = new Date('2026-10-05T10:00:00Z')
let inv: Investigation = newInvestigation(
  {
    name: 'Yard',
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
  T,
  '00000000-0000-4000-8000-000000000001',
)
inv = togglePin(setBeforeAfter(inv, '2025-01-10', '2025-12-20', T), '2025-06-15', T)

const SCL = 's'.repeat(64)
const FULL = 'f'.repeat(64)
const THUMB = 't'.repeat(64)
const entry = (
  date: string,
  o: {
    full?: boolean
    thumb?: boolean
    status?: DateEntry['status']
    window?: [number, number, number, number]
    item?: string
  } = {},
): DateEntry =>
  ({
    date,
    status: o.status ?? 'checked',
    error: null,
    thumbFailed: false,
    invalid: null,
    candidate: {
      date,
      coversAoi: true,
      alternates: [],
      item: { id: o.item ?? `S2_${date}`, collection: 'sentinel-2-l2a' },
    },
    quality: { window: o.window ?? [1, 2, 3, 4], level: 0, sha256: SCL, stats: {}, parts: [] },
    full: o.full ? { window: [5, 6, 7, 8], level: 0, sha256: FULL } : null,
    thumb: o.thumb ? { window: [9, 9, 10, 10], level: 1, sha256: THUMB } : null,
  }) as unknown as DateEntry
const ENTRIES = [
  entry('2025-01-10', { full: true, thumb: true }),
  entry('2025-03-05', { full: true, thumb: true }), // not pinned
  entry('2025-06-15'),
  entry('2025-12-20', { full: true, thumb: true }),
]
const names = (xs: ReturnType<typeof framesToVerify>) =>
  xs.map((x) => [x.date, x.frames.map((f) => `${f.asset}${f.level}`)])

describe('framesToVerify', () => {
  it('sends SCL for every pinned date, the preview and, where the browser holds it, the full photo (spec 8.2)', () => {
    expect(names(framesToVerify(inv, ENTRIES))).toEqual([
      ['2025-01-10', ['scl0', 'visual1', 'visual0']],
      ['2025-06-15', ['scl0']],
      ['2025-12-20', ['scl0', 'visual1', 'visual0']],
    ])
  })

  it('sends the window and the hash the browser computed, and the item of the date', () => {
    const [first] = framesToVerify(inv, ENTRIES)
    expect(first!.item.id).toBe('S2_2025-01-10')
    expect(first!.frames).toEqual([
      { asset: 'scl', level: 0, window: [1, 2, 3, 4], sha256: SCL },
      { asset: 'visual', level: 1, window: [9, 9, 10, 10], sha256: THUMB },
      { asset: 'visual', level: 0, window: [5, 6, 7, 8], sha256: FULL },
    ])
  })

  it('skips dates that are not checked, have no quality, or whose window is empty (E26)', () => {
    const entries = [
      entry('2025-01-10', { status: 'queued' }),
      entry('2025-06-15', { window: [0, 0, 0, 0] }),
      { ...entry('2025-12-20'), quality: null } as DateEntry,
    ]
    expect(framesToVerify(inv, entries)).toEqual([])
    // counter-case: the same dates, checked and covered, are sent
    expect(framesToVerify(inv, [entry('2025-06-15')])).toHaveLength(1)
  })

  it('sends the full photo only for the before and after dates, even when another pinned date holds one (spec 8.2, 50 frames)', () => {
    // The mini map loads the full photo of whatever date the slider rests on (Workbench.tsx).
    const entries = [ENTRIES[0]!, ENTRIES[1]!, entry('2025-06-15', { full: true, thumb: true }), ENTRIES[3]!]
    expect(names(framesToVerify(inv, entries))).toEqual([
      ['2025-01-10', ['scl0', 'visual1', 'visual0']],
      ['2025-06-15', ['scl0', 'visual1']],
      ['2025-12-20', ['scl0', 'visual1', 'visual0']],
    ])
  })

  it('never sends more than three frames for a date (the handler takes four)', () => {
    for (const x of framesToVerify(inv, ENTRIES)) expect(x.frames.length).toBeLessThanOrEqual(3)
  })

  describe('frames already checked (E12)', () => {
    const record = (date: string, asset: 'scl' | 'visual', level: number, v: object) => ({
      [`${date}:${asset}:${level}`]: {
        status: 'verified' as const,
        verifiedAt: 'x',
        frameId: 'f',
        serverSha256: 'z'.repeat(64),
        clientSha256: asset === 'scl' ? SCL : level === 0 ? FULL : THUMB,
        itemId: `S2_${date}`,
        ...v,
      },
    })
    const withRecords = (...r: object[]) => setVerification(inv, Object.assign({}, ...r) as never, T)

    it('skips a verified frame of the same item with the same client hash, but checks a mismatch again', () => {
      const v = withRecords(
        record('2025-01-10', 'scl', 0, {}),
        record('2025-01-10', 'visual', 1, { status: 'mismatch' }),
      )
      expect(names(framesToVerify(v, ENTRIES))[0]).toEqual(['2025-01-10', ['visual1', 'visual0']])
    })
    it('omits a date with nothing left', () => {
      const v = withRecords(record('2025-06-15', 'scl', 0, {}))
      expect(names(framesToVerify(v, ENTRIES)).map(([d]) => d)).toEqual(['2025-01-10', '2025-12-20'])
    })
    it('sends a frame again when its pixels changed or another item took the date', () => {
      const changed = withRecords(record('2025-06-15', 'scl', 0, { clientSha256: 'x'.repeat(64) }))
      expect(names(framesToVerify(changed, ENTRIES)).map(([d]) => d)).toContain('2025-06-15')
      const otherItem = withRecords(record('2025-06-15', 'scl', 0, { itemId: 'S2_OTHER' }))
      expect(names(framesToVerify(otherItem, ENTRIES)).map(([d]) => d)).toContain('2025-06-15')
    })
  })
})

const okFor = (b: VerifyBody, patch: object = {}): VerifyResult => ({
  ok: true,
  frames: b.frames.map((f) => ({
    asset: f.asset,
    level: f.level,
    status: 'verified' as const,
    server_sha256: `srv-${f.asset}${f.level}`,
    frame_id: `id-${f.asset}${f.level}`,
    verified_at: '2026-10-05T10:00:00Z',
    quality: null,
    ...patch,
  })),
})
const deps = (over: Partial<SaveDeps> = {}): SaveDeps => ({
  saveInvestigation: async () => 'srv-1',
  replaceNotes: async () => {},
  verify: async (b) => okFor(b),
  sleep: async () => {},
  ...over,
})
const run = (d: SaveDeps, i = inv, onSaved?: (id: string) => void) =>
  saveAndVerify(d, i, ENTRIES, () => {}, onSaved)

describe('saveAndVerify', () => {
  it('saves, replaces the notes, verifies each pinned date and reports progress', async () => {
    const progress: Array<[number, number]> = []
    const d = deps({
      saveInvestigation: vi.fn().mockResolvedValue('srv-1'),
      replaceNotes: vi.fn().mockResolvedValue(undefined),
      verify: vi.fn(async (b: VerifyBody) => okFor(b)),
    })
    const out = await saveAndVerify(d, inv, ENTRIES, (p) => progress.push([p.done, p.total]))
    expect(out).toMatchObject({ serverId: 'srv-1', verified: 7, mismatched: 0, failed: 0, stoppedBy: null })
    expect(d.replaceNotes).toHaveBeenCalledWith('srv-1', inv.notes, undefined)
    expect(out.noteIds).toEqual(inv.notes.map((n) => n.id))
    expect(progress[0]).toEqual([0, 3])
    expect(progress.at(-1)).toEqual([3, 3])
    const sent = vi.mocked(d.verify).mock.calls.map(([b]) => b)
    expect(sent.map((b) => [b.investigation_id, b.item.id, b.item.collection])).toEqual([
      ['srv-1', 'S2_2025-01-10', 'sentinel-2-l2a'],
      ['srv-1', 'S2_2025-06-15', 'sentinel-2-l2a'],
      ['srv-1', 'S2_2025-12-20', 'sentinel-2-l2a'],
    ])
  })

  it('tells replaceNotes which notes this copy last synced, but only for the row it was synced with', async () => {
    const synced = { ...inv, serverId: 'srv-1', serverNoteIds: ['a', 'b'] }
    const same = deps({ replaceNotes: vi.fn(async () => {}) })
    await run(same, synced)
    expect(same.replaceNotes).toHaveBeenCalledWith('srv-1', synced.notes, ['a', 'b'])
    // saved as a new row (the old one was deleted elsewhere): nothing of this copy is known there, so nothing may be deleted
    const moved = deps({ saveInvestigation: async () => 'srv-2', replaceNotes: vi.fn(async () => {}) })
    await run(moved, synced)
    expect(moved.replaceNotes).toHaveBeenCalledWith('srv-2', synced.notes, undefined)
  })

  it('records the item and the hash that was sent, next to what the server answered', async () => {
    const out = await run(deps())
    expect(out.verification['2025-01-10:visual:0']).toEqual({
      status: 'verified',
      verifiedAt: '2026-10-05T10:00:00Z',
      frameId: 'id-visual0',
      serverSha256: 'srv-visual0',
      clientSha256: FULL,
      itemId: 'S2_2025-01-10',
    })
    expect(out.verification['2025-01-10:visual:1']).toMatchObject({ clientSha256: THUMB })
    expect(out.verification['2025-06-15:scl:0']).toMatchObject({ clientSha256: SCL })
  })

  it('counts a mismatch as a result, not a failure', async () => {
    const out = await run(deps({ verify: async (b) => okFor(b, { status: 'mismatch' }) }))
    expect(out).toMatchObject({ mismatched: 7, verified: 0, failed: 0, stoppedBy: null })
    expect(out.verification['2025-12-20:scl:0']!.status).toBe('mismatch')
  })

  it('tells the caller the server id right after the first save, before the notes (E6)', async () => {
    const calls: string[] = []
    const onSaved = (id: string) => calls.push(`saved:${id}`)
    await run(
      deps({
        saveInvestigation: async () => (calls.push('save'), 'srv-1'),
        replaceNotes: async () => void calls.push('notes'),
        verify: async (b) => (calls.push('verify'), okFor(b)),
      }),
      inv,
      onSaved,
    )
    expect(calls.slice(0, 3)).toEqual(['save', 'saved:srv-1', 'notes'])
  })

  it('keeps the server id when the notes step fails, and the failure reaches the caller (E6)', async () => {
    const onSaved = vi.fn()
    const d = deps({
      replaceNotes: async () => {
        throw new Error('NOTES_FAILED')
      },
      verify: vi.fn(async (b: VerifyBody) => okFor(b)),
    })
    await expect(run(d, inv, onSaved)).rejects.toThrow('NOTES_FAILED')
    expect(onSaved).toHaveBeenCalledWith('srv-1')
    expect(d.verify).not.toHaveBeenCalled()
  })

  it('lets an expired session from the save steps through as SessionExpiredError (E8)', async () => {
    const expired = deps({
      saveInvestigation: async () => {
        throw new SessionExpiredError()
      },
    })
    await expect(run(expired)).rejects.toBeInstanceOf(SessionExpiredError)
    const onSaved = vi.fn()
    const notes = deps({
      replaceNotes: async () => {
        throw new SessionExpiredError()
      },
    })
    await expect(run(notes, inv, onSaved)).rejects.toBeInstanceOf(SessionExpiredError)
    expect(onSaved).toHaveBeenCalledWith('srv-1')
  })

  describe('answers that are not OK', () => {
    const answer = (status: number, error: string, when = (b: VerifyBody) => b.item.id === 'S2_2025-06-15') =>
      vi.fn(async (b: VerifyBody): Promise<VerifyResult> =>
        when(b) ? { ok: false, status, error } : okFor(b),
      )
    const calls = (verify: ReturnType<typeof answer>, id: string) =>
      verify.mock.calls.filter(([b]) => b.item.id === id).length

    it('retries a 502 three times with 1 s and 3 s waits, then counts the date as failed and goes on', async () => {
      const sleep = vi.fn(async () => {})
      const verify = answer(502, 'UPSTREAM')
      const out = await run(deps({ verify, sleep }))
      expect(calls(verify, 'S2_2025-06-15')).toBe(3)
      expect(sleep.mock.calls).toEqual([[1000], [3000]])
      expect(out).toMatchObject({ verified: 6, failed: 1, stoppedBy: null })
    })

    it('retries 503 and 504 too, and a retry that works is a success', async () => {
      for (const status of [503, 504]) {
        let n = 0
        const verify = vi.fn(async (b: VerifyBody): Promise<VerifyResult> => {
          if (b.item.id === 'S2_2025-06-15' && n++ < 2) return { ok: false, status, error: 'UNAVAILABLE' }
          return okFor(b)
        })
        const out = await run(deps({ verify }))
        expect(out, String(status)).toMatchObject({ verified: 7, failed: 0 })
      }
    })

    it('stops at the daily limit (429) and keeps what was verified', async () => {
      const verify = answer(429, 'RATE_LIMITED', (b) => b.item.id === 'S2_2025-12-20')
      const out = await run(deps({ verify }))
      expect(out.stoppedBy).toBe('RATE_LIMITED')
      expect(Object.keys(out.verification)).toContain('2025-01-10:scl:0')
      expect(Object.keys(out.verification).some((k) => k.startsWith('2025-12-20'))).toBe(false)
      expect(calls(verify, 'S2_2025-12-20')).toBe(1)
    })

    it('stops at the 50-frame cap (422 GS:LIMIT_FRAMES): no later date repeats the failure', async () => {
      const verify = answer(422, 'GS:LIMIT_FRAMES', (b) => b.item.id === 'S2_2025-06-15')
      const out = await run(deps({ verify }))
      expect(out).toMatchObject({ stoppedBy: 'FRAME_LIMIT', verified: 3, failed: 0 })
      expect(calls(verify, 'S2_2025-12-20')).toBe(0)
      expect(calls(verify, 'S2_2025-06-15')).toBe(1)
    })

    it('counts any other refusal as a failed date without retrying, and goes on', async () => {
      for (const [status, error] of [
        [422, 'NOT_PINNED'],
        [422, 'BAD_WINDOW'],
        [422, 'GS:SOMETHING_ELSE'],
        [404, 'ITEM_NOT_FOUND'],
        [400, 'BAD_REQUEST'],
        [500, 'INTERNAL'],
      ] as const) {
        const verify = answer(status, error)
        const out = await run(deps({ verify }))
        expect(out, error).toMatchObject({ failed: 1, verified: 6, stoppedBy: null })
        expect(calls(verify, 'S2_2025-06-15'), error).toBe(1)
      }
    })

    it('stops when the session has expired (401), keeping what was verified, without retrying (E8)', async () => {
      const verify = answer(401, 'UNAUTHORIZED', (b) => b.item.id === 'S2_2025-06-15')
      const out = await run(deps({ verify }))
      expect(out).toMatchObject({ stoppedBy: 'SESSION_EXPIRED', verified: 3, failed: 0 })
      expect(calls(verify, 'S2_2025-06-15')).toBe(1)
      expect(calls(verify, 'S2_2025-12-20')).toBe(0)
    })
  })

  describe('a save resumes', () => {
    it('sends nothing again for frames already recorded for the same item and pixels (E12)', async () => {
      const first = await run(deps())
      const saved = setVerification({ ...inv, serverId: 'srv-1' }, first.verification, T)
      const verify = vi.fn(async (b: VerifyBody) => okFor(b))
      const again = await run(deps({ verify }), saved)
      expect(verify).not.toHaveBeenCalled()
      expect(again).toMatchObject({ serverId: 'srv-1', verified: 0, failed: 0, stoppedBy: null })
    })

    it('verifies everything again when the save lands on another server row (deleted elsewhere)', async () => {
      const first = await run(deps())
      const saved = setVerification({ ...inv, serverId: 'srv-OLD' }, first.verification, T)
      const verify = vi.fn(async (b: VerifyBody) => okFor(b))
      const again = await run(deps({ verify, saveInvestigation: async () => 'srv-NEW' }), saved)
      expect(again).toMatchObject({ serverId: 'srv-NEW', verified: 7 })
      expect(verify).toHaveBeenCalledTimes(3)
    })
  })
})
