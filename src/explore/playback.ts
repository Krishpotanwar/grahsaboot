// What the player decides without a screen: how fast it plays, when it can, and what a key or a step does.

/** One frame every 1.2 s: a pace to look at, and never faster than once every 700 ms (WCAG 2.3.1 and 2.2.2). */
export const PACE_MS = 1200
/** A time-lapse needs at least this many frames to play; fewer stay a still strip. */
export const MIN_PLAY = 3

/** The loop is offered with enough frames, and never to a person who asked for less motion: they step instead. */
export const canPlay = (frames: number, reducedMotion: boolean): boolean =>
  frames >= MIN_PLAY && !reducedMotion

export type Step = 'next' | 'prev' | 'first' | 'last'
export type Action = Step | 'toggle'

/** The index a step leads to in a list of `n`: next and previous wrap round at the ends, first and last jump. */
export function stepIndex(i: number, n: number, to: Step): number {
  if (n <= 1) return 0
  switch (to) {
    case 'next':
      return (i + 1) % n
    case 'prev':
      return (i - 1 + n) % n
    case 'first':
      return 0
    case 'last':
      return n - 1
  }
}

/** What a key does on the picture: Space plays or pauses, the arrows step, Home and End jump. Any other key is not ours. */
export function keyAction(key: string): Action | null {
  switch (key) {
    case ' ':
      return 'toggle'
    case 'ArrowRight':
    case 'ArrowDown':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
      return 'prev'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    default:
      return null
  }
}
