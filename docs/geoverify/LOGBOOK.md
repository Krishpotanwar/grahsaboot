# GeoVerify logbook

## 2026-10-01 — Discovery opened

### Request

Expand a satellite-based government construction verification idea into a service usable by private organisations and individuals. Users should enter coordinates and time information and compare a site. The user requested cross-questioning with office-hours and brainstorming, a working explanation, pipeline and stack, PRD, TRD, checkpoints, logbook, and a shared knowledge dump.

### Completed

- Read the office-hours and brainstorming instructions; classified this as architectural planning.
- Inspected the task folder and its Git context. No GeoVerify code exists here.
- Read the supplied Word document and all ten presentation slides; visually inspected the embedded process and progress-curve diagrams.
- Preserved both originals under `sources/`, checked copied files against source SHA-256 hashes, and saved a searchable text extraction.
- Researched native Sentinel-2 resolution, observation limits, commercial data access, hosted processing costs and quotas, and the proposed dataset/metric definitions using primary sources.
- Started the source-claim review and knowledge dump.
- Asked D1 and recorded the user's answer below.
- Asked D2 and recorded unvalidated demand.
- Asked D3 and recorded that no tester is currently reachable.
- Recorded D4: both large buildings/sites and roads/highway corridors are requested for the first version.
- Recorded D5: before/after comparison and timeline are required; claim checking is conditionally allowed if useful to frontend users.
- Explained claim checking with a supplied road-completion claim.
- Recorded D6: free/open imagery is required; 10 m is not a fixed resolution requirement.
- Asked D7 about geographic scope. The user then said “continue” without selecting an option.
- Continued with India-first as an explicit planning assumption, while keeping worldwide expansion in the roadmap.
- Asked D8 about the deadline and monthly processing/hosting budget.
- Checked direct open-data catalogue/COG access and began comparing approaches and evaluation requirements.
- Recorded D8: a one-month target, ₹0 initially, and a later paid-hosting path when free options no longer fit.
- Prepared three concrete approaches in `APPROACHES.md` and an independent validation proposal in the knowledge dump.
- Checked current free-host limits and recorded a distinct local/static-demo profile versus the intended live public-query service. No deployment or capacity measurement occurred.

### Questions and answers

**D1 — What should the first version achieve?**

User answer, verbatim: “A commercial product(free until we scale it)”

Interpretation: commercial product ambition with a free launch phase. This does not establish a paying customer, validate demand, specify the eventual price, or mean that hosted processing is free. It also does not automatically establish eligibility for noncommercial Earth Engine access.

**D2 — What evidence shows someone needs this?**

Question sent: “What is the strongest evidence you have that someone needs this? Describe one actual person or organisation: how they check construction today, and what problem they want solved. If you haven’t spoken to a potential user yet, say ‘not validated yet’; we’ll record that honestly and design a focused pilot.”

User answer, verbatim: “not validated yet”.

Interpretation: demand remains a hypothesis. No customer interviews, buying intent, or existing deployment have been established. The pilot needs to test usefulness to a real user as well as detection performance.

**D3 — Who could test the first version with real sites?**

Question sent: “Who could you realistically get to test the first version with real sites? My provisional recommendation is an owner or engineer overseeing a large construction site, because a larger visible footprint gives us a better starting point for testing 10 m imagery. Choose the group you can actually reach, or describe a specific tester.”

Suggested responses: private developer/site owner/civil engineer; CSR/NGO project team; individual landowner; no reachable tester yet. Free-text responses are also welcome.

User answer, verbatim: “No reachable tester yet”.

Interpretation: there is no available customer tester at present. This does not prevent technical feasibility work on independently documented sites, but such work would not validate customer usefulness or willingness to pay. No customer segment has been selected.

**D4 — Which construction type should the first version focus on?**

Options: large buildings/sites such as warehouses, factories, or campuses; roads/highway corridors; individual houses/small plots.

Provisional recommendation: large buildings/sites, because visible footprints spanning more pixels are a more promising starting point for a 10 m feasibility test. This is a recommendation to evaluate, not a guaranteed detectability threshold. Site dimensions, imagery quality, and the precise claim still need definition.

User answer, verbatim: “A,B”.

Interpretation: include both large buildings/sites and roads/highway corridors in the first-version plan. Individual houses/small plots were not selected. Do not silently defer roads or treat the earlier recommendation of buildings alone as the user's decision. This selects target classes; it does not establish validated minimum sizes, widths, measurement accuracy, or completion-detection capability.

