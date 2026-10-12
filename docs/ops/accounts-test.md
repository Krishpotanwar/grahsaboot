# Accounts: how to try them and how to switch them on

Accounts (Google sign-in, saving, server re-verification of every frame, privacy controls) are built and **switched off**. A build made without the accounts flag holds none of their code, words, requests or storage keys, and `npm run check` proves that on every run (`scripts/check-bundle.ts`, on both builds).

Nothing in this repository has ever talked to a Supabase or Google account. Every command below that does is marked **NOT RUN in the dormant phase**: a person runs it (the tester, or the owner), never an agent, and nothing touches production until the owner says go for that command.

Related files: `docs/ops/accounts.md` (Gate G0, the accounts themselves), `docs/ops/runbook.md` (operating it, and the behaviours that are not bugs), `.env.example` (the two env files), `docs/ops/probes.md` (where P3 and P4 are recorded).

## A. The tester path

A tester needs the dev Supabase project, never the production one.

1. **Gate G0, dev project only.** Follow `docs/ops/accounts.md` and skip everything that names the prod project:
   - the Supabase organisation and the project `grahsaboot-dev` (Mumbai);
   - the Google Cloud project and the OAuth client, with the dev redirect URI `https://<dev-ref>.supabase.co/auth/v1/callback`;
   - the Google provider on, the redirect URLs `http://127.0.0.1:5173/**` and `http://localhost:5173/**`, "Allow anonymous sign-ins" **off**, email on with "Confirm email" off (dev only), and a personal access token for `npx supabase login`.
2. **Env files.** `.env.development.local` holds the browser values only (`VITE_ACCOUNTS=1`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). `.env.local` holds every tooling value. Never put a `VITE_*` variable in `.env.local`: Vite loads it in every build mode. `npm run env:check` validates the pair.
3. **Apply the four migrations to the dev project** (plan task D4, step 1). **NOT RUN in the dormant phase.**

   ```bash
   set -a; . ./.env.local; set +a
   npx supabase link --project-ref "$SUPABASE_DEV_REF" -p "$SUPABASE_DEV_DB_PASSWORD"
   npx supabase db push --linked -p "$SUPABASE_DEV_DB_PASSWORD"
   npx supabase migration list --linked -p "$SUPABASE_DEV_DB_PASSWORD"
   ```

   Expected: four migrations listed as applied on the remote.

4. **Smoke the API** (plan task D4, step 2). **NOT RUN in the dormant phase.** The plan sourced one env file; the browser values are in `.env.development.local` now, so source both.

   ```bash
   set -a; . ./.env.local; . ./.env.development.local; set +a
   curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/keep_alive" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "content-type: application/json" -d '{}'
   curl -s "$VITE_SUPABASE_URL/rest/v1/investigations?select=id" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
   ```

   Expected: the first prints `1`. The second prints a permission error (`42501`): the publishable key cannot read the table, and it cannot return `[]` because every privilege is revoked from `anon`.

5. **Record P3, database half** in `docs/ops/probes.md`: the region shown in the dashboard (Mumbai), PostGIS enabled, the pg_cron job listed by `select jobname, schedule, username, active from cron.job;` (expect `gs-purge`, `0 21 * * *`, `postgres`, `true`), and the keep-alive result.
6. **Deploy the two functions to the dev project** (plan task D7, step 2). **NOT RUN in the dormant phase.**

   ```bash
   npx deno check --config supabase/functions/deno.json supabase/functions/verify/index.ts supabase/functions/delete-account/index.ts
   set -a; . ./.env.local; set +a
   npx supabase functions deploy verify --project-ref "$SUPABASE_DEV_REF"
   npx supabase functions deploy delete-account --project-ref "$SUPABASE_DEV_REF"
   ```

   Expected: both deploy and print their URLs. The first line is the same type-check as `npm run check:deno`, which CI runs.

7. **Run the function smoke** (plan task D7, step 3; probe P3, function half). **NOT RUN in the dormant phase.**

   ```bash
   npm run smoke:verify:dev
   ```

   Expected: JSON with `"statuses":["verified","verified"]`, no error and `ms` recorded. It signs the dev-only smoke user up, writes one investigation and deletes it, and it refuses to run unless `VITE_SUPABASE_URL` starts with `https://$SUPABASE_DEV_REF.`.

8. **Run the app.** **NOT RUN in the dormant phase.**

   ```bash
   npm run dev
   ```

   Open http://127.0.0.1:5173. Draw an outline, pin two dates, press "Save and verify", sign in with a Google account, agree, and watch the status line. Then reload and open the copy from "My investigations", delete it, sign out and sign in again, and delete the account.

