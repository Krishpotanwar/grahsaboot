import { fromArrayBuffer, fromUrl, type GeoTIFF } from 'geotiff'
import { levelFromTransform } from './frame.ts'
import type { LevelInfo, Window } from './types.ts'

export interface Cog {
  sizes: Array<{ width: number; height: number }>
  read(level: number, win: Window, samples: number[], signal?: AbortSignal): Promise<Uint8Array>
}

async function wrap(tiff: GeoTIFF): Promise<Cog> {
  const n = await tiff.getImageCount()
  const images = await Promise.all(Array.from({ length: n }, (_, i) => tiff.getImage(i)))
  return {
    sizes: images.map((im) => ({ width: im.getWidth(), height: im.getHeight() })),
    async read(level, win, samples, signal) {
      const im = images[level]
      if (!im) throw new Error(`NO_LEVEL:${level}`)
      signal?.throwIfAborted()
      const data = await im.readRasters({ window: win, samples, interleave: true, signal })
      signal?.throwIfAborted()
      if (!(data instanceof Uint8Array)) throw new Error('NOT_UINT8')
      return data
    },
  }
}

export async function openCogUrl(url: string, signal?: AbortSignal): Promise<Cog> {
  const cog = await wrap(await fromUrl(url, { allowFullFile: false }, signal))
  signal?.throwIfAborted()
  return cog
}

export async function openCogBuffer(buf: ArrayBuffer): Promise<Cog> {
  return wrap(await fromArrayBuffer(buf))
}

export function levelInfoFor(
  asset: { transform: number[]; shape: [number, number] },
  cog: Cog,
  level: number,
): LevelInfo {
  const size = cog.sizes[level]
  if (!size) throw new Error(`NO_LEVEL:${level}`)
  const expectW = asset.shape[1] / 2 ** level
  if (Math.abs(size.width - expectW) > 1) throw new Error('COG_LAYOUT')
  if (Math.abs(size.height - asset.shape[0] / 2 ** level) > 1) throw new Error('COG_LAYOUT')
  return levelFromTransform(asset.transform, asset.shape, level, size.width, size.height)
}
