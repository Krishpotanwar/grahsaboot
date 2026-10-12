import type { Page, Route } from '@playwright/test'
import { CONSENT_VERSION, consentKey } from '../../src/accounts/consent.ts'

// Shared by every accounts spec: one signed-in user, one syntactically valid JWT, one fake Supabase at the build's own origin
// (.env.accounts: http://127.0.0.1:4174/supabase), so page.route needs no CORS and no preflight.

export const SUPABASE_KEY = 'e2e-publishable-key'
export const USER_ID = '00000000-0000-4000-8000-00000000000a'
/** The id a first save gets back, unless a spec says another. */
export const INSERTED_ID = '11111111-1111-4111-8111-111111111111'

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

/** This user has agreed to the notice in this browser, so a save does not ask. */
export async function agreed(page: Page) {
  await page.addInitScript(
    ([key, version]) => localStorage.setItem(key!, version!),
    [consentKey(USER_ID), CONSENT_VERSION],
  )
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
/** What a call is answered with: a status and body, or `'drop'` for a connection that dies before any answer. */
export type Answer = { status: number; body?: unknown } | 'drop'
export interface MockOptions {
  /** Rows of `public.investigations` as PostgREST returns them (with geom_geojson). */
  investigations?: Array<Record<string, unknown>>
  annotations?: Array<Record<string, unknown>>
  frames?: Array<Record<string, unknown>>
  /** The id a first save gets back (INSERTED_ID by default). */
  insertedId?: string
  /** The answer to recording the agreement (nothing, 204, by default). */
  consent?: { status: number; body?: unknown }
  /** The verify function's answer for a request body; by default every frame comes back verified with the hash it sent. */
  verify?: (body: { frames: Array<{ asset: string; level: number; sha256: string }> }) => {
    status: number
    body: unknown
  }
  /**
   * Answers a call itself, ahead of the defaults below; nothing falls through to them. It may wait (a held answer). The call
   * is already in the log when this runs.
   */
  override?: (call: SupabaseCall) => Answer | undefined | Promise<Answer | undefined>
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
    const call = calls[calls.length - 1]!
    const over = await opts.override?.(call)
    if (over === 'drop') return route.abort('connectionreset')
    if (over) return over.status === 204 ? nothing(route) : json(route, over.status, over.body ?? {})
    const eq = (col: string) => url.searchParams.get(col)?.replace(/^eq\./, '')
    const rowsOf = (rows: Array<Record<string, unknown>> = [], col: string) =>
      rows.filter((r) => eq(col) === undefined || r[col] === eq(col))
    const get = req.method() === 'GET'

    if (path === '/auth/v1/user') return json(route, 200, USER)
    if (path === '/auth/v1/logout') return nothing(route)
    if (path === '/functions/v1/delete-account') return json(route, 200, { ok: true })
    // supabase-js sends the browser here (window.location.assign): a page of its own, so a spec can read the redirect it holds.
    if (path === '/auth/v1/authorize')
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Google</title><p>Google sign-in</p>',
      })
    // The code exchange of the return from Google: the session, whatever the code.
    if (path === '/auth/v1/token') return json(route, 200, SESSION)
    if (path === '/rest/v1/rpc/record_consent')
      return opts.consent ? json(route, opts.consent.status, opts.consent.body ?? {}) : nothing(route)
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
      if (req.method() === 'POST') return json(route, 201, { id: opts.insertedId ?? INSERTED_ID })
      if (req.method() === 'PATCH') return json(route, 200, [{ id: eq('id') }])
      // `.delete().select('id')` asks for the removed rows back, as PostgREST gives them
      if (req.method() === 'DELETE') return json(route, 200, [{ id: eq('id') }])
      return nothing(route)
    }
    if (path === '/rest/v1/annotations')
      return get ? json(route, 200, rowsOf(opts.annotations, 'investigation_id')) : nothing(route)
    if (path === '/rest/v1/frames') return json(route, 200, rowsOf(opts.frames, 'investigation_id'))
    return json(route, 500, { message: `UNMOCKED ${req.method()} ${path}` })
  })
  return calls
}

// Seeding and reading this page's own IndexedDB (the app's store: tests/e2e/helpers.ts has readStored/editStored).
const SITE = {
  kind: 'site',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [79.0834, 21.1413],
        [79.093, 21.1413],
        [79.093, 21.1503],
        [79.0834, 21.1503],
        [79.0834, 21.1413],
      ],
    ],
  },
}
/** A stored investigation. Without a `serverId` it is local work that exists nowhere else. */
export const stored = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  serverId: null,
  name: `Copy ${id.slice(-4)}`,
  aoi: SITE,
  dateFrom: '2025-01-01',
  dateTo: '2025-12-31',
  before: null,
  after: null,
  pinned: [],
  notes: [],
  claim: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedAt: '2026-10-05T10:00:00.000Z',
  ...patch,
})

/** Puts investigations into the app's IndexedDB the way the app's own store keeps them. Run on a page of the app's origin. */
export const seed = (page: Page, ...invs: Array<ReturnType<typeof stored>>) =>
  page.evaluate(async (list) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('gs-investigations', 1)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('investigations'))
          r.result.createObjectStore('investigations')
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction('investigations', 'readwrite')
    for (const i of list) tx.objectStore('investigations').put(i, i.id)
    await new Promise((res) => (tx.oncomplete = res))
    db.close()
  }, invs)

/** The ids of everything this browser holds, sorted. */
export const storedIds = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('gs-investigations')
      r.onsuccess = () => res(r.result)
    })
    const keys = await new Promise<IDBValidKey[]>((res) => {
      const g = db.transaction('investigations').objectStore('investigations').getAllKeys()
      g.onsuccess = () => res(g.result)
    })
    db.close()
    return keys.map(String).sort()
  })
