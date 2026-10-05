# GeoVerify product requirements

Date: 1 October 2026. Version: 0.1. Status: DRAFT FOR REVIEW.

The user selected **B+C: managed imagery processing plus an evidence workbench**. That route is confirmed; the detailed policies below are proposals. No software, customer validation, imagery experiment, accuracy result, or deployment is represented as complete.

## 1. Product promise

A user supplies a location, confirms a site or road corridor, and chooses periods. GeoVerify prepares dated satellite observations, a before/after view, and a timeline. The user can inspect the evidence, identify visible changes, record observations, and export a report with its sources and limitations.

The product helps investigate construction-related surface change. The first public pilot provides inspectable evidence and clearly attributed user observations. Automatic construction attribution and physical measurements need separate validation. Contract acceptance, expenditure, structural safety, interiors, underground work, opening for use, and abandonment cannot be concluded from a visible footprint alone.

The original government-project workflow becomes an optional supplied-claim layer. A private user does not need a sanctioned budget or government record to run a comparison.

## 2. Confirmed scope and proposed wedge

| Item | Standing |
|---|---|
| Commercial product, free customer launch | Confirmed D1 |
| Private organisations and individuals can use location/time comparisons | Confirmed initial request |
| Large buildings/sites and roads/highway corridors | Both required, D4 |
| Before/after comparison and multi-date timeline | Both required, D5 |
| Free/open imagery; resolution may vary | Confirmed D6; no paid-imagery fallback |
| First usable version in one month; ₹0 initially; paid hosting later when needed | Confirmed D8; exact start, team and later spending cap unknown |
| Managed processing plus evidence review | Confirmed D9 |
| Optional supplied-claim check if useful | Conditional delegation, D5 |
| India-first with selected-region validation | Planning assumption A-001; worldwide roadmap |

The proposed wedge is one repeatable workflow: **inspect a dated evidence report for a large site or road corridor and decide whether a closer inspection is warranted**. Candidate users include site owners, civil engineers, project-monitoring teams and land investigators. They are hypotheses; none is an identified customer. Demand is “not validated yet”, and there is “No reachable tester yet”. Their actual status quo and error costs remain unknown.

The first release target is a **bounded live public pilot**, accessible through a browser. Users submit their own locations and periods. Precomputed examples are labelled demonstrations and do not satisfy live processing. Accounts protect private reports and scarce compute; there is no organisation-wide collaboration or guaranteed analyst service in month one.

## 3. User journey

1. Open the site. Understand that it compares visible evidence; choose a labelled example or start a new investigation.
2. Sign in to submit a live request and retain private results during the stated retention period.
3. Enter latitude/longitude in separate labelled fields. Confirm the map location. Select **site** or **road**.
4. Draw/adjust a site polygon, or a road centreline with a confirmed corridor width. Show the selected boundary, dimensions and area before submission. A point locates the map but does not define a project footprint.
5. Select before/after periods and a timeline range. Preview their canonical windows: two distinct ordered comparison windows, with every distinct requested window counted within the same twelve-window limit. Display admission limits, missing-data possibilities, retention durations/start rule and queue status before starting. An unavailable chosen window stays a gap; substitution requires an explicit user choice.
6. Submit. Receive a durable request ID and status. Leaving the page does not cancel a provider job. The interface explains whether processing is queued, running, awaiting result collection, ready, partial, or unsuccessful.
7. Inspect the before/after view and timeline. Each observation shows its actual acquisition date or support period, source and resolution. Gaps and rejected observations remain visible.
8. Add notes or markers anchored to a specific observation/interval. Record what is visibly supported and what is uncertain. If a claim was supplied, compare its observable criterion with the evidence.
9. Download the evidence report/provenance before expiry, or delete the investigation. The report keeps automated outputs, user interpretation and the supplied claim distinguishable.

## 4. Functional requirements and acceptance

