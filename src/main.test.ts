import { afterEach, describe, expect, it, vi } from 'vitest'

// main.tsx starts the app as soon as it is loaded. The app, its styles and the page are stood in for, so that only the
// `vite:preloadError` listener it registers is under test.
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: () => undefined }) }))
vi.mock('./app.tsx', () => ({ App: () => null }))
vi.mock('./styles.css', () => ({}))

const FLAG = 'gs-stale-reload'

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  }
}
const blocked = () => {
  throw new Error('blocked')
}

/**
 * A browser tab in which main.tsx has just run. `fail()` is what Vite does when a lazy page's file will not load: it fires the
 * event, and the page file's import error is thrown unless the listener took it over. It says whether the listener did. The
 * listeners are called straight, so one that throws fails the test (Node's own EventTarget would report it later, elsewhere).
 * `online` is left out for a browser that does not report it.
 */
async function openTab({ online, storage }: { online?: boolean; storage: unknown }) {
  const listeners: Array<(event: Event) => void> = []
  const reload = vi.fn()
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (type === 'vite:preloadError') listeners.push(listener)
    },
  })
  vi.stubGlobal('document', { getElementById: () => ({}) })
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('navigator', online === undefined ? {} : { onLine: online })
  vi.stubGlobal('sessionStorage', storage)
  vi.resetModules()
  await import('./main.tsx')
  return {
    reload,
    fail: () => {
      const event = new Event('vite:preloadError', { cancelable: true })
      for (const listener of listeners) listener(event)
      return event.defaultPrevented
    },
  }
}

describe('a page file that will not load (a tab opened before a deploy)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('takes the error over, reloads the tab once and notes that it did', async () => {
    const storage = memory()
    const tab = await openTab({ storage })
    expect(tab.fail()).toBe(true)
    expect(tab.reload).toHaveBeenCalledTimes(1)
    expect(storage.data).toEqual({ [FLAG]: '1' })
  })

  it('reloads once per session: a second failure, in this page or in the one the reload gave, is left to fail', async () => {
    const storage = memory()
    const first = await openTab({ storage })
    first.fail()
    expect(first.fail()).toBe(false)
    expect(first.reload).toHaveBeenCalledTimes(1)
    const reloaded = await openTab({ storage })
    expect(reloaded.fail()).toBe(false)
    expect(reloaded.reload).not.toHaveBeenCalled()
  })

  it('does not reload while the browser is offline, and keeps the one reload for later', async () => {
    const storage = memory()
    const offline = await openTab({ online: false, storage })
    expect(offline.fail()).toBe(false)
    expect(offline.reload).not.toHaveBeenCalled()
    expect(storage.data).toEqual({})
    const online = await openTab({ online: true, storage })
    expect(online.fail()).toBe(true)
    expect(online.reload).toHaveBeenCalledTimes(1)
  })

  it('reloads when the browser does not say whether it is online', async () => {
    const tab = await openTab({ storage: memory() })
    expect(tab.fail()).toBe(true)
    expect(tab.reload).toHaveBeenCalledTimes(1)
  })

  // With no way to note the reload it could repeat for ever, so it is left to fail.
  it.each([
    ['unreadable', { getItem: blocked, setItem: () => undefined }],
    ['unwritable', { getItem: () => null, setItem: blocked }],
    ['missing', undefined],
  ])('does not reload when session storage is %s', async (_why, storage) => {
    const tab = await openTab({ storage })
    expect(tab.fail()).toBe(false)
    expect(tab.reload).not.toHaveBeenCalled()
  })
})
