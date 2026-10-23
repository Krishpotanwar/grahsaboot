# Deploying GrahSaboot

The app is one Cloudflare Worker, `grahsaboot`, serving the built site from `dist/` (static assets) and `/api/tle`. Live at
https://grahsaboot.grahsaboot.workers.dev. Pushing to GitHub deploys nothing; a deploy is a command, run by the owner (or by
someone the owner told to, for that deploy).

## One time

`npx wrangler login` on the machine that deploys (browser approval). Nothing else is needed: the Worker has no secrets and no
variables today (`wrangler.jsonc` has no `vars` and no cron trigger).

## Each deploy

1. `npm run tle:snapshot` so the bundled orbit snapshot (`public/tle-snapshot.json`) is fresh. At most once every 2 hours:
   CelesTrak answers a repeat with 403. Commit the changed file if it changed.
2. `npm run deploy`. It runs `npm run check` (types, unit and database tests, the build without accounts and its bundle and
   content security policy guards, then the build with accounts and its guards) and then `wrangler deploy`. Never deploy
   straight after `npm run e2e` without it: the e2e builds into `dist-e2e/` and `dist-accounts-e2e/`, but only `check` rebuilds
   `dist/`.
3. Smoke the live site (below). On a failure, roll back at once.

`npm run deploy` always ships the build WITHOUT accounts. Switching accounts on is a different, owner-only procedure
(`docs/ops/accounts-test.md`, section D); never run `npm run deploy` for it.

## Smoke checklist

- Every route answers 200 with HTML: `/`, `/new`, `/limits`, `/privacy`, `/explore?lat=18.99135&lon=73.06575&name=Navi%20Mumbai%20airport`,
  and an unknown path such as `/i/anything` (the single page app's fallback). Not `/api/*`.
- `/api/tle` returns a JSON array of 5 objects. `/api/nothing` is a JSON 404 `{"error":"NOT_FOUND"}`; `POST /api/tle` is 405.
- In a real browser, at 1440 px and 390 px: no page error and no console message about the content security policy; the
  satellites panel says `Live` (or `Orbits from ...` when it is on the snapshot).
- The eye button next to "Start an investigation" hides the satellites panel and shows it again, and the choice survives a reload.
- The time-lapse opens (the `/explore` address above, then "Load the pictures"): six pictures, 2021 to 2026, appear in about 20 s,
  play by themselves, and the console stays quiet.
- The worked example opens (`/new?example=navi-mumbai-airport`, then the review step's open button): both photos appear in
  about 10 s and the whole list of passes follows.
- The map opens in the workbench (tier 2 and up), the report page shows its preview and downloads.

The scripts used in the project's own deploys are kept with the plan notes, not in the repository; the checklist is what they
do.

## Roll back

`npx wrangler rollback` returns to the previous version. Versions: `npx wrangler versions list`.

## Logs

`npx wrangler tail grahsaboot` (observability is on in `wrangler.jsonc`).

## What the Worker does (and why)

`/api/tle` answers from the edge cache. Past 0.8 s of waiting for CelesTrak (from some regions its origin never answers), it
answers from the bundled snapshot with `x-gs-stale: 1` and lets the refresh finish in the background for the next visitor, so
nobody waits on a spinner. Everything else goes to the static assets. Its responses carry `X-Content-Type-Options: nosniff`.

## Headers and the content security policy

`dist/_headers` is generated at build time (`scripts/write-headers.ts`, run by `npm run build`) from `scripts/csp.ts`, which
takes the allowed hosts from `src/config.ts` (its defaults and `ASSET_HOSTS`): a host the code talks to is a host in the policy,
nothing else is. The inline theme script is allowed by the hash of the BUILT `index.html`, so the file cannot go stale by
hand. `npm run check` runs `scripts/check-csp.ts` on both builds: every inline script is covered, no wildcard, no
`unsafe-eval`, no `data:` in `connect-src`, no `frame-ancestors` or `Cross-Origin-Opener-Policy` (ruled out: the site may be
embedded), no EOX host, and only the build with accounts names (one) Supabase origin.

To see a violation locally, serve `dist/` with the headers applied to every same-origin response and watch for
`securitypolicyviolation`; a host dropped from the policy shows up as a refused connection.

## Record

| Date | What | Version |
|---|---|---|
| 2026-10-09 | The report screen | ac88dcf5-3eb4-4528-94cd-58eb46799dff |
| 2026-10-11 | Workbench look, part 1 | 831537dd-fa06-48b9-bc50-f0778515a4d2 |
| 2026-10-12 | Workbench look, part 2 (barcode, pinned dates, road grid) | 4809bf9b-ded1-4a2d-8a0a-920529708d87 |
| 2026-10-12 | Tier-0 and accessibility checks, steadier notes, the content security policy | b21adcfb-d9fb-457b-a3c8-2e59f98d485b |
| 2026-10-18 | A map you can read, drawing aids and a size note | ccf42f10-c512-46cc-8f7d-7f602148fa73 |
| 2026-10-19 | The satellite view of the outline step, and its lines on the limits and privacy pages | ffe08aed-8db6-4f77-a18d-9328b8455dd0 |
| 2026-10-23 | Phase F stage 1: Look closer, Sharper, strict dates, the faster picture reader, the stale-tab reload, and the report's "What we measured" block | 242fa57b-175b-4b5f-8382-f3a0e7baf00c |
| 2026-10-24 | Phase F stage 2: Watch it change (the time-lapse, with its two links on the home screen) and a switch that hides the satellites | 8eedae18-8f94-46bb-9479-d883cf714943 |
