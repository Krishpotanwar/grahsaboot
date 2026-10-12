import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { consentKey } from '../../src/accounts/consent.ts'
import { account } from '../../src/ui/copy-account.ts'
import { copy } from '../../src/ui/copy.ts'
import { flow } from '../../src/ui/copy-flow.ts'
import { openFixtureSite, waitForPhotos } from '../e2e/helpers.ts'
import {
  agreed,
  INSERTED_ID,
  mockSupabase,
  seed,
  signedIn,
  stored,
  storedIds,
  USER_ID,
  type MockOptions,
  type SupabaseCall,
} from './helpers.ts'

// The rest of the accounts UI in the accounts build (port 4174), against the fake Supabase of helpers.ts: the account menu on
// every page, sign-out and what it takes from this browser, deleting the account and one investigation, the saved list, the
// privacy lines, the consent dialog's own behaviour. (The save flow itself is save.spec.ts.)
const SERVER_ID = '33333333-3333-4333-8333-333333333333'
/** A copy in this browser that is also on the server. */
const SAVED = stored('local-00000000-0000-4000-8000-0000000000a1', {
  serverId: SERVER_ID,
  name: 'Saved yard',
})
/** Work that exists only in this browser. */
const ONLY = stored('local-00000000-0000-4000-8000-0000000000b2', { name: 'Only here' })

const menu = (page: Page) => page.getByRole('button', { name: account.menu, exact: true })
const signIn = (page: Page) => page.getByRole('button', { name: account.signIn })
const asked = (calls: SupabaseCall[], path: string, method?: string) =>
  calls.filter((c) => c.path === path && (!method || c.method === method))
const logouts = (calls: SupabaseCall[]) => asked(calls, '/auth/v1/logout')
const removed = (calls: SupabaseCall[]) => asked(calls, '/rest/v1/investigations', 'DELETE')
const consentOf = (page: Page) => page.evaluate((k) => localStorage.getItem(k), consentKey(USER_ID))
const alert = (page: Page, name: string) => page.getByRole('alertdialog', { name })
const deleteIt = (page: Page) => page.getByRole('button', { name: account.delete.investigation })

/** A signed-in browser on the home page with these copies in its store. */
async function home(page: Page, opts: MockOptions = {}, ...copies: Array<ReturnType<typeof stored>>) {
  await signedIn(page)
  await agreed(page)
  const calls = await mockSupabase(page, opts)
  await page.goto('/?tier=0')
  await seed(page, ...copies)
  return calls
}

