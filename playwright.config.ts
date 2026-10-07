import { defineConfig, devices } from '@playwright/test'

const live = process.env.LIVE === '1'
const browsers = (process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit').split(',')
const desktop = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
].filter((p) => browsers.includes(p.name))

export default defineConfig({
  testDir: 'tests',
  // The live worked-example test sits with the e2e specs but skips itself unless LIVE=1; LIVE mode must pick it up too.
  testMatch: live ? ['live/**/*.spec.ts', 'e2e/live-example.spec.ts'] : ['e2e/**/*.spec.ts'],
  timeout: live ? 120_000 : 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: live ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: live ? desktop : [...desktop, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: live
    ? [
        {
          command: 'npm run dev -- --port 5173 --strictPort',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: true,
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
          command: 'npx vite build --mode e2e && npx vite preview --port 4173 --strictPort',
          url: 'http://127.0.0.1:4173',
          timeout: 180_000,
          reuseExistingServer: false,
        },
      ],
})
