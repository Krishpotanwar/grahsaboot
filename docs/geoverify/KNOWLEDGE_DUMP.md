# GeoVerify knowledge dump

Updated: 1 October 2026. This knowledge notebook records confirmed answers, source facts and design proposals. B+C is selected; the detailed artifact package is a draft for review.

## Evidence labels

- **User requirement:** explicitly stated by the user.
- **Source proposal:** stated in the uploaded documents, without assuming implementation or validation.
- **Verified fact:** supported by a linked primary source checked in this session.
- **Inference:** an interpretation or engineering consequence of the evidence.
- **Open question:** requires a user decision, experiment, or further research.

## 1. What the user wants

**Initial user framing, refined by D6:** use satellite imagery to investigate construction at a location over time. The initial request mentioned 10 m pixels; D6 confirms that free/open imagery is the actual sourcing constraint and resolution may vary. Expand beyond government sanctioned-project checking so private organisations or individuals can enter location and time details and compare a site.

**User requirement:** develop the idea through cross-questions and create a project explanation, pipeline, technology stack, PRD, TRD, checkpoints, logbook, and a knowledge dump that retains the work.

**Confirmed answer D1:** “A commercial product(free until we scale it)”.

**Confirmed answer D2:** “not validated yet”. Demand is an untested hypothesis; a pilot must assess usefulness to a real user as well as technical performance. No interviews or commitments were supplied.

**Confirmed answer D3:** “No reachable tester yet”. Technical feasibility can be investigated with independently documented sites, but doing so would not validate customer demand or report usefulness. The first customer remains undecided.

**Confirmed answer D4:** “A,B”. The first-version plan must cover both large buildings/sites (warehouses, factories, campuses) and roads/highway corridors. The earlier recommendation to start with buildings alone was not selected. Individual houses/small plots were not selected. Target scope is confirmed; feasible dimensions and accuracy remain unvalidated.

**Confirmed answer D5:** “A,B (C i didnt understand  if it satisfy the users in the frontend use it tooo)”. Before/after comparison and a multi-date timeline are required. Claim checking is conditionally delegated if it helps users; it is not an unconditional requirement or evidence of user demand.

**Proposed interpretation of conditional C:** an optional “Check a project claim” step. A claim might say that a 3 km road was completed by June; the product would compare available observations with the supplied scope/date. This example does not establish precise road measurement or completion-certification capability. Ordinary comparison/timeline users would not need a sanctioned record, budget, or declared milestone. Exact output labels and evidence criteria still need validation and design review.

**Confirmed answer D6:** “A.” Use free/open imagery; resolution can vary. No paid-imagery fallback is selected. Check each dataset's suitability for commercial use and applicable attribution requirements; free access alone is not a universal usage license. Processing, hosting, storage, and API costs remain separate. Availability of freely usable higher-resolution imagery for particular sites/dates is unverified.

**Planning assumption after D7:** the user said “continue”, without choosing a geography. India-first with representative regional validation is being used as a stated working assumption, and worldwide expansion remains in the roadmap. This is not a confirmed geographic selection or a claim of validated India-wide performance.

**Confirmed answer D8:** “D8 - 1 month but i want to scale it as much as we can , the budget initially is zero when free versions cnnot host we will be using paid”. Plan for a first usable version in one month, initial ₹0 cash spending, and a transition to paid hosting when free options do not fit. Scope retains both asset classes and both outputs. Exact start/deadline, team capacity, demand volume, and later spend limit are unknown. A four-week planning schedule is a proposal; no purchase is authorised merely by recording the paid transition.

**Confirmed answer D9:** “D9 - B plus C”. Select managed imagery processing plus evidence review. The prior self-hosted-first recommendation is superseded as a recommendation, not reversed as an approved decision. Proposed C scope is users inspecting dated images and recording their own observations; analyst-assisted service remains unvalidated. CDSE openEO is a candidate for B, subject to account, commercial-use, capability, quota, and resource checks.

**Open:** geographic assumption review; supported dimensions for each selected asset class; who needs the output; what operational decision the output will inform; exact delivery dates, team capacity, later hosting budget, and expected traffic.

Do not infer that the user has customers, a validated business model, existing software, commercial imagery budget, or an approved twelve-week delivery deadline.

## 2. Supplied material

| Source | Context | Important contents |
|---|---|---|
| GeoVerify How It Works | Team explainer, 172 paragraph positions including blanks | Claim ingestion; imagery; preprocessing; change masks; measurement; progress comparison; verdict/report; suggested stack |
| GeoVerify Project Presentation | Ten-slide Semester V Idea Lab deck, displayed date 18 September 2026 | Government-audit framing, 12-week proposal, four outcome classes, candidate models, dataset and performance targets |

