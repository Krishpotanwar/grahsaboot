export default function TextPage({
  page,
}: {
  page: { title: string; intro: string; items: readonly string[] }
}) {
  return (
    <article className="mx-auto max-w-[70ch] px-4 py-12 lg:py-20">
      <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold leading-none tracking-[-0.04em]">{page.title}</h1>
      <p className="mt-4 text-lg text-fg-2">{page.intro}</p>
      <ul className="mt-10 grid gap-px border border-line bg-line">
        {page.items.map((t) => (
          <li key={t} className="bg-bg p-4 leading-relaxed">
            {t}
          </li>
        ))}
      </ul>
    </article>
  )
}