Behaviours that look odd but are intended (the agreement asked again after each sign-out, the home page shifting once, "Sign in" on `/new` dropping a drawn outline, `?save=1`) are listed in `docs/ops/runbook.md`, "Known behaviours of a build with accounts".

## B. The activation checklist

Tick every box before the activation build in section D. Each line says what passes. Record P3 and P4 in `docs/ops/probes.md` (date, numbers, decision).

### Blocking

- [ ] **BLOCKING, first: a refreshed session moves `auth.users.last_sign_in_at`.** The procedure and the fallback are in section C. Until this passes, do not activate: `purge_expired()` keys on that column, and if it stays at the first sign-in it would delete active people's investigations twelve months later, which cannot be undone.
- [ ] **BLOCKING: the grievance contact.** `src/ui/copy-account.ts` (`privacyItems`, the last line) holds the marked placeholder `[name and email of the grievance contact]`, shown on `/privacy` in a build with accounts. The owner supplies a named contact. Replace it, and update the two tests that pin the placeholder (`src/ui/copy-account.test.ts` and `tests/accounts/account.spec.ts`). The activation build fails while the placeholder is in any built file (`GS_ACCOUNTS_RELEASE=1`, `scripts/bundle-rules.ts`).

### Database, cron and sign-in settings

- [ ] **`pg_cron` from a migration.** `create extension pg_cron` works from a migration on hosted Supabase, and the schedule row exists: `select jobname, schedule, username, active from cron.job;` returns `gs-purge`, `0 21 * * *`, `postgres`, `true`. If Supabase rejects the extension in a migration: enable pg_cron in the dashboard (Database, Extensions), keep only the `cron.schedule` line of `supabase/migrations/20261005000004_ops_cron.sql`, and record that in `docs/ops/probes.md` (P3).
- [ ] **Hosted PostgreSQL 15 or 17.** The D2 and D3 SQL was tested on PGlite (PostgreSQL 18.3). The four migrations apply without an error, and a hand check on the dev project matches the tests: an over-large outline is refused with a `GS:` code, a second user sees none of the first user's rows, and `anon` and `authenticated` cannot execute `purge_expired()`.
- [ ] **"Allow anonymous sign-ins" stays OFF** in both projects (Authentication, Sign In / Providers). An anonymous user has the role `authenticated` and would pass every owner policy.
- [ ] **P4: Google sign-in for a non-team user.** A Google account that is not on the project team can sign in while the OAuth app is "In production" with the basic scopes (`openid`, email, profile). Fallback if it fails: keep testing mode with test users until there is a domain.
- [ ] **The sign-in return.** Sign-in returns to the page it started from. The Supabase redirect URL allow-list accepts the app origins and refuses any other, and production does not list localhost. Google's consent screen return works in a real browser (the end-to-end tests mock it).

### The functions

