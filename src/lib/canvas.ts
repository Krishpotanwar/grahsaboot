export function rgbaToCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  return c
}

export const rgbaToPngDataUrl = (rgba: Uint8ClampedArray, w: number, h: number) =>
  rgbaToCanvas(rgba, w, h).toDataURL('image/png')

/** Native TCI window (interleaved RGB) to RGBA; (0,0,0) is no-data and becomes transparent. */
export function rgbToRgba(rgb: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0, j = 0; i < w * h; i++, j += 3) {
    out[i * 4] = rgb[j]!
    out[i * 4 + 1] = rgb[j + 1]!
    out[i * 4 + 2] = rgb[j + 2]!
    out[i * 4 + 3] = rgb[j]! || rgb[j + 1]! || rgb[j + 2]! ? 255 : 0
  }
  return out
}
