import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { version } from '../../package.json'
import { useInvestigation } from '../data/useInvestigation.ts'
import type { QualityStats } from '../evidence/types.ts'
import { rgbaToPngDataUrl, rgbToRgba } from '../lib/canvas.ts'
import { Link } from '../lib/router.tsx'
import { useMapLayout } from '../map/MapStage.tsx'
import { buildReportHtml, type ReportImage } from '../report/html.ts'
import { buildProvenance } from '../report/provenance.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Skeleton, TextField } from '../ui/kit.tsx'
import { useTheme } from '../ui/theme.ts'
import { isUsable } from '../workbench/defaults.ts'
import { useEvidence } from '../workbench/useEvidence.ts'
import type { FrameResult } from '../workers/imagery-core.ts'
import NotFound from './NotFound.tsx'

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const linkClass = 'inline-flex h-11 items-center rounded-[6px] border border-control px-4'

/** A state with nothing to preview: what happened, and what to do next. */
function Notice({ text, bad = false, children }: { text: string; bad?: boolean; children?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[65ch] justify-items-start gap-4 px-4 py-20">
      <h1 className="sr-only">{flow.report.title}</h1>
      <p role={bad ? 'alert' : undefined} className={bad ? 'text-bad' : 'text-fg-2'}>
        {text}
      </p>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  )
}

