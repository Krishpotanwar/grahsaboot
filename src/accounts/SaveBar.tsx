import { useEffect, useId, useRef, useState } from 'react'
import { setServerId, setServerNoteIds, setVerification, type Investigation } from '../data/investigation.ts'
import { fmtDate } from '../lib/format.ts'
import { account } from '../ui/copy-account.ts'
import { flow } from '../ui/copy-flow.ts'
import type { DateEntry } from '../workbench/runner.ts'
import { signInWithGoogle, useSession } from './auth.ts'
import { giveConsent, hasConsent } from './consent.ts'
import { ConsentDialog } from './ConsentDialog.tsx'
import { recordConsent, remoteDeps } from './remote.ts'
import {
  countVerified,
  saveAndVerify,
  SessionExpiredError,
  type SaveOutcome,
  type SaveProgress,
} from './save.ts'

/** What a finished run leaves to say. The counts are the investigation's own records after the run, not the run's alone. */
interface Done {
  verified: number
  mismatched: number
  latest: string | null
  failed: number
  stoppedBy: SaveOutcome['stoppedBy']
}

/** `?save=1` out of the address, and the router told (it listens to its own event): a reload must not save again. */
function dropSaveParam() {
  const q = new URLSearchParams(location.search)
  q.delete('save')
  const rest = q.toString()
  // Not `navigate()`: it scrolls to the top, and this fires 20-30 s after load. The router listens to `popstate`.
  history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : ''))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * The title block's save control (D8b): the status ("Not saved" / "Saved to your account"), the "Save and verify" button and,
 * only while there is something to say, one live line under them. It stands in for the workbench's plain status in a build with
 * accounts (src/screens/Workbench.tsx); a build without them never loads this file.
 *
 * Click: signed out goes to Google and comes back with `?save=1`; signed in but not agreed asks first; then the save runs.
 * `ready`/`why`: whether everything a save can send is in the page (E7), computed by the workbench; the button waits and says why.
 */
