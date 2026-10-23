import { copy } from './copy.ts'

// Not copy-flow.ts: its words are a 50 KB chunk, and this page is the one that is careful with a visitor's data.
const clear = (pct: number) => `${pct}% clear`
/** "Sentinel-2B" from an id such as S2B_43QBB_20180222_0_L2A (or a Planetary Computer id); plain "Sentinel-2" when it names no unit. */
const satellite = (id: string) => `Sentinel-2${/^S2([ABC])_/.exec(id)?.[1] ?? ''}`

// The words of the time-lapse screen ("Watch it change"): plain, no verdict word and no dash used as punctuation
// (src/ui/copy-explore.test.ts). The page title is `copy.titles.explore`, beside the other titles, because the shell that
// shows it is in the first page's code and this file is not.
export const explore = {
  title: copy.titles.explore,
  intro:
    'One satellite picture a year for the last six years, taken in the same season, played one after another.',
  squareAround: (name: string) => `A square 2 km across, around ${name}.`,
  /** The home screen's button: it starts the load at once, so it says what the load costs, as the satellite switch does. */
  watch: (mb: number) => `Watch it change · about ${mb} MB`,
  /** The start screen's button, for a person who arrived from a link, a reload or a new tab. */
  load: (mb: number) => `Load the pictures · about ${mb} MB`,
  waitsForTap: 'Nothing is downloaded until you tap Load.',
  /** The quiet link under the home screen's buttons. */
  exampleLink: 'Try the time-lapse: Navi Mumbai airport',

  bad: 'This address does not name a place that can be shown.',
  home: 'Go to the home page',

  searching: 'Looking for the clearest time of year',
  progress: (done: number, total: number) => `${done} of ${total} years loaded`,
  /** Spoken (polite) when the load starts and when it ends: never for each picture. */
  loading: 'Loading the pictures.',
  loaded: (n: number, total: number) => `${n} of ${total} pictures loaded.`,
  slotLoading: 'Loading',
  gap: {
    'no-clear-picture': 'No clear picture',
    'timed-out': 'Could not be loaded in time',
    offline: 'Offline',
  },
  failed: {
    NO_SCENES: 'No satellite pictures cover this place.',
    ALL_CLOUDY: 'The recent pictures of this place are all too cloudy to use.',
    OFFLINE: 'Could not reach the picture service. Check your connection.',
    FAILED: 'The pictures could not be loaded.',
  },
  tooFew: 'Not enough clear pictures from the same season to play a time-lapse here.',

  stripLabel: 'Pictures by year',
  stageLabel: 'Time-lapse picture',
  keysHint: 'Space plays or pauses. Arrow keys step. Home and End jump to the first and last picture.',
  keysHintStill: 'Arrow keys step. Home and End jump to the first and last picture.',
  play: 'Play',
  pause: 'Pause',
  previous: 'Previous picture',
  next: 'Next picture',
  slider: 'Choose a picture by year',
  pictureLabel: (name: string, date: string) => `Satellite picture of ${name}, ${date}`,
  caption: (date: string, sceneId: string, clearPct: number) =>
    `${date} · ${satellite(sceneId)} · 10 m · ${clear(clearPct)}`,
  age: (days: number) => `${days} ${days === 1 ? 'day' : 'days'} old.`,
  clear,
  /** Spoken (polite) on a step, a pause and a load, and not for each frame of a loop that is playing. */
  frameStatus: (i: number, n: number, date: string, clearPct: number) =>
    `Frame ${i} of ${n}, ${date}, ${clear(clearPct)}`,
  paused: (frame: string) => `Paused. ${frame}`,

  notEvidence:
    'These pictures are for looking, not evidence. A report fingerprints the exact pixels it uses; these are not saved, hashed or put in a report.',
  credit: (years: number[]) =>
    `${copy.attribution.sentinelYears(years)}. Scenes found through the Earth Search catalogue, with Planetary Computer as the fallback.`,
  handOver: 'Open this place as an investigation',
} as const
