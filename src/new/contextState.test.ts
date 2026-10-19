import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContextImage, ContextResult } from '../context/load.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import {
  CHOICE_KEY,
  COST_MB,
  nowFromUrl,
  OFF,
  readChoice,
  runLoad,
  viewOf,
  writeChoice,
  type Stage,
  type View,
} from './contextState.ts'

const image = (over: Partial<ContextImage> = {}): ContextImage => ({
  rgba: new Uint8ClampedArray(4),
  grid: makeDisplayGrid([79.08, 21.14, 79.1, 21.15], 8, 0),
  sceneId: 'S2B_44QKJ_20251220_0_L2A',
  date: '2025-12-20',
  ageDays: 10,
  clearPct: 100,
  cloudy: false,
  widened: false,
  ...over,
})

describe('viewOf: what the person is told for each way a load ends', () => {
  it('a clear picture is shown as it is', () => {
    const img = image()
    expect(viewOf({ ok: true, image: img })).toEqual({ s: 'on', image: img, cloudy: false })
  })

  it('a cloudy picture is still shown, flagged', () => {
    const img = image({ clearPct: 62, cloudy: true })
    expect(viewOf({ ok: false, reason: 'ALL_CLOUDY', image: img })).toEqual({
      s: 'on',
      image: img,
      cloudy: true,
    })
  })

  it('nothing in range, no connection and every other failure are three different lines', () => {
    expect(viewOf({ ok: false, reason: 'NO_SCENES' })).toEqual({ s: 'none' })
    expect(viewOf({ ok: false, reason: 'OFFLINE' })).toEqual({ s: 'fail', offline: true })
    expect(viewOf({ ok: false, reason: 'FAILED' })).toEqual({ s: 'fail', offline: false })
  })

  it('an abort shows nothing', () => {
    expect(viewOf({ ok: false, reason: 'ABORTED' })).toEqual(OFF)
  })
})

describe('runLoad: only the load that is still wanted may change what is shown', () => {
  const calls = () => {
    const log: Array<Stage | View> = []
    return { log, on: { stage: (s: Stage) => log.push(s), done: (v: View) => log.push(v) } }
  }
  const ok: ContextResult = { ok: true, image: image() }

  it('passes the stage words on, in order, then the result', async () => {
    const { log, on } = calls()
    await runLoad(
      async (onStage) => {
        onStage('searching')
        onStage('checking')
        onStage('reading')
        return ok
      },
      new AbortController().signal,
      on,
    )
    expect(log).toEqual(['searching', 'checking', 'reading', viewOf(ok)])
  })

  it('ignores a result that arrives after the abort, even a good one', async () => {
    const { log, on } = calls()
    const ac = new AbortController()
    let late!: (r: ContextResult) => void
    const run = runLoad(() => new Promise<ContextResult>((r) => (late = r)), ac.signal, on)
    ac.abort()
    late(ok)
    await run
    expect(log).toEqual([])
  })

  it('ignores a stage word that arrives after the abort', async () => {
    const { log, on } = calls()
    const ac = new AbortController()
    await runLoad(
      async (onStage) => {
        onStage('searching')
        ac.abort()
        onStage('checking')
        onStage('reading')
        return ok
      },
      ac.signal,
      on,
    )
    expect(log).toEqual(['searching'])
  })

  it('turns a load that throws into a failure line, never a spinner', async () => {
    const { log, on } = calls()
    await runLoad(() => Promise.reject(new Error('boom')), new AbortController().signal, on)
    expect(log).toEqual([{ s: 'fail', offline: false }])
  })

  it('shows nothing for an ABORTED result of a load that is still wanted', async () => {
    const { log, on } = calls()
    await runLoad(async () => ({ ok: false, reason: 'ABORTED' }), new AbortController().signal, on)
    expect(log).toEqual([OFF])
  })
})

describe('the remembered choice', () => {
  afterEach(() => vi.unstubAllGlobals())
  const store = (initial: Record<string, string> = {}) => {
    const data = { ...initial }
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => void (data[k] = v),
    }
  }

  it('is Map unless the person chose Satellite', () => {
    vi.stubGlobal('localStorage', store())
    expect(readChoice()).toBe('map')
    vi.stubGlobal('localStorage', store({ [CHOICE_KEY]: 'satellite' }))
    expect(readChoice()).toBe('satellite')
    for (const junk of ['', 'Satellite', 'on', '1', 'map']) {
      vi.stubGlobal('localStorage', store({ [CHOICE_KEY]: junk }))
      expect(readChoice(), junk).toBe('map')
    }
  })

  it('is written under gs-context-view', () => {
    const s = store()
    vi.stubGlobal('localStorage', s)
    writeChoice('satellite')
    expect(s.data).toEqual({ 'gs-context-view': 'satellite' })
    writeChoice('map')
    expect(s.data['gs-context-view']).toBe('map')
  })

  it('is never required: storage that throws or is missing changes nothing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    vi.stubGlobal('localStorage', broken)
    expect(readChoice()).toBe('map')
    expect(() => writeChoice('satellite')).not.toThrow()
    vi.unstubAllGlobals() // no localStorage at all (node): reading it is a ReferenceError
    expect(readChoice()).toBe('map')
    expect(() => writeChoice('map')).not.toThrow()
  })
})

describe('nowFromUrl: the clock the tests set, in test builds only', () => {
  it('reads ?now=YYYY-MM-DD as midnight UTC', () => {
    expect(nowFromUrl('?tier=2&now=2025-12-31', true)?.toISOString()).toBe('2025-12-31T00:00:00.000Z')
  })

  it('is ignored when the build is not a test build', () => {
    expect(nowFromUrl('?now=2025-12-31', false)).toBeUndefined()
  })

  it('ignores anything that is not a real date', () => {
    for (const q of [
      '',
      '?now=',
      '?now=tomorrow',
      '?now=2025-13-01',
      '?now=2025-02-30',
      '?now=20251231',
      '?now=2025-12-31T10:00',
    ])
      expect(nowFromUrl(q, true), q).toBeUndefined()
  })
})

describe('the cost shown on the Satellite option', () => {
  it('is a whole number of megabytes', () => {
    expect(Number.isInteger(COST_MB) && COST_MB > 0).toBe(true)
  })

  it('stays inside what the six measured loads cost (2.6 to 8.0 MB) and is not below their median', () => {
    expect(COST_MB).toBeGreaterThanOrEqual(4.1) // the label asks for metered data: it must not understate
    expect(COST_MB).toBeLessThanOrEqual(8)
  })
})
