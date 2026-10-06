import { Moon, Sun } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link, type Route } from '../lib/router.tsx'
import { copy } from './copy.ts'
import { IconButton } from './kit.tsx'
import { useTheme } from './theme.ts'
import { Wordmark } from './Wordmark.tsx'

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const [theme, setTheme] = useTheme()
  // The root is deliberately not positioned: a positioned root would paint and hit-test above the fixed map stage.
  return (
    <div className="min-h-[100dvh]">
      <a
        href="#main"
        className="sr-only z-50 bg-fg px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        {copy.common.skip}
      </a>
      <header className="no-print relative z-30 flex h-16 items-center justify-between border-b border-line bg-bg px-4 lg:px-6">
        <Link to="/" aria-label={copy.nav.home} className="rounded-[6px]">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1">
          {route.name !== 'new' && (
            <>
              <Link
                to="/new"
                className="hidden h-11 items-center rounded-[6px] px-4 text-[0.9375rem] font-medium text-fg hover:bg-panel sm:inline-flex"
              >
                {copy.nav.newInvestigation}
              </Link>
              <span aria-hidden className="mx-1.5 hidden h-[22px] w-px bg-line sm:block" />
            </>
          )}
          <IconButton
            label={copy.nav.themeToggle}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
          </IconButton>
        </nav>
      </header>
      {/* Over the map, empty parts of the page must let pointer input through; screens re-enable it on their panels. */}
      <main
        id="main"
        className={
          route.name === 'globe' || route.name === 'new'
            ? 'pointer-events-none relative z-10'
            : 'relative z-10'
        }
      >
        {children}
      </main>
      {route.name !== 'investigation' && (
        <footer className="no-print relative z-10 border-t border-line bg-bg px-4 py-6 text-sm text-fg-2 lg:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[65ch]">{copy.footer.disclaimer}</p>
            <div className="flex gap-4">
              <Link to="/privacy" className="underline-offset-4 hover:underline">
                {copy.nav.privacy}
              </Link>
              <Link to="/limits" className="underline-offset-4 hover:underline">
                {copy.nav.limits}
              </Link>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
