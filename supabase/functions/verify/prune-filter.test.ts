import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { pruneFilter } from './prune-filter.ts'

const CURRENT = { date: '2025-12-20', itemId: 'S2B_44QKJ_20251220_0_L2A' }

Deno.test('keeps the pinned dates, and drops the frames of this date that came from another item', () => {
  assertEquals(
    pruneFilter(['2025-12-20', '2026-01-05'], CURRENT),
    'frame_date.not.in.(2025-12-20,2026-01-05),and(frame_date.eq.2025-12-20,item_id.neq.S2B_44QKJ_20251220_0_L2A)',
  )
})

Deno.test(
  'no pinned date at all means every frame of the investigation goes (no filter beyond the id)',
  () => {
    assertEquals(pruneFilter([], CURRENT), null)
  },
)

Deno.test('a pinned date that is not YYYY-MM-DD throws, whatever it tries to add to the filter', () => {
  for (const bad of [
    '2025-12-2',
    '20251220',
    '2025-12-20,frame_date.neq.1',
    '2025-12-20)',
    '2025-12-20 ',
    "2025-12-20'",
    '',
  ])
    assertThrows(() => pruneFilter(['2025-12-20', bad], CURRENT), Error, 'BAD_DATE')
  // not a string at all (a row from the database is untyped at run time)
  assertThrows(() => pruneFilter([['2025-12-20'] as unknown as string], CURRENT), Error, 'BAD_DATE')
})

Deno.test('the current date and item id are validated the same way', () => {
  assertThrows(
    () => pruneFilter(['2025-12-20'], { ...CURRENT, date: '2025-12-20,id.eq.1' }),
    Error,
    'BAD_DATE',
  )
  for (const itemId of ['', 'a,b', 'a)', 'a(b', '../x', '.x', 'a b', 'a"b', 'a*b', `${'a'.repeat(100)}b`])
    assertThrows(() => pruneFilter(['2025-12-20'], { ...CURRENT, itemId }), Error, 'BAD_ITEM')
  // the empty pin list does not skip the checks
  assertThrows(() => pruneFilter([], { ...CURRENT, itemId: 'a,b' }), Error, 'BAD_ITEM')
})
