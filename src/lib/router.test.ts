import { describe, expect, it } from 'vitest'
import { matchRoute } from './router.tsx'

describe('matchRoute', () => {
  it.each([
    ['/', { name: 'globe' }],
    ['/new', { name: 'new' }],
    ['/new/', { name: 'new' }],
    ['/privacy', { name: 'privacy' }],
    ['/limits', { name: 'limits' }],
    ['/dev/kit', { name: 'kit' }],
    [
      '/i/local-5f2b9c1e-1111-4222-8333-444455556666',
      { name: 'investigation', id: 'local-5f2b9c1e-1111-4222-8333-444455556666' },
    ],
    [
      '/i/5f2b9c1e-1111-4222-8333-444455556666/report',
      { name: 'report', id: '5f2b9c1e-1111-4222-8333-444455556666' },
    ],
    ['/i/../etc', { name: 'notFound' }],
    ['/i/' + 'a'.repeat(65), { name: 'notFound' }],
    ['/nope', { name: 'notFound' }],
  ])('%s', (path, route) => {
    expect(matchRoute(path)).toEqual(route)
  })
})