**D5 — What should the first report primarily answer?**

Options: A) whether visible change consistent with construction occurred between two periods; B) how visible site changes evolved over several dates; C) whether imagery supports a supplied scope or milestone claim.

Provisional recommendation: A as the first report's primary promise, matching the user's requested location-and-time comparison. B requires temporal interpretation; C additionally requires an explicit project claim and its observable criteria. Neither B nor C establishes contractual completion from imagery alone.

User answer, verbatim: “A,B (C i didnt understand  if it satisfy the users in the frontend use it tooo)”.

Interpretation: A and B are confirmed. The user did not fully understand C and delegated a conditional usefulness decision; do not record C as an unconditional mandatory workflow or as evidence of validated demand.

Explanation given: C checks an explicit user-supplied claim, such as “a 3 km road was completed by June”, against visible imagery evidence. This does not certify contractual completion or establish accurate 3 km measurement from 10 m imagery.

Provisional treatment of C: an optional “Check a project claim” step for users with scope/milestone details. Ordinary comparison/timeline use should not require those details. Keep the user's claim distinct from observed evidence, and separately validate any derived result. This is a planning recommendation under the user's conditional delegation; detailed UI and result semantics still need review.

**D6 — Is 10 m a strict requirement, or is the constraint imagery cost?**

Options: A) use free/open imagery, with resolution allowed to vary; B) require 10 m imagery; C) use free 10 m imagery by default and allow an optional paid higher-resolution path.

Provisional recommendation: A for the initial prototype, because it tests feasibility without committing an imagery-purchase budget. Free imagery still has processing, hosting, and possible API costs. Option C would be a product-planning choice, not permission to purchase imagery now.

User answer, verbatim: “A.”

Interpretation: use free/open imagery; resolution may vary with source and availability. Do not retain a blanket 10 m-only requirement or include a paid-imagery fallback as selected scope. Dataset terms must support the intended commercial use. Processing, hosting, storage, and API costs remain separate and unbudgeted. This choice does not guarantee that higher-resolution historical imagery is freely available for every site/date.

**D7 — What geographic scope should the first release target?**

Options: A) India first, with a pilot in selected regions; B) worldwide at launch; C) one Indian state or region only.

Provisional recommendation: A, grounded in the supplied India-focused proposal. Choose representative pilot regions before making broad performance claims. Initial market, query availability, and regions with validated performance are distinct and must be documented separately.

User reply after D7, verbatim: “continue”. No geographic option was selected.

Planning assumption A-001: India-first, with validation in selected regions and worldwide expansion in the roadmap. This default is grounded in the supplied India-focused material and was stated in chat. It is not a confirmed D7 answer or a nationwide accuracy commitment. The assumption can be revised without discarding the shared processing pipeline.

**D8 — What delivery deadline and compute/hosting budget should the first usable version fit?**

Question sent: “What deadline and monthly processing/hosting budget should the first usable version fit? Approximate figures are enough, including ₹0 if you need to start with local machines and free service tiers. This determines how much model training and infrastructure belongs in the initial plan.”

User answer, verbatim: “D8 - 1 month but i want to scale it as much as we can , the budget initially is zero when free versions cnnot host we will be using paid”.

Interpretation: target the first usable version in one month; initial cash budget is ₹0. Plan a paid-hosting transition when free services do not meet runtime/capacity needs. This is not permission to spend an unspecified amount now or a promise that the entire live service can be reliably hosted for free. A scalable trajectory is required, but no traffic forecast or availability commitment has been established.

Use a four-week planning horizon without inventing a confirmed start/date or team capacity. Keep both asset classes and comparison/timeline in the first-version plan. Research-heavy model training and broad accuracy claims must depend on their evidence, not the deadline. A local processing prototype and a public read-only evidence demo are different deployment outcomes; any live free hosting must be checked for runtime, storage, and commercial-use conditions.

**D9 — Which primary route should shape the full planning package?**

Prepared options: A) process open imagery ourselves; B) provider-managed processing; C) human-assisted evidence workbench. Recommendation: A, because it establishes a reproducible baseline with the fewest components and retains a path to a bounded public pilot. The shared premises require confirmed site/corridor geometry, actual observation dates/provenance, visible-evidence limits, and inconclusive outcomes for unsuitable requests.

User answer, verbatim: “D9 - B plus C”.

