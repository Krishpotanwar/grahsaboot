// Everything the app takes from accounts, and the only module src/accounts/enabled.ts imports. Nothing outside src/accounts/
// imports this file directly: it is reached through loadAccounts, which a build without the flag folds to null.
export { signInWithGoogle, signOut, useSession } from './auth.ts'
export {
  deleteAccount,
  deleteRemote,
  listRemote,
  loadRemoteInvestigation,
  recordConsent,
  remoteDeps,
} from './remote.ts'
export { framesToVerify, saveAndVerify, SessionExpiredError } from './save.ts'
export { getSupabase } from './supabase.ts'
export { account } from '../ui/copy-account.ts'
