import { openCogUrl } from '../evidence/cog.ts'
import { idbByteCache } from '../lib/byte-cache.ts'
import {
  runChange,
  runFrame,
  runQuality,
  type ChangeResult,
  type CoreDeps,
  type FrameResult,
  type QualityResult,
} from './imagery-core.ts'
import type { WorkerRequest } from './imagery-client.ts'

const ctx = self as unknown as Worker
const deps: CoreDeps = { openCog: openCogUrl, cache: idbByteCache() }
const controllers = new Map<number, AbortController>()

const transferables = (r: QualityResult | FrameResult | ChangeResult): Transferable[] =>
  'native' in r
    ? [r.native.rgb.buffer as ArrayBuffer, r.display.rgba.buffer as ArrayBuffer]
    : 'invalid' in r && r.invalid
      ? [r.invalid.buffer as ArrayBuffer]
      : []

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.op === 'cancel') {
    controllers.get(msg.target)?.abort()
    return
  }
  const ac = new AbortController()
  controllers.set(msg.id, ac)
  try {
    const result =
      msg.op === 'quality'
        ? await runQuality(deps, msg.req, ac.signal)
        : msg.op === 'frame'
          ? await runFrame(deps, msg.req, ac.signal)
          : runChange(msg.req)
    if (!ac.signal.aborted) ctx.postMessage({ id: msg.id, ok: true, result }, transferables(result))
  } catch (err) {
    const e2 = err as Error
    if (!ac.signal.aborted)
      ctx.postMessage({ id: msg.id, ok: false, error: { name: e2.name, message: e2.message } })
  } finally {
    controllers.delete(msg.id)
  }
}
