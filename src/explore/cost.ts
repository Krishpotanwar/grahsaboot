import { SPAN_YEARS } from './season.ts'

/**
 * What one year costs on the wire, in MB: the catalogue answer and one clear picture of a 2 km square. Measured at Navi Mumbai on
 * 24 October 2026 with a cold cache: 14.1 MB for the 6 years (13.7 MB of picture files in 31 range requests, 0.35 MB of catalogue
 * in 17 searches), and the earlier probe saw 2.0 to 2.4 MB a picture. That is an airport, which compresses well: the probes P16 and
 * P17 (docs/ops/probes.md) put a village near 4 MB a picture, so about 24 MB for six, and the labels say "or more".
 * shortcut: one place measured, the size at other places is unknown, correct it from the F15 probe.
 */
const YEAR_MB = 2.35
/** What loading the whole time-lapse costs at least, in whole MB, as the start screen and the home button say it ("about 14 MB or more"). */
export const LOAD_MB = Math.round(SPAN_YEARS * YEAR_MB)