test.describe('the account control in the header', () => {
  test('is on every page, signed in', async ({ page }) => {
    await home(page, {}, ONLY)
    for (const path of ['/?tier=0', '/privacy', '/limits', '/new?tier=0', `/i/${ONLY.id}?tier=0`]) {
      await page.goto(path)
      await expect(menu(page), path).toBeVisible()
    }
    // a page that does not exist still has the header, and with it the menu
    await page.goto('/nowhere')
    await expect(menu(page)).toBeVisible()
  })

  test('signed out, offers sign-in, which comes back to the same page without asking for a save, and the code is exchanged there', async ({
    page,
  }) => {
    const calls = await mockSupabase(page)
    await page.goto('/limits?tier=0')
    await expect(menu(page)).toHaveCount(0)
    await signIn(page).click()
    await expect.poll(() => asked(calls, '/auth/v1/authorize').length).toBe(1)
    const sent = asked(calls, '/auth/v1/authorize')[0]!
    expect(sent.query.get('provider')).toBe('google')
    const back = new URL(sent.query.get('redirect_to')!)
    expect(back.pathname).toBe('/limits')
    expect(back.searchParams.get('tier')).toBe('0')
    expect(back.searchParams.has('save')).toBe(false)

    // Google sends the person back to that address with a code, to a page that is not the workbench: it still signs in.
    back.searchParams.set('code', 'e2e-code')
    await page.goto(back.toString())
    await expect(menu(page)).toBeVisible()
    const exchange = asked(calls, '/auth/v1/token')[0]!
    expect(exchange.query.get('grant_type')).toBe('pkce')
    expect(exchange.body).toMatchObject({ auth_code: 'e2e-code' })
    expect(new URL(page.url()).searchParams.has('code')).toBe(false)
    await expect(signIn(page)).toHaveCount(0)
  })

  test('a sign-in that cannot start says so, in our words, and can be tried again', async ({ page }) => {
    // The redirect is built in the browser: it cannot start when the code verifier cannot be kept.
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes('code-verifier') && (window as { __full?: boolean }).__full)
          throw new DOMException('the quota has been exceeded', 'QuotaExceededError')
        return set.call(this, k, v)
      }
      ;(window as { __full?: boolean }).__full = true
    })
    const calls = await mockSupabase(page)
    await page.goto('/?tier=0')
    await signIn(page).click()
    await expect(page.getByText(account.signInFailed)).toBeVisible()
    await expect(page.getByText('quota')).toHaveCount(0)
    expect(asked(calls, '/auth/v1/authorize')).toHaveLength(0)
    await page.evaluate(() => ((window as { __full?: boolean }).__full = false))
    await signIn(page).click()
    await expect.poll(() => asked(calls, '/auth/v1/authorize').length).toBe(1)
  })

  test('the sign-in button works again when Back from Google hands this page back from the cache', async ({
    page,
  }) => {
    // A 204 leaves the page where it is, as a page restored from the back/forward cache is.
    const calls = await mockSupabase(page, {
      override: (c) => (c.path === '/auth/v1/authorize' ? { status: 204 } : undefined),
    })
    await page.goto('/?tier=0')
    await signIn(page).click()
    await expect.poll(() => asked(calls, '/auth/v1/authorize').length).toBe(1)
    await signIn(page).click() // swallowed: one sign-in at a time
    await page.waitForTimeout(200)
    expect(asked(calls, '/auth/v1/authorize')).toHaveLength(1)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await signIn(page).click()
    await expect.poll(() => asked(calls, '/auth/v1/authorize').length).toBe(2)
  })

  test('opens with Enter or Space onto its first item, moves with the arrow keys, closes with Escape and gives the focus back', async ({
    page,
  }) => {
    await home(page)
    const signOut = page.getByRole('menuitem', { name: account.signOut })
    const del = page.getByRole('menuitem', { name: account.delete.account })
    for (const key of ['Enter', 'Space']) {
      await menu(page).focus()
      await page.keyboard.press(key)
      await expect(page.getByRole('menuitem')).toHaveCount(2)
      await expect(signOut).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(del).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(signOut).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('menuitem')).toHaveCount(0)
      await expect(menu(page)).toBeFocused()
    }
  })

  for (const width of [1280, 360, 320]) {
    test(`does not change the header when its code and the session arrive (${width} px)`, async ({
      page,
    }) => {
      await signedIn(page)
      await mockSupabase(page)
      await page.setViewportSize({ width, height: 800 })
      let release!: () => void
      const held = new Promise<void>((r) => (release = r))
      await page.route('**/assets/accounts-*.js', async (route) => {
        await held
        await route.continue()
      })
      try {
        await page.goto('/privacy')
        const toggle = page.getByRole('button', { name: copy.nav.themeToggle })
        const link = page.getByRole('link', { name: copy.nav.newInvestigation })
        const mark = page.getByRole('img', { name: copy.app.name })
        await expect(toggle).toBeVisible()
        await expect(menu(page)).toHaveCount(0)
        const left = async () => ({
          toggle: (await toggle.boundingBox())!,
          mark: (await mark.boundingBox())!,
          link: width >= 640 ? (await link.boundingBox())! : null,
        })
        const held0 = await left()

        release()
        await expect(menu(page)).toBeVisible()
        await page.waitForTimeout(200)
        const now = await left()
        expect(now.toggle.x, 'the theme toggle moved').toBeCloseTo(held0.toggle.x, 0)
        expect(now.mark.x, 'the wordmark moved').toBeCloseTo(held0.mark.x, 0)
        // the links to its left are where they were: the room for it was held, not made
        if (held0.link) expect(now.link!.x, 'a link moved').toBeCloseTo(held0.link.x, 0)
        // it sits between the wordmark and the toggle, and the page does not scroll sideways (WCAG 1.4.10 at 320)
        const m = (await menu(page).boundingBox())!
        expect(m.x).toBeGreaterThanOrEqual(now.mark.x + now.mark.width)
        expect(m.x + m.width).toBeLessThanOrEqual(now.toggle.x)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
          true,
        )
        // and it is a real target on a phone: 44 px wide, as tall as its hit area
        expect(m.width).toBeGreaterThanOrEqual(44)
      } finally {
        release()
      }
    })
  }

  test('a build of the code that lacks the control leaves the page whole', async ({ page }) => {
    await signedIn(page)
    await mockSupabase(page)
    // a file that loads but holds none of what the app asks of it (a newer release replaced the real one)
    await page.route('**/assets/accounts-*.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: 'export const nothing = 1' }),
    )
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: copy.pages.privacy.title })).toBeVisible()
    await expect(page.getByRole('button', { name: copy.nav.themeToggle })).toBeVisible()
    await expect(menu(page)).toHaveCount(0)
    // and the page's own text is all there; the accounts lines are simply not
    for (const t of copy.pages.privacy.items) await expect(page.getByText(t, { exact: true })).toBeVisible()
  })
})

