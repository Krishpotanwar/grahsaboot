import { memo, useState } from 'react'
import { setClaim, type Investigation } from '../data/investigation.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Panel, TextField } from '../ui/kit.tsx'

/** The optional claim, kept as typed in the fields until Save. Memoised, so a runner update renders it not at all. */
export const ClaimPanel = memo(function ClaimPanel({
  inv,
  update,
  error,
}: {
  inv: Investigation
  update: (fn: (i: Investigation) => Investigation) => boolean
  /** Why Save was refused (a key of `flow.workbench.errors`), or null. Said here: the page header is far above this panel. */
  error: string | null
}) {
  const [text, setText] = useState(inv.claim?.text ?? '')
  const [date, setDate] = useState(inv.claim?.date ?? '')
  const [criterion, setCriterion] = useState(inv.claim?.criterion ?? '')
  return (
    <Panel title={flow.claim.title}>
      <div className="grid gap-4">
        <p className="text-sm text-fg-2">{flow.claim.help}</p>
        <div className="grid gap-2">
          <label htmlFor="claim-text" className="text-sm font-medium">
            {flow.claim.text}
          </label>
          <textarea
            id="claim-text"
            value={text}
            maxLength={2000}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            className="rounded-[6px] border border-control bg-bg p-3 text-fg focus:border-accent"
          />
        </div>
        <TextField
          label={flow.claim.date}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label={flow.claim.criterion}
          value={criterion}
          maxLength={500}
          onChange={(e) => setCriterion(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-bad">
            {flow.workbench.errors[error] ?? error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!text.trim()}
            onClick={() => update((i) => setClaim(i, { text, date: date || null, criterion }))}
          >
            {flow.claim.save}
          </Button>
          {inv.claim && (
            <Button
              variant="ghost"
              onClick={() => {
                if (!update((i) => setClaim(i, null))) return
                setText('')
                setDate('')
                setCriterion('')
              }}
            >
              {flow.claim.remove}
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
})