Interpretation: combine provider-managed imagery processing with an evidence workbench. This supersedes the recommendation to make A the primary route; A was a recommendation, never a confirmed user decision. The planned public pilot accepts new locations/periods and supports both asset classes and comparison/timeline. C is proposed as user inspection and annotations, not a promise of free professional analyst review. A specific provider, account eligibility, workload allowance, host, and full written design remain subject to verification/review. No local-only or static-only launch is accepted by this choice.

The user re-invoked office-hours and brainstorming after changing models. Continue the same design session and keep the earlier answers; do not restart intake. Ponytail ultra remains active.

### Decision register

| ID | Decision | Basis | Status |
|---|---|---|---|
| D-001 | Commercial product with free launch phase | D1 user answer | Confirmed |
| D-002 | Broaden discovery beyond government-sanctioned projects | Initial user request | Confirmed |
| D-003 | Produce a durable planning and knowledge artifact set | Initial user request | Confirmed |
| D-004 | Keep implementation minimal and prefer existing capabilities | User's Ponytail ultra invocation | Confirmed preference |
| D-005 | Include both large buildings/sites and roads/highway corridors in the first-version plan | D4: “A,B” | Confirmed target scope; performance unvalidated |
| D-006 | Include both before/after comparison and a timeline | D5: “A,B” | Confirmed requested outputs; exact claims and metrics still need definition |
| D-007 | Consider claim checking when it is useful to frontend users | D5 conditional delegation | Conditional; optional treatment proposed, usefulness and verdicts unvalidated |
| D-008 | Use free/open imagery; resolution can vary | D6: “A.” | Confirmed sourcing constraint; individual data sources and compute costs not selected |
| D-009 | Target the first usable version in one month | D8 | Confirmed target; exact dates/team capacity and feasibility open |
| D-010 | Start at ₹0 and allow a paid-hosting transition when free options no longer fit | D8 | Confirmed planning constraint; no purchase or spend amount authorised |
| D-011 | Combine managed processing (B) and evidence review (C) | D9: “B plus C” | Confirmed route; provider/host and written design proposed for review |

Evidence status E-001: customer demand is unvalidated, explicitly confirmed by the user in D2. This is a known uncertainty rather than a product decision.

Evidence status E-002: no reachable tester yet, explicitly confirmed by the user in D3. Technical feasibility and customer validation must be tracked separately.

The target asset classes, comparison/timeline outputs, free/open imagery constraint, one-month target, initial ₹0 budget, and B+C route are selected. India-first is a planning assumption. The first customer, validated site dimensions, automatic assessment performance, account/provider/host fit, team capacity, and eventual paid budget remain open. Claim checking has conditional inclusion only. Detailed product and technical choices in the written package are proposals until reviewed.

### Checkpoint status

| Checkpoint | Evidence needed | State |
|---|---|---|
| C0 Source intake | Both original files, searchable extracts, provenance | Complete |
| C1 Product goal | Immediate outcome established | Complete: commercial, initially free |
| C2 Customer and workflow | Specific user's current workaround and desired decision | Open gap: demand unvalidated and no reachable tester |
| C3 Observable scope | Asset class, site dimensions, location/time input, valid output claims | Target classes, comparison/timeline, free/open imagery, one-month/₹0 constraints selected; India-first assumed |
| C4 Feasibility and validation plan | Reference labels, representative sites, failure cases, evaluation protocol | Draft protocol in CHECKPOINTS.md; no experiments/reference collection executed |
| C5 Approach selection | Alternatives and user choice | Complete: user selected B+C |
| C6 Artifact review | Consistent PRD/TRD, pipeline, stack, checkpoints, unresolved questions | Full draft written; two independent document reviews complete, user review pending |

These are checkpoints for this planning exercise. Delivery milestones and release acceptance thresholds will be set after the scope is chosen.

### Resume here

Present the reviewed written B+C package for one consolidated user review. If approved, mark the planning status accordingly and preserve the open execution/demand gates; do not treat design approval as permission to implement, create accounts, upload imagery, deploy or spend. If revised, update affected contracts and the decision register. Team capacity, customer demand, account fit, reference availability and a paid-hosting amount remain evidence gaps.

No application code, model training, imagery processing experiment, production result, benchmark result, deployment, or final design approval occurred in this entry.

### Written package checkpoint after D9

