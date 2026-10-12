import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { copy } from '../ui/copy.ts'
import TextPage from './TextPage.tsx'

// Accounts are off in every unit test (vite.config.ts): this is the page a build without them serves.
describe('TextPage', () => {
  it('is byte for byte the same page whether or not it is asked for the accounts items, when there are none', () => {
    for (const [page, extra] of [
      [copy.pages.privacy, 'privacyItems'],
      [copy.pages.limits, 'limitsItems'],
    ] as const) {
      const plain = renderToString(createElement(TextPage, { page }))
      expect(renderToString(createElement(TextPage, { page, extra }))).toBe(plain)
      // counter-case: it does list every item of the page
      for (const t of page.items) expect(plain).toContain(t.replaceAll('"', '&quot;'))
    }
  })
})
