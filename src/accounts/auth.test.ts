import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './auth.ts'

// signInWithGoogle puts `${location.origin}${returnTo}` in redirect_to: anything that is not a path would change the host.
describe('safeReturnTo', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeReturnTo('/i/2a3b?save=1')).toBe('/i/2a3b?save=1')
    expect(safeReturnTo('/')).toBe('/')
  })
  it('sends anything else home: a host cannot be smuggled in after the origin', () => {
    for (const bad of [
      '@evil.example',
      '.evil.example',
      ':8080@evil.example',
      'https://evil.example',
      '//evil.example',
      '',
      'i/abc',
    ])
      expect(safeReturnTo(bad), bad).toBe('/')
  })
})