- [ ] **Key names (E29).** The functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` under the project's key system. One `verify` call leaves no `MISSING_ENV_<NAME>` line and no 500 INTERNAL in the dashboard logs.
- [ ] **`verify_jwt = true` (E29).** The gateway accepts a real user token signed with the project's keys. The functions re-check every call through `getUser`, so `verify_jwt = false` in `supabase/config.toml` is a safe fallback if the gateway rejects valid tokens.
- [ ] **The import map.** The first deploy resolves `import_map = "./functions/deno.json"`: `geotiff`, `proj4`, `@supabase/supabase-js` and `@supabase/supabase-js/cors` all load.
- [ ] **Browser CORS (A31).** A real preflight from the app origin to both endpoints: `OPTIONS` passes `verify_jwt` and the SDK's request headers are allowed, and a real save from the browser works. Then narrow `Access-Control-Allow-Origin` from `*` to the app origins (`supabase/functions/_shared/http.ts`).
- [ ] **P3: CPU and memory.** `npm run smoke:verify:dev`: elapsed ms recorded, statuses `["verified","verified"]`, no `WORKER_LIMIT`, CPU or memory errors in the dashboard (Edge Functions, verify, Logs), a cold start included (geotiff and proj4 load). Pass: CPU under 1.5 s and RSS under 200 MB (spec section 14). If it fails, spec section 13 row 2 applies (verify the scene check and level-1 frames only, or Cloudflare Workers Paid for verify): ask the owner first, it is a paid change. The item literal `S2B_44QLJ_20260512_0_L2A` in the script may no longer exist: swap it for any recent item over Nagpur.
- [ ] **Prune filter syntax.** PostgREST accepts `or=(frame_date.not.in.(...),and(frame_date.eq.<d>,item_id.neq.<id>))` (only unit-tested as a string so far). Pin two dates and save, unpin one and save: its frames are gone. Switch a date to its alternate item: the old item's frames are gone.
- [ ] **The frame cap.** The 51st frame answers 422 `GS:LIMIT_FRAMES`, with that code only (PostgREST's `message` carries the raised text).
- [ ] **Counting.** One request leaves `n` `check` rows in `audit_log` (actor, `frames`, investigation id). The 601st frame within 24 hours answers 429. A request that fails after the reads still counted. `count: exact` works for the service role.
- [ ] **`delete-account`.** The cascade removes investigations, annotations and frames. The `delete_account` audit row exists afterwards and holds IDs only. A second call with the same token is 401.
- [ ] **Redirects.** S3 and Azure range reads answer 206 without a redirect (a 3xx would surface as 502 UPSTREAM). The Azure HEAD with the signed URL returns `etag` and `last-modified`.
- [ ] **Runtime parity.** `AbortSignal.timeout`, `AbortSignal.any` and `redirect: 'error'` behave in the Edge Runtime as in Deno 2.9.6, and the 20 s deadline sits under the platform's limits.
- [ ] **Auth edge cases.** The anon key sent as the bearer token answers 401 (not 500). An Auth outage answers 503.
- [ ] **The gateway's 401 and CORS.** With `verify_jwt = true` an invalid or expired JWT is answered by the platform, not by the function, and that answer may carry no CORS headers. The browser then reports a network error, never a 401, so the app's "sign in again" answer to an expired session would not fire. Test with a real expired token from the app origin. If the answer is opaque, set `verify_jwt = false` (the function authenticates every call itself).
- [ ] **Injected keys when legacy keys are off.** If the project turns off legacy API keys, the injected `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` may be rejected rather than missing: a 500 or 503 with a PostgREST "invalid API key" in the log, not `MISSING_ENV_*`. Confirm which names the platform injects. If needed, store the publishable and secret keys as function secrets and read those.
- [ ] **No signed URL in the logs.** After the first P3 run, search the function logs for `sig=`, `sv=` and `se=`: none.
- [ ] **The `pc:` fallback from the deployed function.** Planetary Computer's token endpoint is unauthenticated and rate-limited by IP, and Edge egress IPs are shared, so `PC_SAS_429` (a 502) is possible. Exercise one `pc:sentinel-2-l2a` item from the function, not only Earth Search.
- [ ] **Upstream requests per open.** There is no block cache (`blockSize` is undefined in geotiff 3), so every IFD and tag array is its own range request, as in the browser. Record the number of upstream requests per `verify` next to the elapsed ms in P3.
- [ ] **The Auth hop.** Each call makes one `GET /auth/v1/user`: include it in the P3 timing and watch the project's Auth rate limits (an Auth 429 answers 503). Anonymous calls with the public anon key pass the gateway and cost one Auth call each: decide whether a platform rate limit is needed.
- [ ] **Preflight volume.** Count the invocations for a 24-date save: each cold preflight is its own Edge invocation.
- [ ] **Concurrency.** Fire two overlapping `verify` calls for the same investigation (different dates), and one with a date pinned in between, to see that the prune race is as rare as assumed.

### The browser

- [ ] **A deleted user's old token.** Delete a throwaway dev user, then `GET /auth/v1/user` with its old token: record the status and the `code`, and pin `accountIsGone` (`src/accounts/leave.ts`) to exactly that answer.
- [ ] **Delete with the connection cut at the response.** Delete the account with the connection cut as the answer would arrive (DevTools offline, or a blocked response): the page says it could not delete, and "Try again" converges to a signed-out page with the account gone.
- [ ] **Back from Google.** Press Back on Google's sign-in page: the Sign in and Save buttons work again (nothing stuck on "signing in").
- [ ] **Save, then cancel at Google.** Press Save, cancel at Google: the page forgets `?save=1`, and reloading it starts no save.
- [ ] **Two accounts in one browser.** A saves and signs out, B signs in: B sees none of A's copies, can save its own, and cannot read A's rows through the API.
- [ ] **The accounts chunk.** The accounts chunk is about 90 KB gzip and loads on every page of a build with accounts. Measure the first view on a throttled connection (DevTools, Slow 4G), and decide whether to load the account menu lazily (`React.lazy` inside `AccountMenu`, which keeps Base UI's Menu away from signed-out visitors).
- [ ] **The home page shift.** "My investigations" arrives a moment after the home page, so the page shifts once for a signed-in person (an accepted ruling, build with accounts only). Look at it on a phone and confirm it is acceptable.

### The Worker, the content security policy and production settings

- [ ] **The CSP origin.** The CSP generator and `check-csp` belong to the Phase C plan's task C11, which had not been built when this file was written. Pass: the generator adds exactly `new URL(VITE_SUPABASE_URL).origin` to `connect-src` in the build with accounts and nothing to the build without, `check-csp` asserts both and no wildcard, and `dist/_headers` and `dist-accounts/_headers` show it after `npm run check`. One origin covers auth, REST and functions (supabase-js builds `<project URL>/functions/v1`). In the accounts build only, with the console open, use the account menu, the agreement dialog, the three confirm dialogs and the two toasts: no CSP violation.
- [ ] **Accessibility of the accounts parts.** The a11y spec runs on the build without accounts, which has no accounts parts to scan. The accounts Playwright project runs axe on the menu and the dialogs, in both themes. Run `E2E_BROWSERS=chromium npm run e2e` on the activation commit, after the final policy is in place, and confirm the accounts project passes.
- [ ] **The cron trigger and variables.** At activation `wrangler.jsonc` gets `"triggers": { "crons": ["30 3 * * *"] }` and `"vars": { "SUPABASE_URL": "https://<ref>.supabase.co" }` (the production project URL, which is public), and `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY` stores the key. The next day the Supabase API log shows one `POST /rest/v1/rpc/keep_alive` with 200 (`docs/ops/runbook.md`, "The daily keep-alive").
- [ ] **Production settings.** The production project has its own redirect URLs (no localhost), email signups disabled, the Google provider on and "Allow anonymous sign-ins" off. The production database and both functions are deployed first (plan task D11, each command only on the owner's explicit go-ahead).

## C. The blocking check: a refreshed session moves `last_sign_in_at`

`purge_expired()` deletes the investigations of every user whose `auth.users.last_sign_in_at` is older than 12 months. If the platform sets that column only at an explicit sign-in, and not when a session's token is refreshed, a person who uses the site every day with a long-lived session would lose their data twelve months after the first sign-in. Nothing can be purged before then, but the loss would be irreversible, so check before the first real user. **NOT RUN in the dormant phase.**

1. On the dev project, sign in as a throwaway user. In the SQL editor note `select id, last_sign_in_at from auth.users where email = '<throwaway email>';`. (An email in the query is fine in the SQL editor; never paste it into a ticket.)
2. Let the access token expire and the session refresh without signing in again. Set "JWT expiry" in the dev project's Authentication settings to the shortest value the dashboard allows, keep the app open past it, and use the app (open an investigation, save) so the SDK refreshes the session.
3. Run the query again. **Pass:** `last_sign_in_at` moved to about the refresh time. **Fail:** it still shows the first sign-in.

If it fails, do not activate. Add a migration that changes `purge_expired()` so an investigation is purged only when the user also has no recent session, by adding this clause to the first `delete`:

```sql
and not exists (
  select 1 from auth.sessions s
  where s.user_id = u.id
    and greatest(s.updated_at, s.refreshed_at at time zone 'utc') >= now() - interval '12 months'
)
```

The PGlite test shim needs an `auth.sessions` table (`user_id`, `updated_at`, `refreshed_at`) so the rule can be tested in `tests/db/security.test.ts`, with a case for an old `last_sign_in_at` and a fresh session (kept) and one for neither (purged).

## D. The activation build

Only the owner runs this, after every box in section B is ticked, with the production URL and publishable key on the command line (never from `.env.local`). The production database, functions and OAuth settings are in place first.

```bash
GS_ACCOUNTS_RELEASE=1 VITE_ACCOUNTS=1 VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm run build && GS_ACCOUNTS_RELEASE=1 tsx scripts/check-bundle.ts && npx wrangler deploy
```

- **NEVER `npm run deploy`.** It runs `npm run check`, which rebuilds `dist/` without the flag, and then deploys that: it ships the build without accounts. The same goes for every routine deploy after activation until the deploy script is changed on purpose: until then the line above is how the live site is deployed.
- `GS_ACCOUNTS_RELEASE=1` tells the guard that this `dist/` is meant to hold accounts. It then requires the accounts chunk, keeps the accounts code out of the first page's files, and fails while the grievance placeholder is in any built file.
- `tsx` is `npx tsx` if `node_modules/.bin` is not on your PATH. `GS_ACCOUNTS_RELEASE=1 npm run bundle` is the same check.
- `wrangler deploy` carries the Worker's `vars` and cron trigger from `wrangler.jsonc`, so they must be in place (section B, "The cron trigger and variables").
