import { expect, test } from '@playwright/test'
import { flow } from '../../src/ui/copy-flow.ts'
import { readStored } from '../e2e/helpers.ts'
import { JWT, mockSupabase, signedIn, SUPABASE_KEY } from './helpers.ts'

// The accounts build (.env.accounts, port 4174) against a fake Supabase. D8a has no accounts UI yet: this proves that the
// flag-on build loads the accounts code lazily and opens a saved investigation by its server id.
const SAVED_ID = '22222222-2222-4222-8222-222222222222'
// The 1000 m square of the fixture site (tests/e2e/helpers.ts outlineSiteByCoords), as the database returns it.
const SAVED = {
  id: SAVED_ID,
  name: 'Saved yard',
  kind: 'site',
  geom_geojson: {
    type: 'Polygon',
    coordinates: [
      [
        [79.0834, 21.1413],
        [79.093, 21.1413],
        [79.093, 21.1503],
        [79.0834, 21.1503],
        [79.0834, 21.1413],
      ],
    ],
  },
  road_width_m: null,
  date_from: '2025-01-01',
  date_to: '2025-12-31',
  before_date: null,
  after_date: null,
  pinned: [],
  claim_text: null,
  claim_date: null,
  claim_criterion: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
}

test('signed in, /i/<server id> opens the saved investigation with the account key and the session token', async ({
  page,
}) => {
  await signedIn(page)
  const calls = await mockSupabase(page, { investigations: [SAVED] })
  await page.goto(`/i/${SAVED_ID}?tier=0`)
  await expect(page.getByRole('heading', { level: 1, name: SAVED.name })).toBeVisible()
  const read = calls.find((c) => c.method === 'GET' && c.path === '/rest/v1/investigations')!
  expect(read.headers.apikey).toBe(SUPABASE_KEY)
  expect(read.headers.authorization).toBe(`Bearer ${JWT}`)
  expect(read.query.get('id')).toBe(`eq.${SAVED_ID}`)
  // A copy is kept in this browser, with the server id as its id, so the next visit needs no request.
  expect(await readStored(page, SAVED_ID)).toMatchObject({
    id: SAVED_ID,
    serverId: SAVED_ID,
    name: SAVED.name,
  })
})

test('signed out, the same address finds nothing', async ({ page }) => {
  const calls = await mockSupabase(page)
  await page.goto(`/i/${SAVED_ID}?tier=0`)
  await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
  // The request went out with the publishable key as the only credential.
  const read = calls.find((c) => c.path === '/rest/v1/investigations')!
  expect(read.headers.apikey).toBe(SUPABASE_KEY)
  // whatever the client sends as the bearer, it is not a session: nobody is signed in
  expect(read.headers.authorization).not.toBe(`Bearer ${JWT}`)
})

test('a local- address is never sent to the server', async ({ page }) => {
  const calls = await mockSupabase(page)
  await page.goto('/i/local-00000000-0000-4000-8000-000000000009?tier=0')
  await expect(page.getByText(flow.workbench.notFound)).toBeVisible()
  expect(calls).toEqual([])
})
