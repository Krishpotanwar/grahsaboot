import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { openCogBuffer, sha256Hex, type Window } from '../_shared/evidence/index.ts'
import { FIXTURE_DATES, fixtureItem, makeScl, makeTci, toArrayBuffer } from '../../../tests/fixtures/scene.ts'
import { upstream } from './upstream.ts'

const S3 = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com'
const SAS = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a'
const AZ = 'https://sentinel2l2a01.blob.core.windows.net/c/x/TCI.tif'
const files: Record<string, Uint8Array> = {
  [`${S3}/f/SCL.tif`]: makeScl(FIXTURE_DATES[3]!.scl),
  [`${S3}/f/TCI.tif`]: makeTci(true),
}

interface Call {
  url: string
  init: RequestInit
}
/** A fetch that records every call and answers from `handler`: nothing here touches the network. */
function fake(handler: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = []
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init })
    return handler(String(input), init)
  }) as typeof fetch
  return { f, calls }
}
/** Serves `files` with HTTP range requests, as S3 does. */
function ranged(url: string, init: RequestInit): Response {
  const file = files[url.split('?')[0]!]
  if (!file) return new Response(null, { status: 404 })
  const m = /^bytes=(\d+)-(\d+)$/.exec((init.headers as Record<string, string>).Range ?? '')
  if (!m) return new Response(null, { status: 400 })
  const start = Number(m[1])
  const end = Math.min(Number(m[2]), file.length - 1)
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { 'content-range': `bytes ${start}-${end}/${file.length}` },
  })
}
const everyCallIsGuarded = (calls: Call[]) => {
  assert(calls.length > 0)
  for (const c of calls) {
    assertEquals(c.init.redirect, 'error', c.url)
    assert(c.init.signal instanceof AbortSignal, c.url)
  }
}

Deno.test(
  'a file opened through the redirect-refusing client reads the bytes the shared buffer path reads',
  async () => {
    const { f, calls } = fake(ranged)
    const up = upstream(f).forRequest(new AbortController().signal)
    const window: Window = [10, 10, 60, 50]
    for (const [href, level, samples] of [
      [`${S3}/f/SCL.tif`, 0, [0]],
      [`${S3}/f/TCI.tif`, 1, [0, 1, 2]],
    ] as const) {
      const cog = await up.openCog(href, 'sentinel-2-l2a')
      const want = await openCogBuffer(toArrayBuffer(files[href]!))
      assertEquals(cog.sizes, want.sizes)
      assertEquals(
        await sha256Hex(await cog.read(level, window, [...samples])),
        await sha256Hex(await want.read(level, window, [...samples])),
      )
    }
    everyCallIsGuarded(calls)
  },
)

Deno.test('one open per file per request, and the request deadline reaches every read', async () => {
  const { f, calls } = fake(ranged)
  const deadline = new AbortController()
  const up = upstream(f).forRequest(deadline.signal)
  const href = `${S3}/f/SCL.tif`
  const [a, b] = await Promise.all([up.openCog(href, 'sentinel-2-l2a'), up.openCog(href, 'sentinel-2-l2a')])
  assert(a === b)
  const opened = calls.length
  await up.openCog(href, 'sentinel-2-l2a')
  assertEquals(calls.length, opened, 'a second open must not touch the network')
  deadline.abort()
  // the deadline is in force for what is already in flight, and a read after it never starts
  assert(calls.every((c) => c.init.signal?.aborted))
  await assertRejects(() => a.read(0, [0, 0, 10, 10], [0]))
  assertEquals(calls.length, opened)
})

Deno.test(
  'fetchItem builds the URL from the id, answers null for 404 and for an off-list item, and throws on other failures',
  async () => {
    const good = fixtureItem(S3, FIXTURE_DATES[3]!)
    const offList = {
      ...good,
      assets: { ...good.assets, visual: { ...good.assets.visual, href: 'https://evil.example/TCI.tif' } },
    }
    const { f, calls } = fake((url) => {
      if (url.endsWith('/GOOD')) return Response.json(good)
      if (url.endsWith('/EVIL')) return Response.json(offList)
      return new Response('x', { status: url.endsWith('/GONE') ? 404 : 500 })
    })
    const up = upstream(f).forRequest(new AbortController().signal)

    const es = await up.fetchItem('sentinel-2-l2a', 'GOOD')
    assertEquals([es?.id, es?.collection], [good.id, 'sentinel-2-l2a'])
    assertEquals(
      calls[0]!.url,
      'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/GOOD',
    )
    const pc = await up.fetchItem('pc:sentinel-2-l2a', 'GOOD')
    assertEquals(pc?.collection, 'pc:sentinel-2-l2a')
    assertEquals(
      calls[1]!.url,
      'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/GOOD',
    )

    assertEquals(await up.fetchItem('sentinel-2-l2a', 'GONE'), null)
    assertEquals(await up.fetchItem('sentinel-2-l2a', 'EVIL'), null)
    await assertRejects(() => up.fetchItem('sentinel-2-l2a', 'BROKEN'), Error, 'STAC_500')
    everyCallIsGuarded(calls)
  },
)

