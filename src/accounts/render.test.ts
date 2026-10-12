import { ToastProvider } from '../ui/toast.tsx'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { account } from '../ui/copy-account.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { DeleteInvestigation } from './DeleteInvestigation.tsx'
import { MyInvestigations } from './MyInvestigations.tsx'

// The static parts, rendered to a string (no DOM, so no effect runs and nothing asks Supabase). The behaviour is in
// tests/accounts/account.spec.ts.
describe('the account controls before anything has happened', () => {
  it("render nothing until the session or the list has answered: the room for them is the shell's", () => {
    expect(renderToString(createElement(AccountMenu))).toBe('')
    expect(renderToString(createElement(MyInvestigations))).toBe('')
  })

  it('is one quiet danger button for an investigation, and no question until it is pressed', () => {
    const html = renderToString(
      createElement(
        ToastProvider,
        null,
        createElement(DeleteInvestigation, { localId: 'local-1', serverId: null }),
      ),
    )
    expect(html).toContain(account.delete.investigation)
    expect(html).toContain('text-bad')
    expect(html).not.toContain(account.delete.confirmInvestigation)
    expect(html.match(/<button/g)).toHaveLength(1)
    // quiet: not the kit's outlined danger button, which is for the answer in the question
    expect(html).not.toContain('border-bad')
  })
})
