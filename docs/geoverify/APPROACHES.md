# GeoVerify approaches for review

Date: 1 October 2026. Status: alternatives record; user selected B+C in D9.

**Selected direction:** provider-managed processing plus an evidence workbench. The earlier A recommendation below is retained as discovery history, not the current recommendation. The current draft is [DESIGN.md](DESIGN.md); detailed requirements are in [PRD.md](PRD.md) and [TRD.md](TRD.md).

This comparison uses the confirmed scope: a commercial service that launches free; both large buildings/sites and roads/highway corridors; before/after comparison and a multi-date timeline; free/open imagery with variable resolution. The first usable version targets one month, with ₹0 initial cash spending and a paid-hosting transition when free services do not fit. Claim checking is conditional and proposed as an optional step. India-first is a stated planning assumption. Customer demand, a reachable tester, team capacity, later paid budget, and traffic are unresolved.

## Common product and evidence premises

The proposed product answers whether visible change occurred, how the site changed over time, and—when validated—whether the evidence is consistent with construction. An explicit supplied claim can be shown alongside observations. Contractual completion and budget expenditure require evidence beyond an optical image comparison.

Coordinates locate the map. A confirmed site boundary or road route/corridor identifies the area the user intends to investigate. A point alone does not establish the project's footprint. The simplest proposed flow lets the user enter coordinates, confirm or draw the relevant area, select periods, and receive inspectable images and a timeline. Long roads would be processed in bounded sections. Exact input limits remain to be established through representative jobs.

The product ambition is public self-service: users submit their own coordinates and periods and receive a newly processed comparison and timeline. The proposed month-one target is a bounded public pilot, with workload/concurrency limits and explicit insufficient-evidence responses. Choosing a processing route does not accept a local-only launch or precomputed examples as fulfilment of that workflow.

Every approach must retain actual acquisition dates, composite support windows, source scene IDs, native resolution, processing versions/settings, valid-area information, and reasons for missing or rejected observations. Missing data should appear as gaps. A lack of suitable observations must remain distinguishable from no detected change.

Buildings/sites and roads require separate reference labels and evaluation. Changed ground area does not automatically equal building floor area; a visible cleared corridor does not automatically establish a paved, connected, completed road. Labels and measurements beyond generic surface change must pass their own validation gates.

These premises and the approaches below are submitted for review, not recorded as approved final requirements.

## Options

| Option | Main idea | Smallest candidate components | Principal tradeoff |
|---|---|---|---|
| A — Process open imagery ourselves | Search a public catalogue, read relevant image crops, run a transparent baseline, and produce a comparison/timeline | Python web service, bounded background worker, SQLite job records, file storage; STAC client, Rasterio/GDAL, NumPy, Shapely; small map interface | More control over reproducibility and consumption; we maintain raster processing and job recovery |
| B — Use managed processing | Send crop/mask/temporal calculations to a service such as CDSE openEO and retrieve results | Web service, provider client, job records, result storage, map/timeline interface | Less local compute operation; provider quotas, credits, job limits, authentication, and supported processing become dependencies |
| C — Evidence workbench | Prepare usable observations and let a user or analyst inspect, annotate, and review findings | Map/timeline interface, preview backend, observation/annotation records, evidence files | Explicit human interpretation and traceability; review effort and a more interactive workflow are real costs |

All three preserve both requested asset classes and both comparison/timeline outputs. They differ in computation and interpretation responsibility. Free source imagery remains required in every option; paid imagery is not selected.

Relative planning estimates: A is **M** effort with **medium** delivery risk; B is **M** integration effort with **medium** quota/access risk; C is **M–L** interface/review effort with **high** scaling risk until review demand is known. These are comparisons, not one-month guarantees. Sensor observability is a material risk for every route. A's durable, bounded processing engine is the proposed long-term foundation; B can replace processing placement if measured operations justify it. C is the lateral alternative that treats evidence review as the service.

## A — Minimal self-hosted comparison service

Proposed flow: confirmed geometry/date windows → source search → bounded crop reads → cloud/validity/registration checks → common analysis grid and reflectance handling → baseline surface-change overlays → dated evidence and timeline → report.

Established candidate tools cover discovery, raster reading, array calculations, and geometry; no custom catalogue, geospatial engine, or model framework is needed just to establish this baseline. One persistent job store and one bounded worker are candidates for a low-volume prototype. The worker must handle interrupted jobs and enforce limits even at small scale.