test.describe('signing out', () => {
  test('asks first when saved copies would leave this browser, and Cancel changes nothing', async ({
    page,
  }) => {
    const calls = await home(page, {}, SAVED, ONLY)
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.signOut }).click()
    const dialog = alert(page, account.signOut)
    await expect(dialog).toContainText(account.signOutConfirm(1))
    await expect(dialog.getByRole('button', { name: copy.common.cancel })).toBeFocused()
    await dialog.getByRole('button', { name: copy.common.cancel }).click()
    await expect(dialog).toHaveCount(0)
    await expect(menu(page)).toBeFocused()
    expect(await storedIds(page)).toEqual([ONLY.id, SAVED.id].sort())
    expect(await consentOf(page)).not.toBeNull()
    expect(logouts(calls)).toHaveLength(0)
    await expect(signIn(page)).toHaveCount(0)

    // Escape is the same as Cancel
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.signOut }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await storedIds(page)).toEqual([ONLY.id, SAVED.id].sort())
  })

  test('removes only the copies that are on the server, forgets the agreement, signs out and moves the focus to sign-in', async ({
    page,
  }) => {
    const calls = await home(page, {}, SAVED, ONLY)
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.signOut }).click()
    await alert(page, account.signOut).getByRole('button', { name: account.signOut }).click()
    await expect(signIn(page)).toBeVisible()
    await expect(signIn(page)).toBeFocused()
    // the saved copy is gone from this browser; the work that exists only here is not touched
    expect(await storedIds(page)).toEqual([ONLY.id])
    expect(await consentOf(page)).toBeNull()
    expect(logouts(calls)).toHaveLength(1)
    // nothing was deleted on the server: signing out is not deleting
    expect(removed(calls)).toHaveLength(0)
    expect(asked(calls, '/functions/v1/delete-account')).toHaveLength(0)
  })

  test('with nothing saved here it signs out at once, and leaves local work alone', async ({ page }) => {
    const calls = await home(page, {}, ONLY)
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.signOut }).click()
    await expect(signIn(page)).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(await storedIds(page)).toEqual([ONLY.id])
    expect(logouts(calls)).toHaveLength(1)
  })

  test('leaves the saved investigation that is on screen, and stays on one that is only here', async ({
    page,
  }) => {
    await home(page, {}, SAVED, ONLY)
    // on a copy that was removed: the next change would put it back, so the person goes home
    await page.goto(`/i/${SAVED.id}?tier=0`)
    await expect(page.getByRole('heading', { level: 1, name: SAVED.name })).toBeVisible()
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.signOut }).click()
    await alert(page, account.signOut).getByRole('button', { name: account.signOut }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(signIn(page)).toBeVisible()
  })

  test('stays on a page that is only here, even when saved copies are removed', async ({ page }) => {
    await home(page, {}, SAVED, ONLY)
    await page.goto(`/i/${ONLY.id}?tier=0`)
    await expect(page.getByRole('heading', { level: 1, name: ONLY.name })).toBeVisible()
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.signOut }).click()
    await alert(page, account.signOut).getByRole('button', { name: account.signOut }).click()
    await expect(signIn(page)).toBeVisible()
    expect(page.url()).toContain(`/i/${ONLY.id}`)
    expect(await storedIds(page)).toEqual([ONLY.id])
  })
})

