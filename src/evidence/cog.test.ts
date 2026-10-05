import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levelInfoFor, openCogBuffer, openCogUrl } from './cog.ts'
import { sha256Hex } from './frame.ts'
import { TCI_SHAPE, TCI_TRANSFORM, makeTci, tciPixel, toArrayBuffer } from '../../tests/fixtures/scene.ts'
import { startFixtureServer } from '../../tests/fixtures/server.ts'

const ASSET = { transform: TCI_TRANSFORM, shape: TCI_SHAPE }

describe('cog', () => {
  let srv: { url: string; close(): Promise<void> }
  beforeAll(async () => {
    srv = await startFixtureServer(0)
  })
  afterAll(async () => {
    await srv.close()
  })

  it('exposes level sizes and reads an exact window', async () => {
    const cog = await openCogBuffer(toArrayBuffer(makeTci(false)))
    expect(cog.sizes).toEqual([
      { width: 256, height: 256 },
      { width: 128, height: 128 },
    ])
    const bytes = await cog.read(0, [92, 94, 203, 211], [0, 1, 2])
    expect(bytes.length).toBe(111 * 117 * 3)
    expect([...bytes.subarray(0, 3)]).toEqual(tciPixel(92, 94, false))
  })
  it('derives level geometry from STAC transform plus real sizes', async () => {
    const cog = await openCogBuffer(toArrayBuffer(makeTci(false)))
    expect(levelInfoFor(ASSET, cog, 0)).toMatchObject({
      originX: 300000,
      originY: 2341000,
      resX: 10,
      resY: 10,
    })
    expect(levelInfoFor(ASSET, cog, 1).resX).toBe(20)
    expect(() => levelInfoFor({ transform: TCI_TRANSFORM, shape: [1000, 1000] }, cog, 1)).toThrow(
      'COG_LAYOUT',
    )
    expect(() => levelInfoFor(ASSET, cog, 3)).toThrow('NO_LEVEL:3')
  })
  it('rejects a pyramid whose height is not 2x per level', async () => {
    const cog = await openCogBuffer(toArrayBuffer(makeTci(false)))
    expect(() => levelInfoFor({ transform: TCI_TRANSFORM, shape: [1000, 256] }, cog, 1)).toThrow('COG_LAYOUT')
  })
  it('reads identical bytes over HTTP range requests', async () => {
    const local = await openCogBuffer(toArrayBuffer(makeTci(true)))
    const remote = await openCogUrl(`${srv.url}/cog/2025-12-20/TCI.tif`)
    const win: [number, number, number, number] = [92, 94, 203, 211]
    expect(await sha256Hex(await remote.read(0, win, [0, 1, 2]))).toBe(
      await sha256Hex(await local.read(0, win, [0, 1, 2])),
    )
  })
})
