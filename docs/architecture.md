# How GrahSaboot works

The README is the short version; this page holds the detail. It was moved here from the README on 24 October 2026 without changes, except for links and the dated figures noted where they appear.

## How it works

The story in five steps:

1. **You choose a place.** You search by name or type coordinates.
2. **You draw an outline.** It can be a site (an area) or a road (a line with a width).
3. **You choose dates.** The site looks for every satellite photo that covers your outline in that time.
4. **The site checks each photo.** It reads only the small piece of each photo file that covers your outline. It scores how clear the view is, and it makes a fingerprint of those exact dots.
5. **You compare and write the report.** You pin the dates that matter, add notes and a claim, and save the report.

## Architecture

This section shows the same system from five angles. Each diagram answers one question.

| Question                                                  | Diagram                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Who talks to whom?                                        | [1. The big picture](#1-the-big-picture)                                                             |
| How is the code organised?                                | [2. Inside the app: the layers](#2-inside-the-app-the-layers)                                        |
| Where do the satellite positions come from?               | [3. Satellite positions and the Cloudflare Worker](#3-satellite-positions-and-the-cloudflare-worker) |
| What happens between typing a place and getting a report? | [4. From a place to a report](#4-from-a-place-to-a-report)                                           |
| Why can someone else trust a report?                      | [5. How a photo becomes evidence](#5-how-a-photo-becomes-evidence)                                   |

Two more diagrams sit next to the text they explain: [which version of the site your device gets](#speed-and-different-devices) and [how a change goes live](development.md#putting-it-online-deploy).

The diagrams are drawn with Mermaid. Each one is shown as a picture, with its Mermaid source folded under it. **Colour key:** blue is you and the screens, green is our code that runs in your browser, yellow is our server on Cloudflare, grey is a public service we do not run, and orange with a dashed edge is built but switched off.

### 1. The big picture

![Diagram: you use the app in your browser, where it runs a satellite worker and a photo worker. The app gets the site and orbit data from our Worker on Cloudflare, which fetches orbit data from CelesTrak. Your browser talks straight to public services for photos (Earth Search, Planetary Computer, Sentinel-2 files on AWS and Azure) and for maps and place search (Nominatim, NASA GIBS, OpenFreeMap, AWS Terrain). Supabase accounts are built but switched off.](diagrams/big-picture.png)

_Who talks to whom: your browser, our one Worker on Cloudflare, and the public services._

<details><summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart LR
  you(["<b>You</b><br/>any web browser"]):::you

  subgraph browser["Runs in your browser"]
    direction TB
    app["<b>The app</b><br/>globe, outline,<br/>workbench, report"]:::mine
    w1["Satellite worker<br/>orbit maths"]:::mine
    w2["Photo worker<br/>reads and fingerprints<br/>photos"]:::mine
  end

  subgraph cf["Runs on Cloudflare"]
    direction TB
    cw["<b>Worker</b> named grahsaboot<br/>serves the site<br/>and /api/tle"]:::edge
  end

  subgraph ext["Public services we do not run"]
    direction TB
    photos["<b>Photos</b><br/>catalogues: Earth Search,<br/>Planetary Computer<br/>files: Sentinel-2 on AWS, Azure"]:::ext
    maps["<b>Maps and places</b><br/>Nominatim, NASA GIBS,<br/>OpenFreeMap, AWS Terrain"]:::ext
    orbits["<b>Orbit data</b><br/>CelesTrak"]:::ext
    supa["<b>Supabase accounts</b><br/>built, switched off"]:::off
  end

  you --> app
  app --> w1
  app --> w2
  app -->|"site and<br/>orbit data"| cw
  w2 -->|"find and read<br/>photos"| photos
  app -->|"maps and<br/>place search"| maps
  cw -->|"orbit data"| orbits
  app -.-> supa

  classDef you fill:#dbeafe,stroke:#1d4ed8,color:#0f172a
  classDef mine fill:#dcfce7,stroke:#15803d,color:#0f172a
  classDef edge fill:#fef9c3,stroke:#a16207,color:#0f172a
  classDef ext fill:#f1f5f9,stroke:#64748b,color:#0f172a
  classDef off fill:#ffedd5,stroke:#c2410c,color:#0f172a,stroke-dasharray:5 4
  style browser fill:transparent,stroke:#94a3b8
  style cf fill:transparent,stroke:#94a3b8
  style ext fill:transparent,stroke:#94a3b8
```

</details>

Only one thing runs on our side: a small Cloudflare **Worker**. It hands out the website and one route, `/api/tle`, that serves satellite orbit data. Everything else happens in your browser, and your browser talks straight to public services:

| Service                                                    | What we use it for                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Earth Search (Element 84) and Microsoft Planetary Computer | Searching for satellite photos (the catalogue). Planetary Computer is the backup |
| Sentinel-2 files on AWS and Azure                          | The photos themselves, read in small pieces                                      |
| OpenStreetMap Nominatim                                    | Place search                                                                     |
| NASA GIBS                                                  | The picture of the Earth on the globe                                            |
| OpenFreeMap                                                | The flat map: roads, labels, building outlines                                   |
| AWS Terrain Tiles                                          | 3D terrain (top device level only)                                               |
| CelesTrak                                                  | Satellite orbit data, through our Worker                                         |
| Supabase                                                   | Accounts (built, switched off)                                                   |

### 2. Inside the app: the layers

![Diagram of four layers, each relying on the one below: the screens (globe and satellites, new investigation, workbench, report, limits and privacy); shared building blocks and memory (src/ui, src/lib, src/data, src/geo, src/map); the engines (orbit engine, evidence engine, report maker, place search, the optional satellite view, and accounts, built but switched off); and the internet: public services over HTTPS, plus our Cloudflare Worker for orbit data.](diagrams/app-layers.png)

_How the code is organised: four layers, from the screens down to the internet._

<details><summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart TB
  subgraph screens["1. What you see: the screens"]
    direction LR
    s1["Globe and<br/>satellites"]:::l1 ~~~ s2["New<br/>investigation"]:::l1 ~~~ s3["Workbench"]:::l1 ~~~ s4["Report"]:::l1 ~~~ s5["Limits and<br/>Privacy"]:::l1
  end
  subgraph blocks["2. Shared building blocks and memory"]
    direction LR
    b1["Look and words<br/><i>src/ui</i>"]:::l2 ~~~ b2["Pages and routes<br/><i>src/lib</i>"]:::l2 ~~~ b3["Investigations on<br/>your device<br/><i>src/data</i>"]:::l2 ~~~ b4["Outline rules and<br/>size limits<br/><i>src/geo</i>"]:::l2 ~~~ b5["Device level<br/>and the map<br/><i>src/map</i>"]:::l2
  end
  subgraph engines["3. The engines"]
    direction LR
    e1["Orbit engine<br/><i>src/sats</i><br/>runs in a<br/>background worker"]:::l3 ~~~ e2["Evidence engine<br/><i>src/stac, src/evidence,<br/>src/workers</i><br/>runs in a<br/>background worker"]:::l3 ~~~ e3["Report maker<br/><i>src/report</i>"]:::l3 ~~~ e4["Place search<br/><i>src/search</i>"]:::l3 ~~~ e5["Satellite view<br/><i>src/context</i><br/>optional, never<br/>evidence"]:::l3 ~~~ e6["Accounts<br/><i>src/accounts</i><br/>built, switched off"]:::off
  end
  net["4. The internet: public services over HTTPS,<br/>plus our own Cloudflare Worker for orbit data"]:::l5
  screens --> blocks --> engines --> net

  classDef l1 fill:#dbeafe,stroke:#1d4ed8,color:#0f172a
  classDef l2 fill:#dcfce7,stroke:#15803d,color:#0f172a
  classDef l3 fill:#dcfce7,stroke:#15803d,color:#0f172a
  classDef off fill:#ffedd5,stroke:#c2410c,color:#0f172a,stroke-dasharray:5 4
  classDef l5 fill:#f1f5f9,stroke:#64748b,color:#0f172a
  style screens fill:transparent,stroke:#94a3b8
  style blocks fill:transparent,stroke:#94a3b8
  style engines fill:transparent,stroke:#94a3b8
```

</details>

Each layer relies on the layer below it. Two walls are checked by automatic tests: the optional satellite view (`src/context`) never feeds a report, and the accounts code (`src/accounts`) can only be reached through one switch.

### 3. Satellite positions and the Cloudflare Worker

![Sequence diagram: your browser asks our Cloudflare Worker for orbit data at /api/tle. If the Worker holds a copy less than 2 hours old, it sends it straight away. If not, it asks CelesTrak. When CelesTrak answers within 0.8 seconds, the Worker sends the fresh data and keeps it for 2 hours; when CelesTrak is too slow or down, it sends the saved copy from the site files, marked as old, and keeps trying in the background for the next visitor.](diagrams/satellite-positions.png)

_How orbit data reaches your browser, and what happens when CelesTrak is slow._

<details><summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
  autonumber
  participant B as Your browser
  participant W as Cloudflare Worker
  participant C as CelesTrak
  participant S as Saved copy in the site files
  B->>W: Ask for orbit data (/api/tle)
  alt The Worker holds a copy less than 2 hours old
    W-->>B: Send it straight away
  else The copy is old or missing
    W->>C: Ask for fresh orbit data
    alt CelesTrak answers within 0.8 seconds
      C-->>W: Fresh orbit data
      W-->>B: Send it, and keep it for 2 hours
    else Too slow, or down
      W->>S: Read the saved copy
      S-->>W: Orbits from the last refresh
      W-->>B: Send the saved copy, marked as old
      Note over W,C: The Worker keeps trying in the background for the next visitor
    end
  end
```

</details>

Your browser works out where each satellite is by itself, using orbit data. The Worker's only job is to fetch that orbit data from CelesTrak, keep it for 2 hours, and never make you wait: if CelesTrak is slow it sends the saved copy at once.

### 4. From a place to a report

![Sequence diagram in 15 steps: you type a place, the app asks Nominatim where it is, and the globe flies there. You draw an outline and pick dates; the photo worker asks the STAC photo catalogue which photos cover it, reads only the small pieces needed from the Sentinel-2 files, and returns a clear-view score and fingerprint for each date. The app shows the timeline and the before and after photos; you pin dates and add notes and a claim; the app saves on your device and gives you a report file, one web page.](diagrams/place-to-report.png)

_Every step between typing a place and getting a report._

<details><summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
  autonumber
  actor You
  participant App as The app
  participant PW as Photo worker
  participant Search as Nominatim
  participant Cat as Photo catalogue called STAC
  participant Files as Sentinel-2 files
  You->>App: Type a place
  App->>Search: Where is it?
  Search-->>App: Coordinates
  App-->>You: The globe flies there
  You->>App: Draw an outline and pick dates
  App->>PW: Find and check photos for this outline
  PW->>Cat: Which photos cover it on these dates?
  Cat-->>PW: Photos with dates and cloud numbers
  PW->>Files: Read only the small pieces needed
  Files-->>PW: The dots (pixels)
  PW-->>App: Clear-view score and fingerprint for each date
  App-->>You: Timeline, before and after photos
  You->>App: Pin dates, add notes and a claim
  App->>App: Save on your device
  App-->>You: A report file, one web page
```

</details>

### 5. How a photo becomes evidence

![Diagram of five steps in a row: 1, a public Sentinel-2 file; 2, read the exact window of dots for your outline; 3, fingerprint the dots with SHA-256; 4, write the file, window, recipe versions and fingerprint into the report; 5, anyone can read the same window and compare.](diagrams/photo-to-evidence.png)

_Why someone else can trust a report: they can read the same dots and compare the fingerprint._

<details><summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart LR
  a["<b>1</b><br/>Public<br/>Sentinel-2 file"]:::ext --> b["<b>2</b><br/>Read the exact<br/>window of dots<br/>for your outline"]:::mine --> c["<b>3</b><br/>Fingerprint<br/>the dots<br/>SHA-256"]:::mine --> d["<b>4</b><br/>Write file, window,<br/>recipe versions and<br/>fingerprint into<br/>the report"]:::mine --> e["<b>5</b><br/>Anyone can read<br/>the same window<br/>and compare"]:::you

  classDef you fill:#dbeafe,stroke:#1d4ed8,color:#0f172a
  classDef mine fill:#dcfce7,stroke:#15803d,color:#0f172a
  classDef ext fill:#f1f5f9,stroke:#64748b,color:#0f172a
```

</details>

A fingerprint (a "hash") is a short code worked out from the dots. If even one dot changed, the code would be completely different. That is how a reader can tell the photos in a report are the real ones.

Every calculation has a version name, for example `scl-v2` for the cloud scoring and `diff-v1` for the brightness difference. The report lists them, so a later reader knows exactly which maths was used. The optional satellite view and the preview pictures are never saved, fingerprinted or put in a report.

## The pages of the website

| Address          | What it is                                                         |
| ---------------- | ------------------------------------------------------------------ |
| `/`              | The globe: live satellites, place search, next pass                |
| `/new`           | Start an investigation: place, outline, dates, review              |
| `/i/<id>`        | The workbench for one investigation                                |
| `/i/<id>/report` | The report for that investigation                                  |
| `/limits`        | What the photos can and cannot show                                |
| `/privacy`       | What the site does with your data                                  |
| `/dev/kit`       | A page for developers that shows the building blocks of the design |
| `/api/tle`       | The only server route: satellite orbit data                        |

## Speed and different devices

The site checks your device and picks one of four levels:

| Level | When                                                             | What you get                                        |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------- |
| T0    | No WebGL2 (3D graphics), or a software graphics chip             | No 3D map. Search and the satellite list still work |
| T1    | Data saver, a slow network (2G or 3G), or 2 GB of memory or less | A flat 2D map. Satellites are listed in the panel   |
| T2    | 4 cores or fewer, or less than 4 GB of memory                    | The globe with satellite markers, tracks and swaths |
| T3    | Everything else                                                  | All of T2, plus 3D terrain                          |

On T1 and T2 you can press "Switch to full". The choice is made in this order:

![Decision diagram for your device: without 3D graphics and a real graphics chip, T0 (no 3D map; search and the list still work). Otherwise, with data saver, a slow network or 2 GB of memory or less, T1 (a flat 2D map, satellites in a list). Otherwise, with 4 cores or fewer or under 4 GB of memory, T2 (the globe with satellite markers, tracks and swaths). Otherwise T3 (everything in T2, plus 3D terrain).](diagrams/device-level.png)

_Which level your device gets: T0, T1, T2 or T3._

<details><summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart TB
  start(["Your device"]):::you --> q1{"3D graphics, and a real<br/>graphics chip?"}
  q1 -->|"no"| t0["<b>T0</b><br/>No 3D map.<br/>Search and list still work"]:::t
  q1 -->|"yes"| q2{"Data saver, slow network<br/>or 2 GB memory or less?"}
  q2 -->|"yes"| t1["<b>T1</b><br/>Flat 2D map.<br/>Satellites in a list"]:::t
  q2 -->|"no"| q3{"4 cores or fewer, or<br/>under 4 GB memory?"}
  q3 -->|"yes"| t2["<b>T2</b><br/>Globe with satellite<br/>markers, tracks, swaths"]:::t
  q3 -->|"no"| t3["<b>T3</b><br/>Everything in T2,<br/>plus 3D terrain"]:::t

  classDef you fill:#dbeafe,stroke:#1d4ed8,color:#0f172a
  classDef t fill:#dcfce7,stroke:#15803d,color:#0f172a
```

</details>

How it stays fast:

- **A small first page.** The JavaScript for the first screen is held to 150 KB compressed. Every other screen is loaded only when you open it (the big map library is its own file, by design).
- **Small reads.** The site reads only the pieces of each photo file that cover your outline, not the whole file.
- **Remembering.** Recently read pieces are kept in your browser so a second look is quick.
- **Background workers.** Orbit maths and photo reading run off the main screen thread, so the page stays smooth.
- **Server cache.** The Worker keeps orbit data for 2 hours. If CelesTrak does not answer within 0.8 seconds, it sends a saved copy right away, and the refresh finishes in the background.

## Built with

| Part          | What we use                                               | What it does for you                                                                |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The app       | React 19, TypeScript 7, Vite 8                            | Draws the screens, catches mistakes while code is written, builds the website files |
| Looks         | Tailwind CSS 4, Geist fonts, Base UI, Phosphor icons      | Colours, spacing, text, accessible building blocks, icons                           |
| Map and globe | MapLibre GL 6.12, terra-draw 1.36                         | Draws the 3D globe and the flat map, and lets you draw an outline                   |
| Orbits        | satellite.js 7.1                                          | Works out where satellites are from public orbit data                               |
| Photos        | geotiff 3, proj4 2.22                                     | Reads pieces of satellite photo files and converts between map systems              |
| Server        | Cloudflare Workers, Wrangler 4                            | Hands out the site and the `/api/tle` route (free plan)                             |
| Tests         | Vitest 5, Playwright 1.63 with axe-core, Deno 2.9, PGlite | Check the code, real browsers, accessibility, server functions and database rules   |
| Later (off)   | Supabase                                                  | Accounts (see [Accounts](development.md#accounts-built-switched-off))               |

Every package version is pinned exactly in `package.json`, and `package-lock.json` is committed, so a fresh install gives the same result.

## Where things are

```
src/
  app.tsx, main.tsx   routes and the app entry
  config.ts           the web addresses of every service it uses
  styles.css          colours and themes (dark and light)
  screens/            the pages: globe, new investigation, workbench, report, limits and privacy, the design kit, not found
  ui/                 design building blocks, the shell, search box, satellites panel; copy.ts holds the words on screen
  map/                the persistent MapLibre globe, device levels, camera, satellite layers
  sats/               satellite list, orbit maths, next-pass search (in a background worker)
  search/             the Nominatim client (throttled, cached)
  evidence/           the evidence engine: photo pieces, SHA-256, cloud scores, shared grid, difference
  stac/               Sentinel-2 photo search (Earth Search, with Planetary Computer as backup)
  workers/            the photo-reading background worker
  context/            the optional satellite view (an aid for finding a place, never evidence)
  geo/                coordinates and outline limits
  new/                the "new investigation" steps: place, outline, dates, review
  workbench/          the workbench: viewer, timeline, road grid, notes, claim
  report/             the report: HTML, provenance, safe escaping of text
  data/               the investigation model and the on-device store
  lib/                small helpers (router, caching of photo pieces, formatting)
  accounts/           sign-in, save and verify (built, switched off, reached through one flag)
  explore/            the time-lapse (Watch it change): its loader, player and address; the share-link codec is a building block with no screen yet
worker/               the Cloudflare Worker: /api/tle with cache, back-off and saved-copy fallback
supabase/             database migrations and the verify and delete-account functions (not live)
scripts/              the checks run by npm run check, the headers builder, probes, the orbit snapshot tool
dev/                  a page the live checks open to read one photo window in a real browser
public/               icons and tle-snapshot.json
tests/                unit, db (database), e2e (browser), live (real services), fixtures, accounts
docs/                 design mockups, plans, research, probes and operations guides
```
