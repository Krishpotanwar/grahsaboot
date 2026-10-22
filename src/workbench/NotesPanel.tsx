import { memo, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
import { Button, Section, TEXTAREA } from '../ui/kit.tsx'
import { withGroundNote } from '../ui/lookCloser.ts'

const KINDS: NoteKind[] = ['change', 'no_clear_change', 'unsure']

/** Which note a button is for, so 200 notes are not 400 buttons named "Edit" and "Delete": the kind, the date, the start of the text. */
const noteName = (n: Note) =>
  `${flow.notes.kinds[n.kind]}${n.date ? `, ${fmtDate(n.date)}` : ''}: ${n.body.slice(0, 40)}${n.body.length > 40 ? '…' : ''}`

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
  // Where the focus goes once the next render has put its target in the page (the button that was pressed may be gone).
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = null
    document.getElementById(id)?.focus()
  })

  // The ground-note helper: the text with "Street View, " added, or null when that would pass the cap (the button is then off).
  const bodyBox = useRef<HTMLTextAreaElement>(null)
  const withGround = withGroundNote(body)
  const startGroundNote = () => {
    if (withGround === null) return
    // Committed first, so the caret can go after the phrase: the date is the next thing the person types.
    flushSync(() => setBody(withGround))
    bodyBox.current?.focus()
    bodyBox.current?.setSelectionRange(withGround.length, withGround.length)
  }

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
    if (ok) {
      setBody('')
      setLastDeleted(null) // the undo of a delete lasts until the next note action
    } else setRefused('add')
  }

  return (
    <Section title={flow.notes.title}>
      <div className="grid gap-4">
        {/* Three real radios in one group; only their look is a row of chips. The legend is for screen readers. */}
        <fieldset>
          <legend className="sr-only">{flow.notes.kindLegend}</legend>
          <div className="flex flex-wrap gap-x-2">
            {KINDS.map((k) => (
              <label key={k} className="relative inline-flex h-11 items-center">
                <input
                  type="radio"
                  name="note-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className="inline-flex h-[34px] cursor-pointer items-center rounded-[6px] border border-control px-3 text-[0.8125rem] peer-checked:border-fg peer-checked:bg-fg peer-checked:text-bg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {flow.notes.kinds[k]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2">
          <label htmlFor="note-body" className="text-sm font-medium">
            {flow.notes.what}
          </label>
          <textarea
            ref={bodyBox}
            id="note-body"
            value={body}
            maxLength={LIMITS.notes.maxChars}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            className={TEXTAREA}
            aria-describedby="note-count"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Button size="sm" disabled={withGround === null} onClick={startGroundNote}>
              {flow.lookCloser.groundNote}
            </Button>
            <p id="note-count" className="ml-auto font-mono text-[0.75rem] text-fg-2 num">
              {flow.notes.count(body.length)}
            </p>
          </div>
        </div>
        {/* One wrapping row, so Add note takes the right end of the last line however many selects there are. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-fg-2">
          <span>
            {flow.notes.yourNote}
            <span aria-hidden> ·</span>
          </span>
          <label className="inline-flex items-center gap-2 text-xs">
            {flow.notes.forDate}
            <select
              value={tied && current ? current : ''}
              onChange={(e) => setTied(e.target.value !== '')}
              className="h-11 rounded-[6px] border border-control bg-bg px-2 text-[0.8125rem] text-fg"
            >
              {current && <option value={current}>{fmtDate(current)}</option>}
              <option value="">{flow.notes.anyDate}</option>
            </select>
          </label>
          {parts.length > 1 && (
            <label className="inline-flex items-center gap-2 text-xs">
              {flow.notes.forSection}
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="h-11 rounded-[6px] border border-control bg-bg px-2 text-[0.8125rem] text-fg"
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
          <Button variant="primary" className="ml-auto" onClick={add}>
            {flow.notes.add}
          </Button>
        </div>
        {refusal('add')}

        {lastDeleted && (
          <>
            {refusal('undo')}
            <div role="status" className="flex items-center justify-between border border-line p-2 text-sm">
              <span>{flow.notes.deleted}</span>
              <Button
                id="note-undo"
                size="sm"
                onClick={() => {
                  if (update((i) => restoreNote(i, lastDeleted))) {
                    focusNext.current = `note-edit-${lastDeleted.id}`
                    setLastDeleted(null)
                  } else setRefused('undo')
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
                        className={TEXTAREA}
                      />
                      {refusal(n.id)}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            // The editor stays open when the edit is refused, with the text as typed.
                            if (update((i) => updateNote(i, n.id, { body: editing.body }))) {
                              focusNext.current = `note-edit-${n.id}`
                              setEditing(null)
                            } else setRefused(n.id)
                          }}
                        >
                          {flow.notes.save}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setRefused(null)
                            focusNext.current = `note-edit-${n.id}`
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
                          id={`note-edit-${n.id}`}
                          size="sm"
                          aria-label={`${flow.notes.edit}: ${noteName(n)}`}
                          onClick={() => {
                            setRefused(null)
                            setLastDeleted(null) // another note action: the last delete can no longer be undone
                            focusNext.current = `edit-${n.id}`
                            setEditing({ id: n.id, body: n.body })
                          }}
                        >
                          {flow.notes.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={`${flow.notes.delete}: ${noteName(n)}`}
                          onClick={() => {
                            if (update((i) => removeNote(i, n.id))) {
                              focusNext.current = 'note-undo'
                              setLastDeleted(n)
                            }
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
    </Section>
  )
})