| ID | Required behaviour | Reviewable acceptance evidence |
|---|---|---|
| P-01 Location and geometry | Accept WGS84 coordinates, confirmed site polygon or road corridor; reject malformed/out-of-range geometry | Wrong coordinate order/range and invalid polygons produce a correction; accepted geometry is displayed and retained |
| P-02 Two asset classes | Both site and road inputs use the live workflow | One newly submitted case per asset reaches a report; unsupported dimensions return a reason without inventing an outcome |
| P-03 Period semantics | Use canonical date windows; two distinct ordered comparison selectors refer to those bins; all distinct windows count toward the same cap | Report and screen agree on dates, windows and selection; a missing bin remains a gap until the user chooses another; no silent widening |
| P-04 Before/after | Display comparable georeferenced observations, an accessible side-by-side alternative and optional swipe | Both views use the same extent; quality/missing-data states cannot appear as an ordinary unchanged image |
| P-05 Timeline | Display up to the admitted number of windows with their evidence and gaps | Missing intervals remain gaps; no synthetic image or interpolated completion percentage is presented as an observation |
| P-06 Evidence provenance | Retain source identifiers, method/version, dates, resolution, masks/quality and coverage | Exported manifest identifies every displayed observation and distinguishes composite support from a single date |
| P-07 Explicit review | User can add/edit dated notes and simple observation markers | Notes have author, creation/revision time and linked evidence; they are labelled user observations |
| P-08 Optional claim | User may enter a claim, date and observable criterion | Comparison works without a claim; claim text is not reused as ground truth or a system-certified outcome |
| P-09 Private retrieval | User can reopen their retained investigation; new authorisation checks deny unrelated users | Cross-user API/object authorisation and expired links fail; previously issued short-lived download links have the disclosed capability lifetime; restart does not discard durable request/results |
| P-10 Export | Provide a sanitized downloadable report and provenance JSON; browser printing supports PDF | An offline saved report contains the selected evidence images and dates, not just expiring provider URLs; print excludes controls |
| P-11 Stop and delete | Support cancellation with disclosed provider status and deletion/retention controls | No automatic paid resubmission; delete immediately blocks new app access, while issued-link revocation/object purge and provider/backup cleanup are tracked separately |
| P-12 Bounded service | Enforce service/account/user resource limits before work starts | Oversized input, duplicate submission, queue saturation and depleted allowance return distinct actionable states |
| P-13 Honest outputs | A comparison can be partial/inconclusive; automation states its method and evidence boundary | No-data/cloud/unsupported cases do not become “not constructed”; no default completion/fraud/abandonment verdict |

## 5. Result language and review policy

| Layer | Initial behaviour | Gate for stronger output |
|---|---|---|
| Source evidence | Dated images, site boundary, resolution and data-quality/gap information | Reproducible provider output and provenance checks |
| Automated generic surface-change overlay | Disabled publicly until quality and held-out exploratory checks pass; then clearly labelled experimental with method/version | Separate coverage, false-alarm/miss and confounder evaluation; never described as a construction mask solely because change is found |
| User interpretation | “Visible change observed”, “No clear visible change observed” or “Not enough evidence”, plus the user's explanation | These are user-authored observations; no correctness guarantee or independent-reference status |
| Automatic construction attribution | Not enabled at first launch | Independent construction/confounder labels and an agreed claim-specific release policy |
| Physical construction area/road length | Not promised at first launch | Independent geometry references, stated tolerances and per-asset measurement errors |
| Supplied claim | Text and dates beside the evidence, with user review of observable criteria | An automatic claim assessment would require validated milestone semantics and explicit uncertainty |

“No clear visible change” does not prove that no work occurred. Interior work, small/narrow features and gaps may be unresolved. A timeline reports observations; any onset interval uses the last usable absence and first usable presence and does not assign an exact event date without evidence. A claim that a road was completed can be decomposed into observable paving and non-observable acceptance/opening criteria rather than given a single definitive label.

## 6. Proposed pilot policies

These are **operational starting bounds for review and runtime testing**, not established sensor sensitivity or supported object sizes. If probes fail, lower admission limits transparently or hold live launch; do not silently omit roads or the timeline.

