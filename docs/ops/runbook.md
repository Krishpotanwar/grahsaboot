# GrahSaboot runbook

Accounts are built and switched off. The live site is the plain build, which has no accounts, no database and no cron. Nothing below has been run against a real project: `docs/ops/accounts-test.md` says how a tester tries accounts and how the owner switches them on.

**Every command that touches Supabase, Cloudflare or Google is run by the owner, only on the owner's explicit go-ahead for that command. An agent never runs one.** Audit rows hold IDs only: never paste a name, an email, a geometry or a note into a ticket, a chat or an incident file.

## Deploys

- Web today: `npm run deploy`. It checks, builds without the accounts flag and ships a site with no accounts. It never ships accounts, and the activation build must never go through it. Only on the owner's explicit go-ahead, never run by an agent.
- Web with accounts: only the activation build and deploy in `docs/ops/accounts-test.md` section D. Only on the owner's explicit go-ahead, never run by an agent.
- Database, dev project (always first). Only on the owner's explicit go-ahead, never run by an agent:
  1. `set -a; . ./.env.local; set +a`
  2. `npx supabase link --project-ref "$SUPABASE_DEV_REF" -p "$SUPABASE_DEV_DB_PASSWORD"`
  3. `npx supabase db push --linked -p "$SUPABASE_DEV_DB_PASSWORD"`
- Database, production. Only on the owner's explicit go-ahead, never run by an agent: `npx supabase link --project-ref "$SUPABASE_PROD_REF"`, then `npx supabase db push --linked`.
- Functions, dev first and production only on the owner's explicit go-ahead, never run by an agent: `npx supabase functions deploy verify --project-ref <ref>` and `npx supabase functions deploy delete-account --project-ref <ref>`.
- The migrations in `supabase/migrations/` were tested on PGlite (PostgreSQL 18.3), and hosted Supabase runs 15 or 17: read the first push's output, and re-check the SQL on a dev project before production.

## The daily keep-alive

A free Supabase project is paused after a period without requests. The Worker's `scheduled()` calls the `keep_alive()` RPC once a day with the publishable key so that does not happen.

