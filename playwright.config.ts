import { defineConfig, devices } from '@playwright/test'

const live = process.env.LIVE === '1'

export default defineConfig({
  testDir: 'tests',
  testMatch: live ? ['live/**/*.spec.ts'] : ['e2e/**/*.spec.ts'],
  timeout: live ? 120_000 : 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
})
