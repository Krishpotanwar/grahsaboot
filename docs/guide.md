# Using GrahSaboot

The README is the short version; this page holds the detail. It was moved here from the README on 24 October 2026 without changes, except for links and the dated figures noted where they appear.

## In one minute

GrahSaboot is a free website. You pick a place on a globe. It finds real photos of that place taken from space. It checks which photos are clear and which are hidden by clouds. You put a "before" photo next to an "after" photo and look for yourself. When you are done, it writes a **report** you can save and share.

The report lists exactly which photos were used. Each photo gets a **digital fingerprint**, so anyone can check later that the photos were not changed.

**Why does it exist?** People say things like "this road was built last year" or "that building is finished". Checking is hard and often costs money. GrahSaboot lets anyone look at free, public satellite photos, with the date on every photo. It is also honest about what the photos can and cannot show.

**Where do the photos come from?** From **Sentinel-2**, three European satellites (Sentinel-2A, 2B and 2C) that photograph all of the Earth's land every few days. The photos are free and open. One dot (pixel) in a photo covers 10 metres by 10 metres of ground.

**Who is it for?** Anyone who wants to check a claim about a place, for example "work started on this site in 2022" or "a new road was built here", without paying for pictures or learning special software.

## What you can do

- **Turn a 3D globe.** It shows a real picture of the Earth. On a big screen it turns slowly by itself. There is a dark theme (the default) and a light theme.
- **See live satellites.** Sentinel-2A, 2B and 2C, plus Landsat 8 and 9, move on the globe in real time. Each one shows its name, its path (a dashed line) and the strip of ground it can see (its "swath").
- **Search for a place** by name, or type coordinates such as `21.1458, 79.0882`. The globe flies there and drops a pin. If you type Indian coordinates the wrong way round, the site offers a one-tap fix.
- **See the next pass.** For your place, it estimates when a satellite will next fly over in daylight.
- **Start an investigation.** Pick a place, draw an outline of a site (a plot, a building) or a road on the map (or paste coordinates), choose the dates, check, and open it.
  - The map stays readable while you draw. You can undo corners. A size note tells you when what you drew is too small for 10 m photos to show.
  - **An optional satellite view** can sit behind the map to help you find your place. It is one recent photo, it only loads when you switch it on, it tells you how old it is, and it is never used as evidence.
