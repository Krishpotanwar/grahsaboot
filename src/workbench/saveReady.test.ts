import { describe, expect, it } from 'vitest'
import { saveWait } from './saveReady.ts'
import type { DateEntry, EntryStatus } from './runner.ts'

// What a save needs to have in the page before it can send everything it can (E7). Null is "ready".
const entry = (
  date: string,
  {
    label = 'CLEAR',
    status = 'checked',
    thumb = true,
    thumbFailed = false,
    full = false,
    error = null,
  }: {
    label?: 'CLEAR' | 'PARTIAL' | 'OBSCURED' | null
    status?: EntryStatus
    thumb?: boolean
    thumbFailed?: boolean
    full?: boolean
    error?: string | null
  } = {},
): DateEntry =>
  ({
    date,
    status,
    error,
    thumbFailed,
    quality: label ? { stats: { label } } : null,
    thumb: thumb ? {} : null,
    full: full ? {} : null,
  }) as unknown as DateEntry

const by = (entries: DateEntry[]) => new Map(entries.map((e) => [e.date, e]))
const inv = { pinned: ['2025-01-10', '2025-06-15', '2025-12-20'], before: '2025-01-10', after: '2025-12-20' }
const ready = [entry('2025-01-10', { full: true }), entry('2025-06-15'), entry('2025-12-20', { full: true })]

describe('saveWait', () => {
  it('is null when every pinned date is checked, has its preview, and before and after have their photos', () => {
    expect(saveWait(inv, by(ready), true)).toBeNull()
  })

  it('waits for the search to finish, unless every pinned date already has its entry', () => {
    const early = [ready[0]!, ready[2]!] // the 15 Jun pass has not been found yet
    expect(saveWait(inv, by(early), false)).toBe('checks')
    // counter-case: the search is over and that date is simply not there: nothing to wait for
    expect(saveWait(inv, by(early), true)).toBeNull()
    // counter-case: every pinned date is in, the rest of the range is still being searched
    expect(saveWait(inv, by(ready), false)).toBeNull()
  })

  it('waits for a pinned date that is queued or being checked, not for one whose check failed', () => {
    for (const status of ['queued', 'checking'] as const)
      expect(
        saveWait(
          inv,
          by([ready[0]!, entry('2025-06-15', { status, label: null, thumb: false }), ready[2]!]),
          true,
        ),
      ).toBe('checks')
    const failed = entry('2025-06-15', { status: 'error', label: null, thumb: false, error: 'SCL_500' })
    expect(saveWait(inv, by([ready[0]!, failed, ready[2]!]), true)).toBeNull()
  })

  it('waits for the preview of a usable pinned date, not for an unusable one or one whose preview failed', () => {
    const none = entry('2025-06-15', { thumb: false })
    expect(saveWait(inv, by([ready[0]!, none, ready[2]!]), true)).toBe('photos')
    expect(
      saveWait(
        inv,
        by([ready[0]!, entry('2025-06-15', { label: 'PARTIAL', thumb: false }), ready[2]!]),
        true,
      ),
    ).toBe('photos')
    expect(
      saveWait(
        inv,
        by([ready[0]!, entry('2025-06-15', { label: 'OBSCURED', thumb: false }), ready[2]!]),
        true,
      ),
    ).toBeNull()
    expect(
      saveWait(
        inv,
        by([ready[0]!, entry('2025-06-15', { thumb: false, thumbFailed: true }), ready[2]!]),
        true,
      ),
    ).toBeNull()
  })

  it('waits for the full photo of before and after, unless that failed', () => {
    const noFull = entry('2025-12-20')
    expect(saveWait(inv, by([ready[0]!, ready[1]!, noFull]), true)).toBe('photos')
    const failed = entry('2025-12-20', { error: 'TCI_500' })
    expect(saveWait(inv, by([ready[0]!, ready[1]!, failed]), true)).toBeNull()
    // the middle date needs no full photo
    expect(saveWait(inv, by(ready), true)).toBeNull()
  })

  it('names the checks first when both are missing', () => {
    const rows = [
      entry('2025-01-10'),
      entry('2025-06-15', { status: 'queued', label: null, thumb: false }),
      ready[2]!,
    ]
    expect(saveWait(inv, by(rows), true)).toBe('checks')
  })

  it('waits for the pair while the search runs, and has nothing to wait for with no dates pinned once it is over', () => {
    expect(saveWait({ pinned: [], before: null, after: null }, by([]), true)).toBeNull()
    // while the search runs the pair is still to come; an all-cloudy range ends with no pair and may still save the outline
    expect(saveWait({ pinned: [], before: null, after: null }, by([]), false)).toBe('checks')
  })
})
