/** diff-v1: per-pixel |ΔY| (Rec. 709 luma) as accent-coloured alpha; masked where either input is transparent or `invalid[i]` is set. */
export function brightnessDiff(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  invalid?: Uint8Array,
  rgb: [number, number, number] = [228, 132, 68],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length)
  for (let i = 0, p = 0; p < a.length; i++, p += 4) {
    if (a[p + 3] === 0 || b[p + 3] === 0 || (invalid && invalid[i])) continue
    const ya = 0.2126 * a[p]! + 0.7152 * a[p + 1]! + 0.0722 * a[p + 2]!
    const yb = 0.2126 * b[p]! + 0.7152 * b[p + 1]! + 0.0722 * b[p + 2]!
    out[p] = rgb[0]
    out[p + 1] = rgb[1]
    out[p + 2] = rgb[2]
    out[p + 3] = Math.min(255, Math.round(Math.abs(ya - yb) * 4))
  }
  return out
}
