import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { FIXTURE_DATES, fixtureItem, itemId, makeScl, makeTci } from './scene.ts'

const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const TLE = readFileSync(new URL('./tle.json', import.meta.url))
const style = (bg: string) =>
  JSON.stringify({
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': bg } }],
  })

const files = new Map<string, Buffer>()
for (const d of FIXTURE_DATES) {
  files.set(`/cog/${d.date}/TCI.tif`, Buffer.from(makeTci(d.roof)))
  files.set(`/cog/${d.date}/SCL.tif`, Buffer.from(makeScl(d.scl)))
}

const CORS = { 'access-control-allow-origin': '*' }

function send(
  res: ServerResponse,
  status: number,
  body: Buffer | string,
  type: string,
  extra: Record<string, string> = {},
) {
  res.writeHead(status, {
    ...CORS,
    'content-type': type,
    'content-length': String(Buffer.byteLength(body)),
    ...extra,
  })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = []
  for await (const c of req) parts.push(c as Buffer)
  return Buffer.concat(parts).toString('utf8')
}

function handler(base: () => string) {
  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...CORS,
        'access-control-allow-methods': 'GET,POST,HEAD,OPTIONS',
        'access-control-allow-headers': 'content-type,range',
      })
      return res.end()
    }
    if (url.pathname === '/stac/search' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { datetime?: string }
      const [a = '', b = a] = (body.datetime ?? '').split('/') // a single instant is both ends
      const from = a === '' || a === '..' ? '0000' : a
      const to = b === '' || b === '..' ? '9999' : b
      const feats = FIXTURE_DATES.filter(
        (d) => `${d.date}T05:30:00Z` >= from && `${d.date}T05:30:00Z` <= to,
      ).map((d) => fixtureItem(base(), d))
      return send(
        res,
        200,
        JSON.stringify({
          type: 'FeatureCollection',
          features: feats,
          links: [],
          context: { returned: feats.length },
        }),
        'application/geo+json',
      )
    }
    const itemMatch = url.pathname.match(/^\/stac\/collections\/sentinel-2-l2a\/items\/(.+)$/)
    if (itemMatch) {
      const d = FIXTURE_DATES.find((x) => itemId(x.date) === itemMatch[1])
      return d
        ? send(res, 200, JSON.stringify(fixtureItem(base(), d)), 'application/geo+json')
        : send(res, 404, '{}', 'application/json')
    }
    const file = files.get(url.pathname)
    if (file) {
      const common = {
        'accept-ranges': 'bytes',
        etag: `"${url.pathname}"`,
        'last-modified': 'Sat, 04 Oct 2026 00:00:00 GMT',
      }
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          ...CORS,
          ...common,
          'content-type': 'image/tiff',
          'content-length': String(file.length),
        })
        return res.end()
      }
      if (range) {
        const start = Number(range[1])
        if (start >= file.length)
          return send(res, 416, '', 'text/plain', { 'content-range': `bytes */${file.length}` })
        const end = Math.min(file.length - 1, range[2] ? Number(range[2]) : file.length - 1)
        return send(res, 206, file.subarray(start, end + 1), 'image/tiff', {
          ...common,
          'content-range': `bytes ${start}-${end}/${file.length}`,
        })
      }
      return send(res, 200, file, 'image/tiff', common)
    }
    if (url.pathname === '/tle') return send(res, 200, TLE, 'application/json')
    if (url.pathname === '/nominatim/search') {
      const hit = /nagpur/i.test(url.searchParams.get('q') ?? '')
        ? [
            {
              place_id: 1,
              display_name: 'Nagpur, Maharashtra, India',
              lat: '21.1458',
              lon: '79.0882',
              boundingbox: ['20.9', '21.3', '78.9', '79.3'],
              type: 'city',
            },
          ]
        : []
      return send(res, 200, JSON.stringify(hit), 'application/json')
    }
    if (url.pathname === '/style/dark.json') return send(res, 200, style('#09090B'), 'application/json')
    if (url.pathname === '/style/light.json') return send(res, 200, style('#FFFFFF'), 'application/json')
    if (url.pathname.startsWith('/tiles/')) return send(res, 200, BLANK_PNG, 'image/png')
    return send(res, 404, 'not found', 'text/plain')
  }
  // A bad request must answer 400, never take the whole fixture server down.
  return (req: IncomingMessage, res: ServerResponse) =>
    route(req, res).catch((e) => send(res, 400, String(e), 'text/plain'))
}

export function startFixtureServer(port = 0): Promise<{ url: string; close(): Promise<void> }> {
  let url = ''
  const server = createServer(handler(() => url))
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}`
      resolve({ url, close: () => new Promise<void>((r) => server.close(() => r())) })
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startFixtureServer(Number(process.env.PORT ?? 4300)).then((s) => console.log(`fixture server on ${s.url}`))
}