The first baseline would detect candidate surface changes. Construction-specific labels and physical measurements would be enabled only after independent evaluation demonstrates that the relevant interpretation is supported. A learned model can be added when it improves a measured baseline failure; model training is not presumed to be necessary before observing that failure.

Risks to test include source outages, slow reads, residual clouds, alignment errors, radiometric inconsistencies, seasonal confounders, overly large corridors, and memory/storage growth. Local or server computation still consumes resources.

**Relative effort:** lowest operational-component count for a controlled prototype; the recommended candidate for the one-month target. Human-team and AI-assisted effort estimates depend on team capacity, which remains unknown. Start on an available local machine if the selected free host cannot run the workload. A public static evidence demo and a live processing service are separate launch profiles; the latter requires verified runtime and storage fit.

## B — Provider-managed processing

Proposed flow: confirmed geometry/date windows → backend submits a versioned process graph → provider loads and processes imagery → backend checks job status and downloads retained outputs → comparison/timeline/report.

CDSE openEO is a candidate for provider-side work. Earth Engine is another candidate only after account eligibility and commercial plan requirements are satisfied. Managed processing does not change the source sensor's spatial evidence.

The application still owns scene/date semantics, method validation, quotas, error states, provenance, retries, and output retention. Provider limits or exhausted credits must result in an understandable pending/error state. Reproducible graph versions and retained settings matter because defaults and services can change.

**Relative effort:** less raster infrastructure, more provider integration and budget management. Under the one-month/₹0 target, begin only within verified access/credit allowances. Human-team and AI-assisted effort estimates depend on team capacity and supported operations. Exact capacity and cost require a representative workload measurement.

## C — Evidence workbench

Proposed flow: find usable observations → prepare dated previews/crops → user or analyst selects comparable evidence → inspect before/after and timeline → record observations and reasons → export a report.

This is a distinct delivery model rather than simply another model algorithm. Automated overlays can assist after validation, while the interpretation remains explicit. Ordinary users can compare imagery without a project claim; a reviewer can attach a supplied claim and describe what the imagery supports or leaves unresolved.

Human interpretation can be wrong and must not be reused as independent truth without a separate labelling protocol. The pilot must measure review time, agreement, usefulness, and willingness to perform or pay for review. Annotation history and user access add work.

**Relative effort:** more interaction and ongoing review effort. Fit to the one-month/₹0 target depends on the selected review workflow and team capacity. No customer has yet established demand for this delivery model.

## Recommendation and route to scale

**Proposed recommendation: A for the feasibility prototype, with inspectable evidence from the start.** It provides a transparent baseline for both asset classes while keeping components small. Add the useful parts of C after users demonstrate a need for scene selection, review, corrections, or repeat monitoring.

Use B instead when the team prefers provider-side processing and measured consumption fits the budget. It is not selected automatically because source imagery is free.

Proposed upgrade triggers:

- Add learned construction classification only when a labelled reference set exposes a baseline weakness and held-out results improve the relevant error rates without hiding abstentions.
- Add worker capacity when measured queue delay and job duration exceed an agreed target; derive demand from jobs, area, bands, and dates rather than registered-user count alone.
- Change the job/database/storage stack when recovery, contention, multi-instance work, or retention requirements outgrow the single-instance arrangement.
- Consider managed computation when transfer/processing becomes the measured bottleneck and provider consumption fits the available budget.
- Expand geographic claims only after external-region validation supports the relevant asset class, sizes, seasons, and resolution.
- If free imagery cannot resolve the requested feature, return insufficient evidence for that case. Neither managed processing nor a model creates independently observed detail.

No Kubernetes, microservice decomposition, two-model ensemble, Redis/Celery, PostGIS, GPU fleet, or custom imagery marketplace is required merely by this planning comparison. Each remains a possible later tool if its responsibility is demonstrated.

## Hosting within the one-month/₹0 constraint

The ₹0 path starts with available local CPU/storage for processing and a free static frontend for clearly labelled, real precomputed examples. This demonstrates the comparison and timeline; it does not fulfil an unrestricted public arbitrary-coordinate service. The intended product still accepts new coordinates and periods. Its live backend must pass a representative runtime, recovery, storage, and quota probe before launch. Paid hosting becomes an option if the free live profile fails those checks; the user's later spending limit is still unknown.

Hosting facts checked 1 October 2026:

