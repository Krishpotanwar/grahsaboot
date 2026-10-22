/*
 * change-v1: the change rule behind the honest line of the time-lapse and the measured sentence of the report. One pure function
 * of two display pictures: no DOM, no network, integer histograms and integer masks, so the Deno copy of this folder
 * (supabase/functions/_shared/evidence) gives the same answer as the browser. The numbers are CHANGE_CONSTANTS, shown here as
 * they stand today.
 *
 *   first, last: display pixels on one grid (RGBA, alpha 0 = no data) and their "not clear" masks (one byte a pixel, from
 *                quality()); `inside`: an outline mask (one byte a pixel), left out = the whole grid
 *     -> clear in both: alpha above 0 in both, marked in neither mask
 *        under half of the outline clear in both                                            -> "not-enough-ground"
 *     -> an outline given: opened like the flags below, it must hold a patch of the area minimum, or it can never
 *        show one (a road narrower than a block, an outline under 0.3 ha, an empty one)    -> "outline-too-small"
 *     -> normal shift, per band: median of (last - first) over ALL clear pixels of the grid (integer histogram); flag the
 *        pixels whose red, green and blue each differ from it by more than bandThreshold (38); estimate again on the
 *        pixels not flagged; `passes` (3) estimates at most
 *     -> guard: a final shift of shiftLimit (38) or more in any band, or half or more of the clear pixels flagged, or half
 *        or more differing by bandThreshold or more before any shift                       -> "most-differs" (no area)
 *     -> flagged AND inside, opened (eroded, then dilated) by a block blockNative (3) native pixels, 30 m, across; 8-connected
 *        patches on the opened mask count from areaMinNative (30) native 10 m pixels, 0.3 ha; the block and the minimum
 *        follow the grid's ground pixel size                                -> "changed" (patches, hectares) | "nothing"
 *
 *   Not here: the words of any line (src/ui and the report), "fewer than 3 usable frames" (a count of frames, the player's)
 *   and the two dates. The constants are provisional until they are tuned on real places and judged (plan F10, D28).
 */
import { haversineM } from './geodesy.ts'
import type { DisplayGrid } from './types.ts'

export const CHANGE_RECIPE = 'change-v1' as const

/** The numbers of change-v1: one object, recorded beside every number the rule prints (see `ChangeResult`). */
export const CHANGE_CONSTANTS = Object.freeze({
  /** A pixel is changed when red, green and blue each differ by more than this, of 255, once the normal shift is taken off. */
  bandThreshold: 38,
  /** Guard: a final normal shift of this much or more in any band is a difference in overall brightness or colour. */
  shiftLimit: 38,
  /** Estimates of the normal shift: the first on all clear pixels, each next on the pixels not flagged so far. */
  passes: 3,
  /** A changed patch holds at least this many native pixels (30 of 10 m make 0.3 ha) ... */
  areaMinNative: 30,
  /** ... and a block this many native pixels (30 m) across, so a thin line cannot pass. */
  blockNative: 3,
  /** The native pixel: Sentinel-2 10 m bands, metres on a side. */
  nativeM: 10,
  /** Less than this share of the outline clear in both pictures at once: not enough ground to compare. */
  clearShare: 0.5,
  /** Guard: this share or more of the clear pixels flagged. */
  flaggedShare: 0.5,
  /** Guard: this share or more of the clear pixels differing by the band threshold before any shift. */
  rawShare: 0.5,
})
export type ChangeConstants = typeof CHANGE_CONSTANTS

export interface ChangeFrame {
  /** Display pixels on the grid; alpha 0 where the scene has no data. */
  rgba: Uint8ClampedArray
  /** One byte per display pixel, 1 = not clear (cloud, shadow, snow, no data): `QualityResult.invalid`. Left out = no mark. */
  invalid?: Uint8Array
}
export interface ChangeInput {
  first: ChangeFrame
  last: ChangeFrame
  /** The grid both pictures sit on (`display-v1`); its ground pixel size sets the minimums and the hectares. */
  grid: DisplayGrid
  /** One byte per display pixel, 1 = inside the outline. Left out = the whole grid. */
  inside?: Uint8Array
}

