import { expect, it } from 'vitest'
import {
  aoiPixelWindow,
  aoiPointsUtm,
  levelInfoFor,
  openCogBuffer,
  sha256Hex,
} from '../../src/evidence/index.ts'
import {
  FIXTURE_EPSG,
  NAGPUR_SQUARE,
  TCI_SHAPE,
  TCI_TRANSFORM,
  makeTci,
  toArrayBuffer,
} from '../fixtures/scene.ts'

// The shared source (src/evidence, run under Node here) and the verify function's copy (supabase/functions/_shared/evidence, run
// by Deno) must derive the same window and the same bytes from the same scene (spec §11); the three browser engines are the
// Playwright half. The SAME literal is pinned in
// supabase/functions/verify/handler.test.ts ("the fixture frame hashes to the pinned value"): change both or neither.
const PIN = {
  window: [45, 46, 103, 107],
  sha256: 'b16880ae7396f7bce8371dcbaed16245084b8138bfefa5c0940264e01477e8f3',
}

it('derives the pinned window and SHA-256 for the fixture scene (visual, level 1, Nagpur square)', async () => {
  const cog = await openCogBuffer(toArrayBuffer(makeTci(true)))
  const lvl = levelInfoFor({ transform: TCI_TRANSFORM, shape: TCI_SHAPE }, cog, 1)
  const window = aoiPixelWindow(
    aoiPointsUtm({ kind: 'site', rings: [NAGPUR_SQUARE] }, FIXTURE_EPSG),
    lvl,
    2,
  )!.clamped
  const sha256 = await sha256Hex(await cog.read(1, window, [0, 1, 2]))
  expect({ window, sha256 }).toEqual(PIN)
})
