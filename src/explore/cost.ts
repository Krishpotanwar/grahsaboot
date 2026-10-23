import { SPAN_YEARS } from './season.ts'

/**
 * One clear picture of a 2 km square, in MB: 2.0 to 2.4 measured at Navi Mumbai (the F15 probe replaces this); each check is about
 * 21 KB, so a year costs one picture. shortcut: one place measured, the size at other places is unknown, correct it from the probe.
 */
const PICTURE_MB = 2.2
/** What loading the whole time-lapse costs, in whole MB, as the start screen and the home button say it ("about 13 MB"). */
export const LOAD_MB = Math.round(SPAN_YEARS * PICTURE_MB)
