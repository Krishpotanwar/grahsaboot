import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'

// The worker entry runs at import: it wants a `self` to hang its handler on, and IndexedDB for its byte cache, which Node has not.
vi.mock('../lib/byte-cache.ts', () => ({
  idbByteCache: () => ({ get: async () => undefined, put: async () => undefined }),
}))
// quality and frame need a scene file: stand in for them with answers of their shapes, to see what goes back with them.
const answers = vi.hoisted(() => ({
  quality: { invalid: new Uint8Array(4) as Uint8Array | undefined },
  frame: { native: { rgb: new Uint8Array(6) }, display: { rgba: new Uint8ClampedArray(8) } },
}))
vi.mock('./imagery-core.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./imagery-core.ts')>()),
  runQuality: async () => answers.quality,
  runFrame: async () => answers.frame,
}))

const posted: Array<{ msg: any; transfer?: Transferable[] }> = []
const scope: {
  onmessage?: (e: MessageEvent) => Promise<void>
  postMessage: (m: unknown, t?: Transferable[]) => void
} = {
  postMessage: (msg, transfer) => posted.push({ msg, transfer }),
}
const send = (data: unknown) => scope.onmessage!({ data } as MessageEvent)

const GRID = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 64)
const n = GRID.width * GRID.height
const picture = () => ({ rgba: new Uint8ClampedArray(n * 4).fill(100) })

beforeAll(async () => {
  vi.stubGlobal('self', scope)
  await import('./imagery.worker.ts')
})
afterAll(() => vi.unstubAllGlobals())

describe('the imagery worker: the change request', () => {
  it('answers with the result of the change rule, which holds no buffer to transfer back', async () => {
    await send({ id: 7, op: 'change', req: { first: picture(), last: picture(), grid: GRID } })
    expect(posted).toHaveLength(1)
    expect(posted[0]!.msg).toMatchObject({
      id: 7,
      ok: true,
      result: { state: 'nothing', recipe: 'change-v1' },
    })
    expect(posted[0]!.transfer).toEqual([])
  })
  it('answers a request whose pictures do not fit the grid with the error, under the same id', async () => {
    posted.length = 0
    await send({
      id: 8,
      op: 'change',
      req: { first: picture(), last: { rgba: new Uint8ClampedArray(8) }, grid: GRID },
    })
    expect(posted).toHaveLength(1)
    expect(posted[0]!.msg).toEqual({ id: 8, ok: false, error: { name: 'Error', message: 'SIZE_MISMATCH' } })
  })
  it('says nothing for a cancel', async () => {
    posted.length = 0
    await send({ id: 0, op: 'cancel', target: 7 })
    expect(posted).toEqual([])
  })
})

describe('the imagery worker: what goes back with each answer', () => {
  it('transfers the cloud marks of a quality answer, and nothing when it has none', async () => {
    posted.length = 0
    await send({ id: 1, op: 'quality', req: {} })
    expect(posted[0]!.transfer).toEqual([answers.quality.invalid!.buffer])
    posted.length = 0
    answers.quality.invalid = undefined
    await send({ id: 2, op: 'quality', req: {} })
    expect(posted[0]!.transfer).toEqual([])
  })
  it('transfers both pictures of a frame answer', async () => {
    posted.length = 0
    await send({ id: 3, op: 'frame', req: {} })
    expect(posted[0]!.transfer).toEqual([answers.frame.native.rgb.buffer, answers.frame.display.rgba.buffer])
  })
})
