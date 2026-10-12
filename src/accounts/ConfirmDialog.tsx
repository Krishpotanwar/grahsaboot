import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useRef, type RefObject } from 'react'
import { Button } from '../ui/kit.tsx'

/**
 * A question with a destructive answer (sign out and drop the saved copies, delete the account, delete an investigation).
 * Modal: focus is trapped, Escape and the first button close it, and focus goes back to `finalFocus`. The first button, the safe
 * one, takes the focus when it opens. While `onConfirm` works nothing closes it, and a failure stays in it as `failed` (a line
 * of ours, never an error's text): it is never closed on a failure, so the person is not left thinking it worked.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  text,
  cancel,
  confirm,
  busy,
  failed,
  onConfirm,
  finalFocus,
}: {
  open: boolean
  onClose(): void
  title: string
  text: string
  cancel: string
  confirm: string
  busy: boolean
  failed: string | null
  onConfirm(): void
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const safe = useRef<HTMLButtonElement>(null)
  // `aria-disabled`, not `disabled`: the button that was pressed keeps the focus while it works.
  const waiting = 'aria-disabled:pointer-events-none aria-disabled:opacity-40'
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <AlertDialog.Popup
          initialFocus={safe}
          finalFocus={finalFocus}
          className="glass fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto p-6"
        >
          <AlertDialog.Title className="text-xl font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-fg-2">{text}</AlertDialog.Description>
          {failed && (
            <p role="alert" className="text-sm text-bad">
              {failed}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {/* A Close part, so a touch screen reader finds the way out; it ends in onOpenChange, which ignores it while busy. */}
            <AlertDialog.Close
              render={<Button ref={safe} aria-disabled={busy || undefined} className={waiting} />}
            >
              {cancel}
            </AlertDialog.Close>
            <Button
              variant="danger"
              aria-disabled={busy || undefined}
              className={waiting}
              onClick={() => !busy && onConfirm()}
            >
              {confirm}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