- Created DESIGN.md, PRD.md, TRD.md, HOW_IT_WORKS.md and CHECKPOINTS.md; updated this logbook, the knowledge dump, approach history and index.
- Selected B+C is reflected throughout. CDSE openEO and a thin FastAPI/Supabase/browser stack are proposed, not a proven hosted service. C means user evidence inspection/notes initially.
- Added source-backed managed-provider research: separate backend identity/balance, credit versus PU meters, unproven budget enforcement, source STAC provenance, provider output/link lifetime, storage/auth/free-host constraints.
- Proposed workload and 7/30-day retention policies are explicit review/runtime-probe items. The 24-project month-one target is exploratory, distinct from the earlier 36-project proposal and from an adequate accuracy benchmark.
- Peer review caught a backup ambiguity: an object inventory alone does not back up imagery. TRD now requires actual retained-object copies/hashes and a restore probe before a recovery-point promise.
- Checked ten Markdown files: 44 local links resolve and code/diagram fences balance. No unfinished placeholder or stale pending-D9 text was found.
- Fresh adversarial reviewer completed two passes. Four material issues—retention start clocks, application-wide waiting limits/transactional admission, backup deletion recovery and before/after window semantics—were fixed. Two smaller wording fixes and one state-description clarification were also applied. Final review: PASS on all five dimensions, subjective document score 9/10, no remaining material concerns.
- The master design passed the local redaction scanner with no findings. Artifacts sync and telemetry are off; no external artifact publication occurred.

All application execution/release gates remain pending. The present outputs are planning documents, not a functioning GeoVerify service or completed validation.

Follow-up preview research established that PNG is advertised but multi-date export cannot be assumed to yield a frame per acquisition. TRD now specifies explicit per-observation export, separate georeferencing, multi-output/date probes and a bounded conversion fallback. Bounding dimensions protect against diagonal-road raster growth; the primary computation route remains managed.

Review fixes set proposed 7/30-day access clocks from first durable publication; twenty shared nonterminal records alongside one active provider job; explicit canonical date windows with no silent replacements; and a current deletion ledger applied to older restored backups. These are written policies awaiting user review and runtime validation, not measured service capacity.

The final master passed the redaction scan again with no findings. A cross-session copy was saved locally at `/Users/krish/.gstack/projects/Krishpotanwar-my-personal-vibe-coding-setup/krish-main-design-20261001-135222.md`, with links back to the workspace artifacts. Review metrics and genuine workflow/PNG-export learnings were logged locally; sync/telemetry remain off. No Git commit was made before user review.

**D10 — Review the written package:** pending. Options are approve the planning package, request revisions, or start over. Approval concerns the written design only; account configuration, live probes, implementation, deployment and spending remain separate future work. Keep B+C selected unless the user revises it.

## 2026-10-05 — R3: re-verification, renaming, redesign (Opus root, Sonnet research agents)

### Work
- Five Sonnet research agents re-verified every claim against current primary docs, then answered a second round of cross-questions. Reports: `research/2026-10-05-r3-{imagery,science,backend,frontend,market-name}.md`.
- Key findings:
  - The free Sentinel Hub tier is request-bound: about 40 analyses/month for the whole product.
  - Public Sentinel-2 COGs on AWS are browser-readable (CORS `*`, no key, no meter). Raw-window SHA-256 was identical in Node and Deno.
  - Every ML asset in the student proposal is non-commercial or unlicensed.
  - Cloudflare now recommends Workers over Pages. No DPDP analysis existed before this round.
  - Leaflet cannot meet the god's-eye brief. MapLibre 6.12 can.
- Design approved (D13). Spec written: `docs/superpowers/specs/2026-10-05-grahsaboot-design.md`.

### Decisions (verbatim answers summarised)
- **D10** God's-eye: full 3D globe with live satellites. Clarified: "i dont want the film loook ... i want industry ready black background ui". The globe is built fresh and better than `WorldPolicy-Env/globe.jsx` ("we dont need to replicate it make it better").
- **D11** Name: rejected Saboot/Kabse/PehleBaad/Jhaank (not geographic), then Jahannuma/OrbitWala/Dishanuma/Upgrahi/Uparwaala. The user asked for "upgrah plus think of a word like saboot" and chose **GrahSaboot**. All four domains were unregistered by RDAP on 2026-10-05; a trademark search is still pending.
- **D12** Imagery: "Browser + verify all". The browser reads public COGs and the server re-reads and verifies every saved frame. This supersedes the D9 provider-managed processing.
- **D13** Design approved.
- Theme: "i want black background" and "dont drop light theme". Black is the default and light is a toggle.
- Design skills: industrial-brutalist-ui, apple-design, minimalist-ui, design-taste-frontend-v1.

### Resume point
User review of the spec, then the implementation plan (`docs/superpowers/plans/`), then compaction, then execution with superpowers:subagent-driven-development (Opus root, Sonnet workers).
