export const LIMITS = {
  site: { maxAreaKm2: 9, maxExtentKm: 4.25, maxVertices: 200 },
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
  stacMaxPages: 10,
} as const
