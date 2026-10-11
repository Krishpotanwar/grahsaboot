import { describe, expect, it } from 'vitest'
import { account } from './copy-account.ts'
import { copy } from './copy.ts'

// The words of signing in are only for a build with accounts (copy-account.ts). The live pages say nothing about them.
const SIGN_IN = /sign.?in|signed.?in|Google|your (whole )?account/i

describe('account copy', () => {
  it('leaves every sign-in word out of the live privacy and limits pages', () => {
    for (const page of [copy.pages.privacy, copy.pages.limits])
      expect([page.title, page.intro, ...page.items].join('\n')).not.toMatch(SIGN_IN)
    // counter-case: the pattern does match the words moved to copy-account, and "without an account" stays allowed
    expect(account.privacyItems.join('\n')).toMatch(SIGN_IN)
    expect(copy.pages.privacy.items.join(' ')).toContain('without an account')
  })

  it('moves both sign-in privacy items to account.privacyItems, with how long each record is kept', () => {
    const text = account.privacyItems.join(' ')
    expect(account.privacyItems).toHaveLength(2)
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
})
