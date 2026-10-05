import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fromArrayBuffer } from 'geotiff'
import { FIXTURE_DATES, makeScl, makeTci, tciPixel, toArrayBuffer } from '../fixtures/scene.ts'
import { startFixtureServer } from '../fixtures/server.ts'

describe('tiled TIFF fixtures', () => {
  it('writes a two-level georeferenced TCI readable by geotiff', async () => {
    const tiff = await fromArrayBuffer(toArrayBuffer(makeTci(true)))
    expect(await tiff.getImageCount()).toBe(2)
    const im0 = await tiff.getImage(0)
    expect([im0.getWidth(), im0.getHeight(), im0.getSamplesPerPixel()]).toEqual([256, 256, 3])
    expect(im0.getOrigin().slice(0, 2)).toEqual([300000, 2341000])
    expect(im0.getResolution().slice(0, 2)).toEqual([10, -10])
    const px = (await im0.readRasters({ window: [150, 150, 151, 151], interleave: true })) as Uint8Array
    expect([...px]).toEqual(tciPixel(150, 150, true))
    const im1 = await tiff.getImage(1)
    expect([im1.getWidth(), im1.getHeight()]).toEqual([128, 128])
  })
  it('writes a single-level SCL with the class function', async () => {
    const tiff = await fromArrayBuffer(toArrayBuffer(makeScl(FIXTURE_DATES[1]!.scl)))
    const im = await tiff.getImage(0)
    const v = (await im.readRasters({ window: [80, 60, 81, 61], interleave: true })) as Uint8Array
    expect(v[0]).toBe(8)
  })
})

describe('fixture server', () => {
  let srv: { url: string; close(): Promise<void> }
  beforeAll(async () => {
    srv = await startFixtureServer(0)
  })
  afterAll(async () => {
    await srv.close()
  })

  it('answers STAC searches filtered by date', async () => {
    const r = await fetch(`${srv.url}/stac/search`, {
      method: 'POST',
      body: JSON.stringify({ datetime: '2025-01-01T00:00:00Z/2025-06-30T23:59:59Z' }),
    })
    const j = await r.json()
    expect(j.features.map((f: { id: string }) => f.id)).toEqual([
      'S2B_44QKJ_20250110_0_L2A',
      'S2B_44QKJ_20250305_0_L2A',
      'S2B_44QKJ_20250615_0_L2A',
    ])
  })
  it('serves byte ranges with CORS like S3', async () => {
    const r = await fetch(`${srv.url}/cog/2025-01-10/TCI.tif`, { headers: { Range: 'bytes=0-7' } })
    expect(r.status).toBe(206)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
    expect([...new Uint8Array(await r.arrayBuffer())].slice(0, 4)).toEqual([0x49, 0x49, 42, 0])
  })
})
