import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

// Known-good vector, verified during planning (2026-10-05) in Node twice and Deno 2.9.6 once: identical windows and hashes.
const KNOWN = {
  item: 'S2B_44QLJ_20260512_0_L2A',
  sclWindow: [45, 2996, 103, 3057],
  sclSha: '0a0d8e8379002c01009e064e77b9cd3eac113039738eafbb332c98b9d15c385a',
  visualWindow: [92, 5994, 203, 6111],
  visualSha: 'df3bb3c2ad37aa84ebe93da6fadf485b682be0cc4a2855e7774c63d290826631',
}
const node = JSON.parse(
  execFileSync('npx', ['tsx', 'scripts/probe-cog.ts', KNOWN.item], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .pop()!,
)

test('Node reproduces the planning-time vector (catches upstream file rewrites)', () => {
  expect(node).toMatchObject(KNOWN)
})

test('browser hashes equal the Node hashes for the same windows (P1 + P2)', async ({ page }) => {
  await page.goto(`/dev/probe.html?item=${node.item}`)
  await expect(page.locator('#out')).not.toHaveText('running', { timeout: 90_000 })
  const out = JSON.parse((await page.locator('#out').textContent())!)
  expect(out.sclWindow).toEqual(node.sclWindow)
  expect(out.visualSha).toBe(node.visualSha)
  expect(out.sclSha).toBe(node.sclSha)
})
