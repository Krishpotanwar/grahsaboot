import type { AttributionControl, Map as MlMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { copy } from '../ui/copy.ts'
import type { Tier } from './tier.ts'
import { createMap, setContextCredit } from './createMap.ts'

// MapLibre's Map and NavigationControl need a browser. The fakes below keep what MapLibre does to the page that the credit swap
// relies on (read in maplibre-gl 6.12 and seen in Chromium): a control added to a bottom corner is put FIRST in it, the
// attribution control starts open (`maplibregl-compact-show`), and querySelector finds a control's element.
vi.mock('maplibre-gl', async (importOriginal) => {
  const real = await importOriginal<typeof import('maplibre-gl')>()
  class El {
    classes: Set<string>
    classList: { contains(c: string): boolean; add(c: string): void; remove(c: string): void }
    parentElement: { append(el: El): void } | null = null
    constructor(
      readonly kind: string,
      classes: string[],
    ) {
      this.classes = new Set(classes)
      this.classList = {
        contains: (c) => this.classes.has(c),
        add: (c) => void this.classes.add(c),
        remove: (c) => void this.classes.delete(c),
      }
    }
  }
  class Corner {
    children: El[] = []
    append(el: El) {
      this.children = this.children.filter((c) => c !== el).concat(el)
    }
  }
  class FakeMap {
    corner = new Corner()
    log: string[] = []
    controls = new Map<object, El>()
    on() {
      return this
    }
    addControl(control: object, position?: string) {
      const attribution = control instanceof real.AttributionControl
      const el = new El(
        attribution ? 'attribution' : 'navigation',
        attribution ? ['maplibregl-ctrl-attrib', 'maplibregl-compact', 'maplibregl-compact-show'] : [],
      )
      this.log.push(`add ${el.kind} ${position}`)
      el.parentElement = this.corner
      this.controls.set(control, el)
      this.corner.children.unshift(el)
      return this
    }
    hasControl(control: object) {
      return this.controls.has(control)
    }
    remove() {
      this.controls.clear()
      this.corner.children = []
    }
    removeControl(control: object) {
      const el = this.controls.get(control)
      this.log.push(`remove ${el?.kind}`)
      this.controls.delete(control)
      this.corner.children = this.corner.children.filter((c) => c !== el)
      return this
    }
    get attribution() {
      return [...this.controls.keys()].find((c) => c instanceof real.AttributionControl)
    }
    getContainer() {
      return {
        querySelector: (selector: string) => {
          const need = selector.split('.').filter(Boolean)
          return this.corner.children.find((c) => need.every((n) => c.classes.has(n))) ?? null
        },
      }
    }
  }
  return { ...real, Map: FakeMap, NavigationControl: class {} }
})

interface FakeMapView {
  corner: { children: Array<{ kind: string; classes: Set<string> }> }
  log: string[]
  attribution: AttributionControl | undefined
}
const build = (tier: Tier = 2) =>
  createMap({ clientWidth: 800, clientHeight: 600 } as HTMLElement, {
    tier,
    getTheme: () => 'dark',
  }) as unknown as MlMap & FakeMapView
const credits = (m: FakeMapView) => m.attribution!.options.customAttribution
const element = (m: FakeMapView) => m.corner.children.find((c) => c.kind === 'attribution')!
const open = (m: FakeMapView) => element(m).classes.has('maplibregl-compact-show')
const BASE = [copy.attribution.osm, copy.attribution.openfreemap, copy.attribution.gibs]
const SENTINEL = (year: number) => `Contains modified Copernicus Sentinel data ${year}`

describe('the attribution control of createMap', () => {
  it('credits OpenStreetMap, OpenFreeMap and NASA GIBS, and the terrain tiles at tier 3 only', () => {
    expect(build().attribution!.options.compact).toBe(true) // the fold logic depends on it
    expect(credits(build(2))).toEqual(BASE)
    expect(credits(build(3))).toEqual([...BASE, copy.attribution.terrain])
  })

  it('is added to the bottom right, under the zoom buttons', () => {
    const m = build()
    expect(m.log).toEqual(['add attribution bottom-right', 'add navigation bottom-right'])
    expect(m.corner.children.map((c) => c.kind)).toEqual(['navigation', 'attribution'])
  })
})

describe('setContextCredit', () => {
  it('adds the Copernicus credit with the year it is given, and a later year replaces it', () => {
    const m = build()
    setContextCredit(m, true, 2025)
    expect(credits(m)).toEqual([...BASE, SENTINEL(2025)])
    expect(SENTINEL(2025)).toBe(copy.attribution.sentinel(2025))
    setContextCredit(m, true, 2026)
    expect(credits(m)).toEqual([...BASE, SENTINEL(2026)])
  })

  it('takes it away for off, and keeps the credit of the terrain tiles through both', () => {
    const m = build(3)
    const terrain = [...BASE, copy.attribution.terrain]
    setContextCredit(m, true, 2025)
    expect(credits(m)).toEqual([...terrain, SENTINEL(2025)])
    setContextCredit(m, false)
    expect(credits(m)).toEqual(terrain)
  })

  it('does nothing when the credit is already as asked: a second on, or off with no credit', () => {
    const m = build()
    setContextCredit(m, false)
    expect(m.log).toHaveLength(2)
    setContextCredit(m, true, 2025)
    const log = [...m.log]
    const control = m.attribution
    setContextCredit(m, true, 2025)
    expect(m.log).toEqual(log)
    expect(m.attribution).toBe(control)
    expect(credits(m)).toEqual([...BASE, SENTINEL(2025)]) // once, not twice
  })

  it('swaps the control in the same corner, and keeps it under the zoom buttons', () => {
    const m = build()
    setContextCredit(m, true, 2025)
    setContextCredit(m, false)
    expect(m.log.slice(2)).toEqual([
      'remove attribution',
      'add attribution bottom-right',
      'remove attribution',
      'add attribution bottom-right',
    ])
    expect(m.corner.children.map((c) => c.kind)).toEqual(['navigation', 'attribution'])
  })

  it('keeps the control folded when it was folded, and open when it was open', () => {
    const m = build()
    expect(open(m)).toBe(true) // MapLibre starts it open
    setContextCredit(m, true, 2025)
    expect(open(m)).toBe(true)
    element(m).classes.delete('maplibregl-compact-show') // what MapStage does to start it as the "i" button
    setContextCredit(m, true, 2026)
    expect(open(m)).toBe(false)
    setContextCredit(m, false)
    expect(open(m)).toBe(false)
    element(m).classes.add('maplibregl-compact-show') // the person opens it
    setContextCredit(m, true, 2026)
    expect(open(m)).toBe(true)
  })

  it('does not take a control that is not compact yet (its style has not loaded) for a folded one', () => {
    const m = build()
    element(m).classes.delete('maplibregl-compact')
    element(m).classes.delete('maplibregl-compact-show')
    setContextCredit(m, true, 2025)
    expect(open(m)).toBe(true)
  })

  it('needs a whole year to credit, and changes nothing without one', () => {
    const m = build()
    for (const year of [undefined, NaN, 2025.5, Infinity]) {
      expect(() => setContextCredit(m, true, year)).toThrow(RangeError)
    }
    expect(m.log).toHaveLength(2)
    expect(credits(m)).toEqual(BASE)
    expect(() => setContextCredit(m, false)).not.toThrow() // off needs no year
  })

  it('leaves a map that createMap did not make alone, and keeps each map to itself', () => {
    expect(() => setContextCredit({} as MlMap, true, 2025)).not.toThrow()
    const [a, b] = [build(), build()]
    setContextCredit(a, true, 2025)
    expect(credits(a)).toEqual([...BASE, SENTINEL(2025)])
    expect(credits(b)).toEqual(BASE)
  })
})

describe('setContextCredit on a removed map', () => {
  it('leaves it alone: MapLibre ended its controls, and ending one twice throws', () => {
    const m = build()
    setContextCredit(m, true, 2025)
    ;(m as unknown as { remove(): void }).remove()
    const log = [...m.log]
    expect(() => setContextCredit(m, false)).not.toThrow()
    expect(m.log).toEqual(log)
  })
})
