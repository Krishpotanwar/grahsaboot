import type { AoiSummary } from '../geo/aoi.ts'
import { flow } from '../ui/copy-flow.ts'

// What a 10 m photo can show of the outline that was drawn: a pixel is 10 m by 10 m (100 m²). A warning, never a block; the
// refusal of an outline under 1,000 m² (10 pixels) is a different thing and replaces the note (it is shown by the outline step).
// Both limits are settled with the owner (an open item of the plan): change them here.
/** A site smaller than this many pixels (5 ha) will not show a single building. */
export const SITE_MIN_PX = 500
/** A road narrower than this many metres is mixed with what is beside it. */
export const ROAD_MIN_M = 20

export interface SizeNote {
  text: string
  /** False for the case that is warned about (it is repeated on the Review step). */
  willShow: boolean
}

/** Rounded the way a person says it: to 100 from a thousand, to 10 from a hundred. */
const rounded = (n: number) =>
  n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n)

/** `widthM` is the road's width (ignored for a site). */
export function sizeNote(s: AoiSummary, widthM: number): SizeNote {
  if (s.kind === 'site') {
    const px = (s.areaKm2 * 1_000_000) / 100
    const text = rounded(px).toLocaleString('en-US')
    return px < SITE_MIN_PX
      ? { text: flow.outline.sizeSmall(text), willShow: false }
      : { text: flow.outline.sizeShows(text), willShow: true }
  }
  const across = Math.round(widthM / 10)
  return widthM < ROAD_MIN_M
    ? { text: flow.outline.roadNarrow(widthM, across), willShow: false }
    : { text: flow.outline.roadShows(widthM, across), willShow: true }
}
