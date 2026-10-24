# Privacy and security

The README is the short version; this page holds the detail. It was moved here from the README on 24 October 2026 without changes, except for links and the dated figures noted where they appear.

## Privacy

- **No accounts and no database** on the live site. Your investigations and your theme choice stay in your browser.
- **Place searches** go to OpenStreetMap Nominatim, only when you press Search (at most once a second).
- **Map and globe pictures** come from OpenFreeMap, NASA GIBS and AWS. Those requests reveal your IP address and the area you are looking at.
- **Satellite photos** are read straight from public Sentinel-2 files on Amazon Web Services (with Microsoft's Planetary Computer and Azure as backup). Those requests reveal an approximate area, never your name or email.
- **The satellite view** is off until you switch it on. A choice you made earlier is remembered and starts it again by itself. It asks the Earth Search catalogue about a coarse version of your map area and reads one recent photo.
- **The Look closer links** (live since 23 October 2026) open Google Street View and Google Earth in a new tab. Nothing is sent to Google until you click one. A click sends the middle of your outline, as latitude and longitude, to Google; what Google does with it is set by its own privacy policy.
- **Watch it change** (live since 24 October 2026) starts when you press its button or tap "Load the pictures". It asks the Earth Search catalogue (Planetary Computer is the fallback) about the 2 km square around your place, once for each year, and reads one picture a year. Nothing is saved.
- **Satellite positions** come through our Worker from CelesTrak. Nothing about you is sent to CelesTrak.
- **Our host.** Cloudflare, which hosts the site, can see ordinary web request information, and the Worker's logs are switched on.

The short version is on the website at `/privacy`.

## Security

- **No secrets in the browser.** The site needs no keys. Service addresses are public.
- **A strict content security policy.** It is generated from the exact list of hosts the code talks to. It allows no wildcards and no `unsafe-eval`. The one inline script (the theme switch) is allowed by its fingerprint, calculated from the built page.
- **Safe server route.** `/api/tle` accepts only GET and HEAD, anything else gets a 405. Unknown `/api/*` routes get a plain JSON 404. Responses carry `X-Content-Type-Options: nosniff`.
- **Inputs are checked.** Outlines, widths, dates and coordinates are validated against clear limits before use.
- **Reports escape text.** Whatever you type in a note or claim is escaped before it goes into the report page.
- **Nothing to steal on the server.** The live site has no accounts and no database. The Worker has no secrets and no variables.
- **Pinned packages.** Every dependency version is exact, and the lock file is committed.
- **Accounts stay off by default.** A guard fails the build if accounts code appears in the normal build.
- **Reporting a problem.** No public security contact is set up yet. Please contact the owner directly (see [Help, contributing and licence](../README.md#help-contributing-and-licence)).
