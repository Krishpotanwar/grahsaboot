export type Tier = 0 | 1 | 2 | 3

export interface TierSignals {
  webgl2: boolean
  renderer: string
  saveData: boolean
  effectiveType: string | null
  deviceMemory: number | null
  cores: number | null
}

export function chooseTier(s: TierSignals): Tier {
  if (!s.webgl2 || /swiftshader|llvmpipe|software/i.test(s.renderer)) return 0
  if (s.saveData || (s.effectiveType !== null && /^(slow-2g|2g|3g)$/.test(s.effectiveType))) return 1
  if (s.deviceMemory !== null && s.deviceMemory <= 2) return 1
  if ((s.cores !== null && s.cores <= 4) || (s.deviceMemory !== null && s.deviceMemory < 4)) return 2
  return 3
}

export const downgrade = (t: Tier): Tier => (t > 0 ? ((t - 1) as Tier) : 0)

export function readSignals(): TierSignals {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }
  let webgl2 = false
  let renderer = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (gl) {
      webgl2 = true
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    webgl2 = false
  }
  return {
    webgl2,
    renderer,
    saveData: !!nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    cores: nav.hardwareConcurrency || null,
  }
}

/** Median frame time over `ms` milliseconds of requestAnimationFrame. */
export function probeFrameMs(ms = 1500): Promise<number> {
  return new Promise((resolve) => {
    const deltas: number[] = []
    const start = performance.now()
    let last = start
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve(deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] ?? 16)
    }
    requestAnimationFrame(tick)
  })
}