test.describe('deleting the account', () => {
  test('asks first, deletes, removes the saved copies and the agreement here, signs out and goes home', async ({
    page,
  }) => {
    const calls = await home(page, {}, SAVED, ONLY)
    await page.goto(`/privacy`)
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.delete.account }).click()
    const dialog = alert(page, account.delete.account)
    await expect(dialog).toContainText(account.delete.confirmAccount)
    // the safe answer has the focus; Keep closes it and nothing was asked of the server
    await expect(dialog.getByRole('button', { name: account.delete.cancel })).toBeFocused()
    await dialog.getByRole('button', { name: account.delete.cancel }).click()
    await expect(dialog).toHaveCount(0)
    expect(asked(calls, '/functions/v1/delete-account')).toHaveLength(0)

    await menu(page).click()
    await page.getByRole('menuitem', { name: account.delete.account }).click()
    await dialog.getByRole('button', { name: account.delete.confirm, exact: true }).click()
    await expect(signIn(page)).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    expect(asked(calls, '/functions/v1/delete-account')).toHaveLength(1)
    // what this browser held for the account is gone, and what exists only here is not
    expect(await storedIds(page)).toEqual([ONLY.id])
    expect(await consentOf(page)).toBeNull()
  })

  // The server did the work and the reply never came. Auth then refuses the token (401) or says the user does not exist (403).
  for (const gone of [
    { status: 401, body: { code: 401, msg: 'invalid JWT: unable to parse or verify signature' } },
    { status: 403, body: { code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' } },
  ]) {
    test(`is done when the answer was lost and Auth answers ${gone.status}`, async ({ page }) => {
      let lost = false
      const calls = await home(
        page,
        {
          override: (c) => {
            if (c.path === '/functions/v1/delete-account') {
              lost = true
              return 'drop'
            }
            return c.path === '/auth/v1/user' && lost ? gone : undefined
          },
        },
        SAVED,
        ONLY,
      )
      await menu(page).click()
      await page.getByRole('menuitem', { name: account.delete.account }).click()
      await alert(page, account.delete.account)
        .getByRole('button', { name: account.delete.confirm, exact: true })
        .click()
      await expect(signIn(page)).toBeVisible()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      expect(asked(calls, '/functions/v1/delete-account')).toHaveLength(1)
      expect(asked(calls, '/auth/v1/user').length).toBeGreaterThan(0)
      expect(await storedIds(page)).toEqual([ONLY.id])
      expect(await consentOf(page)).toBeNull()
    })
  }

  test('is not done when the answer was lost and the user is still there: it says so and keeps everything', async ({
    page,
  }) => {
    let lost = false
    await home(
      page,
      {
        override: (c) => {
          if (c.path === '/functions/v1/delete-account') {
            lost = true
            return 'drop'
          }
          return undefined // the default answer to /auth/v1/user is the user: still there
        },
      },
      SAVED,
    )
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.delete.account }).click()
    const dialog = alert(page, account.delete.account)
    await dialog.getByRole('button', { name: account.delete.confirm, exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText(account.delete.failed)
    expect(lost).toBe(true)
    expect(await storedIds(page)).toEqual([SAVED.id])
    expect(await consentOf(page)).not.toBeNull()
  })

  test('says it failed, keeps everything, and goes through on the second try', async ({ page }) => {
    let tries = 0
    const calls = await home(
      page,
      {
        override: (c) => {
          if (c.path === '/functions/v1/delete-account' && ++tries === 1)
            return { status: 500, body: { error: 'DELETE_FAILED' } }
          return undefined
        },
      },
      SAVED,
      ONLY,
    )
    await menu(page).click()
    await page.getByRole('menuitem', { name: account.delete.account }).click()
    const dialog = alert(page, account.delete.account)
    await dialog.getByRole('button', { name: account.delete.confirm, exact: true }).click()
    // never closed on a failure, never the server's words
    await expect(dialog.getByRole('alert')).toHaveText(account.delete.failed)
    await expect(dialog).toBeVisible()
    await expect(page.getByText('DELETE_FAILED')).toHaveCount(0)
    expect(await storedIds(page)).toEqual([ONLY.id, SAVED.id].sort())
    expect(await consentOf(page)).not.toBeNull()
    // still signed in: the header's menu is behind the open question (hidden from role queries, so by its markup)
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(1)
    expect(logouts(calls)).toHaveLength(0)

    await dialog.getByRole('button', { name: copy.common.retry }).click()
    await expect(signIn(page)).toBeVisible()
    expect(asked(calls, '/functions/v1/delete-account')).toHaveLength(2)
    expect(await storedIds(page)).toEqual([ONLY.id])
  })
})

