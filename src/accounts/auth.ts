import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { getSupabase } from './supabase.ts'

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sb = getSupabase()
    let live = true
    void sb.auth.getSession().then(({ data }) => {
      if (!live) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [])
  return { session, ready }
}

/** `returnTo` is a path on this site (a location.pathname, plus a query): anything else goes home. */
export const safeReturnTo = (returnTo: string) => (/^\/(?!\/)/.test(returnTo) ? returnTo : '/')

export async function signInWithGoogle(returnTo: string): Promise<void> {
  const path = safeReturnTo(returnTo)
  // On success the browser is already leaving for Google. An error (provider off, bad redirect) is returned, not thrown.
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${path}`, scopes: 'openid email profile' },
  })
  if (error) throw new Error(error.message)
}

/** This device only: "Sign out" must not end the session on the person's other devices (supabase-js defaults to global). */
export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut({ scope: 'local' })
}
