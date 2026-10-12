import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Optional } from './Optional.tsx'

describe('Optional', () => {
  it('shows what it holds until something under it throws, then its fallback, or nothing', () => {
    expect(renderToString(createElement(Optional, null, createElement('b', null, 'kid')))).toBe('<b>kid</b>')
    // React hands a caught render error to getDerivedStateFromError; the next render is the fallback
    const o = new Optional({ children: 'kid', fallback: 'plain' })
    expect(o.render()).toBe('kid')
    o.state = Optional.getDerivedStateFromError()
    expect(o.render()).toBe('plain')
    const bare = new Optional({ children: 'kid' })
    bare.state = Optional.getDerivedStateFromError()
    expect(bare.render()).toBeNull()
  })
})