test.describe('deleting one investigation', () => {
  test('asks first, takes the server copy first and then this browser, then goes home', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const calls = await home(
      page,
      {
        override: async (c) => {
          if (c.method === 'DELETE' && c.path === '/rest/v1/investigations') await gate
          return undefined
        },
      },
      SAVED,
      ONLY,
    )
    await page.goto(`/i/${SAVED.id}?tier=0`)
    await deleteIt(page).click()
    const dialog = alert(page, account.delete.investigation)
    await expect(dialog).toContainText(account.delete.confirmInvestigation)
    await dialog.getByRole('button', { name: account.delete.cancel }).click()
    await expect(dialog).toHaveCount(0)
    await expect(deleteIt(page)).toBeFocused()
    expect(removed(calls)).toHaveLength(0)
    expect(await storedIds(page)).toContain(SAVED.id)

    await deleteIt(page).click()
    await dialog.getByRole('button', { name: account.delete.confirm, exact: true }).click()
    // the server's copy is being deleted and this browser's is still here: the order is server first
    await expect.poll(() => removed(calls).length).toBe(1)
    expect(removed(calls)[0]!.query.get('id')).toBe(`eq.${SERVER_ID}`)
    expect(await storedIds(page)).toContain(SAVED.id)
    release()
    await expect(page).toHaveURL(/\/$/)
    expect(await storedIds(page)).toEqual([ONLY.id])
    // and the address no longer opens it
    await page.goto(`/i/${SAVED.id}?tier=0`)
    await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
  })

  test('says it failed, leaves the server copy and this browser alone, and goes through on the second try', async ({
    page,
  }) => {
    let tries = 0
    const calls = await home(
      page,
      {
        override: (c) => {
          if (c.method === 'DELETE' && ++tries === 1)
            return { status: 500, body: { message: 'relation is locked' } }
          return undefined
        },
      },
      SAVED,
    )
    await page.goto(`/i/${SAVED.id}?tier=0`)
    await deleteIt(page).click()
    const dialog = alert(page, account.delete.investigation)
    await dialog.getByRole('button', { name: account.delete.confirm, exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText(account.delete.failed)
    await expect(page.getByText('relation is locked')).toHaveCount(0)
    expect(page.url()).toContain(`/i/${SAVED.id}`)
    expect(await storedIds(page)).toEqual([SAVED.id])

    await dialog.getByRole('button', { name: copy.common.retry }).click()
    await expect(page).toHaveURL(/\/$/)
    expect(removed(calls)).toHaveLength(2)
    expect(await storedIds(page)).toEqual([])
  })

  test('removes work that was never saved from this browser alone, asking nothing of the server', async ({
    page,
  }) => {
    const calls = await home(page, {}, ONLY, SAVED)
    await page.goto(`/i/${ONLY.id}?tier=0`)
    await deleteIt(page).click()
    await alert(page, account.delete.investigation)
      .getByRole('button', { name: account.delete.confirm, exact: true })
      .click()
    await expect(page).toHaveURL(/\/$/)
    expect(await storedIds(page)).toEqual([SAVED.id])
    expect(removed(calls)).toHaveLength(0)
  })

  test('is a quiet button at the end of the side column, after Notes and Claim, not in the title block', async ({
    page,
  }) => {
    await home(page, {}, ONLY)
    await page.goto(`/i/${ONLY.id}?tier=0`)
    const notes = page.getByRole('region', { name: flow.claim.title })
    const del = deleteIt(page)
    await expect(del).toBeVisible()
    // after Notes and Claim, in the side column, and not in the title block with the status, Save and Report
    const [c, d] = [(await notes.boundingBox())!, (await del.boundingBox())!]
    expect(d.y).toBeGreaterThan(c.y + c.height - 1)
    const title = page.getByRole('link', { name: flow.workbench.report })
    expect(d.y).toBeGreaterThan((await title.boundingBox())!.y + 100)
  })
})

test.describe('my investigations', () => {
  const ROWS = [
    { id: SERVER_ID, name: 'Saved yard', updated_at: '2026-10-05T10:00:00Z' },
    { id: INSERTED_ID, name: '<b>Bold</b> & "quoted"', updated_at: '2026-10-04T10:00:00Z' },
  ]

  test('lists what the account holds, newest first, as links that open them, with names as plain text', async ({
    page,
  }) => {
    await home(page, { investigations: ROWS })
    const panel = page.getByRole('region', { name: account.mine })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('link')).toHaveCount(2)
    await expect(panel.getByRole('link', { name: 'Saved yard' })).toHaveAttribute('href', `/i/${SERVER_ID}`)
    // a name is text: the markup in it is shown, not run
    await expect(panel.getByRole('link', { name: '<b>Bold</b> & "quoted"' })).toHaveAttribute(
      'href',
      `/i/${INSERTED_ID}`,
    )
    expect(await panel.locator('b').count()).toBe(0)
    // it sits after the links under the search box and before the tier notice
    const [links, list, notice] = [
      page.getByRole('link', { name: copy.nav.example }),
      panel,
      page.getByText(copy.map.staticNotice),
    ]
    const y = async (l: typeof panel) => (await l.boundingBox())!.y
    expect(await y(list)).toBeGreaterThan(await y(links))
    expect(await y(list)).toBeLessThan(await y(notice))
  })

  test('says so when nothing is saved', async ({ page }) => {
    await home(page, { investigations: [] })
    await expect(page.getByRole('region', { name: account.mine }).getByText(account.none)).toBeVisible()
  })

  test('says so, in our words, when the list could not be loaded: not an empty list', async ({ page }) => {
    await home(page, {
      override: (c) =>
        c.method === 'GET' && c.path === '/rest/v1/investigations'
          ? { status: 500, body: { message: 'db down' } }
          : undefined,
    })
    const panel = page.getByRole('region', { name: account.mine })
    await expect(panel.getByRole('alert')).toHaveText(account.listFailed)
    await expect(panel.getByText(account.none)).toHaveCount(0)
    await expect(page.getByText('db down')).toHaveCount(0)
  })

  test('is not there when signed out, and asks the server nothing', async ({ page }) => {
    const calls = await mockSupabase(page, { investigations: ROWS })
    await page.goto('/?tier=0')
    await expect(signIn(page)).toBeVisible()
    await expect(page.getByRole('region', { name: account.mine })).toHaveCount(0)
    expect(calls.filter((c) => c.path === '/rest/v1/investigations')).toEqual([])
  })
})

