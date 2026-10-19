import { useAccountItems } from '../data/useAccountItems.ts'

export default function TextPage({
  page,
  extra,
}: {
  page: { title: string; intro: string; items: readonly string[]; pageOnly?: readonly string[] }
  /** Which accounts lines follow the page's own: none in a build without accounts, whatever is asked. */
  extra?: 'privacyItems' | 'limitsItems'
}) {
  const more = useAccountItems(extra)
  return (
    <article className="mx-auto max-w-[70ch] px-4 py-12 lg:py-20">
      <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold leading-none tracking-[-0.04em]">{page.title}</h1>
      <p className="mt-4 text-lg text-fg-2">{page.intro}</p>
      <ul className="mt-10 grid gap-px border border-line bg-line">
        {[...page.items, ...(page.pageOnly ?? []), ...more].map((t) => (
          <li key={t} className="bg-bg p-4 leading-relaxed">
            {t}
          </li>
        ))}
      </ul>
    </article>
  )
}
