// The words of signing in, and the one line that may name Google, kept in one place for the two guards that keep them off the live
// pages of a build without accounts: src/ui/copy-account.test.ts (the copy) and tests/e2e/dormant.spec.ts (the pages as served).
// One file, so that the two cannot drift apart.

/** What the live privacy and limits pages must not say. Google is one of the words, bare: only the line below may name it. */
export const SIGN_IN = /sign.?in|signed.?in|Google|your (whole )?account/i

/**
 * The one line of the live pages that names Google: where the Look closer links open (ruling R19). Its wording is pinned here,
 * whole. A longer, shorter or edited line is scanned like any other, so changing it in src/ui/copy.ts means changing it here, on
 * purpose, and the same goes for a second line that wants to name Google.
 */
export const LOOK_CLOSER_LINE =
  'The Look closer links in the outline step and the workbench open Google Street View and Google Earth in a new tab. Nothing is sent to Google until you click one. A click sends the middle of your outline, as latitude and longitude, to Google; what Google does with it is set by its own privacy policy.'

/** The lines of the privacy page that are scanned for `SIGN_IN`: all but the one permitted line, which is matched whole. */
export const withoutLookCloserLine = (lines: readonly string[]): string[] =>
  lines.filter((line) => line.trim() !== LOOK_CLOSER_LINE)

/**
 * Ways to name Google that both guards must refuse on the live pages: every way of signing in with it, the words around a Google
 * account, a link to it, and sentences that only mention it (a piece of the permitted line does not exempt itself).
 */
export const GOOGLE_PHRASINGS: readonly string[] = [
  'Sign in with Google',
  'Signing in with Google',
  'Signed in with Google',
  'Sign up with Google',
  'Continue with Google',
  'Continue to Google',
  'Continue via Google',
  'Log in with Google',
  'Log in with your Google',
  'Log in via Google',
  'Log in using Google',
  'Authenticate through Google',
  'Create an account using Google',
  'Google login',
  'Google log-in',
  'Google sign-in',
  'Google OAuth',
  'Google credentials',
  'Google password',
  'Google ID',
  'Google SSO',
  'Google token',
  'Google Workspace',
  'Google consent screen',
  'your Google',
  'your Google email',
  'your Google profile',
  'your Google name and email',
  'accounts.google.com',
  'Street View is run by Google.',
  'Nothing is sent to Google until you click one.',
  'A click sends the middle of your outline, as latitude and longitude, to Google.',
]
