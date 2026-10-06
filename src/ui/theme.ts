import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'gs-theme'
const EVENT = 'gs-theme'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* private mode: theme still applies for this session */
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, currentTheme, () => 'dark' as Theme), applyTheme]
}
