import { brief, clients, CORS, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'METHOD' })
  try {
    const caller = await clients(req)
    if (caller.reject) return caller.reject
    const { user, admin } = caller
    // The auth user is the root of every cascade: its rows, annotations and frames go with it.
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      console.error('delete', brief(error))
      return json(500, { error: 'DELETE_FAILED' })
    }
    // After the deletion, so a failure never leaves a log that claims one. The audit table has no foreign key to users, so the
    // row still inserts. The account is gone either way: a failed audit write is tried once more, then logged (a restore replays
    // these rows, see the runbook), and never reported as a failed deletion.
    for (let attempt = 0; attempt < 2; attempt++) {
      const audit = await admin
        .from('audit_log')
        .insert({ actor: user.id, action: 'delete_account', entity: 'users', entity_id: user.id })
      if (!audit.error) break
      console.error('audit', brief(audit.error))
    }
    return json(200, { ok: true })
  } catch (e) {
    console.error('entry', brief(e))
    return json(500, { error: 'INTERNAL' })
  }
})
