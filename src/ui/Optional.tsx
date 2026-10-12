import { Component, type ReactNode } from 'react'

/**
 * Around a control the page can do without (the accounts controls): when its code cannot be loaded, or it throws while
 * rendering, the page goes on without it (or with `fallback`) instead of going blank. The app has no other error boundary.
 */
export class Optional extends Component<{ children?: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
