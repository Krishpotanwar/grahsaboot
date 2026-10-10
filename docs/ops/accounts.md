Do these steps only when the owner decides to activate accounts.

# Accounts (Gate G0, done by the human owner)

1. Supabase:
   - At supabase.com, create organisation "GrahSaboot" (Free plan).
   - Create project `grahsaboot-dev`, region **South Asia (Mumbai)**, with a strong DB password.
   - Create project `grahsaboot-prod` the same way, also in Mumbai.
2. Google Cloud:
   - In console.cloud.google.com, create project "GrahSaboot".
   - Open Google Auth Platform → Branding: app name GrahSaboot, support email, and a privacy policy URL (the preview URL + `/privacy`).
   - Audience: External.
   - Data access: scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` only.
   - Clients → Create OAuth client (Web).
     - Authorised JavaScript origins: the preview/prod app URLs.
     - Authorised redirect URIs: `https://<dev-ref>.supabase.co/auth/v1/callback` and `https://<prod-ref>.supabase.co/auth/v1/callback`.
3. Supabase dashboard (each project):
   - Authentication → Sign In / Providers → Google: paste the client ID and secret, then enable.
   - URL Configuration: Site URL = app URL; Additional redirect URLs = the preview/prod URLs `/**`.
   - In **dev only**: also add `http://127.0.0.1:5173/**` and `http://localhost:5173/**`. Production never trusts localhost.
   - Keep "Allow anonymous sign-ins" **off** in both projects: an anonymous user has the role `authenticated` and would pass every owner policy.
   - Disable Email signups in **prod**.
   - In **dev only**: enable Email with "Confirm email" off, so the automated smoke user can sign in with a password.
4. Create a personal access token, then on this VM run `npx supabase login`.
5. Fill in the two env files from `.env.example`, then run `npm run env:check`:
   - Browser variables (`VITE_ACCOUNTS`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) go into `.env.development.local`. The dev server reads it; production builds do not.
   - Tooling variables (everything else) go into `.env.local`.
   - Never put a `VITE_*` variable in `.env.local`: Vite loads that file in every build mode, so the next `npm run build` or `npm run deploy` would ship the dev project, with accounts on, to production.

Region cannot be changed after creation. Choose Mumbai.

Env file format: one `KEY=value` per line, starting in the first column (no `export`, no spaces around `=`, no trailing comment). Do not put `<` in a generated password: `npm run env:check` reads `<` as an unfilled placeholder.
