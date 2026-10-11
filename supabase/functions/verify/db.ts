import type { SupabaseClient } from '@supabase/supabase-js'
import type { VerifyDeps } from './handler.ts'
import { pruneFilter } from './prune-filter.ts'

const DAY_MS = 86_400_000

/**
 * The database half of VerifyDeps. `asUser` is the caller (row-level security applies), `admin` is the service role. Every call
 * throws on any error: the handler turns a throw into 503 (or 422 for a `GS:` rule), so nothing here may read as "not found"
 * or as zero.
 */
export function dbDeps(
  userId: string,
  asUser: SupabaseClient,
  admin: SupabaseClient,
): Pick<
  VerifyDeps,
  'userId' | 'loadInvestigation' | 'countRecentFrames' | 'recordChecks' | 'pruneFrames' | 'saveFrames'
> {
  return {
    userId,
    // As the caller (row-level security): their own investigation or nothing.
    loadInvestigation: async (id) => {
      const { data, error } = await asUser
        .from('investigations')
        .select('id, owner, kind, geom_geojson, road_width_m, date_from, date_to, pinned')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    // The daily limit counts attempts (`check` rows written before any source is read), so work that fails still counts.
    countRecentFrames: async (uid) => {
      const { count, error } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('actor', uid)
        .eq('action', 'check')
        .eq('entity', 'frames')
        .gte('at', new Date(Date.now() - DAY_MS).toISOString())
      if (error) throw new Error(error.message)
      if (count === null) throw new Error('COUNT_MISSING')
      return count
    },
    recordChecks: async (investigationId, n) => {
      const { error } = await admin.from('audit_log').insert(
        Array.from({ length: n }, () => ({
          actor: userId,
          action: 'check',
          entity: 'frames',
          entity_id: investigationId,
        })),
      )
      if (error) throw new Error(error.message)
    },
    pruneFrames: async (investigationId, pinned, current) => {
      const filter = pruneFilter(pinned, current)
      const del = admin.from('frames').delete().eq('investigation_id', investigationId)
      const { error } = await (filter ? del.or(filter) : del)
      if (error) throw new Error(error.message)
    },
    saveFrames: async (rows) => {
      const now = new Date().toISOString()
      const { data, error } = await admin
        .from('frames')
        .upsert(
          rows.map((r) => ({ ...r, verified_at: now })),
          { onConflict: 'investigation_id,item_id,asset,level' },
        )
        .select('id, verified_at, asset, level')
      // The message keeps a `GS:` code (the 50-frame cap raises GS:LIMIT_FRAMES): the handler turns it into a 422. It must be an
      // Error, not the SDK's plain error object, or the handler's `instanceof Error` mapping would answer 503.
      if (error) throw new Error(error.message)
      // PostgREST does not promise the order of the returned rows, and the handler pairs them by index.
      const byKey = new Map((data ?? []).map((s) => [`${s.asset}:${s.level}`, s]))
      return rows.map((r) => {
        const s = byKey.get(`${r.asset}:${r.level}`)
        if (!s) throw new Error('SHORT_WRITE')
        return { id: s.id, verified_at: s.verified_at }
      })
    },
  }
}
