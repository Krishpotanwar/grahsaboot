import type { NoteKind } from '../data/investigation.ts'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Sentinel-2B" from an item id such as S2B_43QBB_20180222_0_L2A; plain "Sentinel-2" when the id names no unit. */
const satellite = (itemId: string) => `Sentinel-2${/^S2([ABC])_/.exec(itemId)?.[1] ?? ''}`

const clearView = (clearPct: number) => `${clearPct}% clear view`
const notChecked = 'Not checked'
/** "0.0–2.0 km". A road's sections are numbered 01, 02, ... along the line, on the photos and in the grid. */
const section = (from: number, to: number) => `${(from / 1000).toFixed(1)}–${(to / 1000).toFixed(1)} km`
const sectionNo = (idx: number) => String(idx + 1).padStart(2, '0')

export const flow = {
  stepOf: (n: number) => `Step ${n} of 4`,
  steps: ['Place', 'Outline', 'Dates', 'Review'],
  place: {
    title: 'Where is it?',
    chosen: (name: string) => `Chosen: ${name}`,
    need: 'Search for a place or paste coordinates to continue.',
  },
  outline: {
    title: 'What are we looking at?',
    kindLegend: 'Kind of place',
    site: 'A building or site',
    siteHelp: 'Draw around the whole site.',
    road: 'A road',
    roadHelp: 'Draw along the centre of the road.',
    width: 'Road width (metres)',
    widthHelp: 'Full width including shoulders, 5 to 200. It decides which pixels count as road.',
    drawSite:
      'Click each corner of your site. Click the first corner again, double-click or press Enter to finish.',
    drawRoad: 'Click along the road. Click the last point again, double-click or press Enter to finish.',
    // What 10 m can show of the outline just drawn (src/new/sizeNote.ts): said, never a block.
    sizeShows: (px: string) =>
      `About ${px} pixels at 10 m. Large buildings, roads and land clearing will show at this size.`,
    sizeSmall: (px: string) =>
      `About ${px} pixels at 10 m. Single buildings and narrow lanes will not show; expect "not enough clear view". You can still continue.`,
    roadShows: (widthM: number, px: number) =>
      `${widthM} m wide is about ${px} pixels across at 10 m. A road this wide shows as a line of its own.`,
    roadNarrow: (widthM: number, px: number) =>
      `${widthM} m wide is about ${px} pixel${px === 1 ? '' : 's'} across. At 10 m a narrow road is mixed with what is beside it. You can still continue.`,
    undo: 'Undo last corner',
    finish: 'Finish outline',
    redraw: 'Draw again',
    mapLoading: 'Loading the map',
    mapFailed: 'The map could not load. Enter coordinates instead.',
    byCoords: 'Enter by coordinates instead',
    centre: 'Centre (lat, lon)',
    side: 'Square side (metres)',
    sideHelp: 'From 100 to 3000 metres.',
    useSquare: 'Use this square',
    start: 'Start point (lat, lon)',
    end: 'End point (lat, lon)',
    useLine: 'Use this line',
    badPoint: 'Enter coordinates like 21.1458, 79.0882.',
    summarySite: (km2: number, km: number) => `Area ${km2.toFixed(2)} km² · ${km.toFixed(2)} km across`,
    summaryRoad: (km: number, n: number) =>
      `Length ${km.toFixed(2)} km · ${plural(n, 'section', 'sections')} of up to 2 km`,
    none: 'No outline yet.',
  },
  // The Map | Satellite control of the outline step (src/new/ContextToggle.tsx) and the one line under it. The picture is a
  // 10 m photo to find a place by: every line that shows it says so, and none of them speaks of evidence being checked.
  context: {
    legend: 'Basemap',
    map: 'Map',
    satellite: (mb: number) => `Satellite · about ${mb} MB`,
    off: 'A recent 10 m photo behind the map: roads and large buildings show, houses do not.',
    tooWideOn: 'Zoom in to your place to use the satellite view.',
    tooWideUpdate: 'Zoom in to your place to update the satellite view.',
    stages: {
      searching: 'Searching for recent photos',
      checking: 'Checking for clouds',
      reading: 'Reading the photo',
    },
    still: 'Still working. A slow connection can take up to a minute.',
    on: (date: string) =>
      `Satellite view · Sentinel-2 · ${date} · 10 m · for finding your place, not evidence`,
    age: (days: number) => `${plural(days, 'day', 'days')} old.`,
    // The clearest of the few photos that were checked (at most three), shown although it is not clear. Below half it says so plainly.
    // Short on purpose: this line is in the tallest state of the toolbar, whose reserved room is measured (OutlineStep.tsx).
    cloudy: (clearPct: number) =>
      `${clearPct < 50 ? 'Clouds cover most of it. ' : ''}This is the clearest photo we checked (${clearView(clearPct)}).`,
    none: 'No recent photo covers this area. The map still works.',
    offline: 'Could not reach the photo service. The map still works.',
    failed: 'Could not get a satellite photo. The map still works.',
    update: 'Update for this view',
  },
  // The Look-closer box (src/ui/LookCloser.tsx) and the note that starts from it (src/workbench/NotesPanel.tsx). The two links open
  // Google's own pages: nothing of them is fetched, stored or checked here. A note that starts with `groundNoteStart` leaves its date
  // to the person, because the picture's date is shown in Google's own page and never comes from today's date.
  lookCloser: {
    title: 'Look closer',
    streetView: 'Street View',
    earth: 'Google Earth',
    newTab: '(opens in a new tab)',
    note: "Opens Google's own pages. Not checked by GrahSaboot.",
    groundNote: 'Start a Street View note',
    groundNoteStart: 'Street View, ',
  },
  dates: {
    title: 'Which dates?',
    from: 'From',
    to: 'To',
    help: 'Photos exist from 2017. Shorter ranges load faster.',
    order: 'The start date must be before the end date.',
    early: 'Photos start in 2017. Choose 1 Jan 2017 or later.',
    future: 'The end date cannot be in the future.',
    estimate: (dates: number, mb: number) =>
      `About ${dates} satellite passes. The first view uses about ${mb} MB of data.`,
  },
  review: {
    title: 'Review',
    name: 'Name',
    open: 'Open the workbench',
    privacy:
      'Nothing is uploaded. Photos are read from public Sentinel-2 files, and your outline stays in this browser until you choose to save.',
    kind: { site: 'Site', road: 'Road' },
    range: (from: string, to: string) => `${from} to ${to}`,
    labels: { kind: 'Kind', size: 'Size', dates: 'Dates', data: 'Data' },
  },
  workbench: {
    searching: 'Finding satellite passes',
    searchingMore: 'Finding the other passes.',
    none: 'No Sentinel-2 photos cover this outline in these dates. Try a longer date range.',
    allCloudy:
      'Every photo in these dates is obscured or does not cover your outline. Try other dates. Your notes are kept.',
    searchFailed: 'Could not reach the satellite catalogue. Check your connection and try again.',
    limited: 'Some passes are not shown. Narrow the dates to see them all.',
    catalogueNote: 'The catalogue may omit a few passes.',
    before: 'Before',
    after: 'After',
    pickPair: 'Pick a clear "before" and "after" date on the timeline.',
    notEnoughClear: 'Only one photo in these dates is clear enough to compare. Try a longer date range.',
    view: 'View',
    modes: { swipe: 'Swipe', side: 'Side by side', diff: 'Difference' },
    swipeLabel: 'Reveal the after photo',
    outlineToggle: 'Show outline',
    diffCaption:
      'Brightness difference between these two dates. Season, moisture, shadows and clouds also cause differences. This is not a construction detector.',
    caption: (date: string, clearPct?: number) =>
      `${date} · Sentinel-2 · 10 m${clearPct === undefined ? '' : ` · ${clearPct}% clear view`}`,
    // The caption under a photo is three lines: this one, then the clear-view figure with "Not saved", then the item id.
    satellite,
    captionLine1: (date: string, itemId: string) => `${date} · ${satellite(itemId)} · 10 m`,
    clearView,
    // A row of the photo timeline: the satellite and resolution, then the clear view once the date is checked.
    rowMeta: (itemId: string, clearPct?: number) =>
      `${satellite(itemId)} · 10 m${clearPct === undefined ? '' : ` · ${clearView(clearPct)}`}`,
    // Over the photo (shown in capitals): which photo it is, what the difference view shows, the scale bar, the north arrow.
    chip: (role: string, date: string) => `${role} · ${date}`,
    diffChip: 'Difference',
    scale: (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`),
    north: 'N↑',
    photoAlt: (role: string, date: string, clearPct?: number) =>
      `${role} photo, ${date}, Sentinel-2 true colour${clearPct !== undefined ? ` · ${clearPct}% clear view` : ''}`,
    timeline: 'Timeline',
    photoTimeline: 'Photo timeline',
    timelineLabel: 'Satellite pass',
    passes: (n: number) => plural(n, 'pass', 'passes'),
    pinnedCount: (n: number) => `${n} pinned`,
    // On a row of the list (shown in capitals) and in the legend under the barcode.
    pinned: 'Pinned',
    notCheckedYet: 'Not checked yet',
    useBefore: 'Use as before',
    useAfter: 'Use as after',
    pin: 'Pin to report',
    unpin: 'Unpin',
    pinLimit: 'You can pin up to 24 dates.',
    grid: 'Sections × dates',
    gridHelp: 'How clearly each section is visible on each date.',
    sectionCol: 'Section',
    sectionsLabel: 'Sections',
    section,
    sectionNo,
    // The grid's row header and the detail block under it.
    sectionHead: (idx: number, from: number, to: number) => `${sectionNo(idx)} · ${section(from, to)}`,
    sectionTitle: (idx: number, from: number, to: number) =>
      `Section ${sectionNo(idx)} · ${section(from, to)}`,
    sectionView: (date: string, word: string, seen: boolean) => `${date} · ${seen ? `${word} view` : word}`,
    gapNote: 'Cloudy or missing views are gaps in the evidence, not "no change".',
    shares: {
      valid: 'Visible ground',
      uncertain: 'Uncertain (shadow or unclassified)',
      obstructed: 'Obscured (cloud, shadow, snow)',
      nodata: 'No data',
    },
    cell: (section: string, date: string, word: string) => `${section}, ${date}: ${word}`,
    showMap: 'Show map',
    hideMap: 'Hide map',
    report: 'Report',
    notSaved: 'Not saved',
    // The server's check of a photo, in its caption: only where a record for this item and these pixels exists.
    verifiedBadge: (date: string) => `Verified · ${date}`,
    mismatchBadge: 'Did not match the source',
    meta: {
      site: (km2: number, dates: string) => `Site · ${km2.toFixed(2)} km² · ${dates}`,
      road: (km: number, widthM: number, dates: string) =>
        `Road · ${km.toFixed(1)} km · ${widthM} m wide · ${dates}`,
      pair: (before: string, after: string) => `${before} ↔ ${after}`,
    },
    loadingPhoto: 'Loading photo',
    checkFailed: 'This photo could not be checked.',
    // Where the sentence does not fit (a grid cell, a section row): the sentence stays in the selected row.
    checkFailedShort: 'Check failed',
    badOutline: 'This outline can no longer be read. Draw it again from the start.',
    thumbFailed: 'Preview unavailable.',
    notFound:
      'This investigation is not in this browser. It may have been deleted, or saved on another device.',
    disclaimer: '"No clear visible change" does not prove that nothing happened. Roofs hide interiors.',
    errors: {
      BAD_ORDER: 'The before date must be earlier than the after date.',
      TOO_MANY_PINS: 'You can pin up to 24 dates.',
      NOTE_EMPTY: 'Write what you see before adding the note.',
      NOTE_TOO_LONG: 'Notes can be up to 2000 characters.',
      TOO_MANY_NOTES: 'An investigation can hold up to 200 notes.',
      CLAIM_TOO_LONG: 'The claim is too long.',
      STORE_FAILED: "Could not load this investigation from your browser's storage.",
      SAVE_FAILED: 'Could not save your changes. Try again.',
    } as Record<string, string>,
  },
  notes: {
    title: 'Notes',
    what: 'What do you see?',
    kindLegend: 'Your reading',
    kinds: {
      change: 'Visible change',
      no_clear_change: 'No clear visible change',
      unsure: 'Not sure',
    } satisfies Record<NoteKind, string>,
    yourNote: 'Your note',
    forDate: 'Photo date',
    anyDate: 'No specific date',
    forSection: 'Section',
    anySection: 'Whole road',
    add: 'Add note',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    deleted: 'Note deleted.',
    undo: 'Undo',
    count: (n: number) => `${n} / 2000`,
    none: 'No notes yet.',
  },
  claim: {
    title: 'Claim (optional)',
    help: 'A statement you want to compare with the photos, for example "Road surface laid by June 2025". GrahSaboot shows it next to the evidence and does not judge it.',
    text: 'Claim',
    date: 'Claimed date',
    criterion: 'What would be visible from above if it were true?',
    save: 'Save claim',
    remove: 'Remove claim',
  },
  // The "Sharper" switch of the viewer (src/workbench/EvidenceViewer.tsx): a viewing aid that shows the same pixels with a little
  // more contrast and a light unsharp mask. `aid` is the plan's wording, which the switch says to a screen reader; `note` is on
  // show under the photos while it is on. Nothing of it reaches the report.
  sharper: {
    label: 'Sharper',
    aid: 'viewing aid: the same pixels, shown more clearly',
    note: 'Sharper is a viewing aid: the same pixels, shown more clearly.',
  },
  report: {
    title: 'Evidence report',
    preparing: 'Preparing the report',
    needPair: 'Choose a before and an after date in the workbench first. The report is built from them.',
    pairMissing:
      'One of the two compared photos could not be loaded. Go back to the workbench and pick the pair again.',
    preparedBy: 'Prepared by (optional)',
    preparedByLabel: 'Prepared by',
    download: 'Download HTML',
    provenance: 'Download provenance JSON',
    print: 'Print or save as PDF',
    back: 'Back to the workbench',
    sections: {
      looked: 'What was looked at',
      evidence: 'Evidence',
      timeline: 'Pinned dates',
      grid: 'Sections × dates',
      notes: 'Notes',
      claim: 'Claim',
      gaps: 'Gaps and limits',
      provenance: 'Provenance',
      attribution: 'Attribution',
    },
    generated: 'Generated',
    unverified:
      'Not verified. This investigation is not saved. The pictures were derived in a browser from the public Sentinel-2 files listed in the provenance.',
    // A saved investigation: what the server's check of the pinned photos found. A difference is a finding, never "not yet".
    verified: (date: string) =>
      `Verified ${date}. The GrahSaboot server re-read every pinned photo from its public source file and got the same pixels.`,
    partlyVerified:
      'Saved, but not every pinned date is verified. The table shows each date. Saving again checks the dates that can still be checked.',
    mismatch:
      'Saved, but the server check found a difference. For at least one pinned photo, the GrahSaboot server read different pixels from the public source file than this browser did. The table marks each date.',
    check: { verified: 'Verified', mismatch: 'Did not match the source', none: notChecked },
    // The strip under the title and the headers of the pinned-dates table.
    labels: {
      area: 'Area',
      length: 'Length',
      dates: 'Dates',
      source: 'Source',
      resolution: 'Resolution',
      date: 'Date',
      view: 'View',
      clear: 'Clear',
      serverCheck: 'Server check',
      sha256: 'SHA-256 (source pixels)',
    },
    values: {
      source: 'Sentinel-2 L2A',
      resolution: '10 m',
      notChecked,
      none: '—',
      area: (km2: number) => `${km2.toFixed(2)} km²`,
      length: (km: number) => `${km.toFixed(2)} km`,
      roadWidth: (m: number) => `${m} m wide`,
    },
    json: 'JSON',
    noNotes: 'No notes.',
    noClaim: 'No claim was entered.',
    obscured: (n: number, total: number) => `${n} of ${total} pinned dates are obscured or not covered.`,
    unchecked: (n: number) => `${plural(n, 'pinned date', 'pinned dates')} could not be checked.`,
    nativeNote: 'Source pixels exactly as hashed (native 10 m grid, before reprojection).',
    nativeAlt: 'source pixels, native 10 m grid',
    // The "What we measured" block (src/report/measured.ts): sentences from numbers only, in measurement words. Every number and the
    // rule's tag are passed in from the result, so a retuned rule prints its own. The report states what the rule did and never
    // judges the person's claim (`claim.help` above): no line of the block says a verdict, nor the honest line of the time-lapse.
    measured: {
      title: 'What we measured',
      lead: 'Computed from the pixels of the two pinned pictures by a fixed rule, not seen by a person. The rule, the grid and its settings are recorded below, so it can be run again from the hashed source pixels.',
      // One per picture: "Before, 22 Feb 2018: 92% clear view, sun 41° above the horizon." A figure the catalogue or the check has not
      // given is left out of the sentence, never printed as zero.
      picture: (role: string, date: string, clearPct: number | null, sunDeg: number | null) => {
        const facts = [
          clearPct === null ? '' : clearView(clearPct),
          sunDeg === null ? '' : `sun ${sunDeg}° above the horizon`,
        ].filter(Boolean)
        return `${role}, ${date}${facts.length ? `: ${facts.join(', ')}` : ''}.`
      },
      // What the rule found, one of these five, in the order the rule looks at them.
      notEnoughGround: 'Not enough clear ground in both pictures to compare.',
      outlineTooSmall: (rule: string, ha: string, m: string) =>
        `This outline holds no area of ${ha} ha that is ${m} m across, so the change rule (${rule}) cannot report a changed patch inside it.`,
      mostDiffers: (rule: string) =>
        `Most of the clear area differs between these two pictures, so the change rule (${rule}) cannot separate a change from a difference in overall brightness or colour. No changed area is stated. Compare the two pictures by eye.`,
      noPatch: (rule: string, ha: string, m: string, nativeM: string) =>
        `The change rule (${rule}) found no changed patch of at least ${ha} ha and ${m} m across between these two pictures. At ${nativeM} m a change this small cannot be told from seasons or noise.`,
      figure: (f: {
        from: string
        to: string
        rule: string
        patches: number
        ha: string
        m: string
        area: string
        pixels: string
      }) =>
        `Between ${f.from} and ${f.to}, the change rule (${f.rule}) found ${plural(f.patches, 'changed patch', 'changed patches')} of at least ${f.ha} ha and ${f.m} m across, ${f.area} ha in all. It rests on ${f.pixels} pixels that are clear in both pictures.`,
      // The one caution string: it ends the figure here, and ends the line under the time-lapse. A patch count never prints without it.
      caution: 'It cannot tell a building from a crop or a season: compare the pictures by eye.',
      differentSeasons: 'These dates are in different seasons; seasonal change is included.',
      // Beside the number: what it takes to run the rule again.
      gridSize: (width: number, height: number) => `${width} × ${height} pixels`,
      record: (rule: string, grid: string, settings: string) =>
        `Rule ${rule}, grid ${grid}. Settings: ${settings}.`,
    },
  },
}