test.describe('the privacy and limits pages', () => {
  test('carry the accounts lines after their own, and the grievance placeholder is marked', async ({
    page,
  }) => {
    await mockSupabase(page)
    await page.goto('/privacy')
    for (const t of [...copy.pages.privacy.items, ...account.privacyItems])
      await expect(page.getByRole('listitem').filter({ hasText: t }).first()).toBeVisible()
    const items = await page.getByRole('listitem').allInnerTexts()
    expect(items.slice(-account.privacyItems.length)).toEqual([...account.privacyItems])
    expect(items.at(-1)).toContain('[name and email of the grievance contact]')

    await page.goto('/limits')
    await expect(page.getByText(account.limitsItems[0])).toBeVisible()
    const limits = await page.getByRole('listitem').allInnerTexts()
    expect(limits.at(-1)).toBe(account.limitsItems[0])
  })
})

test.describe('accessibility, in both themes', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`the menu and each confirmation have no violations (${theme})`, async ({ page }) => {
      await home(page, {}, SAVED, ONLY)
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      const scan = async (where: string) => {
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
        expect(
          violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
          `${theme}: ${where}`,
        ).toEqual([])
      }
      await scan('header')
      await menu(page).click()
      await expect(page.getByRole('menuitem', { name: account.signOut })).toBeVisible()
      await scan('menu open')

      await page.getByRole('menuitem', { name: account.signOut }).click()
      await expect(alert(page, account.signOut)).toBeVisible()
      await scan('sign-out question')
      await page.keyboard.press('Escape')

      await menu(page).click()
      await page.getByRole('menuitem', { name: account.delete.account }).click()
      await expect(alert(page, account.delete.account)).toBeVisible()
      await scan('delete-account question')
      await page.keyboard.press('Escape')

      await page.goto(`/i/${SAVED.id}?tier=0`)
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      await deleteIt(page).click()
      await expect(alert(page, account.delete.investigation)).toBeVisible()
      await scan('delete-investigation question')
    })
  }
})

