import { resolveItemHrefs } from '../stac/pc.ts'
import type {
  ChangeRequest,
  ChangeResult,
  FrameRequest,
  FrameResult,
  QualityRequest,
  QualityResult,
} from './imagery-core.ts'

export type WorkerRequest =
  | { id: number; op: 'quality'; req: QualityRequest }
  | { id: number; op: 'frame'; req: FrameRequest }
  | { id: number; op: 'change'; req: ChangeRequest }
  | { id: number; op: 'cancel'; target: number }

export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null
  onerror?: ((e: unknown) => void) | null
  postMessage(msg: unknown, transfer?: Transferable[]): void
  terminate(): void
}

export interface ImageryClient {
  quality(req: QualityRequest, signal?: AbortSignal): Promise<QualityResult>
  frame(req: FrameRequest, signal?: AbortSignal): Promise<FrameResult>
  /**
   * The change rule (src/evidence/change.ts) on two display pictures. The buffers in `req` are handed over to the worker, not
   * copied: the caller's arrays are empty afterwards, so pass copies of any picture that is shown again. A view of part of a
   * larger buffer is copied instead, and so detaches nothing.
   */
  change(req: ChangeRequest, signal?: AbortSignal): Promise<ChangeResult>
  dispose(): void
}

const abortError = () => new DOMException('Aborted', 'AbortError')

/** The buffers of a change request the worker may take: whole buffers only, each once (a repeat would fail the whole message). */
function handOver({ first, last, inside }: ChangeRequest): ArrayBuffer[] {
  const whole = [first.rgba, last.rgba, first.invalid, last.invalid, inside].flatMap((a) =>
    a && a.buffer instanceof ArrayBuffer && a.byteOffset === 0 && a.byteLength === a.buffer.byteLength
      ? [a.buffer]
      : [],
  )
  return [...new Set(whole)]
}

/**
 * Longest a request may wait: a stalled network or a silent worker ends in TimeoutError, never a spinner.
 * ponytail: total time, not stall time (geotiff reports no progress); a 4.7 MB road frame still fits at 40 KB/s.
 */
const TIMEOUT_MS = 120_000

export function createImageryClient(
  make: () => WorkerLike = () =>
    new Worker(new URL('./imagery.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
): ImageryClient {
  const worker = make()
  let nextId = 1
  let dead: Error | null = null
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: unknown): void }>()
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data as {
      id: number
      ok: boolean
      result?: unknown
      error?: { name: string; message: string }
    }
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve(result)
    else
      p.reject(Object.assign(new Error(error?.message ?? 'IMAGERY_ERROR'), { name: error?.name ?? 'Error' }))
  }
  // A worker that fails to load or crashes never answers: fail what waits, and every later call, at once.
  worker.onerror = () => {
    dead = new Error('IMAGERY_WORKER_FAILED')
    for (const p of pending.values()) p.reject(dead)
    pending.clear()
  }
  function call<T>(
    op: 'quality' | 'frame' | 'change',
    req: QualityRequest | FrameRequest | ChangeRequest,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError())
    if (dead) return Promise.reject(dead)
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      // Every way out drops the timer and the handler: a signal shared across calls must not keep one per request.
      const settle = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const stop = (e: Error) => {
        if (!pending.has(id)) return
        pending.delete(id)
        settle()
        worker.postMessage({ id: 0, op: 'cancel', target: id })
        reject(e)
      }
      const onAbort = () => stop(abortError())
      const timer = setTimeout(() => stop(new DOMException('IMAGERY_TIMEOUT', 'TimeoutError')), TIMEOUT_MS)
      pending.set(id, {
        resolve: (v) => {
          settle()
          resolve(v as T)
        },
        reject: (e) => {
          settle()
          reject(e)
        },
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      // A scene first needs its picture host resolved (a Planetary Computer token); a change request is pixels only.
      const ready =
        'item' in req
          ? resolveItemHrefs(req.item, signal).then((item) => ({ ...req, item }))
          : Promise.resolve(req)
      ready
        .then((r) => {
          if (pending.has(id)) worker.postMessage({ id, op, req: r }, 'first' in r ? handOver(r) : [])
        })
        .catch((e) => {
          pending.delete(id)
          settle()
          reject(e)
        })
    })
  }
  return {
    quality: (req, signal) => call<QualityResult>('quality', req, signal),
    frame: (req, signal) => call<FrameResult>('frame', req, signal),
    change: (req, signal) => call<ChangeResult>('change', req, signal),
    dispose: () => {
      dead = abortError() // before terminate(): a terminated worker never answers, so later calls must fail at once
      worker.terminate()
      for (const p of pending.values()) p.reject(dead)
      pending.clear()
    },
  }
}
