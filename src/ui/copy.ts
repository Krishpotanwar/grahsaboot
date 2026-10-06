import type { Issue } from '../geo/aoi.ts'

const km = (v?: number) => (v ?? 0).toFixed(1)

export const copy = {
  app: {
    name: 'GrahSaboot',
    tagline: 'Satellite proof for any place.',
    promise: 'See what changed at a place, with dated satellite photos.',
  },
  common: {
    close: 'Close',
    skip: 'Skip to content',
    loading: 'Loading',
    retry: 'Try again',
    back: 'Back',
    next: 'Continue',
    cancel: 'Cancel',
    details: 'Details',
  },
  nav: {
    home: 'GrahSaboot home',
    newInvestigation: 'Start an investigation',
    startHere: 'Start an investigation here',
    example: 'Try a worked example: Nagpur',
    privacy: 'Privacy',
    limits: 'Limits',
    themeToggle: 'Switch theme',
  },
  footer: {
    disclaimer:
      'Satellite photos show what is visible from above. They are not proof of contracts, payments or quality.',
  },
  notFound: { title: 'Page not found', body: 'That address does not exist.', home: 'Go to the globe' },
  map: {
    label: 'Map. Use the search box to move it.',
    staticNotice:
      'This device cannot show the 3D map. Search, outlines by coordinates, photos and reports still work.',
    lite: 'Lite mode',
    switchFull: 'Switch to full',
  },
  search: {
    label: 'Search a place or paste coordinates',
    placeholder: 'Nagpur, or 21.1458, 79.0882',
    submit: 'Search',
    results: 'Places found',
    none: 'No place found. Try a city name, or coordinates like 21.1458, 79.0882.',
    failed: 'Search is unavailable right now. Paste coordinates instead.',
    swapped: (lat: number, lon: number) => `These look reversed. Did you mean ${lon}, ${lat}?`,
    useSwapped: 'Use the reversed coordinates',
    useAsTyped: 'Use as typed',
    coordsResult: (lat: number, lon: number) => `Point at ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    attribution: 'Search by OpenStreetMap Nominatim',
  },
  sats: {
    title: 'Live satellites',
    live: 'Live',
    unavailable: 'Satellite positions are unavailable right now. Everything else works.',
    loading: 'Finding satellites',
    nextLook: (place: string) => `Next look at ${place}`,
    estimated: 'Estimated from orbit data. A pass is not a usable photo; clouds can block it.',
    noPass: 'No pass in the next 10 days',
    position: (lat: number, lon: number) =>
      `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`,
    status: {
      40697: 'Extended operations',
      42063: 'Operational',
      60989: 'Operational',
      39084: 'Operational',
      49260: 'Operational',
    } as Record<number, string>,
  },
  quality: {
    CLEAR: { word: 'Clear', help: 'At least 95% of your outline is visible in this photo.' },
    PARTIAL: { word: 'Partly clear', help: 'Clouds, haze or shadows hide part of your outline.' },
    OBSCURED: { word: 'Obscured', help: 'Clouds hide almost all of your outline.' },
    NOT_COVERED: { word: 'Not covered', help: 'This photo does not cover your outline.' },
  },
  attribution: {
    osm: '© OpenStreetMap contributors',
    openfreemap: 'OpenFreeMap',
    gibs: 'NASA GIBS Blue Marble',
    sentinel: (year: number) => `Contains modified Copernicus Sentinel data ${year}`,
  },
  pages: {
    limits: {
      title: 'Limits',
      intro: 'GrahSaboot shows dated 10 metre satellite photos. Here is what that can and cannot tell you.',
      items: [
        'Sites can be up to 9 km² and 4.25 km across. Roads can be up to 10 km long and 5 to 200 metres wide; they are checked in 2 km sections.',
        'Photos go back to 2017. Sentinel-2 passes every few days, but clouds often block the view, especially in the monsoon.',
        'At 10 metres per pixel, large buildings, roads and land clearing are visible. Small or narrow features may not be.',
        '"No clear visible change" does not prove that nothing happened. Roofs hide interiors, and work can happen between photos.',
        'Photos cannot show quality, payments, contracts or who did the work.',
        'The next-pass time is an estimate from orbit data. A pass is not a guaranteed usable photo.',
        'Verified means the pictures match the public source file at the time of checking. It does not prove any claim about a project.',
        'Signed-in accounts can save 50 investigations and verify 600 frames per day.',
      ],
    },
    privacy: {
      title: 'Privacy',
      intro: 'Plain-language summary of what GrahSaboot does with your data.',
      items: [
        'You can explore and investigate without an account. Unsaved work stays in this browser.',
        'Place searches are sent to OpenStreetMap Nominatim.',
        'Satellite photos are read directly from public Sentinel-2 files on Amazon Web Services. Those requests reveal an approximate area, never your name or email.',
        'Satellite positions come through our server from CelesTrak; nothing about you is sent.',
        'If you sign in to save, we store your Google name and email, your outlines, dates, notes and claims, and a log of actions with IDs only.',
        'You can delete any investigation, or your whole account, at any time. Saved data is removed 12 months after your last sign-in.',
      ],
    },
  },
} as const

export function issueMessage(i: Issue): string {
  switch (i.code) {
    case 'not_closed':
      return 'Close the outline by clicking its first point again.'
    case 'too_few_points':
      return 'Add at least three corners for a site, or two points for a road.'
    case 'too_many_vertices':
      return `This outline has ${i.value} points. The limit is ${i.limit}.`
    case 'self_intersects':
      return 'The outline crosses itself. Redraw it as a simple shape.'
    case 'too_large':
      return `This outline covers ${km(i.value)} km². The limit is ${i.limit} km².`
    case 'too_small':
      return 'This outline is too small to see from orbit. Draw an area of at least about 1000 m².'
    case 'too_wide':
      return `This outline is ${km(i.value)} km across. The limit is ${i.limit} km.`
    case 'too_short':
      return `This road is ${km(i.value)} km long. It must be at least ${i.limit} km.`
    case 'too_long':
      return `This road is ${km(i.value)} km long. The limit is ${i.limit} km.`
    case 'bad_width':
      return 'Road width must be a whole number from 5 to 200 metres.'
    case 'out_of_range':
      return 'Check the coordinates: the outline must be one shape that does not cross the 180° line.'
  }
}