// The agreement dialog, which D8b built and this task tests (save.spec.ts covers the happy path and a refused agreement).
test.describe('the agreement dialog', () => {
  const saveButton = (page: Page) => page.getByRole('button', { name: account.save })
  async function ready(page: Page, opts: MockOptions = {}, signed = true) {
    if (signed) await signedIn(page)
    const calls = await mockSupabase(page, opts)
    await openFixtureSite(page)
    await waitForPhotos(page)
    await expect(saveButton(page)).toBeEnabled({ timeout: 30_000 })
    return calls
  }

  test('traps the focus, closes on Escape and on Not now, gives the focus back, and links to the privacy page', async ({
    page,
  }) => {
    const calls = await ready(page)
    await saveButton(page).click()
    const dialog = page.getByRole('dialog', { name: account.consent.title })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel(account.consent.age)).toBeFocused()
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        `agreement dialog (${theme})`,
      ).toEqual([])
    }
    // Tab goes round inside it: past the last control it comes back to the first
    const inside = () => dialog.evaluate((d) => d.contains(document.activeElement))
    // (the dialog forwards focus from its guard on the next frame, so each step is awaited until it settles)
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      await expect.poll(inside, { message: `Tab ${i + 1}` }).toBe(true)
      seen.add(
        await dialog.evaluate(() => document.activeElement!.textContent || document.activeElement!.tagName),
      )
    }
    // a full circle: the tick, the link and "Not now" (the agreement is disabled until the tick), and back to the start
    expect(seen.size).toBe(3)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(saveButton(page)).toBeFocused()
    // and so does "Not now"
    await saveButton(page).click()
    await dialog.getByRole('button', { name: account.consent.cancel }).click()
    await expect(dialog).toHaveCount(0)
    await expect(saveButton(page)).toBeFocused()
    expect(calls.filter((c) => c.path === '/rest/v1/investigations' && c.method === 'POST')).toHaveLength(0)
    expect(calls.filter((c) => c.path === '/rest/v1/rpc/record_consent')).toHaveLength(0)

    // the notice is one click away, in this app
    await saveButton(page).click()
    await dialog.getByRole('link', { name: account.consent.privacy }).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect(dialog).toHaveCount(0)
  })

  test('cannot be closed or sent twice while the agreement is being recorded, then goes on to save', async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const calls = await ready(page, {
      override: async (c) => {
        if (c.path === '/rest/v1/rpc/record_consent') await gate
        return undefined
      },
    })
    await saveButton(page).click()
    const dialog = page.getByRole('dialog', { name: account.consent.title })
    await dialog.getByLabel(account.consent.age).check()
    const agree = dialog.getByRole('button', { name: account.consent.agree })
    await agree.click()
    await expect(agree).toBeDisabled()
    await expect(dialog.getByRole('button', { name: account.consent.cancel })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect.poll(() => calls.filter((c) => c.path === '/rest/v1/rpc/record_consent').length).toBe(1)
    release()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(/frames? verified/)).toBeVisible({ timeout: 30_000 })
    expect(calls.filter((c) => c.path === '/rest/v1/rpc/record_consent')).toHaveLength(1)
    expect(await consentOf(page)).not.toBeNull()
  })

  test('with the session ended, goes to Google with ?save=1; straight after a sign-in it says so and does not loop', async ({
    page,
  }) => {
    const refused: MockOptions['override'] = (c) =>
      c.path === '/rest/v1/rpc/record_consent'
        ? { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } }
        : undefined
    // by a click: the person is sent to sign in again, back to this investigation with the request to save
    const calls = await ready(page, { override: refused })
    const id = page.url().split('/i/')[1]!
    await saveButton(page).click()
    await page.getByRole('dialog').getByLabel(account.consent.age).check()
    await page.getByRole('dialog').getByRole('button', { name: account.consent.agree }).click()
    await expect.poll(() => asked(calls, '/auth/v1/authorize').length).toBe(1)
    const back = new URL(asked(calls, '/auth/v1/authorize')[0]!.query.get('redirect_to')!)
    expect(back.pathname).toBe(`/i/${id}`)
    expect(back.searchParams.get('save')).toBe('1')

    // back from that sign-in the same refusal is a failure to report, not another trip to Google
    back.searchParams.set('code', 'e2e-code')
    back.searchParams.set('tier', '0')
    await page.goto(back.toString())
    const dialog = page.getByRole('dialog', { name: account.consent.title })
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await dialog.getByLabel(account.consent.age).check()
    await dialog.getByRole('button', { name: account.consent.agree }).click()
    await expect(dialog.getByRole('alert')).toHaveText(account.consent.failed)
    await page.waitForTimeout(500)
    expect(asked(calls, '/auth/v1/authorize')).toHaveLength(1) // still the one from the click
  })
})
