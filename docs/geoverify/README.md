# GeoVerify project artifact package

Last updated: 1 October 2026. Status: full B+C planning draft; independent document review complete, user review pending.

> **Superseded (2026-10-05):** the product is now **GrahSaboot**. Current design: [`../superpowers/specs/2026-10-05-grahsaboot-design.md`](../superpowers/specs/2026-10-05-grahsaboot-design.md). This folder is the research and decision history.

GeoVerify is planned as a commercial service that launches free. A user supplies a location and periods, confirms a site or road corridor, and investigates visible construction-related change through dated imagery. The plan retains both large buildings/sites and roads/highway corridors, before/after comparison and a multi-date timeline. Imagery must be free/open; resolution may vary. **D9 selects B+C: managed processing plus an evidence workbench.** India-first remains a planning assumption, with worldwide expansion on the roadmap. An optional supplied-claim step is proposed under the user's conditional delegation. The first customer, validated sensitivity/accuracy and account-specific provider/host fit remain unestablished.

The target is one month with ₹0 initial cash spend, followed by paid hosting when free options no longer fit. The proposed outcome is a bounded live public pilot for new user-submitted locations/periods; precomputed examples remain interim demonstrations. Customer demand is “not validated yet”, and there is “No reachable tester yet”. Technical feasibility, automatic-output validation, customer usefulness and hosting capacity have separate gates. No implementation, account creation, purchase, site-image processing or deployment has occurred.

## Read first

- [Design record](DESIGN.md): selected B+C route, decisions, architecture, delivery boundary, open evidence and the next real-world assignment.
- [Product requirements, PRD](PRD.md): users, journey, scope, requirement IDs, acceptance, result language and proposed pilot policies.
- [Technical requirements, TRD](TRD.md): stack, managed pipeline diagram, data/job contracts, quality/provenance, recovery, security, quota and hosting/scale behaviour.
- [How it works](HOW_IT_WORKS.md): product flow diagram and illustrative site/road evidence reports.
- [Four-week checkpoints](CHECKPOINTS.md): twenty working-day plan, release/hold gates, independent validation, resource records, recruitment draft and scaling triggers.
- [Knowledge dump](KNOWLEDGE_DUMP.md): the user request, source review, verified technical facts, assumptions, research links, and questions to resolve.
- [Logbook](LOGBOOK.md): work completed, answers received, decisions, and the next discussion step.
- [Approach history](APPROACHES.md): the three routes considered and the user's B+C selection.
- [Source text](sources/SOURCE_TEXT.md): paragraph-numbered Word text and all ten presentation slides, with source hashes.
- [Original Word document](sources/GeoVerify_How_It_Works%20%281%29.docx).
- [Original presentation](sources/GeoVerify_Project_Presentation%20%281%29.pptx).

The attachments are reference material. Their proposed stack, metrics, conclusions, and timelines are not automatically requirements or verified results. The current user request and subsequent answers take precedence.

## Requested artifact set

| Artifact | Intended contents | Current state |
|---|---|---|
| Design record | Selected route, decision rationale, premises, architecture and open evidence | Draft: DESIGN.md |
| Product requirements document, PRD | User decisions, supported cases, input/output contract, acceptance criteria, launch scope | Draft: PRD.md |
| Technical requirements document, TRD | Architecture, imagery pipeline, records, jobs, failure states, provenance, security and cost model | Draft: TRD.md |
| How the product works | End-to-end journey and diagram with examples | Draft: HOW_IT_WORKS.md |
| Technology stack and tradeoffs | Chosen B+C stack and measured upgrade path | TRD.md; alternatives retained in APPROACHES.md |
| Validation plan and checkpoints | Independent references, evaluation, release and scale gates, delivery schedule | Draft: CHECKPOINTS.md |
| Logbook and decision history | Dated work, verbatim answers, decisions, reversals and resume point | LOGBOOK.md, maintained |
| Knowledge dump | Source extracts, facts, uncertainties, terminology, proposed/rejected ideas and research | KNOWLEDGE_DUMP.md plus sources/, maintained |

The route choice is confirmed. Detailed stack, workload/retention policies and release claims are written proposals for consolidated review. Runtime, reference, identity/balance and customer evidence remain explicitly open. Producing planning documents is the current task; the invoked office-hours/brainstorming workflows do not authorise software implementation.

Cloud account creation/configuration, acceptance of service terms, uploads and deployments are outside this planning task.

## Working method

1. Source intake and primary-source constraint research: completed as planning research.
2. Cross-question intake: D1–D9 recorded; D7 geography remains an assumption.
3. Three alternatives and route choice: completed; B+C selected.
4. Written package: drafted around B+C with open evidence and proposed policies labelled.
5. Independent consistency/feasibility review: two passes complete; material issues fixed and no material document concerns remain. Execution gates remain untested.
6. User review: pending; implementation and live validation remain future work.

Ponytail ultra remains active for technical choices: reuse existing tools, minimise components, and add complexity when a measured need justifies it. It does not reduce the documentation explicitly requested by the user.

## Workspace note

This folder was empty at intake. Git resolves to a larger parent repository containing unrelated projects and pre-existing changes. No GeoVerify implementation, existing package stack, or prior GeoVerify design was found in this folder. Work for this task stays under this folder; unrelated parent changes are not part of GeoVerify.
