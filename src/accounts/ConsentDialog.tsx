import { Dialog } from '@base-ui/react/dialog'
import { useRef, useState, type RefObject } from 'react'
import { Link } from '../lib/router.tsx'
import { account } from '../ui/copy-account.ts'
import { Button } from '../ui/kit.tsx'

/**
 * The notice and the 18+ confirmation before a first save. A modal dialog: focus stays inside it, Escape closes it, and
 * `finalFocus` puts focus back on the button that asked. The tick starts empty each time it opens (the body mounts with the
 * popup). `busy`: the agreement is being recorded, so it cannot be closed or sent twice. `failed`: the server did not record it,
 * so it stays open and says so; nothing was saved. Whether the person has agreed is `consent.ts`'s, not the dialog's.
 */
export function ConsentDialog({
  open,
  onOpenChange,
  onAgree,
  busy,
  failed,
  finalFocus,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onAgree(): void
  busy: boolean
  failed: boolean
  finalFocus: RefObject<HTMLElement | null>
}) {
  const tick = useRef<HTMLInputElement>(null)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup
          initialFocus={tick}
          finalFocus={finalFocus}
          className="glass fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto p-6"
        >
          <Body tick={tick} busy={busy} failed={failed} onAgree={onAgree} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Body({
  tick,
  busy,
  failed,
  onAgree,
}: {
  tick: RefObject<HTMLInputElement | null>
  busy: boolean
  failed: boolean
  onAgree(): void
}) {
  const [adult, setAdult] = useState(false)
  return (
    <>
      <Dialog.Title className="text-xl font-semibold">{account.consent.title}</Dialog.Title>
      <Dialog.Description className="text-fg-2">{account.consent.intro}</Dialog.Description>
      <ul className="grid list-disc gap-2 pl-5 text-sm">
        {account.consent.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {/* A link in this app, not a new window: the investigation is already in this browser. */}
      <Link
        to="/privacy"
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        {account.consent.privacy}
      </Link>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          ref={tick}
          type="checkbox"
          checked={adult}
          onChange={(e) => setAdult(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--gs-accent)]"
        />
        {account.consent.age}
      </label>
      {failed && (
        <p role="alert" className="text-sm text-bad">
          {account.consent.failed}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Dialog.Close disabled={busy} render={<Button>{account.consent.cancel}</Button>} />
        <Button variant="primary" disabled={!adult || busy} onClick={onAgree}>
          {account.consent.agree}
        </Button>
      </div>
    </>
  )
}