/** Per band, the normal difference (last - first) that was taken off before a pixel was called changed. */
export type Shift = readonly [number, number, number]
interface Recorded {
  recipe: typeof CHANGE_RECIPE
  /** The numbers this result was made with. */
  constants: ChangeConstants
  /** Pixels of the outline that are clear in both pictures: what the figure rests on. */
  clearPixels: number
}
/**
 * How a comparison ends, in the order the states are looked at. Only `changed` carries a patch count and an area, on purpose: no
 * other state states one. `hectares` is the ground area of the patches that count, measured on the opened mask.
 * `outline-too-small` is only ever said for an `inside` mask that was given, and carries no shift: nothing was compared.
 */
export type ChangeResult =
  | (Recorded & { state: 'not-enough-ground' })
  | (Recorded & { state: 'outline-too-small' })
  | (Recorded & { state: 'most-differs'; shift: Shift })
  | (Recorded & { state: 'nothing'; shift: Shift })
  | (Recorded & { state: 'changed'; shift: Shift; patches: number; hectares: number })

const C = CHANGE_CONSTANTS
const DIFFS = 511 // differences -255..255, stored from 0

/** Throws SIZE_MISMATCH unless both pictures, both marks and the outline are one byte (four for a picture) per grid pixel. */
function checkSizes({ first, last, grid, inside }: ChangeInput): number {
  const n = grid.width * grid.height
  const wrong =
    !Number.isInteger(n) ||
    first.rgba.length !== n * 4 ||
    last.rgba.length !== n * 4 ||
    (first.invalid !== undefined && first.invalid.length !== n) ||
    (last.invalid !== undefined && last.invalid.length !== n) ||
    (inside !== undefined && inside.length !== n)
  if (wrong) throw new Error('SIZE_MISMATCH')
  return n
}

/** Ground metres on a side of one display pixel: the grid's top and bottom edges on the same sphere as haversineM, per pixel. */
function groundPixelM(grid: DisplayGrid): number {
  const [tl, tr, br, bl] = grid.cornersLonLat
  const px = (haversineM(tl, tr) + haversineM(bl, br)) / (2 * grid.width)
  // A grid with no ground size would make every patch too small and call the pair "nothing": refuse it.
  if (!(px > 0 && Number.isFinite(px))) throw new Error('BAD_GRID')
  return px
}

/** Display pixels across the block and in the area minimum on a grid whose pixels are `pxM` metres. */
function minimums(pxM: number): { blockPx: number; areaMinPx: number } {
  const k = C.nativeM / pxM // display pixels per native pixel, along a side
  // Rounded up, so a counted patch is never under 30 m across or 0.3 ha; a millionth of slack keeps an exact grid (k = 2)
  // from rounding up on float noise.
  const up = (x: number) => Math.max(1, Math.ceil(x * (1 - 1e-6)))
  return { blockPx: up(C.blockNative * k), areaMinPx: up(C.areaMinNative * k * k) }
}

/** 1 where a pixel is clear in both pictures; and how many are. */
function clearInBoth(a: ChangeFrame, b: ChangeFrame, n: number): { clear: Uint8Array; count: number } {
  const clear = new Uint8Array(n)
  const ia = a.invalid
  const ib = b.invalid
  let count = 0
  for (let i = 0; i < n; i++) {
    if (a.rgba[i * 4 + 3] === 0 || b.rgba[i * 4 + 3] === 0 || (ia && ia[i]) || (ib && ib[i])) continue
    clear[i] = 1
    count++
  }
  return { clear, count }
}