- It is off today: `wrangler.jsonc` has no cron trigger and no `SUPABASE_URL` variable, so Cloudflare never calls `scheduled()`. At activation `wrangler.jsonc` gets `"triggers": { "crons": ["30 3 * * *"] }` (03:30 UTC) and `"vars": { "SUPABASE_URL": "https://<ref>.supabase.co" }` (the URL is public: it is in the browser bundle), and `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY` stores the key (only on the owner's explicit go-ahead, never run by an agent). A deploy without the variable leaves it empty and the ping silently does nothing.
- The Worker swallows every failure on purpose, so a green Cloudflare cron run proves only that the Worker ran. To tell that it works, look in the Supabase dashboard under Logs, API: one `POST /rest/v1/rpc/keep_alive` with status 200 a day. By hand, the owner can run `curl -s -X POST "$URL/rest/v1/rpc/keep_alive" -H "apikey: $KEY" -H "content-type: application/json" -d '{}'`, which prints `1`.
- If the logs show no call, check in this order: the cron trigger in the Cloudflare dashboard (Workers, grahsaboot, Settings, Triggers), the `SUPABASE_URL` variable, the `SUPABASE_PUBLISHABLE_KEY` secret. A paused project is restored from the Supabase dashboard.

## The retention job

`purge_expired()` runs daily at 21:00 UTC (02:30 IST) from pg_cron, as the database owner. No API role can call it. It does two things:

1. It deletes the investigations (and with them their notes and frames) of every user whose `auth.users.last_sign_in_at` is more than 12 months old. A user whose `last_sign_in_at` is null is never purged.
2. It deletes `audit_log` rows older than 365 days, except the consent rows of accounts that still exist: the record that a person agreed is kept while the account exists.

It does not delete the account: the Google name and email stay until the person deletes the account, and the privacy page says so. Its counts are not stored; each deleted row leaves a `delete` audit row attributed to the owner. To see that it ran, run `select jobname, schedule, username, active from cron.job;` (expect `gs-purge`, `0 21 * * *`, `postgres`, `true`) and `select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;`.

It keys on `auth.users.last_sign_in_at`. Before activation the owner must verify that a refreshed session moves it (`docs/ops/accounts-test.md` section C): if it does not, the job would delete the data of people who use the site every day, twelve months after their first sign-in, and that cannot be undone.

It removes the server copies only. The copies in a person's browser stay, and the sign-out question says "they stay in your account" for a copy whose server row is already gone. That is accepted: say so to a person who asks.

## Watching the size of the database

The free plan holds 500 MB. Audit rows grow with activity (every save rewrites every note, so each save leaves one audit row per note). Once a month, in the Supabase SQL editor (it runs as the database owner):

```sql
select pg_size_pretty(pg_database_size(current_database())) as database;
select relname as "table", n_live_tup as rows, pg_size_pretty(pg_total_relation_size(relid)) as size
  from pg_stat_user_tables where schemaname = 'public' order by pg_total_relation_size(relid) desc;
select action, count(*) from public.audit_log where at > now() - interval '30 days' group by 1 order by 2 desc limit 20;
```

A single action that dwarfs the rest, or `audit_log` growing faster than the people using the site, is the sign of a loop or of abuse.

## Consent flood

`record_consent` writes one row per person and agreement version, so a person who calls it with many different version strings can add rows without limit. Consent rows are kept while the account exists (so the record can still be shown), so a flood is permanent until the account is deleted; after that the 365-day purge takes the rows.

1. Find it: `select actor, count(*) from public.audit_log where action like 'consent:%' group by 1 having count(*) > 3 order by 2 desc;`. A normal person has one row (`consent:v1`).
2. Remove it as the database owner in the SQL editor: `delete from public.audit_log where actor = '<uid>' and action like 'consent:%';`. `service_role` cannot delete audit rows (the privilege is revoked on purpose), so no function or script can do it for you. The statement also removes the person's own `consent:v1` row; add `and action <> 'consent:v1'` to keep it.
3. If the person starts again, delete the account from the Supabase dashboard (Authentication, Users). The cascade removes their data, and the 365-day purge takes their consent rows once each is a year old.

## Restore

The free plan has no managed backups, so the owner keeps their own. This procedure has never been rehearsed: rehearse it once on a throwaway project before the first real user.

1. Nightly, on the owner's machine: `npx supabase db dump --linked --data-only -f backups/$(date +%F).sql` (a dump without `--data-only` is the schema only, which the migrations already hold). Keep the files encrypted and out of the repository: they hold people's investigations. Include the `auth` schema (`--schema auth,public`) so people's ids survive: the data is keyed by `auth.users` ids, and a person who signs in to a new project without them gets a new id and sees nothing.
2. To restore, create a fresh project, apply `supabase/migrations/` to it, then load the dump **with triggers disabled**: start the session with `set session_replication_role = replica;` (check the first lines of the file: add the line if it is missing). The insert rule sets `frozen_at` to null for every role, so a restore that fires triggers would drop every freeze. Triggers must also stay off so the load writes no audit rows.
3. Before anyone can open the site, re-apply the deletions newer than the dump: for each `audit_log` row in the live database with action `delete` on `investigations`, `annotations` or `frames`, or `delete_account` on `users`, whose `at` is after the dump time, delete the same IDs in the restored database. The 365-day purge bounds how far back the live rows reach.
4. Verify that no deleted ID reappears, then switch the site over.

## Breach (DPDP Rules: notify affected users without delay, the Board within 72 hours)

1. Contain: rotate the Supabase service-role key and the Google OAuth secret, and redeploy the functions.
2. Assess: use `audit_log` to find the affected IDs and the time window.
3. Notify the affected users by email with what happened, the data involved, what was done and what they can do.
4. Report to the Data Protection Board within 72 hours.
5. Record everything in `docs/ops/incidents/<date>.md`, with IDs only.

## Limits and triggers (spec section 13)

Watch the Supabase usage page monthly:

- Database over 400 MB: propose Pro ($25 a month) to the owner.
- `verify` CPU errors: spec section 13 row 2.

## Known behaviours of a build with accounts

None of these is a bug, and none exists in the live site (a build without the flag has no accounts):

- Signing out, or deleting an investigation or the account, while a save is running is guarded in code: the running save stands down. Say so if a tester asks.
- The agreement (the 18+ confirmation and the points shown before the first save) is asked again at the first save after every sign-out. The server holds the record, but nothing reads it back: the key in the browser is the only gate.
- A session that ends by expiry bypasses the purge of saved copies: they stay in this browser until the next explicit sign-out (an expiry listener cannot ask the question, and the local model does not record whose copy it is).
- The home page shifts once, a line down, when "My investigations" arrives for a signed-in person.
- "Sign in" on `/new` discards an outline that is being drawn (a look-review item).
- Opening a page with `?save=1` while signed in and agreed saves once, when the photos are ready (the person's own data, to their own account).
- The accounts chunk is about 90 KB gzip and loads on every page of a build with accounts. Measure it on a throttled connection before activation. Loading Base UI's Menu lazily (`React.lazy` inside the account menu) would keep it away from signed-out visitors.
