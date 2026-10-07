import { estimateFirstView } from '../geo/estimate.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { draftToAoi, validateDates, ymd } from './draft.ts'
import type { StepProps } from './PlaceStep.tsx'

export function DatesStep({ draft, setDraft, onBack, onNext }: StepProps) {
  const today = ymd(new Date())
  const problem = validateDates(draft.dateFrom, draft.dateTo)
  const aoi = draftToAoi(draft)
  const r = aoi ? summarizeAoi(aoi) : null
  const est = r?.ok && !problem ? estimateFirstView(r.summary, draft.dateFrom, draft.dateTo) : null
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.dates.title}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={flow.dates.from}
          type="date"
          min={LIMITS.dates.earliest}
          max={today}
          value={draft.dateFrom}
          onChange={(e) => {
            const dateFrom = e.target.value
            setDraft((d) => ({ ...d, dateFrom }))
          }}
        />
        <TextField
          label={flow.dates.to}
          type="date"
          min={LIMITS.dates.earliest}
          max={today}
          value={draft.dateTo}
          onChange={(e) => {
            const dateTo = e.target.value
            setDraft((d) => ({ ...d, dateTo }))
          }}
        />
      </div>
      <p className="text-sm text-fg-2">{flow.dates.help}</p>
      <div aria-live="polite" className="text-sm">
        {problem && (
          <p className="text-bad" role="alert">
            {flow.dates[problem]}
          </p>
        )}
        {est && <p className="font-mono num">{flow.dates.estimate(est.dates, est.mb)}</p>}
      </div>
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" disabled={!!problem} onClick={onNext}>
          {copy.common.next}
        </Button>
      </div>
    </div>
  )
}
