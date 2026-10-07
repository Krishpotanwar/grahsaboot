export function moveFocus(
  pos: { r: number; c: number },
  key: string,
  rows: number,
  cols: number,
): { r: number; c: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v))
  switch (key) {
    case 'ArrowRight':
      return { r: pos.r, c: clamp(pos.c + 1, cols) }
    case 'ArrowLeft':
      return { r: pos.r, c: clamp(pos.c - 1, cols) }
    case 'ArrowDown':
      return { r: clamp(pos.r + 1, rows), c: pos.c }
    case 'ArrowUp':
      return { r: clamp(pos.r - 1, rows), c: pos.c }
    case 'Home':
      return { r: pos.r, c: 0 }
    case 'End':
      return { r: pos.r, c: cols - 1 }
    default:
      return pos
  }
}

/**
 * `moveFocus` for a position kept as a row and a date. Columns come and go (pinning adds one, unpinning removes one),
 * so a column number would silently point at another date; the date's column is looked up each time instead.
 * A date that is no longer a column starts from the first one. Returns `pos` itself when `key` is not a navigation key.
 */
export function moveFocusByDate(
  pos: { r: number; date: string },
  key: string,
  rows: number,
  dates: string[],
): { r: number; date: string } {
  if (dates.length === 0) return pos
  const from = { r: pos.r, c: Math.max(0, dates.indexOf(pos.date)) }
  const next = moveFocus(from, key, rows, dates.length)
  return next === from ? pos : { r: next.r, date: dates[next.c]! }
}