| Candidate | Verified constraint | Planning fit |
|---|---|---|
| Cloudflare Pages | Free static assets; 500 builds/month, 20,000 files/site, 25 MiB/file. Functions use separate Workers limits; Free Workers have 10 ms CPU/request and 128 MB RAM. | Candidate frontend/demo host. A Python/GDAL raster worker needs another runtime. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Render Free | 0.1 CPU/512 MB; sleep after 15 minutes; ephemeral local files; no persistent disk. Free Postgres expires after 30 days. Render advises against production use of free instances. | Probe only for a bounded demo/thin gateway; not the default durable raster backend. [Compute plans](https://render.com/docs/compute-plans), [free limitations](https://render.com/docs/free) |
| Hugging Face CPU/Docker Spaces | Current docs require a paid account plan to create compute Spaces, despite no hourly charge for CPU Basic. Its local storage is ephemeral; static Spaces remain free. | Exclude new CPU/Docker deployment from the ₹0 assumption. Recheck if later selected. [Spaces overview](https://huggingface.co/docs/hub/spaces-overview), [pricing](https://huggingface.co/pricing), [storage](https://huggingface.co/docs/hub/spaces-storage) |

These are provider constraints, not measured GeoVerify capacity or a selected host. Terms and limits can change. Cloudflare's general terms include entity customers and Free Services; the reviewed Pages material does not impose Earth Engine's research/noncommercial eligibility model. [Cloudflare terms](https://www.cloudflare.com/terms/)

### Proposed four-week checkpoints

These checkpoints are a discussion proposal. A route decision is still required before the full delivery plan is written.

| Period | Reviewable evidence | Decision if evidence is missing |
|---|---|---|
| Week 1 | Observable examples for both assets, independent reference sources, geometry/date semantics, local resource and hosting probes | Revise the supported case or release profile; record unobservable cases. Start tester outreach even though none is reachable yet. |
| Week 2 | Reproducible baseline with quality rejection, retained provenance, before/after and multi-date outputs | Keep interpretation at generic surface change if construction attribution is not supported. |
| Week 3 | Inspectable frontend/report for both assets, interrupted-job recovery, locked evaluation settings | Do not promise saved history on ephemeral storage or pass a precomputed demo off as live queries. |
| Week 4 | Blind challenge results, resource measurements, user-review evidence if obtainable, and a bounded public pilot launch/hold decision | If live processing cannot pass runtime/recovery/retention checks, hold that launch and review B or a concrete paid transition. A static demo is an interim result; missing demand evidence leaves an unvalidated pilot. |

One month defines the target, not an evidence exemption. Exact dates, available machines, team capacity, public traffic, and later paid spending remain open. The subsequent PRD/TRD will identify must-have outputs and gates without silently dropping roads or the timeline.

### Paid transition and scale

Add verified durable storage before offering recoverable history; fund a suitable always-on CPU runtime if sleep/restarts lose work or miss the agreed turnaround; increase memory or change processing placement if bounded representative jobs exceed limits. Add workers when measured queue delay warrants them, and shared state/storage when multiple workers require it. Retain source IDs, method settings, and outputs so moving hosting does not require rebuilding the analysis contract. No payment, account creation, or deployment has occurred.

## Verified technical support and remaining probes

Earth Search offers public imagery discovery; the Sentinel-2 COG registry documents access without an AWS account. Source/date availability must still be checked for each request. [Earth Search](https://element84.com/earth-search/), [Sentinel-2 COG registry](https://registry.opendata.aws/sentinel-2-l2a-cogs/)

Rasterio supports windowed raster reading and web-accessible datasets. Reads operate on raster blocks; a small requested crop does not imply precisely that number of pixels is transferred. [Windowed reading](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html), [web filesystems](https://rasterio.readthedocs.io/en/latest/topics/vsi.html)

CDSE documents openEO processing and service quotas; the official client supports asynchronous batch work and result retrieval. Allowances and processing credits must be rechecked rather than treated as a permanent free capacity entitlement. [CDSE openEO](https://dataspace.copernicus.eu/ecosystem/services/openeo), [quotas](https://documentation.dataspace.copernicus.eu/Quotas.html), [Python client guide](https://docs.openeo.cloud/getting-started/python/)

Still to measure: scene availability for representative sites/dates, usable site-area coverage, transferred bytes, baseline errors, cold/repeated job latency, peak memory, durable recovery, and per-job resource consumption. None of these has been measured in this session.

## Decision recorded

User selected “D9 - B plus C”. Managed processing is the primary computation route; user evidence inspection and annotations are the proposed initial review workflow. A is not a silent fallback. Detailed stack/provider/host choices remain draft recommendations. Choosing the route authorises planning; it does not claim benchmark success or start software implementation.
