import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import './styles.css'

// A tab opened before a deploy asks for page files the deploy deleted, and the host answers with the home page, so a lazy page will
// not load. Reload the tab once per session to get the new files. Not while offline (the files are not gone), and not when the
// reload cannot be noted (blocked storage), which could repeat for ever: the error then fails the page as before.
// shortcut: once per session, so a tab that sees a second deploy needs a hand reload, lifted by clearing the flag after a good load.
const RELOADED = 'gs-stale-reload'
window.addEventListener('vite:preloadError', (event) => {
  if (navigator.onLine === false) return
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
