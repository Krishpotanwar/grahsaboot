import { describe, expect, it } from 'vitest'
import { LIMITS } from '../geo/limits.ts'
import {
  GOOGLE_PHRASINGS,
  LOOK_CLOSER_LINE,
  SIGN_IN,
  withoutLookCloserLine,
} from '../../tests/fixtures/sign-in-words.ts'
import { account } from './copy-account.ts'
import { flow } from './copy-flow.ts'
import { copy } from './copy.ts'

// The words of signing in are only for a build with accounts (copy-account.ts). The live pages say nothing about them, Google
// included: only the Look closer line of the privacy page names it (tests/fixtures/sign-in-words.ts, shared with dormant.spec.ts).

/** What the guard scans of a live page: the privacy page without its one permitted line, the limits page as it is. `extra` are
 * lines added to the page, to prove what the guard refuses. */
const scanned = (name: 'privacy' | 'limits', extra: readonly string[] = []): string => {
  const page = copy.pages[name]
  const items = [...page.items, ...extra]
  return [page.title, page.intro, ...(name === 'privacy' ? withoutLookCloserLine(items) : items)].join('\n')
}

describe('account copy', () => {
  it('leaves every sign-in word out of the live privacy and limits pages, and Google out of every line but one', () => {
    for (const name of ['privacy', 'limits'] as const) expect(scanned(name)).not.toMatch(SIGN_IN)
    // counter-case: the pattern does match the words moved to copy-account, and "without an account" stays allowed
    expect(account.privacyItems.join('\n')).toMatch(SIGN_IN)
    expect(copy.pages.privacy.items.join(' ')).toContain('without an account')
    // the one permitted line is on the privacy page, whole and once, and it needs its exemption: it names Google
    expect(copy.pages.privacy.items.filter((t) => t === LOOK_CLOSER_LINE)).toHaveLength(1)
    expect(LOOK_CLOSER_LINE).toMatch(SIGN_IN)
  })

  it('fails on any other mention of Google, and on each way of signing in with it, on either page', () => {
    for (const t of GOOGLE_PHRASINGS) {
      expect(t, t).toMatch(SIGN_IN)
      for (const name of ['privacy', 'limits'] as const)
        expect(scanned(name, [t]), `${t}, added to the ${name} page`).toMatch(SIGN_IN)
    }
  })

  it('exempts the Look closer line only whole, and only on the privacy page', () => {
    // longer, shorter, edited or with something before it: a different line, scanned like any other
    for (const t of [
      `${LOOK_CLOSER_LINE} Sign in with Google.`,
      `Note: ${LOOK_CLOSER_LINE}`,
      LOOK_CLOSER_LINE.slice(0, -1),
      LOOK_CLOSER_LINE.replace('Nothing', 'Everything'),
    ])
      expect(scanned('privacy', [t]), t).toMatch(SIGN_IN)
    expect(scanned('limits', [LOOK_CLOSER_LINE])).toMatch(SIGN_IN)
  })

  it('moves both sign-in privacy items to account.privacyItems, with how long each record is kept', () => {
    const text = account.privacyItems.join(' ')
    expect(account.privacyItems).toHaveLength(3) // the two, then the grievance contact (below)
    expect(text).toContain('log is kept for one year') // E10
    expect(text).toContain('record that you agreed is kept while your account exists') // E10
    expect(text).toContain('removed 12 months after your last sign-in')
    expect(text).toContain('Google name and email stay until you delete your account') // E24
  })

  it('states the account limits with the numbers the server enforces', () => {
    expect(account.limitsItems).toEqual([
      'Signed-in accounts can save 50 investigations and verify 600 frames per day.',
    ])
  })

  it('has no "not configured" string: the flag implies the project URL and key', () => {
    expect(Object.keys(account)).not.toContain('notConfigured')
  })

  it('gives the consent dialog the same retention words as the privacy items', () => {
    const text = account.consent.points.join(' ')
    expect(text).toContain('for one year')
    expect(text).toContain('kept while your account exists')
    expect(text).toContain('Google name and email stay until you delete your account')
  })

  it("leaves the words of a photo's check to the main tree: the caption badge and the report are copy-flow's", () => {
    expect(Object.keys(account)).not.toContain('verifiedBadge')
    expect(Object.keys(account)).not.toContain('mismatchBadge')
    expect(flow.workbench.verifiedBadge('20 Dec 2025')).toBe('Verified · 20 Dec 2025')
    expect(flow.workbench.mismatchBadge).toBe('Did not match the source')
  })

  it('says how many frames are verified, in the singular for one', () => {
    expect(account.saved(7, '5 Oct 2026')).toBe('Saved · 7 frames verified · 5 Oct 2026')
    expect(account.saved(1, '5 Oct 2026')).toBe('Saved · 1 frame verified · 5 Oct 2026')
    // with none, there is no date to give
    expect(account.savedNone).toBe('Saved. No frames are verified yet.')
  })

  it('tells the 50-frame cap apart from "try again": what to do, with the number from LIMITS', () => {
    expect(account.frameLimit).toContain(String(LIMITS.pinnedDates * 2 + 2))
    expect(account.frameLimit).toMatch(/unpin/i)
    expect(account.frameLimit).toMatch(/split/i)
    expect(account.frameLimit).not.toMatch(/try again|save again to retry/i)
    // the retryable lines still say so
    expect(account.failed(2)).toContain('Save again to retry')
  })

  it('has a reason line for each thing a save waits for, and its own failure line for the agreement', () => {
    expect(account.waiting.checks).toMatch(/checks/i)
    expect(account.waiting.photos).toMatch(/photos/i)
    expect(account.consent.failed).toMatch(/nothing was saved/i)
    expect(account.consent.cancel).not.toBe(account.delete.cancel) // "Keep" is for an investigation, not a notice
  })

  // The notice needs a named contact (DPDP). The owner supplies it at activation: until then the sentence carries a marked
  // placeholder, shown only in a build with accounts. Replacing the placeholder is a deliberate act, so this test changes with it.
  it('keeps the grievance contact a marked placeholder until the owner supplies it', () => {
    expect(account.privacyItems.at(-1)).toBe(
      'Questions or complaints: [name and email of the grievance contact]. You can also complain to the Data Protection Board of India.',
    )
    // the live privacy page does not have it: it says nothing of accounts
    expect(copy.pages.privacy.items.join(' ')).not.toContain('grievance')
  })

  it('asks before sign-out removes saved copies, naming how many, in the singular for one', () => {
    expect(account.signOutConfirm(1)).toBe(
      'Signing out removes 1 saved investigation from this browser; it stays in your account. Anything you changed since the last save is lost. Save first?',
    )
    expect(account.signOutConfirm(3)).toBe(
      'Signing out removes 3 saved investigations from this browser; they stay in your account. Anything you changed since the last save is lost. Save first?',
    )
  })

  it('has its own line for a sign-out that could not remove the copies, a list that did not load and a sign-in that did not start', () => {
    expect(account.signOutFailed).toMatch(/still signed in/i)
    expect(account.listFailed).toMatch(/could not load/i)
    expect(account.signInFailed).toMatch(/could not start/i)
    // the sign-in sentinel the dormant guard looks for is still the full words; the short label is a prefix of it
    expect(account.signIn).toBe('Sign in with Google')
    expect(account.signIn.startsWith(account.signInShort)).toBe(true)
  })
})
