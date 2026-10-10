import type { Investigation } from '../data/investigation.ts'
import type { DisplayGrid, QualityStats } from '../evidence/types.ts'
import type { AoiSummary } from '../geo/aoi.ts'
import { fmtDate, pct } from '../lib/format.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { outlinePath } from '../workbench/overlay.ts'
import type { DateEntry } from '../workbench/runner.ts'
import { escapeHtml as e, jsonForHtml } from './escape.ts'
import type { Provenance } from './provenance.ts'

/** `displayUrl` and `nativeUrl` are data URLs the app made itself from the pixels it hashed. */
export interface ReportImage {
  date: string
  role: 'before' | 'after'
  displayUrl: string
  nativeUrl: string
  stats: QualityStats | null
  sha256: string
}

// System fonts only (no serif), so the file stays small. Print is white paper whatever the theme.
const CSS = `
:root{--bg:#09090b;--panel:#18181b;--line:#27272a;--fg:#f4f4f5;--fg2:#a1a1aa;--accent:#e48444;color-scheme:dark}
[data-theme="light"]{--bg:#fff;--panel:#fafafa;--line:#e4e4e7;--fg:#18181b;--fg2:#52525b;--accent:#a74e1b;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 ui-sans-serif,system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 20px}h1{font-size:2.25rem;letter-spacing:-.04em;line-height:1.1;margin:.5rem 0 1rem;overflow-wrap:anywhere}
h2{font-size:1.125rem;font-weight:600;letter-spacing:-.01em;margin:0 0 .75rem}
section{display:grid;grid-template-columns:2.75rem minmax(0,1fr);border-bottom:1px solid var(--line);padding:16px 0}h2+p{margin-top:0}section p:last-child{margin-bottom:0}
.n{font:.875rem ui-monospace,monospace;color:var(--fg2);padding-top:2px}
.mono{font-family:ui-monospace,monospace;font-size:.8rem;color:var(--fg2);overflow-wrap:anywhere}.eyebrow{text-transform:uppercase;letter-spacing:.14em;margin:0}
.grid{display:grid;gap:16px}@media(min-width:700px){.two{grid-template-columns:1fr 1fr}}
.strip{display:flex;flex-wrap:wrap;align-items:stretch;margin-top:20px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.strip dl{display:flex;flex-wrap:wrap;margin:0}.strip dl div{display:grid;gap:4px;padding:12px 24px;border-right:1px solid var(--line)}.strip dl div:first-child{padding-left:0}
.strip dt{font:.6875rem ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--fg2)}.strip dd{margin:0;font:500 1rem ui-monospace,monospace}
.strip .by{margin:0 0 0 auto;padding:12px 0 12px 24px;align-self:center;color:var(--fg2);font-size:.875rem;text-align:right;overflow-wrap:anywhere}
figure{margin:0}.ph{position:relative;border:1px solid var(--line);line-height:0}.ph img{width:100%;height:auto;display:block}
.ph svg{position:absolute;inset:0;width:100%;height:100%}.ph path{fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}
.ph path.site{fill:var(--accent);fill-opacity:.08}figcaption{margin-top:8px}
img.native{width:auto;max-width:100%;height:auto;image-rendering:pixelated;border:1px solid var(--line)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:36rem;font-size:.9rem}
td,th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}tbody th,.sections thead th{font-weight:400;white-space:nowrap}
.note{white-space:pre-wrap;overflow-wrap:anywhere}article{margin-bottom:12px}article p{margin:.25rem 0}
.badge{display:inline-block;border:1px solid var(--line);padding:2px 6px;font-family:ui-monospace,monospace;font-size:.75rem}
.badge.accent{border-color:var(--accent);color:var(--accent);margin:0}
details pre{white-space:pre-wrap;word-break:break-all;font-size:.7rem}
@media print{:root,[data-theme="dark"],[data-theme="light"]{--bg:#fff;--panel:#fff;--line:#ccc;--fg:#000;--fg2:#333;--accent:#a74e1b;color-scheme:light}main{padding:0}.scroll{overflow:visible}table{min-width:0}figure,table,tr{break-inside:avoid}h2{break-after:avoid}details{display:none}}
`

