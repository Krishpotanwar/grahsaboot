import { useId } from 'react'
import { copy } from './copy.ts'

const [grah, saboot] = copy.app.name.split(/(?=[A-Z])/)

export function Wordmark() {
  const cut = useId()
  return (
    <span role="img" aria-label={copy.app.name} className="flex items-center gap-3 text-fg">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden>
        <defs>
          <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
            <rect width="48" height="48" fill="#fff" />
            <rect x="22" y="22" width="24" height="24" rx="7" fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#${cut})`} stroke="currentColor">
          <circle cx="21" cy="21" r="17" strokeWidth="2.5" />
          <ellipse cx="21" cy="21" rx="7" ry="17" strokeWidth="1.6" opacity=".5" />
          <path d="M4.6 16.6C14 20.6 28 20.6 37.4 16.6" strokeWidth="1.6" opacity=".5" />
        </g>
        <rect x="24.5" y="24.5" width="19" height="19" rx="4.5" stroke="var(--gs-accent)" strokeWidth="2.5" />
        <path d="M34 26v16M26 34h16" stroke="var(--gs-accent)" strokeWidth="1.2" opacity=".55" />
        <rect x="27.25" y="35.25" width="5.5" height="5.5" rx="1" fill="var(--gs-accent)" />
      </svg>
      <span className="font-mono text-[15px] font-medium uppercase tracking-[0.34em]">
        <span className="font-semibold">{grah}</span>
        <span className="text-fg-2">{saboot}</span>
      </span>
    </span>
  )
}
