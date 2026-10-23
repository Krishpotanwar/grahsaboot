import { describe, expect, it } from 'vitest'
import { placeToQuery } from '../map/camera.ts'
import { exploreHref, placeFromParams, startKey } from './params.ts'

const read = (query: string) => placeFromParams(new URLSearchParams(query))

describe('the place of an /explore address', () => {
  it('reads a latitude, a longitude and a name', () => {
    expect(read('lat=18.99135&lon=73.06575&name=Navi%20Mumbai%20airport')).toEqual({
      name: 'Navi Mumbai airport',
      lat: 18.99135,
      lon: 73.06575,
      bbox: null,
    })
  })

  it('reads negative and whole numbers, and the edges of the range', () => {
    expect(read('lat=-33.8688&lon=151.2093&name=Sydney')).toMatchObject({ lat: -33.8688, lon: 151.2093 })
    expect(read('lat=0&lon=0')).toMatchObject({ lat: 0, lon: 0 })
    expect(read('lat=90&lon=-180')).toMatchObject({ lat: 90, lon: -180 })
    expect(read('lat=-90&lon=180')).toMatchObject({ lat: -90, lon: 180 })
  })

  it('names a place with no name by its coordinates, and cuts a long name at 120 characters', () => {
    expect(read('lat=21.1458&lon=79.0882')?.name).toBe('Point at 21.14580, 79.08820')
    expect(read('lat=21.1458&lon=79.0882&name=%20%20')?.name).toBe('Point at 21.14580, 79.08820')
    expect(read(`lat=1&lon=2&name=${'a'.repeat(300)}`)?.name).toHaveLength(120)
  })

  it('keeps a name as plain text: nothing in it is read as anything else', () => {
    expect(read('lat=1&lon=2&name=%3Cimg%20src%3Dx%3E')?.name).toBe('<img src=x>')
  })

  it('refuses what is not a plain number: hex, an exponent, spaces, a plus sign, nothing', () => {
    for (const bad of [
      '0x10',
      '1e1',
      ' 5',
      '5 ',
      '+5',
      '',
      '.5',
      '5.',
      '--5',
      '5,5',
      'NaN',
      'Infinity',
      'abc',
    ])
      expect(read(`lat=${encodeURIComponent(bad)}&lon=10`), `lat=${bad}`).toBeNull()
    expect(read('lat=10&lon=1e1')).toBeNull()
    expect(read('lat=10')).toBeNull()
    expect(read('lon=10')).toBeNull()
    expect(read('')).toBeNull()
    expect(read('lat=&lon=')).toBeNull()
  })

  it('refuses a place outside the world', () => {
    expect(read('lat=90.0001&lon=0')).toBeNull()
    expect(read('lat=-91&lon=0')).toBeNull()
    expect(read('lat=0&lon=180.5')).toBeNull()
    expect(read('lat=0&lon=-181')).toBeNull()
    expect(read(`lat=${'9'.repeat(400)}&lon=0`)).toBeNull() // too long to be a finite number
  })

  it('ignores every other parameter', () => {
    expect(read('lat=1&lon=2&name=A&side=9999&before=2025-13-01&x=y')).toEqual({
      name: 'A',
      lat: 1,
      lon: 2,
      bbox: null,
    })
  })
})

describe('the address the home screen links to', () => {
  const place = { name: 'Navi Mumbai International Airport', lat: 18.99135, lon: 73.06575, bbox: null }

  it('has the same shape as the investigation link, with six decimals and an escaped name', () => {
    expect(exploreHref(place)).toBe(
      '/explore?lat=18.991350&lon=73.065750&name=Navi%20Mumbai%20International%20Airport',
    )
    expect(exploreHref(place).replace('/explore?', '')).toBe(placeToQuery(place).replace('/new?', ''))
  })

  it('cuts a searched name at its first comma, as the investigation link does', () => {
    const found = {
      name: 'Nagpur, Maharashtra, India',
      lat: 21.1458,
      lon: 79.0882,
      bbox: [78.9, 20.9, 79.3, 21.3] as [number, number, number, number],
    }
    expect(exploreHref(found)).toBe('/explore?lat=21.145800&lon=79.088200&name=Nagpur')
  })

  it('is read back as the same place', () => {
    const back = read(exploreHref(place).split('?')[1]!)
    expect(back).toMatchObject({ name: place.name, lat: 18.99135, lon: 73.06575 })
  })

  it('escapes what could end the address early', () => {
    const odd = { name: 'A&lat=5#x?', lat: 1, lon: 2, bbox: null }
    const back = read(exploreHref(odd).split('?')[1]!)
    expect(back).toMatchObject({ name: 'A&lat=5#x?', lat: 1, lon: 2 })
  })

  it('has one key for the place, the same on the way out and on the way in', () => {
    expect(startKey(place)).toBe('18.991350,73.065750')
    const back = read(exploreHref(place).split('?')[1]!)!
    expect(startKey(back)).toBe(startKey(place))
  })
})
