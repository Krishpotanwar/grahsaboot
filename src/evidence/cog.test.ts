import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levelInfoFor, openCogBuffer, openCogUrl } from './cog.ts'
import { sha256Hex } from './frame.ts'
import type { Window } from './types.ts'
import { TCI_SHAPE, TCI_TRANSFORM, makeTci, tciPixel, toArrayBuffer } from '../../tests/fixtures/scene.ts'
import { startFixtureServer } from '../../tests/fixtures/server.ts'
import { writeTiledTiff } from '../../tests/fixtures/tiff.ts'

const ASSET = { transform: TCI_TRANSFORM, shape: TCI_SHAPE }

/** A square RGB file, one level per entry of `sides`. Its bytes depend on their position: a misplaced block changes the hash. */
function rgbTiff(sides: number[], tile: number): Uint8Array {
  const levels = sides.map((side) => {
    const data = new Uint8Array(side * side * 3)
    for (let i = 0; i < data.length; i++) data[i] = (i * 7 + (i >> 9)) & 255
    return { width: side, height: side, samples: 3 as const, tile, data }
  })
  return writeTiledTiff(levels, { epsg: 32644, originX: 300000, originY: 2341000, resX: 10, resY: 10 })
}

/** One file over HTTP with range support; `ranges` keeps the Range header of every request it gets. */
async function serveRanges(file: Uint8Array) {
  const ranges: string[] = []
  const server = createServer((req, res) => {
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
    if (!m) return void res.writeHead(416).end()
    ranges.push(req.headers.range!)
    const start = Number(m[1])
    const end = Math.min(Number(m[2]), file.length - 1)
    res.writeHead(206, {
      'content-range': `bytes ${start}-${end}/${file.length}`,
      'content-length': end - start + 1,
    })
    res.end(file.subarray(start, end + 1))
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/file.tif`,
    ranges,
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  }
}

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
  it('rejects a NaN shape: NaN must not slip past the size comparison', async () => {
    const cog = await openCogBuffer(toArrayBuffer(makeTci(false)))
    expect(() => levelInfoFor({ transform: TCI_TRANSFORM, shape: [256, NaN] }, cog, 0)).toThrow('COG_LAYOUT')
    expect(() => levelInfoFor({ transform: TCI_TRANSFORM, shape: [NaN, 256] }, cog, 0)).toThrow('COG_LAYOUT')
  })
  it('reads identical bytes over HTTP range requests', async () => {
    const local = await openCogBuffer(toArrayBuffer(makeTci(true)))
    const remote = await openCogUrl(`${srv.url}/cog/2025-12-20/TCI.tif`)
    const win: [number, number, number, number] = [92, 94, 203, 211]
    expect(await sha256Hex(await remote.read(0, win, [0, 1, 2]))).toBe(
      await sha256Hex(await local.read(0, win, [0, 1, 2])),
    )
  })
  it('opens a file and reads one window in at most 3 range requests', async () => {
    // Four 16 KB blocks: the header, the directories and the window take one request each (the bare reader needs 8).
    const srv = await serveRanges(rgbTiff([128, 64], 64))
    try {
      const cog = await openCogUrl(srv.url)
      const bytes = await cog.read(0, [16, 16, 112, 112], [0, 1, 2])
      expect(bytes.length).toBe(96 * 96 * 3)
      expect(srv.ranges.length).toBeLessThanOrEqual(3)
    } finally {
      await srv.close()
    }
  })
  it('reads a window larger than the block cache to the same bytes as a local read', async () => {
    // 2560 x 2560 RGB is 19.7 MB, more than the cache keeps (two generations of 512 blocks of 16 KB):
    // blocks are evicted mid-read.
    const file = rgbTiff([2560], 512)
    const win: Window = [0, 0, 2560, 2560]
    const srv = await serveRanges(file)
    try {
      const remote = await openCogUrl(srv.url)
      const local = await openCogBuffer(toArrayBuffer(file))
      expect(await sha256Hex(await remote.read(0, win, [0, 1, 2]))).toBe(
        await sha256Hex(await local.read(0, win, [0, 1, 2])),
      )
    } finally {
      await srv.close()
    }
  })
})
