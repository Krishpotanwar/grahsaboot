import type { Investigation } from './investigation.ts'
import type { InvestigationStore } from './store.ts'

/**
 * Opens the investigation a route id names. This browser's copy wins. Otherwise, for an id that is not `local-` and only when
 * `remote` exists (a build with accounts): the local copy that carries this server id, then the server's, kept here as a copy.
 * A server that fails or has no such row is `undefined` (not found), never an error. `remote` is null in a dormant build, so
 * the list is not even read.
 */
export async function openInvestigation(
  id: string,
  store: InvestigationStore,
  remote: ((id: string) => Promise<Investigation | null>) | null,
): Promise<Investigation | undefined> {
  const hit = await store.get(id)
  if (hit || !remote || id.startsWith('local-')) return hit
  const saved = (await store.list()).find((i) => i.serverId === id)
  if (saved) return saved
  const fetched = await remote(id).catch(() => null)
  if (!fetched) return undefined
  // A copy kept for next time. Failing to keep it must not hide what the server just sent.
  await store.put(fetched).catch(() => {})
  return fetched
}