export function SaveBar({
  inv,
  entries,
  ready,
  why,
  update,
}: {
  inv: Investigation
  entries: DateEntry[]
  ready: boolean
  why: 'checks' | 'photos' | null
  update: (fn: (i: Investigation) => Investigation) => boolean
}) {
  // supabase-js is made here, on mount: that is also what exchanges a `?code=` from the Google sign-in on this page.
  const { session, ready: sessionReady } = useSession()
  const [busy, setBusy] = useState<SaveProgress | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [failed, setFailed] = useState(false)
  const [asking, setAsking] = useState(false)
  const [recording, setRecording] = useState(false)
  const [refused, setRefused] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  // Refs, not state: two clicks (or a click and the resume) can come before a render, and each would insert a row.
  const running = useRef(false)
  const recordingNow = useRef(false)
  // Set when this page was opened by the return from Google: a second "session ended" then is a failure to report, not another
  // trip to Google (which would loop for ever if the function refuses a session the sign-in just made).
  const afterSignIn = useRef(false)
  const wants = useRef(new URLSearchParams(location.search).get('save') === '1')
  const latest = useRef({ inv, entries })
  latest.current = { inv, entries }
  const reasonId = useId()

  const signingIn = useRef(false)
  const signIn = (path = location.pathname) => {
    // Once: two clicks would start two sign-ins and the second would overwrite the first's code verifier.
    if (signingIn.current) return
    signingIn.current = true
    // Local work stays: nothing is cleared. An error is shown in our words, never the provider's.
    signInWithGoogle(`${path}?save=1`).catch(() => {
      signingIn.current = false
      setFailed(true)
    })
  }

  async function run() {
    if (running.current) return
    running.current = true
    // The page this save is for: the run may outlive a navigation, and the sign-in must come back to THIS investigation.
    const path = location.pathname
    const { inv: sent, entries: held } = latest.current
    setBusy({ total: 0, done: 0 })
    setDone(null)
    setFailed(false)
    let expired = false
    try {
      // The row id is kept the moment it exists (E6), so a failure after it cannot orphan the row.
      const out = await saveAndVerify(remoteDeps(), sent, held, setBusy, (id) =>
        update((i) => setServerId(i, id)),
      )
      // Also when the run stopped early (a limit, the session): what was saved and checked is real and stays.
      update((i) => setServerNoteIds(setVerification(i, out.verification), out.noteIds))
      const merged = setVerification(setServerId(sent, out.serverId), out.verification)
      expired = out.stoppedBy === 'SESSION_EXPIRED'
      // A pinned date whose own check failed was never sent: it is a date that could not be checked too.
      const unchecked = held.filter((e) => sent.pinned.includes(e.date) && e.status === 'error').length
      setDone({
        ...countVerified(merged, held),
        failed: out.failed + unchecked,
        stoppedBy: out.stoppedBy,
      })
    } catch (e) {
      // Never an Error.message here: it is the database's or the network's text.
      if (e instanceof SessionExpiredError) expired = true
      else setFailed(true)
    } finally {
      running.current = false
      setBusy(null)
    }
    if (!expired) return
    if (afterSignIn.current) {
      setDone(null) // not "Saved" and "Could not save" together
      setFailed(true)
    } else signIn(path)
  }

  const start = () => {
    if (!session) return signIn()
    if (!hasConsent(session.user.id)) {
      setRefused(false)
      return setAsking(true)
    }
    void run()
  }

  async function agree() {
    const user = session?.user.id
    if (!user || recordingNow.current) return
    recordingNow.current = true
    setRecording(true)
    setRefused(false)
    try {
      // The server first; the key in this browser only after it said yes (E9).
      await giveConsent(user, recordConsent)
      setAsking(false)
      void run()
    } catch (e) {
      if (e instanceof SessionExpiredError && !afterSignIn.current) {
        setAsking(false)
        signIn()
      } else setRefused(true) // the dialog stays open, in its own words (also when a fresh session was refused: no loop)
    } finally {
      recordingNow.current = false
      setRecording(false)
    }
  }

  // Back from Google with `?save=1`: continue the save that was asked for, once, when there is a session and the page has
  // everything a save can send (the checks and photos arrive after the page does).
  useEffect(() => {
    if (!wants.current || !sessionReady) return
    if (!session) {
      // The sign-in did not complete. Forget the request: acting on it later would be a save nobody just asked for.
      wants.current = false
      dropSaveParam()
      return
    }
    if (!ready) return
    wants.current = false
    dropSaveParam()
    afterSignIn.current = true
    start()
  }, [session, sessionReady, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const progress = busy ? (busy.total === 0 ? account.working : account.saving(busy.done, busy.total)) : null
  const waiting = !ready ? account.waiting[why ?? 'checks'] : null
  const outcome =
    done && !busy
      ? done.verified > 0
        ? account.saved(done.verified, fmtDate(done.latest!.slice(0, 10)))
        : account.savedNone
      : null
  const line = progress ?? waiting ?? outcome
  // What the run could not do or found, once it is over: one line each, and a failure is an alert.
  const result = done && !busy ? done : null

  // The right group of the title block is a wrapping flex row: the status and the button sit in it beside the Report link, and
  // the lines go last (`order-last`) on a row of their own. `w-0 min-w-full` fills the row without adding the sentence's length
  // to the width the group asks for, so a long line cannot squeeze the title. Empty, the live region is `sr-only` (out of the
  // layout, still in the page): its `min-w-full` would then be the page's width, so it is taken off.
  const row = 'order-last w-0 min-w-full text-sm'
  return (
    <>
      {/* Same look as the workbench's own status. Its place is held by the Suspense fallback in Workbench.tsx: a saved copy's
          longer words get a width of their own (208 px, also there), so the row wraps the same before and after they arrive. */}
      <span
        className={`mr-2 inline-flex items-center gap-2 font-mono text-[0.8125rem] text-fg-2${inv.serverId ? ' w-52' : ''}`}
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full border-[1.5px] border-fg-2" />
        {inv.serverId ? account.savedLabel : flow.workbench.notSaved}
      </span>
      {/* An outlined accent button, secondary to the primary Report link (approved mockup 02); the kit has no such variant and
          this is its one use. 160 px wide, as the placeholder in Workbench.tsx: the row must not change size when this arrives.
          Disabled (and out of the tab order) only while the page is not ready; while saving it stays focusable (aria-disabled),
          so focus is not lost when it comes back. */}
      <button
        ref={button}
        type="button"
        disabled={!ready || !sessionReady}
        aria-disabled={busy ? true : undefined}
        aria-describedby={!ready ? reasonId : undefined}
        onClick={() => {
          afterSignIn.current = false
          start()
        }}
        className="inline-flex h-11 w-40 select-none items-center justify-center rounded-[6px] border-[1.5px] border-accent px-4 text-[0.9375rem] font-medium text-accent transition-transform duration-100 hover:bg-panel active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40"
      >
        {account.save}
      </button>
      {/* In the page before its words are, and out of the layout while empty. */}
      <div id={reasonId} aria-live="polite" className={`${row} grid gap-1 empty:sr-only empty:min-w-0`}>
        {line && <p className="text-fg-2">{line}</p>}
        {result && result.mismatched > 0 && (
          <p className="text-warn">{account.mismatched(result.mismatched)}</p>
        )}
      </div>
      {result && result.failed > 0 && (
        <p role="alert" className={`${row} text-warn`}>
          {account.failed(result.failed)}
        </p>
      )}
      {result?.stoppedBy === 'RATE_LIMITED' && (
        <p role="alert" className={`${row} text-warn`}>
          {account.limited}
        </p>
      )}
      {result?.stoppedBy === 'FRAME_LIMIT' && (
        <p role="alert" className={`${row} text-warn`}>
          {account.frameLimit}
        </p>
      )}
      {failed && (
        <p role="alert" className={`${row} text-bad`}>
          {account.saveFailed}
        </p>
      )}
      <ConsentDialog
        open={asking}
        // Not while the agreement is being recorded: closing then would still save once it came back.
        onOpenChange={(o) => {
          if (!recordingNow.current) setAsking(o)
        }}
        onAgree={() => void agree()}
        busy={recording}
        failed={refused}
        finalFocus={button}
      />
    </>
  )
}
