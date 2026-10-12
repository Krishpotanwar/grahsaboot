import { useEffect, useState } from 'react'
import { Link } from '../lib/router.tsx'
import { account } from '../ui/copy-account.ts'
import { Panel } from '../ui/kit.tsx'
import { useSession } from './auth.ts'
import { listRemote } from './remote.ts'

type Rows = Awaited<ReturnType<typeof listRemote>>

/** The home screen's list of what this account has saved. Nothing at all while signed out or until the list arrives. */
export function MyInvestigations() {
  const { session } = useSession()
  const user = session?.user.id
  // Keyed to the user, so a token refresh does not ask again and a different user never sees the previous list.
  const [rows, setRows] = useState<{ user: string; list: Rows | 'failed' } | null>(null)
  useEffect(() => {
    if (!user) return
    let live = true
    listRemote().then(
      (list) => live && setRows({ user, list }),
      () => live && setRows({ user, list: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [user])
  if (!user || rows?.user !== user) return null
  return (
    <Panel title={account.mine}>
      {rows.list === 'failed' ? (
        <p role="alert" className="text-sm text-bad">
          {account.listFailed}
        </p>
      ) : rows.list.length === 0 ? (
        <p className="text-sm text-fg-2">{account.none}</p>
      ) : (
        <ul className="grid max-h-56 gap-px overflow-auto bg-line">
          {rows.list.map((r) => (
            <li key={r.id} className="bg-panel">
              {/* A name is the person's own text: rendered as text, never as markup. */}
              <Link to={`/i/${r.id}`} className="block break-words px-3 py-3 hover:bg-line">
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