Deno.test(
  'Planetary Computer signing: a failed token request throws and caches nothing; a missing or unreadable expiry still expires',
  async () => {
    const realNow = Date.now
    let now = Date.UTC(2026, 0, 1)
    Date.now = () => now
    try {
      let cancelled = 0
      // a failed token request must not leave its body open (the connection would wait for garbage collection)
      let answer: () => Response = () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled++
            },
          }),
          { status: 503 },
        )
      const { f, calls } = fake((url) => (url === SAS ? answer() : new Response(null, { status: 200 })))
      const up = upstream(f).forRequest(new AbortController().signal)
      const sasCalls = () => calls.filter((c) => c.url === SAS).length
      const lastHead = () => calls.filter((c) => c.url !== SAS).at(-1)!.url

      await assertRejects(() => up.headAsset(AZ, 'pc:sentinel-2-l2a'), Error, 'PC_SAS_503')
      await assertRejects(() => up.headAsset(AZ, 'pc:sentinel-2-l2a'), Error, 'PC_SAS_503')
      assertEquals(sasCalls(), 2, 'a failure is not cached')
      assertEquals(cancelled, 2, 'the failed answers were cancelled')

      answer = () => Response.json({ token: 'sig=A', 'msft:expiry': 'not a date' })
      await up.headAsset(AZ, 'pc:sentinel-2-l2a')
      assertEquals(lastHead(), `${AZ}?sig=A`)
      await up.headAsset(AZ, 'pc:sentinel-2-l2a')
      assertEquals(sasCalls(), 3, 'reused while it is more than a minute from expiring')

      // the unreadable expiry became "5 minutes": after 4 min 1 s it is renewed (a NaN expiry would never be)
      now += 4 * 60_000 + 1_000
      answer = () => Response.json({ token: 'sig=B', 'msft:expiry': new Date(now + 3_600_000).toISOString() })
      await up.headAsset(`${AZ}?x=1`, 'pc:sentinel-2-l2a')
      assertEquals(sasCalls(), 4)
      assertEquals(lastHead(), `${AZ}?x=1&sig=B`)

      now += 30 * 60_000
      await up.headAsset(AZ, 'pc:sentinel-2-l2a')
      assertEquals(sasCalls(), 4, 'a valid expiry is honoured')

      answer = () => Response.json({ 'msft:expiry': new Date(now + 3_600_000).toISOString() })
      now += 60 * 60_000
      await assertRejects(() => up.headAsset(AZ, 'pc:sentinel-2-l2a'), Error, 'PC_SAS_TOKEN')
    } finally {
      Date.now = realNow
    }
  },
)

Deno.test(
  'headAsset signs the Planetary Computer URL only, and returns only the identity header values',
  async () => {
    const { f, calls } = fake((url) =>
      url === `${S3}/f/TCI.tif` || url.startsWith(AZ)
        ? new Response(null, {
            status: 200,
            headers: {
              etag: '"abc"',
              'last-modified': 'Wed, 01 Jan 2026 00:00:00 GMT',
              'x-amz-checksum-crc64nvme': 'AAAA',
              'content-type': 'image/tiff',
            },
          })
        : url === SAS
          ? Response.json({ token: 'sig=A', 'msft:expiry': '2999-01-01T00:00:00Z' })
          : new Response(null, { status: 403, headers: { etag: '"error-page"' } }),
    )
    const up = upstream(f).forRequest(new AbortController().signal)

    assertEquals(await up.headAsset(`${S3}/f/TCI.tif`, 'sentinel-2-l2a'), {
      etag: '"abc"',
      last_modified: 'Wed, 01 Jan 2026 00:00:00 GMT',
      crc64nvme: 'AAAA',
    })
    assertEquals(calls[0]!.url, `${S3}/f/TCI.tif`)
    assertEquals(calls[0]!.init.method, 'HEAD')
    assertEquals(calls[0]!.init.headers, { 'x-amz-checksum-mode': 'ENABLED' })

    await up.headAsset(AZ, 'pc:sentinel-2-l2a')
    const azure = calls.find((c) => c.url.startsWith(AZ))!
    assertEquals(azure.url, `${AZ}?sig=A`)
    assertEquals(azure.init.headers, {})

    // the token goes to the Planetary Computer storage host only, whatever the collection says
    await up.headAsset(`${S3}/f/TCI.tif`, 'pc:sentinel-2-l2a')
    const s3 = calls.at(-1)!
    assertEquals(s3.url, `${S3}/f/TCI.tif`)
    assertEquals(s3.init.headers, { 'x-amz-checksum-mode': 'ENABLED' })

    // a refused HEAD is an empty identity, not an error and not a half-filled record
    assertEquals(await up.headAsset(`${S3}/f/other.tif`, 'sentinel-2-l2a'), {})
    everyCallIsGuarded(calls)
  },
)