/** Per band, the lower median of last - first over the clear pixels not flagged; null when there are none. */
function medians(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  clear: Uint8Array,
  flagged: Uint8Array,
): [number, number, number] | null {
  const hist = [new Uint32Array(DIFFS), new Uint32Array(DIFFS), new Uint32Array(DIFFS)] as const
  let count = 0
  for (let i = 0, p = 0; i < clear.length; i++, p += 4) {
    if (!clear[i] || flagged[i]) continue
    count++
    hist[0][b[p]! - a[p]! + 255] += 1
    hist[1][b[p + 1]! - a[p + 1]! + 255] += 1
    hist[2][b[p + 2]! - a[p + 2]! + 255] += 1
  }
  if (!count) return null
  const rank = (count - 1) >> 1 // the lower of the two middle values: an integer, the same in every runtime
  const at = (h: Uint32Array) => {
    let seen = 0
    let v = 0
    while ((seen += h[v]!) <= rank) v++
    return v - 255
  }
  return [at(hist[0]), at(hist[1]), at(hist[2])]
}

/** Sets `flagged` to 1 for the clear pixels whose three bands each differ from `shift` by more than the band threshold. */
function flagPixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  clear: Uint8Array,
  shift: Shift,
  flagged: Uint8Array,
): number {
  let count = 0
  for (let i = 0, p = 0; i < clear.length; i++, p += 4) {
    const on =
      clear[i] !== 0 &&
      Math.abs(b[p]! - a[p]! - shift[0]) > C.bandThreshold &&
      Math.abs(b[p + 1]! - a[p + 1]! - shift[1]) > C.bandThreshold &&
      Math.abs(b[p + 2]! - a[p + 2]! - shift[2]) > C.bandThreshold
    flagged[i] = on ? 1 : 0
    count += on ? 1 : 0
  }
  return count
}

/** How many clear pixels differ by the band threshold or more in all three bands, before any shift. */
function countDiffering(a: Uint8ClampedArray, b: Uint8ClampedArray, clear: Uint8Array): number {
  let count = 0
  for (let i = 0, p = 0; i < clear.length; i++, p += 4)
    if (
      clear[i] &&
      Math.abs(b[p]! - a[p]!) >= C.bandThreshold &&
      Math.abs(b[p + 1]! - a[p + 1]!) >= C.bandThreshold &&
      Math.abs(b[p + 2]! - a[p + 2]!) >= C.bandThreshold
    )
      count++
  return count
}

/** The normal shift and the pixels it leaves flagged: median, flag, estimate again on the pixels not flagged, `passes` times at most. */
function estimateShift(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  clear: Uint8Array,
): { shift: Shift; flagged: Uint8Array; flaggedCount: number } {
  const flagged = new Uint8Array(clear.length)
  let shift: Shift = [0, 0, 0]
  let flaggedCount = 0
  for (let pass = 0; pass < C.passes; pass++) {
    const next = medians(a, b, clear, flagged)
    // Nothing left to estimate from, or the same shift again (so the same flags): the last answer stands.
    if (!next || (pass > 0 && next.every((v, band) => v === shift[band]))) break
    shift = next
    flaggedCount = flagPixels(a, b, clear, shift, flagged)
  }
  return { shift, flagged, flaggedCount }
}

/** The pixels where a whole block of `b` x `b` set pixels starts (to the right and down), by a run along x and then along y. */
function erode(src: Uint8Array, w: number, h: number, b: number): Uint8Array {
  const along = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    let run = 0
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      run = src[i] ? run + 1 : 0
      along[i] = run >= b ? 1 : 0
    }
  }
  const out = new Uint8Array(src.length)
  const down = new Int32Array(w)
  for (let y = h - 1; y >= 0; y--)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      down[x] = along[i] ? down[x]! + 1 : 0
      out[i] = down[x]! >= b ? 1 : 0
    }
  return out
}

