import { SPAN_YEARS } from './season.ts'

/**
 * What one year costs on the wire, in MB: the catalogue answer and one clear picture of a 2 km square. Measured at Navi Mumbai on
 * 24 October 2026 with a cold cache: 14.1 MB for the 6 years (13.7 MB of picture files in 31 range requests, 0.35 MB of catalogue
 * in 17 searches), and the earlier probe saw 2.0 to 2.4 MB a picture. Like the satellite view's size, it is not the lowest figure:
 * the label asks for metered data. shortcut: one place measured, the size at other places is unknown, correct it from the F15 probe.
 */
const YEAR_MB = 2.35
/** What loading the whole time-lapse costs, in whole MB, as the start screen and the home button say it ("about 14 MB"). */
export const LOAD_MB = Math.round(SPAN_YEARS * YEAR_MB)
