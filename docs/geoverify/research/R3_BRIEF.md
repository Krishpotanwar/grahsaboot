# R3 research brief (shared by all research agents)

Date: 2026-10-05. Orchestrator: Opus. Workers: Sonnet (max effort).

## Project in one paragraph
Working name "GeoVerify" (being renamed). A web product where anyone (private orgs, engineers, individuals, later govt auditors) enters a location + time periods, confirms a **large site polygon** or a **road corridor**, and gets **dated satellite evidence**: before/after comparison and a multi-date timeline, quality/cloud gaps shown honestly, user notes, exportable evidence report. Origin: a Semester V university Idea Lab project (team of 5 students, India) that proposed auditing government construction claims with Sentinel-2 + change-detection models. Owner wants a commercial product, free at launch, that **scales**, with a "god's-eye" frontend.

## Confirmed constraints (user decisions)
- Commercial, free launch (D1). Demand not validated, no tester yet (D2/D3).
- Both large buildings/sites AND roads/highway corridors (D4).
- Before/after AND multi-date timeline; optional user-supplied claim check (D5).
- Free/open imagery only, resolution may vary, no paid imagery (D6).
- India-first assumption, worldwide later (D7).
- 1-month first usable version, ₹0 initial cash, paid hosting later when free tiers fail (D8).
- Route B+C: provider-managed imagery processing + user evidence workbench (D9).
- Owner wants scale and no quality compromises; minimal components (Ponytail: reuse native/managed features, no speculative infra).

## Current recommended architecture (ARCHITECTURE_V2.md, R2, written earlier today)
React+Vite+TS+Leaflet frontend on Cloudflare Pages; Supabase Auth (Google OAuth) + Postgres + PostGIS + private Storage + Edge Functions + Cron/pg_net; CDSE Sentinel Hub Catalog + Statistical + Process APIs for imagery (openEO batch as alternative); evidence = real dated acquisitions (no composites), SCL quality stats, PNG renders, HTML/JSON export + browser print-to-PDF. No ML at launch.

## Files to read (all in /media/psf/project/Idea lab laa/docs/geoverify/)
ARCHITECTURE_V2.md (current), research/2026-10-05-provider-audit.md, research/2026-10-05-science-audit.md, TRD.md (older openEO/FastAPI draft), PRD.md, sources/SOURCE_TEXT.md (original student proposal), KNOWLEDGE_DUMP.md.

## Your output rules
1. Verify against the **latest primary sources available today** (official docs, pricing pages, licence files, release notes). Use WebSearch/WebFetch. Record access date 2026-10-05 and URL for every claim.
2. Claim ledger table: ID | claim (quote file) | verdict CONFIRMED / CORRECTED / REFUTED / OUTDATED / UNVERIFIABLE | current evidence + URL | consequence for design.
3. Then "Counter-proposals": anything newer/better/cheaper/simpler the existing docs missed. For each: what it is, licence/commercial-use status, cost at ₹0 and at scale, why it beats or loses to the current choice.
4. Then "Best recommendation" for your domain with the strongest argument AGAINST it (steelman the alternative). Be decisive.
5. Never fabricate numbers. If a page is blocked, say so. Distinguish fact from inference.
6. Write your report to the output path given in your task. Return a ≤250-word summary of the top findings as your final message.
