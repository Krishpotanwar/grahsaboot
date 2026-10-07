import { useRef, useState } from 'react'
import { newInvestigation } from '../data/investigation.ts'
import { getStore } from '../data/store.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { estimateFirstView } from '../geo/estimate.ts'
import { navigate } from '../lib/router.tsx'
import { placeLabel } from '../map/camera.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { draftToAoi } from './draft.ts'
import type { StepProps } from './PlaceStep.tsx'

export function ReviewStep({ draft, setDraft, onBack }: StepProps) {
  // A ref, not a disabled button: a disabled button drops keyboard focus in Chrome, and a second press must not mint a second investigation.
  const saving = useRef(false)
  const [failed, setFailed] = useState(false)
  const aoi = draftToAoi(draft)
  const r = aoi ? summarizeAoi(aoi) : null
  if (!aoi || !r?.ok) return null
  const s = r.summary
  const est = estimateFirstView(s, draft.dateFrom, draft.dateTo)
  const open = async () => {
    if (saving.current) return
    saving.current = true
    setFailed(false)
    let inv
    try {
      inv = newInvestigation({
        name: draft.name || (draft.place ? placeLabel(draft.place) : ''),
        aoi,
        dateFrom: draft.dateFrom,
        dateTo: draft.dateTo,
        before: draft.before,
        after: draft.after,
      })
      await getStore().put(inv)
    } catch {
      // IndexedDB can be off (private mode) or full: say so and let the user try again, never fail silently.
      saving.current = false
      setFailed(true)
      return
    }
    navigate(`/i/${inv.id}`)
  }
  const rows: Array<[string, string]> = [
    [flow.review.labels.kind, flow.review.kind[s.kind]],
    [
      flow.review.labels.size,
      s.kind === 'site'
        ? flow.outline.summarySite(s.areaKm2, s.extentKm)
        : flow.outline.summaryRoad(s.lengthKm ?? 0, s.parts.length),
    ],
    [flow.review.labels.dates, flow.review.range(draft.dateFrom, draft.dateTo)],
    [flow.review.labels.data, flow.dates.estimate(est.dates, est.mb)],
  ]
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.review.title}</h1>
      <TextField
        label={flow.review.name}
        value={draft.name}
        maxLength={120}
        onChange={(e) => {
          const name = e.target.value
          setDraft((d) => ({ ...d, name }))
        }}
      />
      <dl className="grid gap-px border border-line bg-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 bg-bg p-3 sm:grid-cols-[10rem_1fr]">
            <dt className="font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2">{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-fg-2">{flow.review.privacy}</p>
      {failed && (
        <p role="alert" className="text-sm text-bad">
          {flow.workbench.errors.SAVE_FAILED}
        </p>
      )}
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" onClick={() => void open()}>
          {flow.review.open}
        </Button>
      </div>
    </div>
  )
}
