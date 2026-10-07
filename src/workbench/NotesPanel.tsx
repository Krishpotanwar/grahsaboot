import { memo, useEffect, useState } from 'react'
import {
  addNote,
  removeNote,
  restoreNote,
  updateNote,
  type Investigation,
  type Note,
  type NoteKind,
} from '../data/investigation.ts'
import { LIMITS } from '../geo/limits.ts'
import { fmtDate } from '../lib/format.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, Panel } from '../ui/kit.tsx'

const KINDS: NoteKind[] = ['change', 'no_clear_change', 'unsure']

interface Props {
  inv: Investigation
  /** A road's sections, from a memoised summary: a fresh array each render would defeat the memo. A site has one part and shows no section. */
  parts: Array<{ idx: number; fromM: number; toM: number }>
  /** The date on show in the timeline; null until there are passes. */
  current: string | null
  update: (fn: (i: Investigation) => Investigation) => boolean
  /** Why the last note action was refused (a key of `flow.workbench.errors`), or null. Said beside the control that was refused. */
  error: string | null
}

/** Holds only the notes: nothing here grows with the number of passes. Memoised, so a runner update renders it not at all. */
export const NotesPanel = memo(function NotesPanel({ inv, parts, current, update, error }: Props) {
  const [kind, setKind] = useState<NoteKind>('change')
  const [body, setBody] = useState('')
  // A note takes the date on show unless "no specific date" was chosen. Scrubbing the timeline moves the date, not the choice.
  const [tied, setTied] = useState(true)
  const [section, setSection] = useState('')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [lastDeleted, setLastDeleted] = useState<Note | null>(null)
  // The control the last refusal came from: 'add', 'undo' or a note's id. The page header is far above a panel the user has
  // scrolled to, so the reason is said where they are looking.
  const [refused, setRefused] = useState<string | null>(null)
  const refusal = (at: string) =>
    refused === at && error ? (
      <p role="alert" className="text-sm text-bad">
        {flow.workbench.errors[error] ?? error}
      </p>
    ) : null
  useEffect(() => {
    if (!lastDeleted) return
    const t = setTimeout(() => setLastDeleted(null), 6000)
    return () => clearTimeout(t)
  }, [lastDeleted])

  const add = () => {
    // The draft goes only when the note was kept; a refused one leaves the text where it was, and the message says why.
    const ok = update((i) =>
      addNote(i, {
        kind,
        body,
        date: tied ? current : null,
        sectionIdx: section === '' ? null : Number(section),
      }),
    )
    if (ok) setBody('')
    else setRefused('add')
  }

  return (
    <Panel title={flow.notes.title}>
      <div className="grid gap-4">
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{flow.notes.kindLegend}</legend>
          {KINDS.map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="note-kind"
                checked={kind === k}
                onChange={() => setKind(k)}
                className="accent-[var(--gs-accent)]"
              />
              {flow.notes.kinds[k]}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-2">
          <label htmlFor="note-body" className="text-sm font-medium">
            {flow.notes.what}
          </label>
          <textarea
            id="note-body"
            value={body}
            maxLength={LIMITS.notes.maxChars}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            className="rounded-[6px] border border-control bg-bg p-3 text-fg focus:border-accent"
            aria-describedby="note-count"
          />
          <p id="note-count" className="text-right font-mono text-[0.75rem] text-fg-2 num">
            {flow.notes.count(body.length)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            {flow.notes.forDate}
            <select
              value={tied && current ? current : ''}
              onChange={(e) => setTied(e.target.value !== '')}
              className="h-11 rounded-[6px] border border-control bg-bg px-2 text-fg"
            >
              {current && <option value={current}>{fmtDate(current)}</option>}
              <option value="">{flow.notes.anyDate}</option>
            </select>
          </label>
          {parts.length > 1 && (
            <label className="grid gap-2 text-sm font-medium">
              {flow.notes.forSection}
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="h-11 rounded-[6px] border border-control bg-bg px-2 text-fg"
              >
                <option value="">{flow.notes.anySection}</option>
                {parts.map((p) => (
                  <option key={p.idx} value={p.idx}>
                    {flow.workbench.section(p.fromM, p.toM)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {refusal('add')}
        <Button variant="primary" onClick={add}>
          {flow.notes.add}
        </Button>

        {lastDeleted && (
          <>
            {refusal('undo')}
            <div role="status" className="flex items-center justify-between border border-line p-2 text-sm">
              <span>{flow.notes.deleted}</span>
              <Button
                size="sm"
                onClick={() => {
                  if (update((i) => restoreNote(i, lastDeleted))) setLastDeleted(null)
                  else setRefused('undo')
                }}
              >
                {flow.notes.undo}
              </Button>
            </div>
          </>
        )}

        {inv.notes.length === 0 ? (
          <p className="text-sm text-fg-2">{flow.notes.none}</p>
        ) : (
          <ul className="grid gap-px bg-line">
            {inv.notes.map((n) => {
              // A section that is not (or no longer) there is left out: no label beats a wrong one.
              const part = n.sectionIdx === null ? undefined : parts.find((p) => p.idx === n.sectionIdx)
              return (
                <li key={n.id} className="grid gap-2 bg-bg p-3">
                  <p className="font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2">
                    {flow.notes.kinds[n.kind]}
                    {n.date ? ` · ${fmtDate(n.date)}` : ''}
                    {part ? ` · ${flow.workbench.section(part.fromM, part.toM)}` : ''}
                  </p>
                  {editing?.id === n.id ? (
                    <>
                      <label className="sr-only" htmlFor={`edit-${n.id}`}>
                        {flow.notes.edit}
                      </label>
                      <textarea
                        id={`edit-${n.id}`}
                        value={editing.body}
                        maxLength={LIMITS.notes.maxChars}
                        rows={3}
                        onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                        className="rounded-[6px] border border-control bg-bg p-3 text-fg"
                      />
                      {refusal(n.id)}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            // The editor stays open when the edit is refused, with the text as typed.
                            if (update((i) => updateNote(i, n.id, { body: editing.body }))) setEditing(null)
                            else setRefused(n.id)
                          }}
                        >
                          {flow.notes.save}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setRefused(null)
                            setEditing(null)
                          }}
                        >
                          {flow.notes.cancel}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{n.body}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setRefused(null)
                            setEditing({ id: n.id, body: n.body })
                          }}
                        >
                          {flow.notes.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (update((i) => removeNote(i, n.id))) setLastDeleted(n)
                          }}
                        >
                          {flow.notes.delete}
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
})
