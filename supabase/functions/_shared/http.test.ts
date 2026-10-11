import { corsHeaders } from '@supabase/supabase-js/cors'
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { brief, clients, json, readText } from './http.ts'

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('http://localhost/verify', { method: 'POST', body, headers })

Deno.test("CORS: the SDK's own header list, and POST and OPTIONS only", async () => {
  const r = json(418, { error: 'X' })
  assertEquals(r.status, 418)
  assertEquals(await r.json(), { error: 'X' })
  assertEquals(r.headers.get('content-type'), 'application/json')
  assertEquals(r.headers.get('access-control-allow-origin'), '*')
  // one value, not the SDK's "GET, POST, ..." merged with ours
  assertEquals(r.headers.get('access-control-allow-methods'), 'POST, OPTIONS')
  // exactly the SDK's list, so a header it adds later cannot break the preflight
  assertEquals(r.headers.get('access-control-allow-headers'), corsHeaders['Access-Control-Allow-Headers'])
  assertEquals(r.headers.get('access-control-max-age'), '7200')
})

Deno.test(
  'readText: a body up to the limit is returned, one byte more is refused (bytes, not characters)',
  async () => {
    assertEquals(await readText(post('{"a":1}'), 16_384), '{"a":1}')
    assertEquals(await readText(post('x'.repeat(16_384)), 16_384), 'x'.repeat(16_384))
    assertEquals(await readText(post('x'.repeat(16_385)), 16_384), null)
    // 5,462 euro signs are 5,462 characters and 16,386 bytes
    assertEquals(await readText(post('€'.repeat(5_462)), 16_384), null)
    assertEquals(await readText(post('€'.repeat(5_461)), 16_384), '€'.repeat(5_461))
    assertEquals(await readText(new Request('http://localhost/verify', { method: 'POST' }), 16_384), '')
  },
)

Deno.test('readText: a declared length over the limit is refused without reading the body', async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull() {
      throw new Error('the body must not be read')
    },
  })
  const r = new Request('http://localhost/verify', {
    method: 'POST',
    body: stream,
    headers: { 'content-length': '16385' },
    duplex: 'half',
  } as RequestInit)
  assertEquals(await readText(r, 16_384), null)
})

Deno.test('readText: a body that streams past the limit is cut off without reading the rest', async () => {
  const chunk = new TextEncoder().encode('y'.repeat(4_096))
  let sent = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      sent++
      if (sent > 100) return c.close()
      c.enqueue(chunk)
    },
  })
  const r = new Request('http://localhost/verify', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit)
  assertEquals(await readText(r, 16_384), null)
  assertEquals(sent < 10, true, `read ${sent} chunks of a 100-chunk body`)
})

Deno.test(
  'no bearer token is a 401 with the CORS headers, before any environment or network is touched',
  async () => {
    for (const headers of [{}, { Authorization: 'Basic abc' }, { Authorization: 'Bearer ' }] as Record<
      string,
      string
    >[]) {
      const c = await clients(post('{}', headers))
      if (!c.reject) throw new Error('expected a rejection')
      assertEquals(c.reject.status, 401)
      assertEquals(await c.reject.json(), { error: 'UNAUTHORIZED' })
      assertEquals(c.reject.headers.get('access-control-allow-origin'), '*')
    }
  },
)

Deno.test(
  'clients: the service-role key is read only for a user the Auth service accepted; a refusal is 401, an outage 503',
  async () => {
    const wanted: string[] = []
    const env = (n: string) => {
      wanted.push(n)
      return n === 'SUPABASE_URL' ? 'https://abcdefghijklmnopqrst.supabase.co' : `key-${n}`
    }
    const realFetch = globalThis.fetch
    const ask = async (answer: () => Response) => {
      wanted.length = 0
      const seen: Array<{ url: string; auth: string | null }> = []
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        seen.push({ url: String(input), auth: new Headers(init?.headers).get('authorization') })
        return answer()
      }) as typeof fetch
      try {
        return { c: await clients(post('{}', { Authorization: 'Bearer user.jwt' }), env), seen }
      } finally {
        globalThis.fetch = realFetch
      }
    }
    const ok = await ask(() =>
      Response.json({ id: '00000000-0000-4000-8000-00000000000a', aud: 'authenticated' }),
    )
    if (ok.c.reject) throw new Error('expected the caller')
    assertEquals(ok.c.user, { id: '00000000-0000-4000-8000-00000000000a' })
    assertEquals(ok.seen.length, 1)
    assertEquals(ok.seen[0]!.auth, 'Bearer user.jwt') // the caller's own token, checked by the Auth service
    assert(ok.seen[0]!.url.endsWith('/auth/v1/user'))
    assertEquals(wanted, ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])

    for (const [status, want] of [
      [401, 401],
      [403, 401],
      [429, 503],
      [500, 503],
      [502, 503],
    ] as const) {
      const r = await ask(() => Response.json({ code: status, error_code: 'x', msg: 'x' }, { status }))
      if (!r.c.reject) throw new Error('expected a rejection')
      assertEquals(r.c.reject.status, want, `Auth answered ${status}`)
      assertEquals(r.c.reject.headers.get('access-control-allow-origin'), '*')
      assert(!wanted.includes('SUPABASE_SERVICE_ROLE_KEY'), `no service-role client for ${status}`)
    }
    const down = await ask(() => {
      throw new TypeError('fetch failed')
    })
    if (!down.c.reject) throw new Error('expected a rejection')
    assertEquals(down.c.reject.status, 503)
  },
)

Deno.test('brief: a signed URL in an error message loses its query string, and the message is cut', () => {
  const e = new TypeError(
    'error sending request for url (https://sentinel2l2a01.blob.core.windows.net/c/x/TCI.tif?st=2026&sig=SECRET): client error (Connect)',
  )
  assertEquals(brief(e).includes('SECRET'), false)
  assertEquals(
    brief(e).startsWith(
      'error sending request for url (https://sentinel2l2a01.blob.core.windows.net/c/x/TCI.tif?)',
    ),
    true,
  )
  assertEquals(brief('x'.repeat(500)).length, 200)
  assertEquals(brief(undefined), 'undefined')
})
