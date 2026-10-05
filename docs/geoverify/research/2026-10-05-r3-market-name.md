# R3 market, prior art, positioning and new name

Date of research: 2026-10-05 (all "accessed" dates below are 2026-10-05). Worker: Sonnet. Domain: market / prior art / positioning / NAME.

Evidence grades used: **[P]** primary page fetched and read today; **[S]** secondary or search-result snippet only (not independently confirmed); **[I]** my inference. Anything I could not open is marked BLOCKED or UNVERIFIED. Nothing here is legal advice (trademark section especially).

---

## PART 1. Prior art and positioning

### 1.1 Claim ledger

Source claims quoted from `sources/SOURCE_TEXT.md` (original student proposal) and `research/2026-10-05-science-audit.md`.

| ID | Claim (file) | Verdict | Current evidence (accessed 2026-10-05) | Consequence for design / pitch |
|---|---|---|---|---|
| M-01 | Slide 3: "No published system ingests a declared project record, aligns imagery to its milestone timeline, measures progress in physical units and returns a scored, evidence-linked verdict." | **REFUTED in the broad form; NOT ESTABLISHED in the narrow form** | (a) India already did the closest thing officially: NIRDPR's pilot of "geosatellite monitoring" of PMGSY roads reported ~31% of surveyed village roads in ten districts (Odisha, Rajasthan, Chhattisgarh, Telangana, Assam) were shorter than sanctioned length; a tripartite agreement (NRRDA/MoRD, NRSC-ISRO, CGARD-NIRDPR) followed on 7 March 2017. [S: pilot via search snippets of Hindustan Times/YourStory 2016, both pages blocked 403; agreement via search snippet of PMGSY MoU PDF]. Bhuvan-PMGSY portal itself confirms a satellite-derived rural-road length/connectivity database for roads sanctioned since 2000-01, internal use only, login required. [P https://bhuvan-app1.nrsc.gov.in/pmgsy/home/index.php]. (b) Academic: "Automated progress monitoring system for linear infrastructure projects using satellite remote sensing" (ScienceDirect, Automation in Construction, 2016). [S: title seen in search results; page blocked 403, abstract unread] https://www.sciencedirect.com/science/article/abs/pii/S0926580516300826. (c) ESA ran an open "Space for Construction Monitoring" call (18 Nov 2024 to 18 Feb 2025, 50-80% funded feasibility/demonstration, scope includes progress tracking, automated documentation). [P https://business.esa.int/funding/call-for-proposals-non-competitive/space-for-construction-monitoring]. (d) ESA project SaSCA (lead Paulinyi&Partners, Hungary; ongoing feasibility; updated 29 Sep 2026; sites >10 ha; basic tier on open Sentinel data, premium on commercial imagery; tracks earthwork, slabs, roofing, columns). [P https://business.esa.int/projects/sasca]. (e) Commercial products already sell "progress vs plan" (see 1.2). | Delete "no published system" from every pitch and from slide 3 lineage. The honest novelty is narrower: a **self-serve, free, open-imagery, polygon/corridor evidence workbench for non-government users**. Whether anyone combines "declared claim + scored verdict" for a public audience was not exhaustively searched (see M-06). |
| M-02 | Slide 3 row: "Geotagged photo and MIS portals: Self-reported by the audited agency; no baseline." | **CORRECTED** | PMGSY inspections are done by National/State Quality Monitors and uploaded with geotagged photos through the QMS mobile app, and eMARG takes geotagged photos for maintenance. [S: search-result summary of MoRD/PIB material; PIB PDF fetched but unreadable]. So there is an independent-monitor layer, not purely agency self-report. Separately, Geo-MGNREGA reports >6.24 crore assets geotagged. [S: search summary] | Reword to "photo evidence is point-in-time, ground-captured and held on government systems; it gives no dated overhead baseline". Do not say "self-reported". |
| M-03 | Slide 9: "Evidence held by ESA and USGS, not by the audited agency." | **CONFIRMED for the imagery, CORRECTED for the framing** | Open Sentinel/Landsat archives are indeed outside the audited agency. But auditors are already acquiring satellite capability: CAG signed an MoU with BISAG-N on 26 Mar 2025 for geospatial/remote-sensing audit tools. [P https://gisresources.com/cag-bisag-n-collaboration-to-enhance-remote-sensing-in-audits/]. CWC decided to monitor ~150 projects biannually via ISRO-Bhuvan from 2013 [S]. | "Independent of the agency" is true only for the imagery source. The institutional users (CAG, MoRD) are going to build/buy in-house; an outside product competes with their own captive stack. Aim first at users who are not government. |
| M-04 | Slide 9: "Wide-area screening at near-zero imagery cost." | **CONFIRMED** | Copernicus Browser is free with a free account; includes Timelapse (GIF/MP4 export), split/opacity compare, cloud-cover filter. [P https://documentation.dataspace.copernicus.eu/Applications/Browser.html; repo https://github.com/eu-cdse/copernicus-browser/blob/main/README.md]. The free tool means the *imagery view* is not the product; the report/workflow is. | Position on the evidence workflow, not on "we show satellite pictures". |
| M-05 | Slide 9 / PRD: abandonment "read from curve shape plus vegetation regrowth"; "Progress reported in metres and square metres" | **UNVERIFIABLE (not a market claim)** | Belongs to the science audit (R3 science). SCI-28 already marks the F1/length targets as unproven. | None for this report. |
| SCI-27 | "No published system ties observations to construction monitoring" | **CONFIRMED as "Not established; broad framing contradicted"; I add strong new evidence** | See M-01. Additional items the science audit did not list: SaSCA (2026), the 2024-25 ESA call's stated scope, the PMGSY NIRDPR/NRSC programme, CAG-BISAG-N MoU, and at least four commercial vendors (1.2). An "exhaustive exact-feature novelty search" is still not done; I did not search patents or Google Scholar systematically. | Keep the science-audit wording. Add: a one-page "Related work and why we are different" to the PRD. |
| M-06 | (implied by PRD) Demand exists among "site owners, civil engineers, project-monitoring teams, land investigators" | **UNVERIFIABLE** | PRD itself says demand is "not validated yet", "No reachable tester yet". I found market-research-style pages (e.g. dataintelo "Construction Monitoring Via Satellite Market") [S, not trusted: vendor-style market report] but no primary evidence of paid demand from small users. | Treat as hypotheses; see 1.4 for who to test. |
| M-07 | (ARCH/PRD, free tooling assumption) EO Browser is a free web viewer users already have | **OUTDATED** | Planet states "Sentinel Hub web applications, including EO Browser and the Dashboard application, will no longer be accessible on March 20, 2026"; paid users go to insights.planet.com; free users are told to use Copernicus Browser, which is unaffected. [P https://community.planet.com/product-updates/important-update-sunset-of-eo-browser-and-sentinel-hub-dashboard-6426]. Free-account EO Browser users therefore lost their tool in March 2026: a small tailwind for any free alternative. | Do not benchmark against EO Browser. Benchmark against Copernicus Browser. (Inference [I]: this notice concerns the Planet-hosted web apps; it does not by itself say anything about CDSE Sentinel Hub APIs, which is the provider-audit's domain. Worth one confirmation in the provider audit.) |

### 1.2 Competitor and adjacent-product map (current, 2025 to 2026)

Pricing: only figures I actually saw are given. "Not published" means the page I read did not state it.

#### A. Commercial: satellite construction / infrastructure monitoring

| Product | What it does | Price / access | Gap vs this product |
|---|---|---|---|
| **Imageryst** [P https://www.imageryst.com/construction-progress-monitoring/] | GIS-first satellite construction progress monitoring; automated change detection, progress KPIs, GIS-ready reports against original plans; standard imagery every ~5 days, premium near-daily, up to 30 cm via partners. | Subscription by product tier and monitored km2; free trial of its "Land Analysis Core" product; demo on request. Aimed at mid-size/large energy, utilities, engineering firms. No India presence mentioned on the page. | Enterprise, paid, sales-led, commercial imagery. Not self-serve for an individual, not free, no open-imagery honesty-about-gaps workflow. |
| **SkyWatch (EXPLORE)** [P https://skywatch.com/satellite-imagery-for-construction-monitoring/] | Aggregates 400+ providers (Planet, Airbus, Nearmap, BlackSky, others); recurring capture schedules; progress vs plan, earthworks, as-built documentation. | "No minimum contract spend"; prices not on the page. | Imagery marketplace, pay-per-image; no evidence-report/notes workbench; costs money. |
| **EOS / EOSDA LandViewer** [P https://eos.com/blog/construction-site-monitoring/; pricing S via search] | Web viewer combining commercial and free catalogues, down to 0.3 m, change detection, time series, tasking. | Search-result summary: free plan with limited functionality; Pro **$49.99/month** (full functionality for 10-100 m imagery, change detection, time series, downloads, alerts). [S, not verified on the pricing page]. | The nearest "analyst-grade" competitor with a free tier. Gaps: no polygon-confirmation + corridor workflow, no user notes / provenance export built for dispute use [I: not verified in their product]. |
| **Planet Insights Platform** (Sentinel Hub now part of Planet) [S via search snippets of https://support.planet.com/hc/en-us/articles/38144064507293] | Daily 3.7 m PlanetScope, Basemaps/Tiles APIs, Sentinel/Landsat; 30-day trial with 30,000 processing units. | Monitoring plan from **$2,700/year** (Tier Three) up to $9,650/year global (snippet; support page itself returned HTTP 403 to me). | API-first and enterprise-priced; Planet's Indian sales aim at government (it markets an India government white paper). Not an investigation workbench. |
| **LiveEO** [S https://letsdatascience.com/news/liveeo-raises-28m-to-expand-satellite-ai-monitoring-0fa6b590] | AI infrastructure monitoring for rail, power grids, pipelines (>1 million miles); raised EUR 28M first tranche in 2026. | Enterprise. | Operator-facing vegetation/encroachment risk, not citizen/auditor evidence of construction. |
| **Blackshark.ai** [S search] | Austria; AI extracts buildings/roads/land use from imagery at planet scale; SYNTH3D 3D globe; defence and urban-planning. | Enterprise/B2G. | Map/feature extraction, not dated-evidence workflow. (The task said "ESA initiatives, Blackshark"; I found no construction-progress product from them.) |
| **UP42** [S search] | Geospatial marketplace/dev platform (e.g. BlackSky tasking). | Pay per data/processing. | Plumbing, not an end-user product. |
| **ESA SaSCA / ESA construction call** [P, see M-01] | Feasibility study (basic = Sentinel; premium = commercial imagery) for >10 ha industrial/logistics sites; ESA call funds European firms only. | Not a product yet. | Not live; Europe-focused; >10 ha, BIM-linked. Validates the thesis and the open-data tier; does not occupy India. |

#### B. Indian private players

| Player | What it does (relevant) | Price / access | Gap |
|---|---|---|---|
| **SatSure** (Bengaluru) [P https://www.satsure.co/] | "Utilities and Critical Infrastructure" solution lists route optimisation for roads/rail/powerlines, ROW/vegetation management, construction monitoring in remote areas; products Skies and Sage. Part of Pixxel-led IN-SPACe national EO constellation consortium. [S https://www.pixxel.space/news/pixxel-led-consortium-with-partners-dhruva-space-piersight-and-satsure-wins-in-space-proposal-to-build-indias-national-eo-constellation] | "Request demo"; no public pricing. | B2B/B2G sales-led. Not self-serve; not an open evidence workbench for individuals. |
| **Pixxel** (Aurora) [S] | Hyperspectral satellites; Aurora platform; government solutions mention construction progress tracking; raised $100M Series C (Sept 2026); selected to lead India's EO constellation. | Enterprise. | Hyperspectral/data and platform company, not a citizen tool. |
| **GalaxEye** [S] | Mission **Drishti** launched 3 May 2026: OptoSAR (SAR + optical), 1.2 to 3.6 m, first of 8-12 satellites by 2029. | Data/analytics for commercial and strategic users. | Provides imagery, not an investigation workbench. (Also a naming constraint: Drishti is now a satellite mission name; see Part 2.) |
| **Suhora** [S] | Dual-use ISR analytics; exclusive Satellogic data and services rights for India and Nepal. | Enterprise/defence. | Defence-leaning; not self-serve. |
| **SkyServe** | I could not find a fetched page establishing a construction-monitoring product; treat as **not a direct competitor [UNVERIFIED]**. | n/a | n/a |
| **Vassar Labs** [S via https://assetlyhq.com/blog/satellite-ai-detect-land-encroachment-india-technology/, not primary] | Co-built Bhubaneswar Land Use Intelligence System (BLUIS) with ORSAC on Planet SkySat 50 cm imagery, monthly cadence. | Government contract. | Land-encroachment, not construction progress, and government-only. |

#### C. Indian government systems

| System | What it does | Access | Gap |
|---|---|---|---|
| **PMGSY: OMMAS + QMS + eMARG** [S, search summary of MoRD/PIB; PIB PDF unreadable] | OMMAS tracks physical/financial progress; quality monitors (NQM/SQM) upload inspections with geotagged photos via QMS app; eMARG for maintenance with geotagged photos. | Largely public dashboards; inspection data on government portals. | Ground photo at a point in time; no dated overhead baseline for any citizen to run. |
| **Bhuvan-PMGSY (NRSC)** [P https://bhuvan-app1.nrsc.gov.in/pmgsy/home/index.php] | Satellite-derived rural road length/connectivity database for roads sanctioned since 2000-01. | "For internal use by NRIDA and Authorised Person", login. | Exactly the satellite audit idea, but closed; confirms the idea works and that the public cannot access it. |
| **NIRDPR CGARD** [S] | Executed geo-spatial monitoring of rural roads; reported ~1.7 lakh km monitored (search summary; one-pager PDF unreadable to me). | Internal to MoRD. | Closed, programme-specific. |
| **PM Gati Shakti NMP (BISAG-N)** [S] | GIS platform; ministries can review cross-sector project progress; satellite imagery meant to give periodic on-ground progress. Bhuvan supports PRAGATI with 350+ projects. | Government users; the master plan portal login-gated. | Planning/review tool for ministries; not open to the public or private firms. |
| **NHAI Data Lake + mandatory drone video** [S https://www.drishtiias.com/daily-updates/daily-news-analysis/drone-survey-mandatory-for-all-national-highways-projects etc.] | Contractors upload monthly drone videos to the "Data Lake" portal; AI forecasts delays and disputes. | Government/contractor. | Contractor-supplied, so the evidence is controlled by the party being checked. Satellite evidence is the independent counterpart. This is the sharpest institutional argument for the product. |
| **CAG-BISAG-N MoU (26 Mar 2025)** [P] | Custom geospatial/AI tools for audit; training; case studies. | Internal to CAG. | Competes with, or could adopt, the product's method; do not pitch CAG first. |
| **GNIDA-NRSC, Defence Estates (62 cantonments, Cartosat-3)** [S] | AI change detection on high-res imagery for land/unauthorised construction. | Internal. | Same category: captive govt systems; shows the buyer type exists. |

#### D. Free tools (the real baseline for any user)

| Tool | What it does | Price / access | Gap vs this product |
|---|---|---|---|
| **Copernicus Browser** [P] | Sentinel-1/2/3/5P search; Timelapse (GIF/MP4); split and opacity compare; cloud-cover filter; statistics and measurement tools; open-source repo. | Free; account required; "Quotas & Limitations" page exists (not read). | No saved investigation, no confirmed site/corridor object, no notes, no provenance export or report. Hard for non-GIS users. **This is the true incumbent to beat.** |
| **EO Browser** [P] | Retired 20 Mar 2026 (see M-07). | n/a | n/a |
| **Google Earth Pro / Google Earth historical imagery** [S weak: search results from low-quality sites] | Time slider across historical frames. Reports claim India's historical imagery was removed in 2023 and restored only back to ~2009-2011. [UNVERIFIED, not from Google]. | Free. | Irregular frame dates, no cloud/quality stats, no export with provenance, visually very high-res in cities but patchy elsewhere. |
| **Google Earth Timelapse** [P partial: page confirms 2021-2022 frames added; full coverage and resolution not stated] | Annual animations. | Free. | Annual cadence, not useful for dated evidence. [Coverage after 2022 unverified.] |
| **Google Earth Engine** [S search of https://cloud.google.com/earth-engine/pricing] | Analysis platform; commercial plans Basic **$500/month**, Professional **$2,000/month**, Premium contact-sales; free for noncommercial/research and eligible news media. | See left. | Needs code; commercial use of Earth Engine from a startup is not free. (Do not build on it.) |
| **Bhuvan public** | Not examined in depth; Bhuvan hosts public layers and PMGSY geoportal for authorised users only. | Free/restricted | Not a workbench. |

### 1.3 Sharpest wedge

[I] after reading the above:

1. **Do not pitch "AI that detects fraud in government construction".** That is the original slide-3 framing, it is contradicted by prior art, it is a captive-government buyer (CAG, MoRD, NRSC, BISAG-N all building in-house), it needs defensible accuracy that the science audit says is unproven, and it carries defamation/political risk.
2. **Wedge = "a dated, honest, shareable evidence page for anyone who has to answer 'has anything actually been built there, and since when?'"**, built on free Sentinel imagery. The gap that all of the free and paid tools leave open is the **last mile from imagery to an argument**: confirmed boundary, dated observations with cloud/quality gaps shown, user notes, one exportable report. Copernicus Browser gives pictures; paid vendors give enterprise dashboards. Nobody I found gives a free, non-GIS-user, polygon-in / report-out flow.
3. **Why India:** government evidence (OMMAS photos, NHAI Data Lake drone videos) is produced or uploaded by contractors or the agency, while satellite evidence is the only neutral dated record; the PMGSY pilot (31% shorter than sanctioned) shows the concept finds real discrepancies; and the working government version is closed to the public (Bhuvan-PMGSY: "internal use ... Authorised Person").
4. **Honest scope that stays defensible:** 10 m Sentinel can show earthworks, cleared land, large roofs and widening corridors, not completion, quality or fraud (SaSCA's own article-level caveats say the same). Position as "evidence, not verdict" (matches PRD).

Recommended single-sentence positioning: **"Draw the site. See what changed from space, and when."**

### 1.4 Most reachable first users in India (testable next week)

All of this is [I]; none is a verified customer. Rank by "can get a real task in a week at zero cost".

1. **The team's own city and campus (Nagpur) [I]:** pick 3 live local projects (large roads/metro/expressway packages, a campus extension or private layout) and run them. Reach: the team's own civil-engineering classmates, professors and the college placement/alumni network; the owner's email domain is rbunagpur.in. Test: can a civil student build a before/after report in under 10 minutes without help?
2. **CSR impact-assessment consultants and CSR teams.** Fact [S https://samhita.org/impact-assessment-faqs]: since the 2021 CSR Rules amendment, companies with CSR obligation of INR 10 crore or more must commission **independent impact assessment** for projects of INR 1 crore or more, and may spend up to 5% (cap INR 50 lakh) on it. Slide 9 itself names CSR verification. These are small agencies and in-house teams with a recurring "did the school block / road / community hall get built, and when?" question and no GIS skill. Reach by LinkedIn/email to small Indian CSR consultancies.
3. **Social-audit and RTI communities:** MGNREGA Section 17 requires independent social audits at least every six months; Telangana's SSAAT is an established independent body (>9,125 public hearings over a decade) [S]. Also RTI activists and local journalists. They already ask "was the work done?" and lack overhead evidence; low willingness to pay but high credibility and legitimate evidence-sharing use. Risk: legal/political sensitivity; do not name officials.
4. **Independent engineers, lender-side monitors and small contractors** who must prove progress or dispute a claim; reachable through personal and college networks. Pays later if at all.
5. **RERA homebuyers and NRI plot buyers:** huge pain (delayed possession) but I found no satellite-based competitor; RERA portals give self-declared quarterly progress and trackers aggregate delays and complaints [S]. Residential towers are small (~1 to 2 pixels of 10 m Sentinel) so large townships, layouts, and plot developments only. Good for a later test, not week one.
6. **Do not start with:** CAG, NHAI, MoRD, NRSC (captive/in-house, procurement cycles of months), or commercial imagery vendors.

Week-one test design [I]: 5 users, each gives 1 real site; success = they say the report is something they would forward to someone else, and they can state what it changed (a decision or an argument), which tells you whether D2/D3 demand is real before building more.

---

## PART 2. NAME

### 2.1 Findings that shape naming

- **Verified domain method:** RDAP queries direct to the registry (Verisign for .com, NIXI for .in, Google Registry for .app, Identity Digital for .ai). HTTP **200 = registered**, **404 = not registered** (strong evidence of availability but not a guarantee: premium, reserved, or blocked names also return 404, and registrar pricing is unseen). Tested 2026-10-05; rdap.org rate-limited so I used the registries directly.
- **Near-every single Hindi dictionary word is already registered on .com and .in** (see table below: nazar, pakka, sach, sahi, netra, aaina, upar, dekha, khabri, drishya, naap, taak, parakh, baaz, drishti...). The owner should expect a **coined or compound name**, or a brand on .app/.ai first.
- **Avoid "Netra" and "Drishti" for different reasons:** "Netra" collides with the owner's own NidhiNetra project (see MEMORY.md: NidhiNetra), and "Drishti" is the name of GalaxEye's Mission Drishti (launched 3 May 2026) [S], also Drishti IAS (a very large Indian edtech brand, seen in search results) and drishti.com (registered 2000). "Chakshu" is a Government of India telecom-fraud reporting portal [I from memory; not re-verified today]; "Pramaan" is an e-Pramaan government authentication brand [I, not re-verified]; both are government-flavoured and domains are taken.
- **Eliminated after checking:** Polkhol (polkhol.in is a live Hindi-language news site with a "Pol Khol" expose section [P WebFetch]; also ABP News has a show named "Poll Khol" [S]). Khulasa (khulasa.com is a Hindi news portal [P]; app stores show Khulasa-named apps incl. "Khulasa First: News" [P iTunes API]). Both sit in the same "expose" space this product would claim; confusion risk is high.

### 2.2 Twenty-five candidates

Roots: Hindi / Urdu / Hinglish / slang. Domain codes: RDAP result for .com / .in / .app / .ai (T = taken, F = free/404).

| # | Name | Meaning | Vibe | .com/.in/.app/.ai |
|---|---|---|---|---|
| 1 | **Saboot** | evidence, proof ("saboot dikhao") | receipts culture, blunt | T/T/F/F |
| 2 | **Jhaank** | peek / glimpse | playful, light | F/F/F/F |
| 3 | **Kabse** | "since when?" | witty, time-based | T/F/F/F |
| 4 | **Cheel** | kite/hawk (bird of prey), also sounds like "chill" | sky-eye, cool | T/T/T/T |
| 5 | **Gawah** | witness | serious, neutral | T/T/F/F |
| 6 | **Dikhta** | "it is visible" (cf. "jo dikhta hai wo bikta hai") | cheeky | T/F/F/F |
| 7 | **PehleBaad** | before-after | literal, clear | F/F/F/F |
| 8 | **Khulasa** | revelation / expose | newsy | T/T/T/T (eliminated) |
| 9 | Polkhol | expose ("pol khol") | slangy | T/T/F/F (eliminated) |
| 10 | Nazar | gaze / evil eye | iconic, also superstition | T/T/T/T |
| 11 | Pakka | certain / for sure | Gen-Z "pakka?" | T/T/T/T |
| 12 | Tabse | "since then" | quiet pun | T/F/F/F |
| 13 | Dekha | "saw it" | casual | T/T/T/T |
| 14 | Upar | above | minimal, global-friendly | T/T/T/T |
| 15 | Aasmaan | sky | poetic | T/T/F/? (.ai 429 once) |
| 16 | Aaina | mirror | soft | T/T/T/T |
| 17 | Raseed | receipt | literal "receipts" | T/T/T/T |
| 18 | Chashm | eye (Urdu) | formal | T/T/F/T |
| 19 | Jaanch | investigation | official | T/T/T/F |
| 20 | Kaam Hua | "work done?" | wry, India-specific | F/F/F/F ("kaamhua") |
| 21 | Dikhado | "show it" | Gen-Z command | T/F/F/F |
| 22 | Nigrani | surveillance | heavy/ominous | T/T/T/F |
| 23 | Drishti | sight | taken in the space (see 2.1) | T/T/T/T |
| 24 | Sach | truth | strong, crowded | T/T/T/T |
| 25 | Netra | eye | collides with NidhiNetra | T/T/T/T |

Also verified free as longer coined forms: getsaboot / sabootai / sabootapp / usesaboot / getkabse / getjhaank (all four TLDs free), sabootly, sabootcam, nazarcam, jhaankcam, pehleab, kabsetak (all free). Registry-level note: saboot.co and saboot.io returned 404 via rdap.org only (indicative).

### 2.3 Deep check of the best eight

Method for existence checks: Apple App Store India search (iTunes Search API, country=IN, software), GitHub repository-name search (unauthenticated API), RDAP registration data for domains, and web searches. **Not done / blocked:** Google Play search (no usable API from this environment), IndiaMCA/Zauba/Tofler company-name search, Startup India DB, IP India trademark search (captcha-gated), WIPO/USPTO/EUIPO trademark databases (JS-driven, not fetchable). So "no hit" below means **no hit in what I could search**, and a trademark clearance (IP India classes 9, 35, 42 and Madrid for key markets) is still required before commitment. Web-search engine results for these coined words were weak (it returned unrelated "startup directory" pages), so absence is weak evidence.

| Name | Pronunciation / ease for global users | Domains (RDAP, 2026-10-05) | Existing uses found | Verdict |
|---|---|---|---|---|
| **Saboot** | "sah-BOOT", two syllables, 6 letters; easy for Hindi/Urdu speakers; English readers may hear "sabot/sabotage" (slight negative) | saboot.com registered 2006-12-22, expires 2026-12-22; saboot.in registered 2025-11-25 (to 2028; recent, possibly someone building); .app F; .ai F; getsaboot.* all free | App Store IN: 0 hits. GitHub: 21 repos by name, none notable (e.g. saboot-org/saboot, 0 stars). Could not open saboot.com/.in (connection failures). Web search: no company found. | Strong fit; need a domain workaround. Watch saboot.com (expiry in Dec 2026 does not mean it will drop; owners usually renew). Find out who holds saboot.in before deciding. |
| **Jhaank** | "jhaank" (aspirated "jh" then long "aa", hard "nk"); the JH is the biggest pronunciation hurdle globally; also spelled jhank / jhanki | **All four free** (.com .in .app .ai); getjhaank free | App Store IN: 0. GitHub: 10 repos by name, all personal/"jhaankit"/"jhaankur" user-name style; no product. Web search: none (nearby: JhaJi pickles, "Jhink" accelerator, unrelated). | Cleanest availability. Weaker semantics (peek = surveillance/snooping connotation possible, does not say proof). |
| **Kabse** | "KUB-seh"; easy; needs a one-line explanation outside Hindi | kabse.com registered 2004-01-16 to 2027-01-16 (T); .in/.app/.ai **free**; getkabse free | App Store IN: no relevant hit (KingKabs, Kabs4Kids etc., unrelated). Web search: none. | Distinct, memorable and ties to the timeline feature ("Kabse? Since when was this being built?"). Loses .com. |
| **Cheel** | "cheel" (looks like "chill"); easy | All four taken: cheel.com 2005, cheel.in 2015, cheel.app 2022 (expires 2026-12-12), cheel.ai 2025-09-20 | App Store IN: CheelPizza, "Cheelee Wallet" (different spellings/products); GitHub: 190 repos (e.g. cheelang, 9 stars). cheel.in returned a 200 with an empty page. | Best imagery (kite/hawk = god's-eye), but no domain; skip unless acquiring. |
| **Gawah** | "gah-WAH"; easy | gawah.com 2016, gawah.in 2020 (T/T); .app/.ai free | App Store IN: 0. GitHub: 29 repos, one org "Gawah" (MangoPeel, 47 stars). Could not open gawah.com. | Good meaning ("witness"), reads courtroom/formal, less Gen-Z. |
| **Dikhta** | "DIKH-ta"; ok | dikhta.com T; .in/.app/.ai free | App Store IN: 0. GitHub: only student repos from a coding-course meme ("Jo-Dikhta-Hai-Vo-Bikta-Hai", "what's visible sells"). | Cheeky, meme-linked ("what shows, sells"), may feel marketing-gimmicky for evidence. |
| **PehleBaad** | "PEH-leh BAAD"; clunky for non-Hindi speakers | **All four free** | App Store IN: 0. GitHub: 0. | Descriptive, safe, but long and not memorable. |
| **Tabse** | "TUB-seh" | tabse.com 2009 T; .in/.app/.ai free | Search: no hit. | Quiet pun; weaker than Kabse. |

Eliminated from the top eight due to findings: Polkhol, Khulasa (live Hindi news brands), Nazar/Pakka/Dekha/Sach/etc. (everything taken, too generic).

### 2.4 Ranking: top three

**1. Saboot.** Strongest idea-to-product fit: "saboot" is the single Hindi/Urdu word for proof/evidence, directly the "receipts" energy Indian Gen-Z uses ("saboot kahan hai?"), short enough to say, and no product or app found under it in my searches. Pair with a tagline like "Saboot, from above." Brand-able even without the .com (getsaboot.com, sabootapp.com, saboot.app, saboot.ai free; the .app/.ai suit a web product). **Condition:** identify the owner of saboot.in (registered 25 Nov 2025) and saboot.com; if either is an active software/evidence company, drop to #2.

**2. Kabse.** "Since when?" is the exact question the timeline answers, it is witty, Hinglish-native and memorable, short and unambiguous in spelling, and it does not carry sabotage or surveillance connotations. Free .in/.app/.ai; .com taken (2004). Weakness: less obvious meaning to non-Hindi readers, so it needs the tagline "Kabse? A dated look from space."

**3. Jhaank.** Cleanest domain picture (all four free) and no conflicts found, fun, Gen-Z. Weakness: the "jh"/"aa" pronunciation for global users, and "peek" is not "proof" (could read as snooping).

Strongest argument **against** my #1: "Saboot" sounds adversarial (it implies there is a lie to disprove), which clashes with the PRD's careful position of "evidence, not verdict", and the unclaimed domain space is thinner than Jhaank's. Steelman for Jhaank: zero conflicts and zero domain compromises matter more than semantic perfection for a ₹0 launch, because a name can be explained in a tagline but a lost .com cannot be fixed later. If the owner agrees with that priority order, choose Jhaank, otherwise Saboot.

Decision rule: (1) buy `saboot.app` + `saboot.in` only after finding the current saboot.in holder; (2) otherwise buy `kabse.app` + `kabse.in` + `kabse.ai`; (3) run an IP India (classes 9, 42, 35) trademark search by hand before the logo or domain money is spent.

---

## Appendix: sources accessed (2026-10-05)

Fetched and read: ESA call https://business.esa.int/funding/call-for-proposals-non-competitive/space-for-construction-monitoring; ESA SaSCA https://business.esa.int/projects/sasca; newspaceeconomy.ca article (3 Oct 2026) https://newspaceeconomy.ca/2026/10/03/can-satellite-construction-monitoring-make-project-progress-easier-to-verify/; Imageryst https://www.imageryst.com/construction-progress-monitoring/; SkyWatch https://skywatch.com/satellite-imagery-for-construction-monitoring/; EOS https://eos.com/blog/construction-site-monitoring/; SatSure https://www.satsure.co/; Copernicus Browser docs and repo (links above); Planet EO Browser sunset notice; Bhuvan-PMGSY https://bhuvan-app1.nrsc.gov.in/pmgsy/home/index.php; CAG-BISAG-N https://gisresources.com/cag-bisag-n-collaboration-to-enhance-remote-sensing-in-audits/; Google Earth Timelapse https://earthengine.google.com/timelapse/; Earth Engine commercial page https://earthengine.google.com/commercial/ (no prices); polkhol.in and khulasa.com homepages; RDAP endpoints (https://rdap.verisign.com/com/v1/, https://rdap.nixiregistry.in/rdap/, https://pubapi.registry.google/rdap/, https://rdap.identitydigital.services/rdap/); iTunes Search API; GitHub search API.

Blocked or unreadable: YourStory 2016 PMGSY article (Cloudflare 403), ScienceDirect article (403), Planet support pricing page (403), PIB PDFs and NIRDPR CGARD one-pager (unreadable PDFs), saboot.com / cheel.com / gawah.com (connection errors), Sentinel Hub pricing page (redirect only), Google Play search.

Search-result-only claims (not independently opened) are tagged [S] in the text.

---

## PART 3. Geography names (round 2)

Brief from owner (via coordinator): round 1 rejected because the words did not relate to geography; frontend is a 3D god's-eye globe with live satellites and before/after imagery. Need Gen-Z Indian names with GEOGRAPHY / MAP / EARTH / ORBIT / SATELLITE / SKY-VIEW roots.

Method unchanged: RDAP directly against the registries on 2026-10-05 (200 = registered, 404 = not registered; 404 is strong but not conclusive evidence of availability, since premium or reserved names also return 404); Apple App Store India search (iTunes API), GitHub name search, web search, registration dates for taken domains. Still **not** done (blocked or captcha-gated): IP India / WIPO / USPTO trademark databases, Google Play, MCA company-name search. A trademark clearance remains mandatory before spend. Tags: [P] checked today, [S] search-result only, [I] my knowledge/inference, not re-verified today.

### 3.1 What the checks showed

- **Single Hindi/Urdu geography words are all taken on all four TLDs**, with one exception pattern: they die as .com/.in/.app/.ai together (naksha, bhugol, kaksha, dharti, bhoomi, bhoo, gola, vyom, falak, dunya, duniya, antariksh, sitara, taara, ambar, afaq, arsh, zamin, jahan, gol, nuqta, mulk, vasudha, latlong, latlon, numa all 200 on every TLD). Dharti, Bhoomi, Antariksh are therefore dead as standalone brands even before clash checks.
- **Compound / suffix coinages are the only open space.** Fully free on all four TLDs: upgrahi, orbitwala, orbitwalla, nabhnazar, gagannazar, bhoonazar, hawainazar, dishanuma, nazarnuma, nakshanuma, zaminnuma, nakshabaaz, farsharsh, akshdesh, bhoogola, bhoogolia, dharatalai, upgrahai, aasmanwala, earthwala, dunyawala, kshitijai, kaamhua.
- **Seeds eliminated by a verified clash:**
  - **Naksha** [P]: NAKSHA is the Government's urban land-survey programme (National geospatial Knowledge-based land Survey of urban Habitations, under DILRMP, Dept of Land Resources with Survey of India; pilot launched 18 Feb 2025 in Thanjavur; 157 urban local bodies in 27 states and 3 UTs). Also: Survey of India "Nakshe" portal; "Smart Bhumi Naksha" iOS app by the Ministry of Land (App Store IN); Delhivery "Naksha LLM" address-intelligence product [S]; HERE Maps "heremaps/naksha" GitHub repo (10 stars) [P]; GitHub name search returns ~1,300 repos. Domains: naksha.com registered 2001, naksha.ai 2021, naksha.app 2023. Dead on both domain and clash grounds.
  - **Bhoogol / Bhugol** [P/S]: BHUGOL GIS Pvt Ltd (Mumbai; GRAM++ geospatial tool from IIT Bombay research) is an existing Indian geospatial company [S, geospatialworld profile]. bhoogol.com (2000), bhoogol.in (2022), bhoogol.ai (2025-08-26) are all registered; only .app is free. The owner's example "Bhoogol.ai" is already taken.
  - **Bhuvan** (ISRO/NRSC portal), **Bhoomi** (Karnataka land records), **Prithvi** (missile; Prithvi-EO): clashes already stated by owner; I did not re-verify. Domains for bhoomi are all registered.
  - **Gagan** [I]: GAGAN is the ISRO/AAI satellite-based GPS augmentation system; gagan.com/.in/.app/.ai all registered (RDAP). Treat as clash.
  - **Kaksha** [I]: besides "orbit", Hindi *kaksha* means "classroom/grade" ("kaksha 10"), so it reads as edtech; all four TLDs taken.
  - **Kshitij** [I]: very common first name and the name of IIT Kharagpur's annual tech fest; .com/.in/.ai taken; confusing.
  - **Disha / Dishaa**: very generic (many Indian brands; Disha Experts publishers [I]); dishaa.com, .in, .ai taken.
  - **Akshansh, Dharatal, Khagol, Parikrama, Chakkar, Ilaka**: .com and .in taken in every case. *Chakkar* also means "romantic affair" in slang. *Akshansh* works as a word but is heavy for global users.
- **Plain-word search in the App Store IN for the winners returned zero hits** (see table), which is encouraging but weak evidence given the search method.

### 3.2 Twenty-five new candidates

Domain columns are RDAP results: T = registered, F = not registered. Order is .com / .in / .app / .ai.

| # | Name | Root and meaning | Vibe | .com/.in/.app/.ai |
|---|---|---|---|---|
| 1 | **Jahannuma** | jahan (world) + numa ("showing", as in qutubnuma = compass): "that which shows the world" | grand, poetic, old-map feel | T/F/F/F |
| 2 | **OrbitWala** | English orbit + Hinglish -wala ("the orbit guy") | playful, street-Hinglish | F/F/F/F |
| 3 | **Dishanuma** | disha (direction) + numa: compass, "shows direction" | friendly, navigational | F/F/F/F |
| 4 | **Upgrahi** | upgrah (satellite) + Gen-Z "-i" | quirky, techy | F/F/F/F |
| 5 | **Nabhnazar** | nabh (sky) + nazar (gaze): sky-sight | poetic, sky-eye | F/F/F/F |
| 6 | **Deshantar** | Hindi for "longitude"; also "another country" | heavy, formal | T/F/F/F |
| 7 | **FarshArsh** | Urdu "farsh o arsh": earth to sky, floor to heaven | lyrical, earth-to-sky zoom | F/F/F/F |
| 8 | **Nakshabaaz** | naksha (map) + -baaz ("map-guy", as jugaadbaaz) | cheeky | F/F/F/F |
| 9 | Naksha | map | too obvious, government clash | T/T/T/T |
| 10 | Nakshaa | Gen-Z spelling of naksha | still reads as Naksha | T/T/F/T |
| 11 | Bhoogol | geography | clash with Bhugol GIS | T/T/F/T |
| 12 | Bhoogola | bhoogol + gola (globe/ball) | fun, but "gola" is also ice-candy slang | F/F/F/F |
| 13 | Upgrah | satellite | taken on .com (2021, to 2026-11-18) | T/F/F/F |
| 14 | Kaksha | orbit / classroom | classroom confusion | T/T/T/T |
| 15 | Akshansh | latitude | stiff | T/T/F/F |
| 16 | Kshitij | horizon | very common name | T/T/F/T |
| 17 | Dharti | earth | taken | T/T/T/T |
| 18 | Bhoomi | earth | Karnataka govt system | T/T/T/T |
| 19 | Antariksh | space | taken, generic | T/T/T/T |
| 20 | Nabh | sky | taken | T/T/T/F |
| 21 | Zaminnuma | zamin (land) + numa: "shows the land" | neat, but zameen = real estate | F/F/F/F |
| 22 | Hawainazar | hawai (aerial) + nazar | clumsy | F/F/F/F |
| 23 | Nazarnuma | "gaze-showing" | clear but long | F/F/F/F |
| 24 | Parikrama | orbit / circumambulation | rock-band and many others | T/T/T/F |
| 25 | Ufaq | Urdu: horizon | "FAQ" sound hurts | T/F/T/F |

Also tested: Dharatal (T/T/F/F), Khagol (T/T/F/F), Chakkar (T/T/F/F), Ilaka (T/T/F/T), Latlong (T on all four), Gola (T on all four), Mauqa (T/T/T/F), Nuqta (T on all four; App Store has "Nuqta Ltd", "Nuqta AI" and others), Kaksh (T/T/F/F).

### 3.3 Deep check of the best eight

| Name | Pronunciation / ease for global users | Domains (RDAP, 2026-10-05) | Clash checks | Verdict |
|---|---|---|---|---|
| **Jahannuma** | "jah-HAAN-noo-mah", 4 syllables; non-Hindi readers may drop one "n"; spelling variants (jahanuma, jahan numa) will leak traffic | jahannuma.com registered 2025-06-20 to 2027-06-20 and shows a "Launching Soon" page with no stated purpose [P WebFetch]; **.in / .app / .ai free** | App Store IN: 0 hits. GitHub: 2 repos, 0 stars each (cod-vista/jahannuma, lfgraphics/jahannuma). Web search: no company found. A *Jahan Numa Palace* hotel in Bhopal exists [I, from memory, not re-verified], so hospitality search noise possible. | Best meaning fit ("shows the world" is exactly the globe frontend). Unknown who is behind the .com. |
| **OrbitWala** | "OR-bit-wah-la"; trivial for English speakers and for Hindi speakers; 3 syllables | **All four free** (also orbitwalla all four free) | App Store IN: 0. GitHub: 0. Web search: no product. "Orbit" itself is a very crowded English word (not searched); the compound is distinctive but the root is generic. | Easiest globally and cleanest domains. Weak on "geography"; strongest on the orbit/satellite seed. |
| **Dishanuma** | "dee-shah-NOO-mah"; easy once read | **All four free** | App Store IN: 0. GitHub: 0. Web search: no hit. | Clean. "Compass" = navigation, a bit off the Earth-imagery story. |
| **Upgrahi** | "oop-GRAH-hee"; the "grah" cluster and "upgrah" are unfamiliar outside Hindi; may look like "upgrade" | **All four free**; upgrah.com is registered (2021-11-18, expires 2026-11-18) [P], so the root word is held but the "i" form is open | App Store IN: 0. GitHub: 0 for upgrahi; "upgrah" only student repos. Web search: no hit. upgrah.com could not be opened. | Clean and satellite-specific, but the least friendly pronunciation. |
| **Nabhnazar** | "nubh-NUZ-ur"; "nabh" is a formal/Sanskritic word that Gen-Z uses little | **All four free**; (gagannazar and bhoonazar also free) | App Store IN: 0. GitHub: 0. Web search: no hit. | Poetic and literal ("sky gaze"); does not feel Gen-Z. |
| **Deshantar** | "deh-SHAAN-tar" | deshantar.com registered 2024-03-22 and looks parked [P WebFetch]; .in / .app / .ai free | App Store IN: 0. GitHub: org "Deshantar" with a "FestivalApp" and web-site repos (0 stars), apparently unrelated hobby projects. | Accurate (longitude) and "foreign country" double meaning, but heavy and formal; .com taken. |
| **FarshArsh** | "FARSH-ARSH": tongue-twister rhyme; "farsh" can read as "harsh" to English eyes; Persian origin (idiom "farsh se arsh tak", from earth to sky, confirmed by a Rekhta-style dictionary search result [S]) | **All four free** | App Store IN: 0. GitHub: 0. A rug shop in Tehran is called "Farsh Arsh" [S]; "farsh" also means floor/carpet. | The best *story* (zooming from ground to sky is the product), the hardest to say cleanly. |
| **Nakshabaaz** | "NUK-shah-baaz"; fun and clear | **All four free** | App Store IN: 0. GitHub: 1 repo "digital-registry-nakshabaaz" (0 stars). Inherits the Naksha government and Survey of India associations (NAKSHA programme, Nakshe portal). | Fun, but "naksha" is the very word with the clash baggage, and "-baaz" is informal for a product people may forward to officials. |

### 3.4 Ranking: top four

1. **Jahannuma** ("that which shows the world"). The only candidate whose literal meaning is the product: a view of the world. Distinctive, no product found under it, .in/.app/.ai free. *Costs:* four syllables, spelling variants, and an unknown holder of the .com (registered June 2025, "Launching Soon"). Find out whose it is before committing; if it is a software or maps company, drop to #2.
2. **OrbitWala.** Easiest to say and the cleanest domain picture (all four free). Covers the orbit/satellite seed and has the Hinglish Gen-Z "-wala" pattern. *Costs:* "orbit" is a crowded English root, and the name says nothing about maps or Earth.
3. **Dishanuma.** All four free, no clash found, short enough, reads as Hindi-Urdu without being heavy, and "shows the way" fits a navigable globe. *Costs:* compass meaning is adjacent to, not on, the imagery story.
4. **Upgrahi.** The most satellite-specific, all four free, a genuinely Gen-Z-style twist on *upgrah*. *Costs:* pronunciation for global users and the "upgrade" misreading.

Runners-up: FarshArsh (best story, worst to say), Nabhnazar, Deshantar.

**Strongest argument against my #1 (Jahannuma):** a founder will say this name aloud hundreds of times; a four-syllable name that half of listeners will misspell loses to a three-syllable one that spells itself. OrbitWala spells itself and has no ownership questions. If the owner values everyday say-ability and the full domain set over meaning, take OrbitWala; there is no way to fix pronunciation friction later.

**Next steps:** (1) look up who holds jahannuma.com; (2) manual IP India search (classes 9, 35, 42) for Jahannuma, OrbitWala, Dishanuma, Upgrahi; (3) re-run the RDAP check on the day of purchase; (4) all compound domains here are untouched at registrar prices, which are unseen.
