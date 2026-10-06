import { describe, expect, it, vi } from 'vitest'
import { createNominatim } from './nominatim.ts'

const ROW = {
  display_name: 'Nagpur, Maharashtra, India',
  lat: '21.1458',
  lon: '79.0882',
  boundingbox: ['20.9', '21.3', '78.9', '79.3'],
}
const ok = (rows: unknown[]) => new Response(JSON.stringify(rows), { status: 200 })

describe('nominatim', () => {
  it('parses results into places with [w,s,e,n] bboxes', async () => {
    const n = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockResolvedValue(ok([ROW])),
      sleep: async () => {},
    })
    expect(await n.search('Nagpur')).toEqual([
      { name: 'Nagpur, Maharashtra, India', lat: 21.1458, lon: 79.0882, bbox: [78.9, 20.9, 79.3, 21.3] },
    ])
  })
  it('caches repeated queries (case and space insensitive)', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok([ROW]))
    const n = createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} })
    await n.search('Nagpur')
    await n.search('  nagpur ')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('waits so requests are at least 1 s apart', async () => {
    let t = 1000
    const waits: number[] = []
    const n = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockImplementation(async () => ok([])),
      now: () => t,
      sleep: async (ms) => {
        waits.push(ms)
        t += ms
      },
    })
    await n.search('a')
    t += 200
    await n.search('b')
    expect(waits).toEqual([800])
  })
  it('throws on HTTP errors and drops malformed rows', async () => {
    const bad = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
      sleep: async () => {},
    })
    await expect(bad.search('x')).rejects.toThrow('NOMINATIM_503')
    const odd = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockResolvedValue(ok([{ display_name: 1 }, ROW])),
      sleep: async () => {},
    })
    expect(await odd.search('y')).toHaveLength(1)
  })
  it('sends the query encoded and asks for English names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]))
    await createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} }).search(
      'Sitabuldi & Fort',
    )
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://x/search?format=jsonv2&limit=5&q=Sitabuldi%20%26%20Fort',
    )
    expect(fetchImpl.mock.calls[0]![1].headers['Accept-Language']).toBe('en')
  })
})
