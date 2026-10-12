import { Menu } from '@base-ui/react/menu'
import { UserCircle } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { getStore } from '../data/store.ts'
import { navigate } from '../lib/router.tsx'
import { copy } from '../ui/copy.ts'
import { account } from '../ui/copy-account.ts'
import { Button } from '../ui/kit.tsx'
import { useToast } from '../ui/toast.tsx'
import { signInWithGoogle, signOut, useSession } from './auth.ts'
import { clearConsent } from './consent.ts'
import { left } from './left.ts'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { accountIsGone, deleteAccountAndCopies, leave, savedCopies } from './leave.ts'
import { deleteAccount } from './remote.ts'
import { getSupabase } from './supabase.ts'

// Set when this person has just left: the sign-in button that replaces the menu then takes the focus, which was on the menu.
let justLeft = false

/**
 * The header's account control, on every page of a build with accounts. It fills the box the shell holds for it (the icon on a
 * phone, the word from `sm`), so the nav does not change size as the code and the session arrive. Mounting it makes the
 * Supabase client, which is what exchanges the `?code=` of a return from Google, wherever Google sent the person.
 */
export function AccountMenu() {
  const { session, ready } = useSession()
  if (!ready) return null
  return session ? <Menus userId={session.user.id} /> : <SignIn />
}

/** The glyph on a phone, the word from `sm`: the name is the full words either way (the word is its first part). */
const label = (text: string) => (
  <>
    <UserCircle size={20} weight="bold" aria-hidden className="sm:hidden" />
    <span className="hidden sm:inline">{text}</span>
  </>
)

function SignIn() {
  const toast = useToast()
  const going = useRef(false)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (justLeft) button.current?.focus()
    justLeft = false
  }, [])
  // Back from Google can hand this very page back from the browser's cache: nothing is leaving any more, so the button must work.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) going.current = false
    }
    window.addEventListener('pageshow', back)
    return () => window.removeEventListener('pageshow', back)
  }, [])
  return (
    <Button
      ref={button}
      size="sm"
      variant="ghost"
      className="w-full"
      aria-label={account.signIn}
      title={account.signIn}
      onClick={() => {
        // Once: a second click would start a second sign-in over the first one's code verifier.
        if (going.current) return
        going.current = true
        // Back to this page as it is. No `?save=1`: signing in from the menu asks for nothing to be saved.
        signInWithGoogle(location.pathname + location.search).catch(() => {
          going.current = false
          toast(account.signInFailed)
        })
      }}
    >
      {label(account.signInShort)}
    </Button>
  )
}

type Ask = { kind: 'signOut'; n: number } | { kind: 'delete' }

const ITEM =
  'flex min-h-11 cursor-default select-none items-center rounded-[6px] px-3 text-sm outline-none data-[highlighted]:bg-line'

function Menus({ userId }: { userId: string }) {
  const toast = useToast()
  const [ask, setAsk] = useState<Ask | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const working = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)

  async function go(kind: Ask['kind']) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setFailed(false)
    justLeft = true
    try {
      const deps = { store: getStore(), userId, signOut, forgetConsent: clearConsent }
      const removed =
        kind === 'delete'
          ? await deleteAccountAndCopies({
              ...deps,
              deleteAccount: () => deleteAccount(),
              accountIsGone: () => accountIsGone(() => getSupabase().auth.getUser()),
            })
          : await leave(deps)
      // The investigation on screen has just left this browser: stay on it and the next change would put it back.
      left() // a save that was running stands down: it must not write a removed copy back
      const here = /^\/i\/([^/]+)/.exec(location.pathname)?.[1]
      if (kind === 'delete' || removed.some((c) => c.id === here || c.serverId === here)) navigate('/')
      if (kind === 'delete') toast(account.delete.done)
      setAsk(null)
    } catch {
      justLeft = false
      setFailed(true)
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  // Saved copies are removed from this browser at sign-out, so it asks first; with none there is nothing to ask.
  async function askSignOut() {
    const n = (await savedCopies(getStore())).length
    if (n) {
      setFailed(false)
      setAsk({ kind: 'signOut', n })
    } else void go('signOut')
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          ref={trigger}
          aria-label={account.menu}
          title={account.menu}
          render={<Button size="sm" variant="ghost" className="w-full" />}
        >
          {label(account.menu)}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-50">
            <Menu.Popup className="glass grid min-w-56 p-1">
              <Menu.Item onClick={() => void askSignOut()} className={ITEM}>
                {account.signOut}
              </Menu.Item>
              <Menu.Item
                onClick={() => {
                  setFailed(false)
                  setAsk({ kind: 'delete' })
                }}
                className={`${ITEM} text-bad`}
              >
                {account.delete.account}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <ConfirmDialog
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={ask?.kind === 'delete' ? account.delete.account : account.signOut}
        text={
          ask?.kind === 'delete'
            ? account.delete.confirmAccount
            : account.signOutConfirm(ask?.kind === 'signOut' ? ask.n : 0)
        }
        cancel={ask?.kind === 'delete' ? account.delete.cancel : copy.common.cancel}
        confirm={
          failed ? copy.common.retry : ask?.kind === 'delete' ? account.delete.confirm : account.signOut
        }
        busy={busy}
        failed={failed ? (ask?.kind === 'delete' ? account.delete.failed : account.signOutFailed) : null}
        onConfirm={() => ask && void go(ask.kind)}
        finalFocus={trigger}
      />
    </>
  )
}
