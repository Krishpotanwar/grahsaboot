// The checks for text that is not ours (an address, a saved link, a stored record): `new Date('2025-02-30')` is 2 March,
// `Number('0x7d0')` is 2000 and `Number('')` is 0, so neither can be trusted to refuse what it should.

const YMD = /^\d{4}-\d{2}-\d{2}$/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

/**
 * The day `YYYY-MM-DD` names, as midnight UTC, or undefined when the text is not a real calendar day (`2025-02-30`, `2025-13-01`,
 * `2025-12-30junk`). The pattern of `nowFromUrl`: the text must come back unchanged from a `Date`. It says nothing of a range; for
 * one, compare the text, which is exact once the day is real.
 */
export function realDate(s: string | null | undefined): Date | undefined {
  const d = s && YMD.test(s) ? new Date(s) : null
  return d && !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s ? d : undefined
}

/**
 * A number written with digits only: an optional minus sign, digits, and a point with digits after it. Undefined for anything
 * `Number` would still read (hex, an exponent, spaces, a plus sign, an empty text) and for a number too long to be finite.
 */
export function plainNumber(s: string | null | undefined): number | undefined {
  const n = s && PLAIN_NUMBER.test(s) ? Number(s) : NaN
  return Number.isFinite(n) ? n : undefined
}