export default function Report({ id }: { id: string }) {
  useMapLayout('hidden')
  const { inv, error } = useInvestigation(id)
  const [theme] = useTheme()
  const [preparedBy, setPreparedBy] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  // Only the pinned days are searched (never the range), and nothing at all until there is a pair to build the report from.
  const before = inv?.before ?? null
  const after = inv?.after ?? null
  const pair = inv && before && after ? inv : null
  const { state, grid, summary, requestFull, requestThumb, retry } = useEvidence(pair, 1024, {
    only: pair?.pinned,
  })
  const byDate = useMemo(() => new Map(state.entries.map((e) => [e.date, e])), [state.entries])
  const beforeEntry = before ? byDate.get(before) : undefined
  const afterEntry = after ? byDate.get(after) : undefined

  // All idempotent: the 10 m frames of the pair, and the preview of every other usable pinned date, which the provenance lists.
  useEffect(() => {
    if (state.phase !== 'ready') return
    for (const d of [before, after]) if (d && byDate.has(d)) requestFull(d)
    for (const e of state.entries) requestThumb(e.date)
  }, [state.phase, state.entries, byDate, before, after, requestFull, requestThumb])

  // Ready: every pinned date is checked (or failed), every usable one has its preview (or failed), and the pair's frames are in.
  // Anything less would leave SCL frames out of the provenance and print a date with no result as 0%.
  const ready =
    !!pair &&
    !!summary &&
    !!grid &&
    state.phase === 'ready' &&
    !!beforeEntry?.full &&
    !!afterEntry?.full &&
    state.entries.every(
      (e) =>
        (e.status === 'checked' || e.status === 'error') &&
        (!isUsable(e) || e.thumb !== null || e.thumbFailed),
    )
  const beforeFull = beforeEntry?.full
  const afterFull = afterEntry?.full
  const beforeStats = beforeEntry?.quality?.stats ?? null
  const afterStats = afterEntry?.quality?.stats ?? null

  const provenance = useMemo(
    () => (ready && pair && summary ? buildProvenance(pair, summary, state.entries, version) : null),
    [ready, pair, summary, state.entries],
  )
  // Apart from the HTML: typing in "Prepared by" builds the page again, never the four PNGs.
  const images = useMemo<ReportImage[]>(() => {
    if (!ready || !before || !after || !beforeFull || !afterFull) return []
    const one = (
      role: 'before' | 'after',
      date: string,
      f: FrameResult,
      stats: QualityStats | null,
    ): ReportImage => ({
      date,
      role,
      stats,
      sha256: f.sha256,
      displayUrl: rgbaToPngDataUrl(f.display.rgba, f.display.width, f.display.height),
      nativeUrl: rgbaToPngDataUrl(
        rgbToRgba(f.native.rgb, f.native.width, f.native.height),
        f.native.width,
        f.native.height,
      ),
    })
    return [one('before', before, beforeFull, beforeStats), one('after', after, afterFull, afterStats)]
  }, [ready, before, after, beforeFull, afterFull, beforeStats, afterStats])
  const html = useMemo(
    () =>
      provenance && pair && summary
        ? buildReportHtml({
            inv: pair,
            summary,
            grid: grid ?? undefined,
            images,
            entries: state.entries,
            provenance,
            theme,
            preparedBy,
            generatedAt: new Date(provenance.generatedAt),
          })
        : null,
    [provenance, pair, summary, grid, images, state.entries, theme, preparedBy],
  )

  if (inv === undefined) return <Skeleton className="m-6 h-64" />
  if (inv === null)
    return error ? (
      <Notice bad text={flow.workbench.errors[error] ?? error}>
        <Link to="/" className={linkClass}>
          {copy.notFound.home}
        </Link>
      </Notice>
    ) : (
      <NotFound text={{ title: copy.notFound.title, body: flow.workbench.notFound }} />
    )
  const back = (
    <Link to={`/i/${inv.id}`} className={linkClass}>
      {flow.report.back}
    </Link>
  )
  if (!pair) return <Notice text={flow.report.needPair}>{back}</Notice>
  if (state.phase === 'error')
    return (
      <Notice
        bad
        text={state.error === 'BAD_OUTLINE' ? flow.workbench.badOutline : flow.workbench.searchFailed}
      >
        {state.error !== 'BAD_OUTLINE' && <Button onClick={() => retry()}>{copy.common.retry}</Button>}
        {back}
      </Notice>
    )
  // A day whose search found no scene is simply not there; a frame that failed to load can be asked for again.
  const failed = [beforeEntry, afterEntry].filter((e) => e && e.error !== null && !e.full)
  if ((state.phase === 'ready' && (!beforeEntry || !afterEntry)) || failed.length)
    return (
      <Notice bad text={flow.report.pairMissing}>
        {failed.length > 0 && (
          <Button onClick={() => failed.forEach((e) => retry(e!.date))}>{copy.common.retry}</Button>
        )}
        {back}
      </Notice>
    )

  const slug =
    inv.name
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .slice(0, 40)
      .replace(/^-|-$/g, '') || 'report'
  return (
    <div className="mx-auto grid max-w-[1200px] gap-4 p-4 lg:p-6">
      <h1 className="sr-only">{`${flow.report.title}: ${inv.name}`}</h1>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <Link
          to={`/i/${inv.id}`}
          className="inline-flex h-11 items-center rounded-[6px] px-3 text-fg-2 hover:bg-panel"
        >
          {flow.report.back}
        </Link>
        <TextField
          className="w-full sm:w-72"
          label={flow.report.preparedBy}
          value={preparedBy}
          maxLength={80}
          onChange={(e) => setPreparedBy(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!html} onClick={() => html && download(`${slug}.html`, 'text/html', html)}>
            {flow.report.download}
          </Button>
          <Button
            disabled={!provenance}
            onClick={() =>
              provenance &&
              download(`${slug}.provenance.json`, 'application/json', JSON.stringify(provenance, null, 2))
            }
          >
            {flow.report.provenance}
          </Button>
          <Button variant="primary" disabled={!html} onClick={() => frame.current?.contentWindow?.print()}>
            {flow.report.print}
          </Button>
        </div>
      </div>
      {html ? (
        <iframe
          ref={frame}
          title={flow.report.title}
          srcDoc={html}
          sandbox="allow-same-origin allow-modals"
          className="h-[80dvh] w-full border border-line bg-bg"
        />
      ) : (
        <div role="status" className="grid gap-3">
          <p className="text-fg-2">{flow.report.preparing}</p>
          <Skeleton className="h-[60dvh] w-full" />
        </div>
      )}
    </div>
  )
}