Originals, exact paths, SHA-256 values, and complete extracted text are in [sources/SOURCE_TEXT.md](sources/SOURCE_TEXT.md). Source paragraph IDs below refer to that extraction. Embedded diagrams depict the proposed pipeline, three time windows, four illustrative progress curves, and asynchronous request handling. They are explanatory illustrations, not observed model outputs.

### Existing proposal as written

The proposed sequence is project record → imagery retrieval → cloud masking/alignment → change detection → physical measurement → progress curve → comparison against the claim → score, dashboard, and PDF report.

The record includes coordinates or route, cost, scope, and declared dates. Imagery windows include six months before sanction, around six intervals during execution, and six months after claimed completion. The documents propose four states: verified, partially verified, stalled/abandoned, and not constructed. They also say the output is advisory and not a fraud finding.

The deck proposes FC-Siam-diff and BIT, with NDVI/NDBI differences as a baseline. It lists Sentinel-2, Landsat, OSCD, LEVIR-CD, and WHU. Targets include change-detection F1 of at least 0.55, project verdict accuracy of at least 75% on 40–60 sites, road-length error no more than 20%, and reports in under ten minutes. These are source targets, not achieved results or newly agreed acceptance criteria.

## 3. Technical facts and their implications

### Native resolution and measurement

**Verified fact:** Sentinel-2 B2, B3, B4, and B8 have native 10 m sampling; B5, B6, B7, B8A, B11, and B12 are 20 m; B1, B9, and B10 are 60 m. [Copernicus mission specification](https://sentiwiki.copernicus.eu/web/s2-mission)

**Arithmetic:** a 10 m grid cell represents 100 m²; 500 m² represents five nominal grid-cell areas. A 20 m cell represents 400 m². These quantities do not establish a minimum reliably detectable object size.

**Inference:** detection depends on shape, width, material contrast, neighbourhood, pixel alignment, season, shadows, and registration. A long but narrow road is not made wide enough to resolve merely by exceeding a length threshold. Counting changed pixels measures classified changed area on a grid; it does not automatically measure true construction area or road length. Linear measurements require a separate validated method and reference data.

**Verified fact:** NDBI combines short-wave infrared and near infrared values; bare ground can resemble built-up surfaces in those spectral responses. [Singh and Jain primary research](https://isprs-archives.copernicus.org/articles/XLIII-B3-2022/705/2022/isprs-archives-XLIII-B3-2022-705-2022.pdf)

**Inference:** when NDBI uses Sentinel-2 B11 or B12, its information includes a native 20 m measurement. Resampling onto a 10 m grid does not create native 10 m SWIR detail. Neither a spectral index nor a generic change mask uniquely identifies construction.

### Time, clouds, alignment, and processing

**Verified facts:** the nominal twin-satellite revisit is five days at the equator; actual collection follows an observation plan. Level-2A supplies surface reflectance, and its scene-classification layer is generated at 20 m. Cloud masking has documented omissions and misclassifications, with differences between processing baselines. [Mission and access](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2), [processing](https://sentiwiki.copernicus.eu/web/s2-processing), [product limitations](https://sentiwiki.copernicus.eu/web/s2-products)

**Inference:** revisit is not a cloud-free delivery promise. A requested date may have no suitable observation. Scene-level cloud percentage does not tell us whether the specific project site is clear. The usable portion of the site and actual observation dates must be established.

**Verified fact:** optical observations contain seasonal vegetation dynamics. [USGS phenology](https://www.usgs.gov/special-topics/remote-sensing-phenology/science)

**Inference:** agriculture, soil moisture, flooding, demolition, seasonal vegetation, shadows, and sensor/processing differences can imitate or conceal construction change. A median composite can mix dates and suppress short events; any composite-based output must preserve its temporal support. Geometric refinement reduces registration error but does not make alignment exact.

### What the observations establish

**Inference:** sufficiently visible and validated changes can provide evidence consistent with land clearing, excavation, paving, or a changed building footprint. Establishing which cause applies requires suitable labels, context, and evaluation.

The product must distinguish these questions during discovery:

1. Did a visible surface change occur?
2. Is that change consistent with construction?
3. Is a specified exterior milestone observable?
4. Was the whole contractual project completed and accepted?

The fourth question requires evidence beyond an optical before/after comparison. Interior finish, structural integrity, underground works, utilities, workmanship, budget use, and administrative acceptance do not follow from an observed footprint.

**Wording review after D5, not approved result semantics:** candidate evidence labels are “Visible change observed”, “No clear visible change observed”, and “Not enough evidence to assess”. Generic surface change should not silently acquire a construction-specific meaning. If an optional claim is attached, display it separately from the observations; avoid “verified”, confirmed road length, or completion percentages unless the corresponding measurements and observable milestones have independent validation. Clouds, missing dates, or inadequate spatial detail belong in the evidence-quality explanation.

**Inference:** no detected change is compatible with several explanations: no work, work below sensitivity, hidden work, wrong site geometry, missed observation windows, or poor data. It cannot automatically become “not constructed”. An explicit inconclusive result needs consideration in the design.

**Inference:** a flat observed curve is not evidence of abandonment by itself. A roof can appear early while interior work continues. Vegetation regrowth can have multiple causes. The meaning and duration of a stall must be defined for the selected asset class and supported by independent evidence.

## 4. Commercial access, quotas, and cost

**Verified fact:** Copernicus Sentinel data can be used in lawful commercial downstream services subject to applicable terms and source notices. Free source data and a free hosted processing service are separate matters. [Sentinel legal notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice), [CDSE FAQ](https://documentation.dataspace.copernicus.eu/FAQ.html), [CDSE terms](https://dataspace.copernicus.eu/terms-and-conditions)

**Verified fact:** Google distinguishes commercial and noncommercial Earth Engine use. Its examples of commercial activity include monetized services and internal development primarily intended to produce a commercial product. Student status or free customer access does not by itself resolve eligibility. [Earth Engine eligibility](https://earthengine.google.com/noncommercial/)

**Inference for D1:** GeoVerify's intended commercial use requires provider eligibility and plan selection to be checked explicitly before production use. The research notebook does not make an account-specific eligibility determination.

**Verified fact:** Google documents noncommercial compute tiers, quotas, and reverification. Commercial Earth Engine requires registration and billing/plan selection; its published Limited plan is usage-based with restricted intended workload characteristics and no SLA. Do not assume every commercial use has a fixed monthly subscription, or that this plan fits an enterprise availability commitment. [Noncommercial tiers](https://developers.google.com/earth-engine/guides/noncommercial_tiers), [access](https://developers.google.com/earth-engine/guides/access), [commercial pricing](https://cloud.google.com/earth-engine/pricing)

**Verified facts checked 2026-10-01:** CDSE general-user Sentinel Hub limits list 10,000 requests and 10,000 processing units per month, plus minute limits. Immediately available download services separately list connection, bandwidth, and rolling transfer limits. These are service/account quotas, not per-customer entitlements for our application. Recheck before implementation. [CDSE quota tables](https://documentation.dataspace.copernicus.eu/Quotas.html)

**Verified fact:** a Sentinel Hub processing unit depends on requested pixels, bands, temporal samples, output format, and processing. One customer comparison is not one processing unit. [Processing-unit definition](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/ProcessingUnit.html)

**Candidate cost questions, not a selected architecture:** how many sites, what area per site, how many dates and bands, how often to re-run, what cache reuse is possible, how much imagery/output to retain, and what manual review is required? Source imagery, hosted processing, application compute, model inference/training, storage/egress, maps, and support need distinct budget lines. No monthly total is credible before a representative workload is measured.

## 5. Model and evaluation facts

**Verified fact:** OSCD contains 24 paired Sentinel-2 locations from 2015–2018, with 13 bands of mixed 10/20/60 m native sampling. Its published split has 14 training pairs and 10 test pairs, with urban-change annotations. [Dataset author's page](https://rcdaudt.github.io/oscd/)

**Inference:** OSCD is a useful benchmark candidate, but it does not supply contractual completion or abandonment labels for Indian construction projects. Many image patches from a small number of locations do not become many independent sites. Site/geography leakage must be avoided when selecting train/validation/test partitions.

**Verified fact:** LEVIR-CD provides 637 pairs of 0.5 m Google Earth image patches, primarily building change. [Dataset author's repository](https://github.com/justchenhao/LEVIR/blob/master/README.md)

**Inference:** performance on 0.5 m building imagery cannot be carried directly over to 10 m Sentinel-2 construction classification. Sensor, geography, task, spectral channels, and spatial scale differ. Resizing imagery alone does not validate transfer. WHU's exact intended variant and applicable license still require verification before use.

**Verified fact:** APLS evaluates road-graph similarity through differences in optimal path lengths. [Metric author's implementation and definition](https://github.com/CosmiQ/apls/blob/master/README.md)

**Inference:** “road length error ≤20%, APLS” mixes different evaluations. Total detected-length error, centreline/corridor overlap, and graph connectivity are different quantities and require separately defined metrics if they remain in scope.

**Inference:** model agreement and clear imagery are useful quality signals, but neither is automatically a calibrated probability of correctness. Two models can make the same error. Thresholds, confidence language, abstention, and unsupported cases need validation with an independent reference set.

**Verified methodological support:** land-change assessments use independently collected reference labels, and performance varies by class, region, and timing tolerance. [USGS validation study](https://www.usgs.gov/publications/validation-us-geological-surveys-land-change-monitoring-assessment-and-projection)

## 6. Source claims requiring revision or evidence

| Source location | Claim or proposal | Discovery assessment |
|---|---|---|
| DOCX P25–27; slides 5–6 | Pixel counting gives road length, width, or building area | Changed area is not automatically construction extent; length/width require separate methods and uncertainty |
| Slide 9 | More than 500 m road or 500 m² built-up area is the supported scope | An unvalidated heuristic; width, contrast, geometry, and observation quality matter |
| Slides 4, 6, 8 | Four definite project states | Inconclusive/unsupported evidence must be addressed; no-change and no-construction differ |
| DOCX P29; slide 6 | Compare measured and promised percentage curves | Start/end dates and sanctioned cost do not define an expected physical progress curve |
| DOCX P51–57; slides 6, 9 | Plateau plus regrowth indicates abandonment | Hypothesis needing class-specific temporal validation and reference labels |
| DOCX P86–94 | Earth Engine is free and images arrive every five days | Separate source-data rights, processing eligibility/cost, revisit, and usable observations |
| Slide 6 | Six months after completion is always available | Impossible for a recent/current endpoint; distinguish retrospective analysis from current monitoring |
| DOCX P7 | Satellite photos cannot be edited afterwards | Preserve original scene identity, processing baseline, retrieved artifacts, and hashes; processing products can be revised |
| Slide 7 | BIT is the main model; fine-tuning will fit this task | A candidate, not established superiority on this use case; require a fair baseline comparison |
| Slide 8 | 75% verdict accuracy on 40–60 sites | A proposed target/sample, not evidence; define class balance, independent labels, per-class errors, and uncertainty |
| Slide 8 | Road error metric is APLS | Separate graph/path similarity from aggregate length error |
| Slide 3; DOCX P27 | No published system does this; research stops at masks | Novelty claim not established by the supplied references; needs a targeted literature/market review |
| Slide 9 | Super-resolution can sharpen 10 m imagery | Visually plausible detail is not independent observed evidence and cannot certify an unresolved structure |
| Slide 4 | Under ten minutes per project | Workload, cold-cache behaviour, queue time, provider limits, and data availability are unspecified |
| Slide 4 | Verification for the sanctioned amount | Imagery alone does not establish proper expenditure or value for money |

The documents already make a useful distinction between advisory screening and fraud findings. Preserve that intent while tightening the observability and performance claims.

## 7. Existing stack candidates, without selection

The source stack includes React/Vite, Leaflet, Recharts, FastAPI, Celery/Redis, Earth Engine, Rasterio/GDAL, GeoPandas, PyTorch/TorchGeo, FC-Siam-diff, BIT, OpenCV, PostgreSQL/PostGIS, Docker, and QGIS.

These are inherited proposals, not an installation list. No packages are installed in the task folder, and no stack is approved. In the alternatives discussion, each component must have a current responsibility, a simpler alternative, an operational cost, and a reason it is needed for the first validated workflow. Extra models, queues, databases, multi-provider abstractions, and deep-learning training are not justified solely because they appeared in the presentation.

## 8. Questions to resolve progressively

Only the active question is being asked in chat. This list preserves future discovery topics; it is not a form the user must answer all at once.

1. **Answered D1:** commercial product, free initially.
2. **Answered D2 and D3:** demand is not validated and no tester is currently reachable. The future customer's workflow and desired decision remain unknown.
3. **Answered D5:** before/after comparison and multi-date timeline are required. Optional claim checking is conditionally allowed when useful; do not silently make claim details mandatory. Exact labels and acceptance criteria remain to be defined.
4. **Answered D4:** both large buildings/sites and roads/highway corridors. Typical footprint/width and documented examples still need definition. Road corridor change must not automatically become a pavement-width or completed-road measurement; building footprint change must not automatically become total floor area or whole-project completion.
5. **D7 handled as an assumption:** India-first with selected regional pilots; user said “continue” without choosing an option. Seasons, historical periods, and point-versus-boundary inputs remain open. Worldwide expansion is a roadmap item, not an achieved capability.
6. **Answered D6:** free/open imagery with resolution allowed to vary. Strictly 10 m imagery and an optional paid-imagery path were not selected. Independent validation evidence and the budget for processing/hosting remain separate questions.
7. What “completed”, “stalled”, “construction”, and “no change” mean for the chosen workflow.
8. Available independent dated reference evidence and the right to use it. Include unchanged and confounding sites.
9. Cost of a false alarm, missed change, and inconclusive result to the first user.
10. **Answered D8:** one month; initial ₹0; paid hosting later when free options no longer fit; scale the plan as far as justified. Team skills and GPU/compute access remain unknown; no dedicated GPU is established as necessary. Paid spend limits and exact dates remain open.
11. Expected comparisons, site areas, response times, concurrent jobs, repeat monitoring, and data retention.
12. Public anonymous use versus private organisation workspaces and the privacy expectations for uploaded site data.
13. What would trigger charging, a higher-resolution path, extra models, a more complex queue, or more infrastructure.

## 9. Candidate evidence checkpoints for the future plan

These are discussion inputs, not approved scope or numeric release gates.

### Implications of including both selected asset classes

**Research synthesis after D4; all are engineering inferences from the cited evidence:**

- Evaluate buildings/sites by footprint area and shape, roof/material contrast, and surrounding land cover; evaluate roads by width, length, continuity, and surface contrast. A length cutoff cannot substitute for width sensitivity.
- Label milestones separately. A visible roof can precede interior completion; a visible cleared road corridor can precede paving or opening. Preserve the distinction between the observation and the project's state.
- Validate the measurements actually promised. Changed-area overlap/area error, road centreline/corridor overlap, aggregate length error, and graph connectivity answer different questions.
- Report results separately for the two asset classes before any combined result. Adjacent patches of one campus or highway do not constitute independent test projects. Include confusing non-construction changes and inconclusive cases in both evaluations.

### Candidate checkpoints

- **Customer usefulness:** a reachable user can describe a repeatable decision and evaluate an example report.
- **Observation feasibility:** representative sites have suitable before/after observations and sufficient spatial evidence for the selected claim.
- **Label feasibility:** reference outcomes are independent of the model and sufficiently dated; inaccessible or ambiguous truth is recorded.
- **Baseline performance:** a simple method and analyst review establish what a trained model must improve.
- **Honest evaluation:** separate held-out sites, per-class errors, false alarms, misses, abstention, and performance by site size/season.
- **Pipeline behaviour:** distinguish cloud/no-data/unsupported scope from “no change”; verify geometry, registration, dates, and provenance.
- **Pilot economics:** measure cold and repeated comparison latency, compute, storage, provider consumption, and review effort.
- **Scale decision:** add infrastructure when measured demand or service objectives require it; first define those triggers.

## 10. Knowledge maintenance

Keep new user answers verbatim in the logbook and summarise their implications here. Label recommendations separately from decisions. When a source or assumption changes, record the date and what it supersedes. Retain unsuccessful experiments and rejected approaches with their reason, when such work has actually occurred.

No experiments, model comparisons, accuracy measurements, customer interviews, or production costs have been generated in this session. B+C is selected; the detailed PRD/TRD/pipeline and release policy are being written for review. Model performance and public release readiness have not been established.

## 11. Direct open-data route investigated on 2026-10-01

**Verified source support:** Earth Search provides a free-to-use imagery discovery API; its public service has no availability guarantee. Its metadata distinguishes publicly accessible HTTPS assets from requester-pays assets requiring credentials. Dataset choice must consider actual asset access rather than assuming every catalogue entry is free to retrieve. The Sentinel-2 COG registry separately documents public access without an AWS account. [Earth Search provider documentation](https://github.com/Element84/earth-search), [Sentinel-2 COG registry](https://registry.opendata.aws/sentinel-2-l2a-cogs/)

**Read-only live metadata probe:** the public collections endpoint responded and included `sentinel-2-l2a`, `sentinel-2-c1-l2a`, and `landsat-c2-l2`. Sentinel collection metadata contained optical-band assets and SCL; the collection-level licence field was `proprietary`. That generic/custom-licence marker does not mean imagery must be purchased: inspect the linked upstream terms, which were researched separately. A broad collection temporal extent does not prove complete coverage for a particular site/date. [Probed endpoint](https://earth-search.aws.element84.com/v1/collections)

No site imagery was downloaded or processed in this probe. It verifies catalogue discovery, not per-site availability, image quality, speed, or accuracy.

**Verified tooling support:** Rasterio can access web-hosted rasters and read windows through GDAL. Network reads follow raster block structure, so a requested crop and transferred byte count differ. [Rasterio web filesystems](https://rasterio.readthedocs.io/en/latest/topics/vsi.html), [windowed reads](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html)

**Verified managed alternative:** CDSE openEO and the official Python client provide provider-side processing, asynchronous batch jobs, status retrieval, and result download. Published credits and quotas need checking for the chosen service/account; a free allowance is not guaranteed permanent business capacity. [CDSE service](https://dataspace.copernicus.eu/ecosystem/services/openeo), [quota tables](https://documentation.dataspace.copernicus.eu/Quotas.html), [client guide](https://docs.openeo.cloud/getting-started/python/)

**Inference:** direct catalogue discovery plus bounded raster reads permits a feasibility path with locally controlled compute. Hosted processing remains an alternative. Neither establishes that the source detail supports every requested construction feature.

## 12. Validation contract proposed for discussion

**Status:** proposals, not approved acceptance criteria or achieved results.

### Reference evidence and labels

Separate generic surface change, construction attribution, and physical measurements. Label observable exterior milestones such as a cleared corridor or visible roof footprint. A permit or announcement alone does not establish a construction polygon or dated physical outcome.

For each site, retain confirmed geometry, asset type, source periods, independent dated reference evidence, provenance, usage rights, and uncertainty. Candidate references include lawfully usable orthophotography, geolocated site photographs, or engineering inspections. Two reviewers should label independently of model predictions and adjudicate disagreements. Preserve reference-unknown cases rather than manufacturing a definitive truth label. These proposals apply independent spatial/temporal reference principles from [Olofsson et al.](https://doi.org/10.1016/j.rse.2014.02.015).

Include construction positives, stable sites, and confusing non-construction changes. Cover both asset classes, dimensions, surrounding land cover, seasons, regions, resolution, and observation quality. Keep all dates, patches, adjacent road sections, and shared developments from one project in one split. Development/training, calibration, and blind testing have different roles. Spatial/grouped splitting follows the concerns described by [Roberts et al.](https://doi.org/10.1111/ecog.02881).

### Quality, measurement, and timeline evaluation

Freeze quality thresholds on development/calibration data. Proposed reasons for abstention include ambiguous geometry, cloud/shadow obstruction, missing dates, inadequate detail/alignment, and uncertain interpretation. Report both the proportion of requests assessed and errors among assessed cases. Abstention is a service outcome, not a construction reference class.

Metrics must follow the promise: changed-class precision/recall and overlap for generic change; per-class construction/confounder errors for attribution; absolute area error and bias for area; positional tolerance, missed/spurious segments, and absolute length error for road measurements. Connectivity remains a separate metric if promised. Report per-asset results and uncertainty at independent project level.

For a timeline, the milestone onset is bounded by the last usable observation where it is absent and the first where it is present. Missing earlier or later evidence yields one-sided bounds. Display acquisition dates, composite support periods, and gaps. Evaluate interval usefulness and false events; an extremely broad interval can contain the event without helping a user. Do not interpolate a physical completion percentage through an unobserved interval.

### Pilot size and release claims

**Proposed feasibility exercise:** 36 independent projects, 18 per asset; within each asset, six construction, six stable, and six confusing-change cases. Use 12 development, 12 calibration, and 12 blind challenge projects, balanced across those categories. This is a method/reproducibility exercise with very small strata, not a statistically adequate release benchmark or an established available dataset.

**Illustrative arithmetic, not observed results:** 30 correct out of 40 independent tests gives an approximate 95% Wilson interval of 60–86%; 45 out of 60 gives about 63–84%. Splitting sites across assets/classes and calibration weakens the estimates further. Pixel counts and patches do not increase the independent project count. [NIST Wilson interval method](https://itl.nist.gov/div898/handbook/prc/section2/prc241.htm)

Proposed gates are reference/provenance and split integrity; observability and appropriate abstention for both assets; then locked blind evaluation. Public construction-specific or measurement claims require separately agreed error, coverage, measurement, and temporal-usefulness criteria, supported by an adequately sized test set. Numeric release thresholds remain open because the customer decision and error costs are unknown.

Customer usefulness and willingness to pay remain separate evidence gaps. Technical benchmark success alone would not establish product demand.

## 13. Approach selection and its history

[APPROACHES.md](APPROACHES.md) compares three candidates: A) self-hosted open-imagery comparison; B) provider-managed processing; C) an evidence workbench with explicit user/analyst interpretation. A was recommended during discovery. In D9 the user selected B+C; the final draft therefore uses managed processing plus inspectable evidence, not the unselected A route.

The comparison retains both asset classes, comparison/timeline, free/open imagery, the confirmed one-month target, and ₹0 initial budget with a later paid-hosting path. It makes the proposed geometry confirmation and evidence limits explicit. B+C is confirmed. Specific algorithms, provider/host contracts, the detailed stack, and release claims remain draft choices for review and evidence checks.

## 14. Free launch, paid transition, and basemap research

**Confirmed D8:** one month; initial ₹0; paid hosting when free services stop fitting. This authorises a planning path, not a purchase or a particular later spending amount. A scalable plan must retain a credible live-query path; a static demonstrator is only an interim profile.

**Verified on 2026-10-01:** Cloudflare Pages serves static assets with a free plan subject to build/file limits. Functions inherit Workers resource limits; this is not a Python/GDAL worker host. General terms cover entity customers and Free Services. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [terms](https://www.cloudflare.com/terms/)

**Verified on 2026-10-01:** Render Free supplies a small, sleeping, ephemeral instance. SQLite/results on its local disk would not provide durable user history. Its free database has an expiry, and the provider discourages production use of these free instances. [Render Free](https://render.com/docs/free), [compute plans](https://render.com/docs/compute-plans)

**Verified on 2026-10-01:** Hugging Face's current documentation requires a paid account plan for new CPU/Docker compute Spaces even though CPU Basic's hourly compute charge is zero. Static Spaces remain free. Local compute-Space disk is ephemeral. This differs from older free-CPU advice and must be rechecked if selected. [Spaces overview](https://huggingface.co/docs/hub/spaces-overview), [pricing](https://huggingface.co/pricing), [storage](https://huggingface.co/docs/hub/spaces-storage)

**Inference:** a public static frontend plus owned local processing is the strongest immediately credible ₹0 feasibility profile. It is not a live public arbitrary-coordinate product. A limited free live profile requires actual runtime, retained-state, quota, and access tests; paid hosting may be necessary before dependable public processing. None of those tests has been performed here.

**Upgrade proposals:** durable storage before saved-history promises; suitable always-on CPU hosting when restart/sleep behaviour breaks turnaround or recovery; more memory or provider-side processing when the measured workload does not fit; more workers only when queue delay warrants them. Job count, area/corridor width, dates, bands, cache hits, output retention, and review time drive consumption. Registered-user count alone does not.

**Verified basemap constraint:** OpenStreetMap's public tile service requires attribution, normal interactive access/caching, and suitable request identification. Bulk/offline prefetching is prohibited; service is best effort. Free geographic data does not imply unrestricted hosted tile capacity. [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

**Planning implication:** keep the basemap source replaceable. Analysis cache and source-imagery downloads are separate from basemap tiles; report generation must not initiate prohibited tile bulk downloads. A basemap is navigation context, not dated evidence of the construction being evaluated.

## 15. Managed B+C route: research checked 2026-10-01

**Meters and allowance:** CDSE lists openEO credits separately from Sentinel Hub requests/processing units. Its currently published openEO allocation is 10,000 credits/month, described as a temporary boost, with separate API/start/concurrency constraints. These are not application jobs/month or per-user entitlements. Record the actual backend identity and usable balance before capacity planning. [CDSE quotas](https://documentation.dataspace.copernicus.eu/Quotas.html)

**Credit consumption:** compute, memory, storage and selected services affect consumption; published fixed request/job overhead is only part of cost. Failed work can consume nonrefundable credits. Total representative site/corridor/timeline consumption has not been measured. [Credit usage](https://documentation.dataspace.copernicus.eu/APIs/openEO/credit_usage.html)

**Backend identity:** CDSE machine-to-machine authentication is documented as experimental. Its service-account jobs/results and credit balance differ from personal-account resources; credit linkage requires support. Authenticating with a credential is not proof that the backend has usable free compute. [Client credentials](https://documentation.dataspace.copernicus.eu/APIs/openEO/authentication/client_credentials.html)

**Lifecycle and budget:** a read-only public capability check showed core API 1.2 job lifecycle and logs; no estimate endpoint was advertised. The openEO standard specifies a budget field, but enforcement for the chosen CDSE account/workload remains untested. Application limits and measured allowance reservations must not depend on unproven enforcement. [Live capabilities](https://openeo.dataspace.copernicus.eu/openeo/1.2/), [API specification](https://api.openeo.org/)

**Output and link lifetime:** CDSE documents 90-day completed-result retention and renewable seven-day signed download URLs. The application proposes a shorter disclosed 7/30-day policy; it must copy images and metadata into private storage rather than retain URLs alone. [Retention announcement](https://dataspace.copernicus.eu/news/2025-5-6-important-change-retention-period-openeo-job-results), [job configuration](https://documentation.dataspace.copernicus.eu/APIs/openEO/job_config.html)

**Provenance:** STAC 1.1 result metadata can include root/child results and `derived_from` collections of input scenes. Persist their contents before links expire. A sample real job must establish scene/date completeness and selection/masking semantics; a composite timestamp does not establish per-pixel acquisition time. [Result metadata](https://documentation.dataspace.copernicus.eu/APIs/openEO/openeo-backend/docs/job-result-stac11.html)

**Collection checks:** public `SENTINEL2_L2A` metadata and queryables exposed bands, scene identity/date, grid and processing version. The research used generic catalogue metadata, without a user area of interest or an executed job. It establishes available metadata fields, not output accuracy or completeness for a request. [Collection](https://openeo.dataspace.copernicus.eu/openeo/1.2/collections/SENTINEL2_L2A), [queryables](https://openeo.dataspace.copernicus.eu/openeo/1.2/collections/SENTINEL2_L2A/queryables)

**Durable state candidate:** Supabase can combine auth, relational records and private objects. Its free plan has finite database/object/egress and per-file allowances, no automatic backups/SLA, and inactivity can pause service. A database export does not back up stored objects. Keep database and object export/restore probes distinct. [Pricing](https://supabase.com/pricing), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [backups](https://supabase.com/docs/guides/platform/backups)

**Login candidate:** default Supabase email delivery is restricted; it cannot be assumed to handle public signups. One Google OAuth provider is proposed rather than a new mail service. This requires provider/application configuration, suitable redirect/audience settings and a non-team login probe; it is not configured by this planning work. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)

**Account and service terms:** imagery rights and hosted service eligibility are distinct. Proposed provider/service-account and auth/storage use for an external-user commercial application still needs a terms/account check. The plan does not certify blanket eligibility from the word “free”. [CDSE terms](https://dataspace.copernicus.eu/terms-and-conditions), [Supabase terms](https://supabase.com/terms)

**Concrete probes:** demonstrate service identity/balance; run a tiny site and corridor/timeline job; verify masks, grid, source dates and manifest; interrupt create/start/collection; reconcile without duplicate paid work; test cancel/delete and any budget enforcement; retain and restore records plus objects; verify private access, expiry and a non-team user's login. No such account-specific processing probe ran during planning.

**Preview export follow-up:** core capability metadata advertises PNG, but current upstream implementation reduces temporal data to a single spatial output. CDSE's example removes time before PNG export. Prepare each selected observation explicitly; verify multi-frame assets and dates rather than assuming one PNG per cube timestamp. PNG needs separate bounds/CRS/provenance, and diagonal geometry needs a bounding-raster limit as well as area limits. A bounded GeoTIFF-to-PNG display conversion is a possible fallback requiring memory/runtime tests; it does not move the analysis to unselected self-hosted processing. [Live formats](https://openeo.dataspace.copernicus.eu/openeo/1.2/file_formats), [upstream implementation](https://github.com/Open-EO/openeo-geopyspark-driver/blob/master/openeogeotrellis/geopysparkdatacube.py), [CDSE example](https://documentation.dataspace.copernicus.eu/APIs/openEO/R_Client/R.html)

## 16. Written package and maintenance after D9

[DESIGN.md](DESIGN.md) records the selected route and open evidence. [PRD.md](PRD.md) defines the user contract; [TRD.md](TRD.md) specifies pipeline, stack, records and recovery; [HOW_IT_WORKS.md](HOW_IT_WORKS.md) explains user-facing examples; [CHECKPOINTS.md](CHECKPOINTS.md) defines four-week gates, evaluation, resource/experiment records and scale triggers. These files retain the requested knowledge without copying the same specification into this notebook repeatedly.

Proposed operational caps cover area/corridor/time windows, per-frame bounding dimensions, one provider job and twenty shared accepted nonterminal analyses; exact policies are in the PRD/TRD. Proposed access retention is seven-day images/results and thirty-day manifests/annotations from first durable report publication. Preview durations/start rule before submit and exact deadlines at publication; keep minimal cleanup/deletion records until required reconciliation/older backups are resolved. These policies are for review/runtime checks, not validated sensitivity or permanent-history behaviour.

The fuller 36-project reference proposal in section 12 is preserved. The month-one checkpoint plan proposes 24 independent projects as a practical exploratory target. Neither is a broad accuracy benchmark. A live evidence workbench can be assessed separately from automatic labels/quantities; missing references keep unsupported automatic features disabled.

Record future work in the logbook with real status, source links, experiment/resource record, decisions and rejected alternatives. When this draft changes, update affected requirements and the decision register together. Do not relabel a planning checkpoint as a completed experiment or an annotated product finding as independent reference truth.
