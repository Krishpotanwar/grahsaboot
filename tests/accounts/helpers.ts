import type { Page, Route } from '@playwright/test'

// Shared by every accounts spec: one signed-in user, one syntactically valid JWT, one fake Supabase at the build's own origin
// (.env.accounts: http://127.0.0.1:4174/supabase), so page.route needs no CORS and no preflight.

export const SUPABASE_KEY = 'e2e-publishable-key'
export const USER_ID = '00000000-0000-4000-8000-00000000000a'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** header.payload. with no signature: the app and supabase-js can read it, a server would refuse it. */
export const JWT = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  sub: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  exp: 4102444800, // 2100-01-01
  iat: 1767225600,
})}.`
export const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@example.com',
  app_metadata: { provider: 'google' },
  user_metadata: { full_name: 'Test User' },
  created_at: '2026-10-05T00:00:00Z',
}
/** What supabase-js 2.117.2 keeps under `gs-auth`: JSON.stringify(session); expires_at is in seconds. */
export const SESSION = {
  access_token: JWT,
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: USER,
}

/** A signed-in browser: the session is there before the app starts. */
export async function signedIn(page: Page) {
  await page.addInitScript((session) => localStorage.setItem('gs-auth', JSON.stringify(session)), SESSION)
}

export interface SupabaseCall {
  method: string
  /** Path below the fake Supabase root, e.g. /rest/v1/investigations. */
  path: string
  query: URLSearchParams
  /** Header names are lower case. */
  headers: Record<string, string>
  body: unknown
}
export interface MockOptions {
  /** Rows of `public.investigations` as PostgREST returns them (with geom_geojson). */
  investigations?: Array<Record<string, unknown>>
  annotations?: Array<Record<string, unknown>>
  frames?: Array<Record<string, unknown>>
  /** The id a first save gets back. */
  insertedId?: string
  /** The verify function's answer for a request body; by default every frame comes back verified with the hash it sent. */
  verify?: (body: { frames: Array<{ asset: string; level: number; sha256: string }> }) => {
    status: number
    body: unknown
  }
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const nothing = (route: Route) => route.fulfill({ status: 204, body: '' })

/**
 * Answers every request under /supabase/ and returns the log of what was asked. A path nobody mocked is a 500 that says so,
 * so a spec cannot hang on a call it did not expect. GET filters by `id=eq.` / `investigation_id=eq.` like PostgREST does.
 * postgrest-js reads a GET `maybeSingle()` from an ARRAY (Accept: application/json), and `.single()` on a write from an object.
 */
export async function mockSupabase(page: Page, opts: MockOptions = {}) {
  const calls: SupabaseCall[] = []
  await page.route('**/supabase/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/supabase/, '')
    calls.push({
      method: req.method(),
      path,
      query: url.searchParams,
      headers: req.headers(),
      body: req.postData() ? req.postDataJSON() : undefined,
    })
    const eq = (col: string) => url.searchParams.get(col)?.replace(/^eq\./, '')
    const rowsOf = (rows: Array<Record<string, unknown>> = [], col: string) =>
      rows.filter((r) => eq(col) === undefined || r[col] === eq(col))
    const get = req.method() === 'GET'

    if (path === '/auth/v1/user') return json(route, 200, USER)
    if (path === '/rest/v1/rpc/record_consent') return nothing(route)
    if (path === '/functions/v1/verify') {
      const body = req.postDataJSON() as Parameters<NonNullable<MockOptions['verify']>>[0]
      const out = opts.verify?.(body) ?? {
        status: 200,
        body: {
          frames: body.frames.map((f) => ({
            asset: f.asset,
            level: f.level,
            status: 'verified',
            server_sha256: f.sha256,
            frame_id: `f-${f.asset}${f.level}`,
            verified_at: '2026-10-05T10:00:00Z',
            quality: null,
          })),
        },
      }
      return json(route, out.status, out.body)
    }
    if (path === '/rest/v1/investigations') {
      if (get) return json(route, 200, rowsOf(opts.investigations, 'id'))
      if (req.method() === 'POST')
        return json(route, 201, { id: opts.insertedId ?? '11111111-1111-4111-8111-111111111111' })
      if (req.method() === 'PATCH') return json(route, 200, [{ id: eq('id') }])
      return nothing(route)
    }
    if (path === '/rest/v1/annotations')
      return get ? json(route, 200, rowsOf(opts.annotations, 'investigation_id')) : nothing(route)
    if (path === '/rest/v1/frames') return json(route, 200, rowsOf(opts.frames, 'investigation_id'))
    return json(route, 500, { message: `UNMOCKED ${req.method()} ${path}` })
  })
  return calls
}
