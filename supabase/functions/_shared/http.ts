import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { corsHeaders } from '@supabase/supabase-js/cors'

// The headers supabase-js itself sends, from the SDK, so a header it adds later cannot break the preflight. The origin stays `*`
// because these endpoints authenticate with a bearer JWT and never with cookies; narrow it to the site origin at activation.
// Max-Age: without it browsers cache a preflight for 5 s, and every verify call of a longer save is two Edge invocations.
export const CORS = {
  ...corsHeaders,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '7200',
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const denoEnv = (name: string): string => {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`MISSING_ENV_${name}`)
  return v
}

/** A log message: short, and any query string (a SAS token) removed. */
export const brief = (e: unknown) =>
  String((e as Error)?.message ?? e)
    .replace(/\?[^\s)]*/g, '?')
    .slice(0, 200)

/** Either the answer to send (nobody is signed in, or the auth service is down), or the signed-in caller and the two clients. */
export type Caller =
  { reject: Response } | { reject: null; user: { id: string }; asUser: SupabaseClient; admin: SupabaseClient }

const SERVER = { persistSession: false, autoRefreshToken: false }

/**
 * `user` comes from the Auth service checking the caller's own JWT, never from a claim in the token or a field in the body.
 * `asUser` acts as that user (row-level security applies); `admin` is the service role and exists only for a signed-in user.
 */
export async function clients(req: Request, env: (name: string) => string = denoEnv): Promise<Caller> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1]
  if (!token) return { reject: json(401, { error: 'UNAUTHORIZED' }) }
  const url = env('SUPABASE_URL')
  const asUser = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: SERVER,
  })
  const { data, error } = await asUser.auth.getUser(token)
  if (error || !data.user) {
    // A failing auth service is not a signed-out caller: 503 is retried, 401 sends the person back to sign in.
    const down =
      (error?.status ?? 0) >= 500 || error?.status === 429 || error?.name === 'AuthRetryableFetchError'
    return { reject: down ? json(503, { error: 'UNAVAILABLE' }) : json(401, { error: 'UNAUTHORIZED' }) }
  }
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: SERVER })
  return { reject: null, user: { id: data.user.id }, asUser, admin }
}

/** The request body as text, or null when it is longer than `max` bytes (the excess is never buffered). */
export async function readText(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('content-length')) > max) return null
  if (!req.body) return ''
  const utf8 = new TextDecoder()
  let text = ''
  let size = 0
  for await (const chunk of req.body) {
    size += chunk.byteLength
    if (size > max) return null
    text += utf8.decode(chunk, { stream: true })
  }
  return text + utf8.decode()
}
