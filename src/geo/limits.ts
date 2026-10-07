export const LIMITS = {
  site: { minAreaKm2: 0.001, maxAreaKm2: 9, maxExtentKm: 4.25, maxVertices: 200 },
  road: {
    minLengthKm: 0.2,
    maxLengthKm: 10,
    minWidthM: 5,
    maxWidthM: 200,
    defaultWidthM: 30,
    sectionM: 2000,
    maxVertices: 200,
  },
  dates: { earliest: '2017-01-01', defaultMonths: 24 },
  pinnedDates: 24,
  notes: { maxChars: 2000, maxPerInvestigation: 200 },
  investigationsPerUser: 50,
  verifiedFramesPerDay: 600,
  // STAC pages (100 items each) walked per 12-month window. The old whole-search cap of 10 pages was a guess: the P9 probe
  // (docs/ops/probes.md, 2026-10-07) found ~3.6 items per date, so 1,000 items were only ~280 dates and the oldest-first sort
  // dropped the newest photos. A year is 180 items (88 dates) in 2025, so 5 pages (500 items) per window has room to spare.
  stacMaxPagesPerWindow: 5,
} as const