| Resource | Proposed initial bound/policy |
|---|---|
| Site geometry | At most 1 km² selected area |
| Road geometry | At most 10 km centreline, 200 m full corridor width and 2 km² selected area; process bounded sections |
| Time request | At most 12 windows spanning at most 24 months; monthly defaults fit a 12-month range; longer ranges require visible coarser/sparser windows |
| Provider concurrency | One active job for the application account initially; actual provider allowance may be lower or impose other limits |
| Per-user consumption | One active investigation and at most two admitted analyses/day initially; lower shared credit/storage bounds take precedence. These are resource policies, not proven capacity |
| Accepted waiting/active records | At most twenty nonterminal analyses application-wide initially, including quota-blocked and unresolved provider work. A full queue returns a limit before accepting new intent; probes may lower this cap |
| Repeat monitoring | User-initiated comparisons only; scheduled monitoring is a later demand-driven feature |
| Retention | Proposed image/result access: 7 days and manifest/annotation access: 30 days from first durable report publication. Preview durations/start rule before submit; exact deadlines appear at publication; minimal cleanup IDs may remain until resolved |
| Privacy | Private investigations; no default public map, public report link or location sharing |

A broad source coverage map is not a performance map. The pilot distinguishes whether a request is geographically admitted, whether usable imagery exists, and whether an interpretation is validated for that setting. The India-first assumption does not imply nationwide accuracy. Free imagery of adequate detail cannot be guaranteed for arbitrary places/dates.

## 7. Quality, accessibility and service requirements

Input validation and quota admission happen server-side as well as in the browser. Account-owned resources use access checks. Provider credentials and storage service keys never reach the browser or reports. User text is treated as data, including report exports. Locations and claim text are omitted from ordinary analytics/log messages; diagnostic records use request IDs.

The map has coordinate fields and a clear textual summary of the selected extent. Date inputs use native controls. Image comparison and the timeline have keyboard-operable controls, labelled statuses and a side-by-side fallback. Colour alone does not communicate validity or change. The interface exposes empty, loading, partial, failure, expired and quota-blocked states.

No response-time SLA or numerical accuracy is promised before measuring representative requests. Record queue time, provider runtime, collection latency, bytes, storage and allowance consumption separately. On a sleeping thin backend, provider work may continue while result collection waits for service recovery; the user sees that state. A live release needs a proven result-collection/reconciliation arrangement within provider expiry. It may require paid always-on hosting before traffic grows.

## 8. Release and commercial decisions

A public evidence workbench may launch only after both asset workflows, before/after/timeline, privacy, provenance, quality rejection, quota protection, recovery and retained-result/export tests pass. It may remain useful without an automatic construction verdict. An internal-only experiment or static demo is recorded honestly as an interim deliverable, not completion of the live-product requirement.

Automatic conclusions have their own validation gates in [CHECKPOINTS.md](CHECKPOINTS.md). Customer usefulness is another gate: no benchmark substitutes for observing a real user interpret a report. If no tester is found, the release remains an unvalidated pilot and broad commercial claims stay on hold.

Initial customer price is zero. Later pricing is undecided. Measure marginal provider credits, application compute, retained bytes/egress and support/review time. Candidate paid offers could involve repeated portfolio investigations, longer history, or optional analyst review, but none is month-one scope or a validated buying preference. Keep a cost/allowance boundary before accepting a free job; no automatic charge or unapproved subscription is part of this plan.

## 9. Explicit exclusions and expansion gates

Month one excludes individual-house promises, guaranteed exact-date imagery, contractual completion/fraud/abandonment certification, expenditure estimation, automated precise road or built-area measurement, paid imagery, model ensembles/training by default, portfolio administration, scheduled alerts, mobile apps and guaranteed analyst labour.

Add each when there is demonstrated user demand plus the needed evidence/operational support. Scale by measured jobs, area, dates, credits and storage; improve a model only when it beats a measured baseline on the relevant errors. The selected B+C route does not assume microservices or a GPU fleet.

## 10. Open evidence and review decisions

The detailed provider/host stack and pilot policies need review. Account-specific commercial access and shared application credentials/credits need verification; reference evidence and an independent evaluator need sourcing; available team/hardware and a later hosting cap need declaration before committing dates or costs. The first actual user and their decision remain unidentified.

The [design record](DESIGN.md) summarizes the decisions, [TRD.md](TRD.md) specifies the pipeline/stack and recovery contracts, and [CHECKPOINTS.md](CHECKPOINTS.md) supplies the four-week work and release gates. [LOGBOOK.md](LOGBOOK.md) preserves user answers; [KNOWLEDGE_DUMP.md](KNOWLEDGE_DUMP.md) holds research and source corrections.
