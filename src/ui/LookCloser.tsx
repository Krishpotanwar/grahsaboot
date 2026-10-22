import { ArrowSquareOut } from '@phosphor-icons/react'
import type { Bbox } from '../geo/aoi.ts'
import { flow } from './copy-flow.ts'
import { lookCloserLinks } from './lookCloser.ts'

// Like a secondary Button (kit.tsx), on a link: 44 px tall.
const LINK =
  'inline-flex h-11 select-none items-center justify-center gap-2 rounded-[6px] border border-control px-4 text-[0.9375rem] font-medium text-fg transition-transform duration-100 hover:bg-panel active:scale-[0.98]'

function GoogleLink({ href, children }: { href: string; children: string }) {
  return (
    // `noreferrer` keeps this page's address from Google; `noopener` (implied by it, said for older browsers) cuts the new tab off.
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
      <span className="sr-only"> {flow.lookCloser.newTab}</span>
      <ArrowSquareOut size={16} aria-hidden />
    </a>
  )
}

/**
 * Two links to Google's own pages for the middle of an outline's box. Nothing is requested until one is clicked, and nothing of
 * what they show is kept here. The note is a div, not a p: the workbench title block's e2e test finds its meta line as the only p.
 */
export function LookCloser({ bbox, className = '' }: { bbox: Bbox; className?: string }) {
  const links = lookCloserLinks(bbox)
  if (!links) return null
  return (
    // The links wrap as a pair, so a narrow column gets the title, then the two links, then the note, and a wide one a single row.
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <h2 className="text-sm font-medium">{flow.lookCloser.title}</h2>
      <div className="flex flex-wrap gap-2">
        <GoogleLink href={links.streetView}>{flow.lookCloser.streetView}</GoogleLink>
        <GoogleLink href={links.earth}>{flow.lookCloser.earth}</GoogleLink>
      </div>
      <div className="text-sm text-fg-2">{flow.lookCloser.note}</div>
    </div>
  )
}
