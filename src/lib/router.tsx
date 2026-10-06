import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

export type Route =
  | { name: 'globe' }
  | { name: 'new' }
  | { name: 'investigation'; id: string }
  | { name: 'report'; id: string }
  | { name: 'privacy' }
  | { name: 'limits' }
  | { name: 'kit' }
  | { name: 'notFound' }

const ID = '([A-Za-z0-9-]{1,64})'

export function matchRoute(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return { name: 'globe' }
  if (p === '/new') return { name: 'new' }
  if (p === '/privacy') return { name: 'privacy' }
  if (p === '/limits') return { name: 'limits' }
  if (p === '/dev/kit') return { name: 'kit' }
  let m = p.match(new RegExp(`^/i/${ID}$`))
  if (m) return { name: 'investigation', id: m[1]! }
  m = p.match(new RegExp(`^/i/${ID}/report$`))
  if (m) return { name: 'report', id: m[1]! }
  return { name: 'notFound' }
}

const EVENT = 'gs-navigate'
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', to)
  window.dispatchEvent(new Event(EVENT))
  window.scrollTo(0, 0)
}

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(EVENT, cb)
  }
}
const snapshot = () => location.pathname + location.search

export function useRoute(): Route {
  const href = useSyncExternalStore(subscribe, snapshot, () => '/')
  return useMemo(() => matchRoute(href.split('?')[0]!), [href])
}

export function useSearchParams(): URLSearchParams {
  const href = useSyncExternalStore(subscribe, snapshot, () => '/')
  return useMemo(() => new URLSearchParams(href.split('?')[1] ?? ''), [href])
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}
