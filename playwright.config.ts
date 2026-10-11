import { defineConfig, devices } from '@playwright/test'

const live = process.env.LIVE === '1'
const browsers = (process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit').split(',')
const desktop = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
].filter((p) => browsers.includes(p.name))
// The accounts build is served on its own port, against a fake Supabase on the same origin (page.route mocks, tests/accounts).
// It needs one browser, and the main projects never see it: they keep proving that a build without the flag is unchanged.
// E2E_ACCOUNTS=0 skips it (and its build) for a run that only wants the main projects.
const withAccounts = !live && browsers.includes('chromium') && process.env.E2E_ACCOUNTS !== '0'

export default defineConfig({
  testDir: 'tests',
  // The live worked-example test sits with the e2e specs but skips itself unless LIVE=1; LIVE mode must pick it up too.
  testMatch: live ? ['live/**/*.spec.ts', 'e2e/live-example.spec.ts'] : ['e2e/**/*.spec.ts'],
  timeout: live ? 120_000 : 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: live ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: live
    ? desktop
    : [
        ...desktop,
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
        ...(withAccounts
          ? [
              {
                name: 'accounts',
                testMatch: 'accounts/**/*.spec.ts',
                use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
              },
            ]
          : []),
      ],
  webServer: live
    ? [
        {
          command: 'npm run dev -- --port 5173 --strictPort',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: true,
          // A developer's .env.development.local may switch accounts on; the live smoke test is of the site as deployed.
          env: { VITE_ACCOUNTS: '0' },
        },
      ]
    : [
        {
          command: 'npx tsx tests/fixtures/server.ts',
          url: 'http://127.0.0.1:4300/tle',
          env: { PORT: '4300' },
          reuseExistingServer: true,
        },
        {
          // Its own folder: dist/ stays the build `npm run check` made (a test build there could be deployed by mistake).
          command:
            'npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
          url: 'http://127.0.0.1:4173',
          timeout: 180_000,
          reuseExistingServer: false,
          // The process env beats the mode files: a shell that has accounts switched on must not reach the main suite.
          env: { VITE_ACCOUNTS: '0' },
        },
        ...(withAccounts
          ? [
              {
                command:
                  'npx vite build --mode accounts --outDir dist-accounts-e2e && npx vite preview --outDir dist-accounts-e2e --port 4174 --strictPort',
                url: 'http://127.0.0.1:4174',
                timeout: 180_000,
                reuseExistingServer: false,
                // Pinned for the same reason: the specs mock /supabase/ on this origin, a real project must never be reachable.
                env: {
                  VITE_ACCOUNTS: '1',
                  VITE_SUPABASE_URL: 'http://127.0.0.1:4174/supabase',
                  VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key',
                },
              },
            ]
          : []),
      ],
})
