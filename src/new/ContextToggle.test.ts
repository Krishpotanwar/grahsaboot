import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ContextImage } from '../context/load.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import { fmtDate } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { ContextControls, type ControlsProps } from './ContextToggle.tsx'
import { COST_MB, OFF, type View } from './contextState.ts'

// The switch and the one line under it, rendered to a string for every state (no DOM, so no effect runs). What it does when
// pressed, and how it sits next to the map, is in tests/e2e/context-view.spec.ts.
const noop = () => {}
const render = (over: Partial<ControlsProps> = {}) =>
  renderToString(
    createElement(ContextControls, {
      want: false,
      view: OFF,
      ready: true,
      tooWide: false,
      onChoose: noop,
      onAgain: noop,
      onCancel: noop,
      ...over,
    }),
  )
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
const on = (over: Partial<ContextImage> = {}, cloudy = false): View => ({
  s: 'on',
  image: image(over),
  cloudy,
})
const loading = (stage: 'searching' | 'checking' | 'reading', slow = false): View => ({
  s: 'loading',
  stage,
  slow,
})

const radio = (html: string, value: 'map' | 'satellite') =>
  new RegExp(`<input[^>]*value="${value}"[^>]*>`).exec(html)?.[0] ?? ''
const checked = (tag: string) => /\bchecked=""/.test(tag)
const disabled = (tag: string) => /\bdisabled=""/.test(tag)
/** The line that speaks: the alert when there is one (the polite status is then empty), else the polite status. Role, classes, text. */
function line(html: string) {
  const alert = /<p([^>]*role="alert"[^>]*)>(.*?)<\/p>/s.exec(html)
  const m = alert ?? /<p([^>]*role="status"[^>]*)>(.*?)<\/p>/s.exec(html)
  return {
    role: alert ? 'alert' : m ? 'status' : undefined,
    attrs: m?.[1] ?? '',
    text: (m?.[2] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }
}
/** The polite status is mounted in every state (a live region inserted with its text is announced unreliably). */
const politeText = (html: string) =>
  (/<p[^>]*role="status"[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? 'MISSING').replace(/<[^>]+>/g, '').trim()
const button = (html: string, name: string) =>
  new RegExp(`<button[^>]*>${name}</button>`).exec(html)?.[0] ?? ''

describe('the Map | Satellite control', () => {
  it("is one labelled group of two radios, in the viewer tabs' pattern, each a 44 px target", () => {
    const html = render()
    expect(html).toContain(`<legend class="sr-only">${flow.context.legend}</legend>`)
    expect(html.match(/<fieldset/g)).toHaveLength(1)
    expect(html.match(/type="radio"[^>]*name="basemap"|name="basemap"[^>]*type="radio"/g)).toHaveLength(2)
    expect(html.match(/h-11/g)!.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('peer-checked:bg-fg')
    expect(html).toContain('peer-checked:text-bg')
    expect(html).toContain('peer-focus-visible:outline-accent')
  })

  it('names the options Map and Satellite with the cost, and starts on Map', () => {
    const html = render()
    expect(html).toContain(`>${flow.context.map}<`)
    expect(html).toContain(flow.context.satellite(COST_MB))
    expect(checked(radio(html, 'map'))).toBe(true)
    expect(checked(radio(html, 'satellite'))).toBe(false)
    expect(disabled(radio(html, 'map')) || disabled(radio(html, 'satellite'))).toBe(false)
  })

  it('checks Satellite whenever it is the choice, however far its load has got', () => {
    for (const view of [
      loading('searching'),
      on(),
      { s: 'none' } as View,
      { s: 'fail', offline: false } as View,
    ]) {
      const html = render({ want: true, view })
      expect(checked(radio(html, 'satellite')), view.s).toBe(true)
      expect(checked(radio(html, 'map')), view.s).toBe(false)
    }
  })

  it('turns Satellite off while the map is not ready or the view is too wide, and never Map', () => {
    for (const over of [{ ready: false }, { tooWide: true }]) {
      const html = render(over)
      expect(disabled(radio(html, 'satellite')), JSON.stringify(over)).toBe(true)
      expect(disabled(radio(html, 'map')), JSON.stringify(over)).toBe(false)
    }
  })

  it('keeps both radios usable while the picture is on, even when the view has become too wide', () => {
    const html = render({ want: true, view: on(), tooWide: true })
    expect(disabled(radio(html, 'satellite'))).toBe(false)
    expect(disabled(radio(html, 'map'))).toBe(false)
    expect(checked(radio(html, 'satellite'))).toBe(true)
  })

  it('keeps a remembered Satellite checked while it waits for a map it can use', () => {
    const html = render({ want: true, ready: true, tooWide: true })
    expect(checked(radio(html, 'satellite'))).toBe(true)
    expect(disabled(radio(html, 'satellite'))).toBe(true)
  })
})

describe('the one line under the control', () => {
  it('is a single polite status, always there, and says what the photo gives while the view is off', () => {
    const html = render()
    expect(html.match(/role="(status|alert)"/g)).toHaveLength(1)
    expect(line(html).role).toBe('status')
    expect(line(html).text).toBe(flow.context.off)
    expect(line(html).attrs).toContain('text-fg-2')
    expect(html).not.toContain('<button')
  })

  it('says how to use the view when it is too wide, instead of the off line', () => {
    expect(line(render({ tooWide: true })).text).toBe(flow.context.tooWideOn)
    expect(line(render({ want: true, tooWide: true })).text).toBe(flow.context.tooWideOn)
  })

  it("leaves the line empty (its room kept) while the map loads, for the map's own line to speak", () => {
    expect(line(render({ ready: false })).text).toBe('') // Map is the choice: the same
    expect(line(render({ want: true, ready: false, tooWide: true })).text).toBe('')
    expect(line(render({ want: true, ready: false })).text).toBe('')
    expect(line(render({ want: true, ready: true })).text).toBe('') // a moment before the load starts
    expect(line(render({ want: true, ready: false })).role).toBe('status')
  })

  it('shows the three stage words, a Cancel that is always on, and no figure', () => {
    for (const stage of ['searching', 'checking', 'reading'] as const) {
      const html = render({ want: true, view: loading(stage) })
      expect(line(html).role).toBe('status')
      expect(line(html).text).toBe(flow.context.stages[stage])
      expect(line(html).text).not.toMatch(/\d/)
      expect(button(html, copy.common.cancel)).not.toBe('')
      expect(disabled(button(html, copy.common.cancel))).toBe(false)
    }
  })

  it('adds the slow-connection line after a while, inside the same status', () => {
    const html = render({ want: true, view: loading('reading', true) })
    expect(line(html).text).toBe(`${flow.context.stages.reading} ${flow.context.still}`)
    expect(html.match(/role="(status|alert)"/g)).toHaveLength(1)
    expect(line(render({ want: true, view: loading('reading', false) })).text).not.toContain('Still working')
  })

  it('keeps Update focusable but greyed while a load runs: a second press starts nothing and focus stays', () => {
    const tag = button(render({ want: true, view: loading('searching') }), flow.context.update)
    expect(tag).toContain('aria-disabled="true"')
    expect(disabled(tag)).toBe(false) // a focused button that becomes disabled drops focus to the page
  })

  it('greys Update and Try again while the map is not ready', () => {
    expect(disabled(button(render({ want: true, view: on(), ready: false }), flow.context.update))).toBe(true)
    for (const view of [{ s: 'none' } as View, { s: 'fail', offline: false } as View])
      expect(disabled(button(render({ want: true, view, ready: false }), copy.common.retry)), view.s).toBe(
        true,
      )
  })

  it('has Update and Cancel as small buttons', () => {
    const html = render({ want: true, view: loading('searching') })
    for (const name of [flow.context.update, copy.common.cancel]) expect(button(html, name)).toContain('h-8')
  })

  it('names the picture: satellite, Sentinel-2, its date, 10 m and that it is for finding the place, not evidence', () => {
    const html = render({ want: true, view: on() })
    expect(line(html).role).toBe('status')
    expect(line(html).text).toBe(flow.context.on(fmtDate('2025-12-20')))
    expect(line(html).text).toContain('for finding your place, not evidence')
    expect(button(html, flow.context.update)).not.toBe('')
    expect(disabled(button(html, flow.context.update))).toBe(false)
    expect(html).not.toContain(copy.common.cancel)
  })

  it('adds the age whenever the photo is older than 75 days or the search had to reach back for it', () => {
    const text = (over: Partial<ContextImage>) => line(render({ want: true, view: on(over) })).text
    expect(text({ ageDays: 75 })).not.toContain('old')
    expect(text({ ageDays: 76 })).toContain('76 days old.')
    expect(text({ ageDays: 229, widened: true })).toContain('229 days old.')
    expect(text({ ageDays: 10, widened: true })).toContain('10 days old.')
    expect(text({ ageDays: 1, widened: true })).toContain('1 day old.')
    expect(text({ ageDays: 10 })).not.toContain('old')
  })

  it('shows a cloudy photo with its figure, and says "Clouds cover most of it" only below half', () => {
    const text = (clearPct: number) =>
      line(render({ want: true, view: on({ clearPct, cloudy: true }, true) })).text
    expect(text(12)).toContain(flow.context.on(fmtDate('2025-12-20')))
    expect(text(12)).toContain(flow.context.cloudy(12))
    expect(text(12)).toContain('Clouds cover most of it.')
    expect(text(62)).toContain('62% clear view')
    expect(text(62)).not.toContain('Clouds cover most of it')
    expect(text(62)).toContain('not evidence')
  })

  it('keeps the photo and its label when the view is too wide, and turns only Update off', () => {
    const html = render({ want: true, view: on(), tooWide: true })
    expect(line(html).text).toBe(`${flow.context.on(fmtDate('2025-12-20'))}. ${flow.context.tooWideUpdate}`)
    expect(disabled(button(html, flow.context.update))).toBe(true)
  })

  it('says that nothing covers the area, as plain information, with Try again', () => {
    const html = render({ want: true, view: { s: 'none' } })
    expect(line(html).role).toBe('status')
    expect(line(html).text).toBe(flow.context.none)
    expect(line(html).attrs).not.toContain('text-bad')
    expect(button(html, copy.common.retry)).not.toBe('')
  })

  it('says a failure in an alert, in the bad colour, with Try again, and keeps no connection apart from the rest', () => {
    const offline = render({ want: true, view: { s: 'fail', offline: true } })
    expect(line(offline).role).toBe('alert')
    expect(line(offline).attrs).toContain('text-bad')
    expect(line(offline).text).toBe(flow.context.offline)
    expect(button(offline, copy.common.retry)).not.toBe('')
    const failed = render({ want: true, view: { s: 'fail', offline: false } })
    expect(line(failed).role).toBe('alert')
    expect(line(failed).text).toBe(flow.context.failed)
    expect(line(failed).text).not.toMatch(/offline|no photo/i)
    expect(failed).not.toContain('Searching')
    // the polite status stays mounted (and empty) beside the alert, so the first stage word after Try again is said
    for (const html of [offline, failed]) {
      expect(politeText(html)).toBe('')
      expect(html.match(/role="alert"/g)).toHaveLength(1)
    }
    expect(politeText(render())).toBe(flow.context.off)
    expect(politeText(render({ want: true, view: loading('checking') }))).toBe(flow.context.stages.checking)
  })

  it('lets Try again be pressed even when the view has become too wide (it then waits for a view that fits)', () => {
    const fail = render({ want: true, view: { s: 'fail', offline: false }, tooWide: true })
    expect(disabled(button(fail, copy.common.retry))).toBe(false)
  })
})
