import { brief, clients, CORS, json, readText } from '../_shared/http.ts'
import { dbDeps } from './db.ts'
import { handleVerify, type VerifyDeps } from './handler.ts'
import { upstream } from './upstream.ts'

// A verify body is at most four small frames.
const MAX_BODY = 16_384
// One deadline for everything a request reads from the sources (the browser's own STAC timeout is the same 20 s).
const DEADLINE_MS = 20_000
// One per isolate, so the Planetary Computer token is shared by the requests this isolate serves.
const sources = upstream()

// The operator's log: the step and a short message with no query string. Never the body, and nothing about the caller.
const log = (step: string, e: unknown) => console.error(step, brief(e))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'METHOD' })
  try {
    const caller = await clients(req)
    if (caller.reject) return caller.reject
    const { user, asUser, admin } = caller
    const text = await readText(req, MAX_BODY)
    if (text === null) return json(413, { error: 'PAYLOAD_TOO_LARGE' })
    let body: unknown = null
    try {
      body = JSON.parse(text)
    } catch {
      // stays null: the handler answers 400
    }
    // Every dependency throws on any error: the handler maps a throw to 503 (or 422 for a GS: rule), never to "not found".
    const deps: VerifyDeps = {
      ...dbDeps(user.id, asUser, admin),
      ...sources.forRequest(AbortSignal.timeout(DEADLINE_MS)),
      log,
    }
    const r = await handleVerify(deps, body)
    return json(r.status, r.body)
  } catch (e) {
    // Anything unexpected: a static code with the CORS headers, no message and no stack.
    log('entry', e)
    return json(500, { error: 'INTERNAL' })
  }
})
