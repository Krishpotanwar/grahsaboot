import { useEffect, useState } from 'react'
import { loadAccounts } from '../accounts/enabled.ts'

const NONE: readonly string[] = []

/**
 * The accounts' extra lines for a text page (`privacyItems`, `limitsItems`): none in a build without accounts, which never
 * asks for them; with them, the lines once the accounts code has loaded. They are appended after the page's own items. The
 * lines are kept with the page they are for, so moving from one text page to the other never shows the first one's lines.
 */
export function useAccountItems(page?: 'privacyItems' | 'limitsItems'): readonly string[] {
  const [got, setGot] = useState<{ page: string; items: readonly string[] } | null>(null)
  useEffect(() => {
    if (!loadAccounts || !page) return
    let live = true
    loadAccounts().then(
      (m) => live && setGot({ page, items: m.account?.[page] ?? NONE }),
      () => {}, // the page is whole without them
    )
    return () => {
      live = false
    }
  }, [page])
  return got && got.page === page ? got.items : NONE
}
