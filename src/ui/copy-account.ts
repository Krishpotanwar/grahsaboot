import { LIMITS } from '../geo/limits.ts'

// Spec 8.2: the scene check and the preview of each pinned date, and the full photo of before and after.
const FRAME_CAP = LIMITS.pinnedDates * 2 + 2

// Every word of the accounts feature. Only src/accounts/ imports this file (tests/unit/accounts-boundary.test.ts), so a build
// without the accounts flag holds none of it (scripts/check-bundle.ts looks for "Sign in with Google").
export const account = {
  signIn: 'Sign in with Google',
  signOut: 'Sign out',
  menu: 'Account',
  mine: 'My investigations',
  none: 'Nothing saved yet.',
  save: 'Save and verify',
  savedLabel: 'Saved to your account',
  // Said until the first answer says how many dates there are to verify.
  working: 'Saving your investigation',
  saving: (done: number, total: number) => `Verifying ${done} of ${total} dates`,
  saved: (verified: number, at: string) =>
    `Saved · ${verified} frame${verified === 1 ? '' : 's'} verified · ${at}`,
  savedNone: 'Saved. No frames are verified yet.',
  // Why "Save and verify" is dimmed: what it is waiting for. It saves everything it can in one go.
  waiting: {
    checks: 'Waiting for the date checks to finish.',
    photos: 'Waiting for the photos to load.',
  },
  mismatched: (n: number) =>
    `${n} frame${n === 1 ? '' : 's'} did not match the source file. It is shown as unverified.`,
  failed: (n: number) => `${n} date${n === 1 ? '' : 's'} could not be checked. Save again to retry.`,
  limited: 'Daily verification limit reached. The rest will verify when you save again tomorrow.',
  // A refusal that saving again cannot fix: say what to do instead.
  frameLimit: `This investigation holds as many frames as a saved one can keep (${FRAME_CAP}). Saving again will not change that. Unpin some dates, or split it into two investigations.`,
  saveFailed: 'Could not save. Your work is still in this browser.',
  consent: {
    title: 'Before you save',
    intro:
      'Saving stores your outline, dates, notes and claim with your Google name and email, so you can open them on any device.',
    points: [
      'We read satellite photos from public files; we never send your name or email to them.',
      'Each saved photo is re-checked by our server against the public source file.',
      'We keep a log of actions with IDs only, for one year, for security. The record that you agreed is kept while your account exists.',
      'You can delete any investigation, or your whole account, at any time. We remove saved investigations 12 months after your last sign-in; your Google name and email stay until you delete your account.',
    ],
    age: 'I am 18 or older.',
    agree: 'Agree and save',
    cancel: 'Not now',
    // The agreement is saved first and the save follows, so a failure here means nothing went to the server.
    failed: 'Could not record your agreement, so nothing was saved. Try again.',
    privacy: 'Read the privacy notice',
  },
  delete: {
    investigation: 'Delete investigation',
    confirmInvestigation:
      'Delete this investigation from this browser and from your account? This cannot be undone.',
    account: 'Delete my account and data',
    confirmAccount: 'Delete your account and everything saved with it? This cannot be undone.',
    confirm: 'Delete',
    cancel: 'Keep',
    done: 'Deleted.',
    failed: 'Could not delete. Check your connection and try again.',
  },
  /** The privacy page's two sign-in items. A build with accounts appends them to `copy.pages.privacy.items` (D9). */
  privacyItems: [
    'If you sign in to save, we store your Google name and email, your outlines, dates, notes and claims, and a log of actions with IDs only. The log is kept for one year; the record that you agreed is kept while your account exists.',
    'You can delete any investigation, or your whole account, at any time. Saved investigations are removed 12 months after your last sign-in; your Google name and email stay until you delete your account.',
  ],
  /** The limits page's sentence about accounts, with the numbers the server enforces. Appended in builds with accounts (D9). */
  limitsItems: [
    `Signed-in accounts can save ${LIMITS.investigationsPerUser} investigations and verify ${LIMITS.verifiedFramesPerDay} frames per day.`,
  ],
} as const
