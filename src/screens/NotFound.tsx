import { Link } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'

export default function NotFound() {
  return (
    <div className="pointer-events-auto mx-auto max-w-[65ch] px-4 py-20">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{copy.notFound.title}</h1>
      <p className="mt-3 text-fg-2">{copy.notFound.body}</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-[6px] border border-control px-4">
        {copy.notFound.home}
      </Link>
    </div>
  )
}
