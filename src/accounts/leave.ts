import type { Investigation } from '../data/investigation.ts'
import type { InvestigationStore } from '../data/store.ts'

// Signing out and deleting the account, as steps with their dependencies passed in, so the order of what happens (and what
// happens when a step fails) is tested without a browser. The local store is not per user: whoever signs in next on this
// browser could open the previous person's saved copies by id, so they leave with the person (D9 ruling).

type Store = Pick<InvestigationStore, 'list' | 'remove'>

/**
 * The copies in this browser that are also on the server: they come back with the next sign-in. A copy with no server id was
 * never saved and is the only place its work exists, so it is never listed. A store that cannot be read holds nothing to leak.
 */
export async function savedCopies(store: Store): Promise<Investigation[]> {
  try {
    return (await store.list()).filter((i) => i.serverId)
  } catch {
    return []
  }
}

/** Removes the saved copies from this browser. Throws if one cannot be removed. Returns what was removed. */
export async function purgeSaved(store: Store): Promise<Investigation[]> {
  const copies = await savedCopies(store)
  for (const c of copies) await store.remove(c.id)
  return copies
}

export interface LeaveDeps {
  store: Store
  userId: string
  signOut(): Promise<unknown>
  forgetConsent(userId: string): void
}

/**
 * Sign out: the saved copies and this user's agreement leave this browser, then the session ends. A copy that cannot be
 * removed throws before anything else runs, so the person stays signed in and is told, never half signed out.
 */
export async function leave(d: LeaveDeps): Promise<Investigation[]> {
  const removed = await purgeSaved(d.store)
  d.forgetConsent(d.userId)
  await d.signOut()
  return removed
}

/**
 * Delete the account: the server first, and only then this browser's copies. When the answer was lost (`deleteAccount` threw)
 * the account may be gone all the same: `accountIsGone` asks Auth, and a gone account is done. Any other failure is thrown,
 * with nothing removed locally.
 */
export async function deleteAccountAndCopies(
  d: LeaveDeps & { deleteAccount(): Promise<void>; accountIsGone(): Promise<boolean> },
): Promise<Investigation[]> {
  try {
    await d.deleteAccount()
  } catch (e) {
    if (!(await d.accountIsGone())) throw e
  }
  return leave(d)
}

/**
 * Auth's answer to "who is signed in" after a delete whose reply never came. The user's token is refused (401, 403) or the user
 * does not exist: the account is gone. A server that fails, a connection that does not get through and a missing session are
 * not that: the account may still be there.
 */
export async function accountIsGone(
  getUser: () => Promise<{ error: { status?: number; code?: string; name?: string } | null }>,
): Promise<boolean> {
  try {
    const { error } = await getUser()
    // `AuthSessionMissingError`: the SDK has already dropped the session, so the cleanup is right whichever way the account stands.
    return (
      !!error &&
      (error.status === 401 ||
        error.status === 403 ||
        error.code === 'user_not_found' ||
        error.name === 'AuthSessionMissingError')
    )
  } catch {
    return false
  }
}
