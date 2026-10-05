import { describe, expect, it } from 'vitest'
import { parseCoordinates } from './coords.ts'

describe('parseCoordinates', () => {
  it.each([
    ['21.1458, 79.0882', 21.1458, 79.0882],
    ['21.1458 79.0882', 21.1458, 79.0882],
    ['21.1458,79.0882', 21.1458, 79.0882],
    ['21.1458°N 79.0882°E', 21.1458, 79.0882],
    ['33.86 S, 151.21 E', -33.86, 151.21],
    ['-0.5, -78.5', -0.5, -78.5],
    ['https://www.google.com/maps/@21.1458,79.0882,15z', 21.1458, 79.0882],
    ['https://maps.google.com/?q=21.1458,79.0882', 21.1458, 79.0882],
  ])('parses %s', (input, lat, lon) => {
    expect(parseCoordinates(input)).toEqual({ lat, lon, swappedHint: false })
  })

  it('flags a probable lon/lat swap for India-shaped input', () => {
    expect(parseCoordinates('79.0882, 21.1458')).toEqual({ lat: 79.0882, lon: 21.1458, swappedHint: true })
  })

  it.each(['', 'Nagpur', '91, 0', '0, 181', 'https://maps.app.goo.gl/abc', '21.1, 79.0, 5'])(
    'rejects %s',
    (input) => {
      expect(parseCoordinates(input)).toBeNull()
    },
  )
})
