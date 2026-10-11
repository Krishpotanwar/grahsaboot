import type { SupabaseClient } from '@supabase/supabase-js'
import type { Investigation } from '../data/investigation.ts'
import { investigationRow, newInvestigationRow, noteRows, rowToInvestigation } from './rows.ts'
import { SessionExpiredError, type SaveDeps, type VerifyFrameOut, type VerifyResult } from './save.ts'
import { getSupabase } from './supabase.ts'

// Every call takes the client as its last argument, defaulting to the real one, so tests can pass one over a fake fetch.

/** A refused request. A rejected session (HTTP 401, or PostgREST's JWT codes) is SessionExpiredError: sign in again. */
function failure(e: { message?: string; code?: string }, status?: number): Error {
  return status === 401 || /^PGRST30[123]$/.test(e.code ?? '') || /jwt/i.test(e.message ?? '')
    ? new SessionExpiredError()
    : new Error(e.message || 'REQUEST_FAILED')
}

// Notes go in chunks of this many ids per delete, so the request line stays short at the 200-note cap.
const DELETE_CHUNK = 50

export function remoteDeps(sb: SupabaseClient = getSupabase()): SaveDeps {
  return {
    async saveInvestigation(inv) {
      if (inv.serverId) {
        const { data, error, status } = await sb
          .from('investigations')
          .update(investigationRow(inv))
          .eq('id', inv.serverId)
          .select('id')
        if (error) throw failure(error, status)
        if (data.length) return inv.serverId
        // Gone (deleted on another device): save it again as a new row.
      }
      const { data, error, status } = await sb
        .from('investigations')
        .insert(newInvestigationRow(inv))
        .select('id')
        .single()
      if (error) throw failure(error, status)
      return data.id as string
    },

    // Delete the notes this copy knew and no longer has, then upsert the rest by (investigation, id). A note the copy never saw
    // (written on another device) is left alone. The delete goes first so a save that swaps a note at the 200-note cap fits;
    // it removes only notes the copy itself dropped, so a failed upsert loses nothing the copy still holds.
    async replaceNotes(serverId, notes, known = []) {
      const keep = new Set(notes.map((n) => n.id))
      const stale = known.filter((id) => !keep.has(id))
      for (let i = 0; i < stale.length; i += DELETE_CHUNK) {
        const del = await sb
          .from('annotations')
          .delete()
          .eq('investigation_id', serverId)
          .in('id', stale.slice(i, i + DELETE_CHUNK))
        if (del.error) throw failure(del.error, del.status)
      }
      if (notes.length) {
        const up = await sb
          .from('annotations')
          .upsert(noteRows(serverId, notes), { onConflict: 'investigation_id,id' })
        if (up.error) throw failure(up.error, up.status)
      }
    },

    async verify(body): Promise<VerifyResult> {
      const { data, error } = await sb.functions.invoke('verify', { body })
      if (!error) {
        const frames = (data as { frames?: VerifyFrameOut[] } | null)?.frames
        return Array.isArray(frames)
          ? { ok: true, frames }
          : { ok: false, status: 502, error: 'BAD_RESPONSE' }
      }
      // A non-2xx answer carries its Response; anything else never reached the function (offline): retryable.
      const res = (error as { context?: unknown }).context
      if (!(res instanceof Response)) return { ok: false, status: 502, error: 'NETWORK' }
      const payload = (await res.json().catch(() => null)) as { error?: unknown } | null
      return {
        ok: false,
        status: res.status,
        error: typeof payload?.error === 'string' ? payload.error : 'UNKNOWN',
      }
    },
  }
}

/** The investigation `id` of this account with its notes and checks; null when the account holds no such row. */
export async function loadRemoteInvestigation(
  id: string,
  sb: SupabaseClient = getSupabase(),
): Promise<Investigation | null> {
  const one = await sb
    .from('investigations')
    .select(
      'id, name, kind, geom_geojson, road_width_m, date_from, date_to, before_date, after_date, pinned, claim_text, claim_date, claim_criterion, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (one.error) throw failure(one.error, one.status)
  if (!one.data) return null
  const [notes, frames] = await Promise.all([
    sb
      .from('annotations')
      .select('id, kind, body, frame_date, section_idx, created_at, updated_at')
      .eq('investigation_id', id)
      .order('created_at'),
    sb
      .from('frames')
      .select('id, frame_date, asset, level, status, server_sha256, client_sha256, item_id, verified_at')
      .eq('investigation_id', id),
  ])
  // Not a partial copy: one that lacks its notes would delete them from the server on the next save.
  if (notes.error) throw failure(notes.error, notes.status)
  if (frames.error) throw failure(frames.error, frames.status)
  return rowToInvestigation(one.data, notes.data ?? [], frames.data ?? [])
}

export async function listRemote(
  sb: SupabaseClient = getSupabase(),
): Promise<Array<{ id: string; name: string; updated_at: string }>> {
  const { data, error, status } = await sb
    .from('investigations')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw failure(error, status)
  return data
}

export async function deleteRemote(id: string, sb: SupabaseClient = getSupabase()): Promise<void> {
  const { error, status } = await sb.from('investigations').delete().eq('id', id)
  if (error) throw failure(error, status)
}

/** Throws when the server did not record it: the caller must not remember consent that no server holds. */
export async function recordConsent(version: string, sb: SupabaseClient = getSupabase()): Promise<void> {
  const { error, status } = await sb.rpc('record_consent', { version })
  if (error) throw failure(error, status)
}

export async function deleteAccount(sb: SupabaseClient = getSupabase()): Promise<void> {
  const { error } = await sb.functions.invoke('delete-account', { body: {} })
  if (error) throw new Error('DELETE_FAILED')
  // The user no longer exists, so there is no server session to end: clear this browser's.
  await sb.auth.signOut({ scope: 'local' })
}
