# Approved visual direction (V1, approved 2026-10-06)

The screens in `mockups/` were rendered from real data: live CelesTrak orbits, real Sentinel-2 L2A at 10 m, and OSM geometry. They are the visual target for Phases B and C. Where a plan task and a mockup disagree on **looks**, the mockup wins. Where they disagree on **behaviour, copy rules, tokens or accessibility**, the plan wins.

To view them: `cd docs/design/mockups && python3 -m http.server 4500`, then open `01-landing.html` and the other pages. `node_modules` is a symlink to the repo's own.

| Screen | Render | Source |
|---|---|---|
| Globe / landing | `mockups/01-landing.png` | `01-landing.html` |
| Site workbench | `mockups/02-workbench.png` | `02-workbench.html` |
| Road workbench | `mockups/03-road.png` | `03-road.html` |
| Evidence report (light) | `mockups/04-report.png` | `04-report.html` |
| App icon | `mockups/icon-1024.png` | `icon.html` |

## Deltas the plan tasks must absorb

- **Brand (B2 wordmark, B3 header, favicon)**
  - **Mark:** `mockups/mark.svg` is a ring planet with a cut-out accent window, coloured with `currentColor` + `var(--gs-accent)`. Use `mark-16.svg` for the 16 px favicon.
  - **Wordmark:** Geist Mono, uppercase, letter-spacing 0.34em. **GRAH** at weight 650 in fg, **SABOOT** in fg-2.
  - **Header:** 64 px tall, holding the wordmark, "Start an investigation", a divider, the theme icon button and "Sign in" as a primary button.
  - **Icons:** `index.html` gets an SVG favicon plus an apple-touch-icon made from `icon-1024.png` (180 px).
- **Globe (B4 stage, B7 satellites)**
  - **Basemap:** NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` (the plan's `gs-gibs`).
  - **Size and shading:** zoom the globe to fill about 88% of the stage's short side: `log2(0.44·min(w,h)·2π/512) + 0.36`. Add a screen-space radial shade over the stage.
  - **Satellites:** mark each one with the glyph SVG from `01-landing.html`, labelled with its name. Hide markers on the far side (`opacityWhenCovered: '0'`).
  - **Tracks:** dashed (`line-dasharray [3,3]`); the next-pass satellite's track is in accent at width 1.6.
  - **Place pin:** an accent dot with a dark label chip.
  - **Panel:** "Live satellites", a LIVE dot, a mono lat/lon table with the next-pass satellite's row in accent, and a "Next pass over {place} · estimated" block plus a note.
- **Workbench header and viewer (C5)**
  - **Header:** breadcrumb, title, a mono metadata line, draft status, and "Save and verify" as an outlined accent button.
  - **Viewer:** tabs with icons, date chips on the photos, a round swipe handle, a scale bar, a north arrow, and an outline on/off switch. The outline is translucent and dashed, so it never hides the ground.
- **Timeline (C6)**
  - **Layout:** a barcode with one row per year for sites, one strip for roads, and a section × date grid for roads.
  - **Legend and detail:** a legend, real 20 m thumbnails, and pinned tags.
- **Report (C9)**
  - **Badge:** "Local preview · not verified yet", in the three-state style.
  - **Layout:** a metadata strip (area, dates, source, resolution) and numbered sections.
  - **Pinned dates table:** date, view, clear %, server check, source item and SHA-256 (source pixels).

Not taken: V2 "Google Earth" imagery (Blue Marble NG + EOX s2cloudless + atmosphere overlay). The user chose V1. The V2 mockup is not in the repo.
