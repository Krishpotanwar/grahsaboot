import { Link } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'

export default function GlobeScreen() {
  return (
    <div className="grid min-h-[calc(100dvh-64px)] lg:grid-cols-[38%_1fr]">
      <section className="pointer-events-auto relative z-10 flex flex-col justify-end gap-6 bg-bg p-6 pb-10 lg:justify-center lg:p-12">
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.04em]">
          {copy.app.promise}
        </h1>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/new"
            className="inline-flex h-11 items-center rounded-[6px] bg-fg px-4 font-medium text-bg"
          >
            {copy.nav.newInvestigation}
          </Link>
          <Link
            to="/new?example=nagpur"
            className="inline-flex h-11 items-center rounded-[6px] px-4 text-fg-2 hover:bg-panel hover:text-fg"
          >
            {copy.nav.example}
          </Link>
        </div>
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}
