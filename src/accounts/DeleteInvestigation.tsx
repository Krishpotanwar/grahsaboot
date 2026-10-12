import { useRef, useState } from 'react'
import { getStore } from '../data/store.ts'
import { navigate } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'
import { account } from '../ui/copy-account.ts'
import { useToast } from '../ui/toast.tsx'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { forget } from './left.ts'
import { deleteRemote } from './remote.ts'
import { SessionExpiredError } from './save.ts'

/**
 * The end of the workbench's side column: a quiet danger button and its confirmation. The server's copy goes first (when
 * there is one), then this browser's, then the person is taken home. On a failure the dialog stays and says so, and the
 * local copy is untouched: the person is never told it is deleted while it is not.
 */
export function DeleteInvestigation({ localId, serverId }: { localId: string; serverId: string | null }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<'network' | 'signIn' | null>(null)
  const toast = useToast()
  const working = useRef(false)
  const opener = useRef<HTMLButtonElement>(null)

  async function remove() {
    if (working.current) return
    working.current = true
    setBusy(true)
    setFailed(null)
    try {
      if (serverId) await deleteRemote(serverId) // 0 rows is "already gone", which is what was asked
      forget(localId) // a save that is running must not make the server copy again, or write this one back
      await getStore().remove(localId)
      navigate('/')
      toast(account.delete.done)
    } catch (e) {
      // Signed out with a copy that was saved: the server cannot be asked until the person signs in again.
      setFailed(e instanceof SessionExpiredError ? 'signIn' : 'network')
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-5 lg:px-6">
      {/* -ml-3: the words, not the button's edge, line up with the titles of the sections above. */}
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setFailed(null)
          setOpen(true)
        }}
        className="-ml-3 inline-flex h-11 select-none items-center rounded-[6px] px-3 text-sm font-medium text-bad hover:bg-panel active:scale-[0.98]"
      >
        {account.delete.investigation}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={account.delete.investigation}
        text={serverId ? account.delete.confirmInvestigation : account.delete.confirmLocal}
        cancel={account.delete.cancel}
        confirm={failed === 'network' ? copy.common.retry : account.delete.confirm}
        busy={busy}
        failed={failed === 'signIn' ? account.delete.signInFirst : failed ? account.delete.failed : null}
        onConfirm={() => void remove()}
        finalFocus={opener}
      />
    </div>
  )
}
