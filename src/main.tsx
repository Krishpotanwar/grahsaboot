import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import './styles.css'

// A tab opened before a deploy asks for page files the deploy deleted, and the host answers with the home page, so a lazy page will
// not load. Reload the tab once per session to get the new files. Not while offline (the files are not gone), not while the page is
// being left (below), and not when the reload cannot be noted (blocked storage), which could repeat for ever: the error then fails
// the page as before.
// shortcut: once per session, so a tab that sees a second deploy needs a hand reload, lifted by clearing the flag after a good load.
const RELOADED = 'gs-stale-reload'

// WebKit ends the lazy files of a page the moment a navigation away from it starts, and keeps running the page until the next one
// arrives. Vite reports an ended file like one that will not load, and a reload of the page being left would take the navigation's
// place. The page hears of the navigation first (`beforeunload`), so a failure just after it is the navigation's, not a deploy's.
// shortcut: a history step (Back) ends the files before `beforeunload`, so it is not covered; the step won against the reload in
// 16 of 16 tries. If one is ever replaced, wait a moment before the reload and look again.
const LEAVING_MS = 1_000
let leftAt = -Infinity
window.addEventListener('beforeunload', () => {
  leftAt = Date.now()
})

window.addEventListener('vite:preloadError', (event) => {
  if (navigator.onLine === false || Date.now() - leftAt < LEAVING_MS) return
  try {
    if (sessionStorage.getItem(RELOADED)) return
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    return
  }
  event.preventDefault()
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
