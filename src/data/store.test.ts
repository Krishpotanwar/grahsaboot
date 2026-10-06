import { describe, expect, it } from 'vitest'
import { memoryStore } from './store.ts'
import { newInvestigation } from './investigation.ts'

const inv = (n: number, t: string) =>
  newInvestigation(
    {
      name: `I${n}`,
      aoi: {
        kind: 'road',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [0, 0.01],
          ],
        },
        widthM: 30,
      },
      dateFrom: '2025-01-01',
      dateTo: '2025-02-01',
    },
    new Date(t),
    `00000000-0000-4000-8000-00000000000${n}`,
  )

describe('memoryStore', () => {
  it('round-trips copies and lists newest first', async () => {
    const s = memoryStore()
    const a = inv(1, '2026-01-01T00:00:00Z'),
      b = inv(2, '2026-02-01T00:00:00Z')
    await s.put(a)
    await s.put(b)
    expect((await s.list()).map((x) => x.name)).toEqual(['I2', 'I1'])
    const got = await s.get(a.id)
    got!.name = 'mutated'
    expect((await s.get(a.id))!.name).toBe('I1')
    await s.remove(a.id)
    expect(await s.get(a.id)).toBeUndefined()
  })
})