/** Every pixel of the `b` x `b` block that starts at a set pixel: the undoing of `erode`. */
function dilate(src: Uint8Array, w: number, h: number, b: number): Uint8Array {
  const along = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    let since = b // pixels since the last set one; b is out of reach
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      since = src[i] ? 0 : since + 1
      along[i] = since < b ? 1 : 0
    }
  }
  const out = new Uint8Array(src.length)
  const above = new Int32Array(w).fill(b)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      above[x] = along[i] ? 0 : above[x]! + 1
      out[i] = above[x]! < b ? 1 : 0
    }
  return out
}

/**
 * The patches of `flags` once opened by a block of `b` x `b` (only blocks that lie wholly inside it stay, so nothing narrower
 * than a block does): the 8-connected pieces of at least `minArea` pixels, how many and their pixels in all. `flags` is not changed.
 */
function countPatches(
  flags: Uint8Array,
  w: number,
  h: number,
  b: number,
  minArea: number,
): { patches: number; pixels: number } {
  const mask = dilate(erode(flags, w, h, b), w, h, b) // ours: it is cleared as the patches are walked
  const stack = new Int32Array(mask.length) // a pixel is pushed once, when it is cleared
  let patches = 0
  let pixels = 0
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue
    mask[start] = 0
    stack[0] = start
    let top = 1
    let size = 0
    while (top > 0) {
      const p = stack[--top]!
      size++
      const x = p % w
      const y = (p - x) / w
      const x1 = Math.min(w - 1, x + 1)
      const y1 = Math.min(h - 1, y + 1)
      for (let ny = Math.max(0, y - 1); ny <= y1; ny++)
        for (let nx = Math.max(0, x - 1); nx <= x1; nx++) {
          const q = ny * w + nx
          if (!mask[q]) continue
          mask[q] = 0
          stack[top++] = q
        }
    }
    if (size >= minArea) {
      patches++
      pixels += size
    }
  }
  return { patches, pixels }
}

/** Compares two display pictures of one place. Throws SIZE_MISMATCH (sizes that do not fit the grid) or BAD_GRID. */
export function measureChange(input: ChangeInput): ChangeResult {
  const { first, last, grid } = input
  const n = checkSizes(input)
  const pxM = groundPixelM(grid)
  const { blockPx, areaMinPx } = minimums(pxM)
  const inside = input.inside ?? new Uint8Array(n).fill(1)
  const { clear, count: clearCount } = clearInBoth(first, last, n)

  let insidePixels = 0
  let clearPixels = 0
  for (let i = 0; i < n; i++)
    if (inside[i]) {
      insidePixels++
      clearPixels += clear[i]!
    }
  const recorded = { recipe: CHANGE_RECIPE, constants: C, clearPixels }
  if (clearPixels < C.clearShare * insidePixels) return { ...recorded, state: 'not-enough-ground' }
  // An outline that cannot hold a patch could never show one: say so, rather than "nothing". No outline is the whole square.
  if (input.inside && !countPatches(inside, grid.width, grid.height, blockPx, areaMinPx).patches)
    return { ...recorded, state: 'outline-too-small' }

  // The normal shift comes from every clear pixel of the grid: inside a tight outline the site itself can be the majority.
  const a = first.rgba
  const b = last.rgba
  const { shift, flagged, flaggedCount } = estimateShift(a, b, clear)
  if (
    shift.some((s) => Math.abs(s) >= C.shiftLimit) ||
    flaggedCount >= C.flaggedShare * clearCount ||
    countDiffering(a, b, clear) >= C.rawShare * clearCount
  )
    return { ...recorded, state: 'most-differs', shift }

  // Only the area inside the outline is counted (`flagged` is ours: it is cut down in place).
  for (let i = 0; i < n; i++) if (!inside[i]) flagged[i] = 0
  const { patches, pixels } = countPatches(flagged, grid.width, grid.height, blockPx, areaMinPx)
  return patches
    ? { ...recorded, state: 'changed', shift, patches, hectares: (pixels * pxM * pxM) / 10_000 }
    : { ...recorded, state: 'nothing', shift }
}
