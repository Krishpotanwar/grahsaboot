import { config } from '../config.ts'
import { withTimeout } from './search.ts'
import type { S2Item } from './types.ts'

let token: { value: string; expiresAt: number } | null = null

export async function signPcHref(
  href: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  if (!token || token.expiresAt - Date.now() < 60_000) {
    const res = await fetchImpl(config.pcSasUrl, { signal: withTimeout(signal) })
    if (!res.ok) throw new Error(`PC_SAS_${res.status}`)
    const j = (await res.json()) as { token: string; 'msft:expiry': string }
    // No usable expiry still gets a finite life, so a stale token is never reused forever.
    token = { value: j.token, expiresAt: Date.parse(j['msft:expiry']) || Date.now() + 5 * 60_000 }
  }
  return `${href}${href.includes('?') ? '&' : '?'}${token.value}`
}

/** Planetary Computer assets need a short-lived SAS token; Earth Search assets are public. Provenance keeps the unsigned href. */
export async function resolveItemHrefs(item: S2Item): Promise<S2Item> {
  if (item.collection !== 'pc:sentinel-2-l2a') return item
  return {
    ...item,
    visual: { ...item.visual, href: await signPcHref(item.visual.href) },
    scl: { ...item.scl, href: await signPcHref(item.scl.href) },
  }
}