const none = flow.report.values.none
const word = (s: QualityStats | null | undefined) => (s ? copy.quality[s.label].word : none)

export function buildReportHtml(a: {
  inv: Investigation
  summary: AoiSummary
  /** The grid the photos are drawn on: with it, the outline is drawn over each of them. */
  grid?: DisplayGrid
  images: ReportImage[]
  entries: DateEntry[]
  provenance: Provenance
  theme: 'dark' | 'light'
  preparedBy: string
  generatedAt: Date
}): string {
  const { inv, summary: s } = a
  const R = flow.report
  const pinned = a.entries.filter((x) => inv.pinned.includes(x.date))
  const obscured = pinned.filter(
    (x) => x.quality && (x.quality.stats.label === 'OBSCURED' || x.quality.stats.label === 'NOT_COVERED'),
  ).length
  const unchecked = pinned.filter((x) => !x.quality).length
  const range = flow.review.range(fmtDate(inv.dateFrom), fmtDate(inv.dateTo))
  const compared =
    inv.before && inv.after ? flow.workbench.meta.pair(fmtDate(inv.before), fmtDate(inv.after)) : range
  const size =
    s.kind === 'site'
      ? flow.outline.summarySite(s.areaKm2, s.extentKm)
      : flow.outline.summaryRoad(s.lengthKm ?? 0, s.parts.length)
  const width = inv.aoi.kind === 'road' ? R.values.roadWidth(inv.aoi.widthM) : ''
  const iso = a.generatedAt.toISOString()
  const prepared = a.preparedBy.trim()

  const alt = (img: ReportImage) =>
    flow.workbench.photoAlt(
      flow.workbench[img.role],
      fmtDate(img.date),
      img.stats ? pct(img.stats.clearFraction) : undefined,
    )
  const figure = (img: ReportImage) => {
    const outline = a.grid
      ? `<svg aria-hidden="true" viewBox="0 0 ${a.grid.width} ${a.grid.height}" preserveAspectRatio="none"><path${s.kind === 'site' ? ' class="site"' : ''} d="${outlinePath(inv.aoi, a.grid)}"/></svg>`
      : ''
    const caption = flow.workbench.caption(
      fmtDate(img.date),
      img.stats ? pct(img.stats.clearFraction) : undefined,
    )
    const badge = img.stats ? ` · <span class="badge">${e(word(img.stats))}</span>` : ''
    return `<figure><div class="ph"><img src="${img.displayUrl}" alt="${e(alt(img))}">${outline}</div><figcaption class="mono">${e(caption)}${badge}<br>${e(R.labels.sha256)}: ${e(img.sha256)}</figcaption></figure>`
  }
  const native = (img: ReportImage) =>
    `<img class="native" src="${img.nativeUrl}" alt="${e(`${alt(img)} · ${R.nativeAlt}`)}">`

  const evidence = `<div class="grid two">${a.images.map(figure).join('')}</div>${
    a.images.length
      ? `<p class="mono">${e(R.nativeNote)}</p><div class="grid two">${a.images.map(native).join('')}</div>`
      : ''
  }`

  const scroll = (title: string, table: string) =>
    `<div class="scroll" tabindex="0" role="region" aria-label="${e(title)}">${table}</div>`

  const timeline = `<table class="dates"><thead><tr>${[
    R.labels.date,
    R.labels.view,
    R.labels.clear,
    R.labels.serverCheck,
    R.labels.source,
    R.labels.sha256,
  ]
    .map((h) => `<th scope="col">${e(h)}</th>`)
    .join('')}</tr></thead><tbody>${pinned
    .map(
      (x) =>
        `<tr><th scope="row">${e(fmtDate(x.date))}</th><td>${e(word(x.quality?.stats))}</td><td>${x.quality ? `${pct(x.quality.stats.clearFraction)}%` : e(none)}</td><td>${e(R.values.notChecked)}</td><td class="mono">${e(x.candidate.item.id)}</td><td class="mono">${e(x.full?.sha256 ?? x.quality?.sha256 ?? none)}</td></tr>`,
    )
    .join('')}</tbody></table>`

  const grid =
    s.kind === 'road' && pinned.length
      ? `<table class="sections"><thead><tr><th scope="col">${e(flow.workbench.sectionCol)}</th>${pinned.map((x) => `<th scope="col">${e(fmtDate(x.date))}</th>`).join('')}</tr></thead><tbody>${s.parts
          .map(
            (p) =>
              `<tr><th scope="row">${e(flow.workbench.section(p.fromM, p.toM))}</th>${pinned.map((x) => `<td>${e(word(x.quality?.parts.find((q) => q.idx === p.idx)?.stats))}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table>`
      : ''

  const notes = inv.notes.length
    ? inv.notes
        .map((n) => {
          const part = n.sectionIdx === null ? undefined : s.parts.find((p) => p.idx === n.sectionIdx)
          return `<article><p><span class="badge">${e(flow.notes.kinds[n.kind])}</span>${n.date ? ` <span class="mono">${e(fmtDate(n.date))}</span>` : ''}${part ? ` <span class="mono">${e(flow.workbench.section(part.fromM, part.toM))}</span>` : ''}</p><p class="note">${e(n.body)}</p></article>`
        })
        .join('')
    : `<p>${e(R.noNotes)}</p>`

  const claimLine = inv.claim
    ? [inv.claim.date ? fmtDate(inv.claim.date) : '', inv.claim.criterion].filter(Boolean).join(' · ')
    : ''
  const claim = inv.claim
    ? `<p class="note">${e(inv.claim.text)}</p>${claimLine ? `<p class="mono">${e(claimLine)}</p>` : ''}`
    : `<p>${e(R.noClaim)}</p>`

  const gaps = `<p>${e(R.obscured(obscured, pinned.length))}${unchecked ? ` ${e(R.unchecked(unchecked))}` : ''}</p><ul>${copy.pages.limits.items.map((t) => `<li>${e(t)}</li>`).join('')}</ul>`

  const prov = a.provenance
  const provenance = `<p class="mono">${e([prov.schema, `${prov.app.name} ${prov.app.version}`, prov.generatedAt].join(' · '))}</p><details><summary>${e(R.json)}</summary><pre>${e(JSON.stringify(prov, null, 2))}</pre></details><script type="application/json" id="provenance">${jsonForHtml(prov)}</script>`

  const S = R.sections
  const sections: Array<[string, string]> = [
    [S.looked, `<p>${e([flow.review.kind[s.kind], size, width, range].filter(Boolean).join(' · '))}</p>`],
    [S.evidence, evidence],
    [S.timeline, scroll(S.timeline, timeline)],
    ...(grid ? [[S.grid, scroll(S.grid, grid)] as [string, string]] : []),
    [S.notes, notes],
    [S.claim, claim],
    [S.gaps, gaps],
    [S.provenance, provenance],
    [S.attribution, `<p class="mono">${prov.attribution.map(e).join(' · ')}</p>`],
  ]

  const L = R.labels
  const facts: Array<[string, string]> = [
    s.kind === 'site' ? [L.area, R.values.area(s.areaKm2)] : [L.length, R.values.length(s.lengthKm ?? 0)],
    [L.dates, compared],
    [L.source, R.values.source],
    [L.resolution, R.values.resolution],
  ]

  return `<!doctype html>
<html lang="en" data-theme="${a.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(R.title)}: ${e(inv.name)}</title><style>${CSS}</style></head>
<body><main>
<p class="mono eyebrow">${e(copy.app.name)} · ${e(R.title)} · ${e(R.generated)} ${e(fmtDate(iso.slice(0, 10)))} ${e(iso.slice(11, 16))} UTC</p>
<h1>${e(inv.name)}</h1>
<p class="badge accent">${e(R.unverified)}</p>
<div class="strip"><dl>${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>${prepared ? `<p class="by">${e(R.preparedByLabel)}: ${e(prepared)}</p>` : ''}</div>
${sections.map(([title, body], i) => `<section><span class="n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h2>${e(title)}</h2>${body}</div></section>`).join('\n')}
</main></body></html>`
}