- **Use the workbench.** Compare a "before" and an "after" photo with a swipe, side by side, or as a brightness difference. A small map shows your outline. Each photo shows its date, the satellite, how much of your outline it sees clearly, and its fingerprint.
- **Use the timeline.** Every satellite pass in your date range is a tick. A tall tick means a clear view. A short tick means clouds hide the view. Press or drag along it to move through the dates, and pin the dates that matter.
- **Check a road in sections.** A road is cut into sections. A grid shows how clearly each section is seen on each pinned date.
- **Write notes and a claim.** Say what you see, and what claim you are testing.
- **Save a report.** One self-contained web page file with the photos, the table of dates, your notes and claim, the limits, and a "provenance" block (a list of every file, window and fingerprint used) so someone else can check your work.
- **Phase F so far (live since 23 and 24 October 2026).**
  - **Watch it change (live since 24 October 2026).** Pick a place on the globe, or open a link to one, and press "Watch it change": six satellite pictures of the same place, one a year and all from the same time of year, played one after another, with Play, Previous, Next, a slider and the keyboard. It loads about 14 MB or more, which the button says before you press it (a link from outside waits for a tap on "Load the pictures"). The pictures are for looking: they are not saved, not fingerprinted and never put in a report. A link at the bottom opens the same place as a new investigation. While you wait, the start screen shows a small line drawing of six prints: it stays still unless you point at it, and it is fully still if you have asked for less motion.
  - **A switch that hides the satellites (live since 24 October 2026).** An eye button next to "Start an investigation" hides the live satellites panel, their markers and their tracks on the globe, and shows them again. Your choice is remembered in your browser.
  - **Look closer.** Once your outline is valid, a box offers two links, Street View and Google Earth. It sits in the outline step and at the top of the workbench. Each link opens Google's own page for the middle of your outline in a new tab. GrahSaboot does not check those pages, and they are never put in a report. In the notes panel, a button starts a note with "Street View, " and leaves the date for you to type from what Google shows.
  - **Sharper.** A switch in the workbench's tool row shows the photos with a little more contrast and a light sharpening. It is "a viewing aid: the same pixels, shown more clearly". It starts off at every visit, and it never changes a fingerprint or the report.
  - **What we measured.** The report gets a short block with a changed area in hectares, or a plain statement of why it has none. See [What the report measures](#what-the-report-measures).
  - **Smaller changes.** Photo files are read in 16 KB blocks. For a 1 km square, with nothing cached, a cloud check or a photo now takes 2 requests on Earth Search where it took 12 to 14, and the pixels and fingerprints are the same (measured in [`docs/ops/probes.md`](ops/probes.md), P18, which also gives the times and their limits). A date that is not a real day, such as 30 February, is shown as written instead of as another day. If a tab was left open across an update and a page will not load, the tab reloads itself once to get the new files.

Your investigations stay in your browser, on your device. There are no accounts on the live site.

![Next pass over a searched place](screenshots/next-pass.png)

## What it cannot do

Please read this part. It is the most important part.

- **It cannot see small things.** Photos are 10 metres per pixel. A house is only one to three dots. Large buildings, roads and cleared land can be seen. Small or narrow things may not be.
- **Clouds get in the way.** Clouds often block the view, especially in the monsoon. A satellite passes every few days, but a pass is not always a usable photo.
- **"No visible change" does not mean "nothing happened".** Roofs hide what is inside, and work can happen between two photos.
- **It cannot show quality, payments, contracts or who did the work.**
- **Photos go back to 2017 only.**
- **Pass times are estimates.** They are worked out from public orbit data.
- **The satellite view is for finding your place.** It is not saved, not fingerprinted and never put in a report.
- **"Verified" has a narrow meaning.** It means the pictures match the public source file at the time of checking. It does not prove any claim about a project.
- **Size limits.** A site can be up to 9 km² and 4.25 km across. A road can be up to 10 km long and 5 to 200 metres wide. Roads are checked in 2 km sections.

The full list is on the website at `/limits`.

## A worked example

The site has one ready-made example: the **Navi Mumbai airport site**, a 2 km square of land.

1. Open the website.
2. Press **Try a worked example: Navi Mumbai airport**.
3. Open the workbench. It shows a clear photo from **22 February 2018** and a clear photo from **12 December 2025**.
4. Swipe between them. Then look at the timeline and the report.

Direct link: `/new?example=navi-mumbai-airport`.

## What the report measures

This part has been live since 23 October 2026.

The Evidence part of the report ends with a short block called **What we measured**. A fixed rule, `change-v1`, compares your two pinned photos (the "before" and the "after"). It looks for patches of changed ground that are at least 0.3 ha (a hectare is 100 m by 100 m) and 30 m across. Those settings are provisional. The block says what the rule found, in one of five ways:

- **A changed area** in hectares, always with the caution "It cannot tell a building from a crop or a season: compare the pictures by eye."
- **No changed patch** of that size.
- **Most of the picture differs**, so the rule "cannot separate a change from a difference in overall brightness or colour". It states no area.
- **Not enough ground:** "Not enough clear ground in both pictures to compare."
- **An outline that is too small** to hold a patch of that size.

The numbers are computed from the pixels, not seen by a person, and the block never says whether your claim is true. If it compared the photos and the two dates are more than 20 days apart in the year, it adds "These dates are in different seasons; seasonal change is included." It records the rule, the grid and the settings, so it can be run again from the hashed source pixels. It appears only when the rule could run. If it could not (a photo has no cloud check, or no answer comes within 10 seconds, for example), the report is made without it. The report's provenance names `change-v1` only when the block is there.

## Accessibility

- Every screen is tested with axe against **WCAG 2.2 AA**, in both the dark and the light theme.
- You can use the site with a keyboard. Focus is visible, and status messages are read out by screen readers.
- **Reduced motion** is respected (the globe stops turning by itself).
- The photo-quality labels never rely on colour alone: each one uses a symbol and a word. In high-contrast (forced colours) mode, the timeline marks switch to system colours.
- The weakest devices (T0) get a simple version that still works.

## Questions and answers

**Is it free?** Yes. It needs no sign-in and no keys, and it runs on a free hosting plan.

**Do I need an account?** No. The live site has no accounts.

**Where is my work saved?** In your own browser, on your own device. Clearing your browser data removes it. Save the report file if you want to keep it.

**Why can't I see my house?** Each dot in the photo covers 10 m by 10 m. A house is only one to three dots.

**Why are there so few photos in some months?** Clouds. In the monsoon, clouds often hide the ground for weeks.

**Does a clear photo prove that something was built?** No. It shows what was visible from space on that date. It does not show quality, payments or who did the work.

**What does "No visible change" mean?** Only that you could not see a change in these photos. It does not prove that nothing happened.

**What is the fingerprint for?** It lets anyone read the same piece of the same public file later and check that it gives the same fingerprint.

**Which browsers work?** Modern desktop and phone browsers. The automated tests cover Chromium, Firefox and WebKit (the engine behind Safari), plus a phone-sized Chromium. WebKit is not the Safari app itself, so Safari has not been confirmed.

**Can I use it offline?** No. It reads live photos and orbit data from the internet.

**Can I run my own copy?** You can run it on your computer today (see [Run it on your computer](development.md#run-it-on-your-computer)). The licence is not chosen yet, so ask the owner before reusing the code.

**Is the next-pass time exact?** No. It is an estimate from orbit data.

## Glossary

| Word                          | Plain meaning                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Satellite                     | A machine that circles the Earth and takes photos or measurements                                                             |
| Sentinel-2                    | Three European satellites (2A, 2B, 2C) that photograph all land every few days. Their photos are free                         |
| Pixel (dot)                   | The smallest square in a photo. In Sentinel-2 photos one pixel is 10 m by 10 m of ground                                      |
| Resolution (10 m)             | How much ground one pixel covers. Smaller is sharper                                                                          |
| Clouds and clear view         | A photo can be partly hidden by cloud. The "clear view" score says how much of your outline can be seen                       |
| SCL                           | Scene classification layer: a map, made by the satellite team, that marks which dots are cloud, shadow, water, land and so on |
| Outline (site or road)        | The area you draw: a site is an area, a road is a line with a width                                                           |
| Investigation                 | One piece of work: a place, an outline, a date range, your notes and your claim                                               |
| Workbench                     | The screen where you compare photos                                                                                           |
| Timeline                      | A row of ticks, one for each satellite pass in your date range                                                                |
| Pinned date                   | A date you chose to keep in the report                                                                                        |
| Claim                         | The statement you are testing, for example "the building was finished by 2024"                                                |
| Report                        | One web page file with the photos, notes, limits and provenance                                                               |
| Provenance                    | The record of where every photo came from: file, window and fingerprint                                                       |
| Fingerprint (hash, SHA-256)   | A short code worked out from data. Change one dot and the code changes completely                                             |
| COG (cloud-optimised GeoTIFF) | A photo file format that lets a program fetch only a small piece of a big file                                                |
| STAC                          | A standard way to list satellite photos so programs can search them                                                           |
| Byte range                    | Asking a server for just part of a file                                                                                       |
| Orbit data (TLE)              | A short text that describes a satellite's path. Used to work out where it is now and when it will pass                        |
| SGP4                          | The standard maths for turning orbit data into a position                                                                     |
| Ground track and swath        | The line a satellite draws on the ground, and the strip of ground it can see                                                  |
| Next pass                     | The next time a satellite flies over your place in daylight                                                                   |
| Device level (tier)           | How much of the site your device can run: T0 to T3                                                                            |
| Worker (Cloudflare)           | A small program that runs on Cloudflare's servers close to the visitor                                                        |
| Web Worker                    | A helper that runs in your browser in the background so the page stays smooth                                                 |
| Content security policy       | A rule list the browser follows that says which web addresses the page may talk to                                            |
| Bundle (and bundle budget)    | The JavaScript files sent to your browser. The budget limits the size of the first page                                       |
| Lazy loading                  | Loading a screen only when you open it                                                                                        |
| CI                            | A robot on GitHub that runs the checks on every change                                                                        |
| Deploy and rollback           | Publishing a new version, and going back to the previous one                                                                  |
| axe, WCAG                     | Tools and rules for making sites usable by everyone, including people who use screen readers                                  |
| Reduced motion                | A device setting that asks sites to avoid animation                                                                           |
| Switched off (flag-off)       | Built and tested, but not part of the live site                                                                               |
