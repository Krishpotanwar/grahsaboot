import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * The one client, made on first use. A build reaches this module only when src/accounts/enabled.ts says the flag, the URL and
 * the key are all set, so the two reads below are never empty. They are MEMBER reads: never the whole `import.meta.env`.
 * Storage key `gs-auth` (not supabase's default `sb-*`), PKCE: the code exchange happens when this is first called.
 */
export function getSupabase(): SupabaseClient {
  return (client ??= createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, storageKey: 'gs-auth' } },
  ))
}
