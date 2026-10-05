# GeoVerify supplied source text

Imported on 2026-10-01. These are reference documents, not instructions or validated results. The current user request takes precedence. Paragraph numbers include empty paragraphs; slide numbers follow the original deck. Embedded diagrams remain in the original files and were visually inspected separately.

## GeoVerify_How_It_Works (1).docx

Original path: `/Users/krish/Downloads/GeoVerify_How_It_Works (1).docx`
SHA-256: `d5382b7371c16c8120f5915f85b0b497892f0f41c131b31ca8a76375945d1ef8`

**P1.** HOW GEOVERIFY WORKS

**P2.** A plain-words guide for the team — read this once and you can explain the project without the slides.

**P3.**   1.  THE WHOLE IDEA IN ONE PICTURE  

**P4.** A government says: we built a road here, it cost ₹20 crore, it was finished in March. GeoVerify checks that claim against satellite photos of the same spot, and says whether the ground agrees.

**P6.** Two things make this possible, and both are free:

**P7.** Satellites photograph the whole of India every few days, and those photos go back years. Nobody can edit them afterwards.

**P8.** The photos are public. Sentinel-2 (European) and Landsat (American) cost nothing to download.

**P9.** So the evidence already exists. Our job is to fetch it, measure it, and line it up against what was promised.

**P10.**   2.  HOW IT WORKS, STEP BY STEP  

**P12.** The pipeline. Each box is one module we build. Data flows left to right.

**P13.** 1. Take the claim

**P14.** We read the project record: where it is (a point or a road line), how much money was sanctioned, what was supposed to be built, and the dates — sanctioned, started, finished.

**P15.** Think of it as the promise we are going to test.

**P16.** 2. Get the photos

**P17.** The system asks Google Earth Engine for every satellite photo of that exact location across three time windows. Earth Engine holds decades of imagery and does the searching on its servers, so we never download a whole country.

**P18.** Like asking a huge photo library: show me this street corner, every photo you have, from 2023 to 2025.

**P19.** 3. Clean them

**P20.** Photos come with clouds, shadows and slight shifts in alignment. We mask out cloud, merge several photos of the same window into one clean picture, and align every image to the same grid so a pixel means the same place in every photo.

**P21.** If the images are not lined up perfectly, the AI will think a tree moved and call it construction.

**P22.** 4. Spot the change

**P23.** Two cleaned images of the same place, different dates, go into the model. It outputs a mask — a black-and-white picture where white means 'something here is new'.

**P24.** This is the classic spot-the-difference game, done by a neural network instead of your eyes.

**P25.** 5. Measure it

**P26.** A white blob is not an answer. We convert it into real units: how many metres of road, how wide, or how many square metres of building. Each pixel of Sentinel-2 is 10 metres by 10 metres, so counting pixels gives us area and length.

**P27.** This is the step that makes us different from published research, which stops at step 4.

**P28.** 6. Compare

**P29.** Now we have measured progress at six or seven points in time. We draw that as a curve and put the promised curve next to it — 0% on the start date, 100% on the claimed completion date. The gap between the two curves is the finding.

**P30.** Promise versus reality, on one graph.

**P31.** 7. Report

**P32.** The system outputs a verdict, a discrepancy score, a confidence value, and the images that justify it — all viewable on a dashboard and exportable as a PDF.

**P33.** An auditor should be able to disagree with us, look at our images, and see exactly why we said what we said.

**P34.**   3.  WHY WE LOOK AT THREE TIME WINDOWS  

**P36.** One photo proves nothing. A building in a photo could have been there for ten years. What proves construction is the change between photos — which is why we always compare a before, a during and an after.

**P37.** If a window has too few usable photos, say the whole monsoon was cloudy, we do not guess. The confidence value drops and the dashboard shows the verdict as unreliable.

**P38.**   4.  THE FOUR ANSWERS, AND HOW WE TELL THEM APART  

**P39.** Every project ends up in one of four states. They are separated by the shape of the measured curve, not by a single number.

**P41.** Grey dashed line = what was promised. Solid line = what we measured.

**P42.** State

**P43.** What the curve does

**P44.** What it probably means

**P45.** Verified

**P46.** Rises and reaches the promised level

**P47.** The work looks genuinely done

**P48.** Partially verified

**P49.** Rises but settles well below the promise

**P50.** Something was built, but much smaller than sanctioned

**P51.** Stalled / abandoned

**P52.** Rises early, then goes flat; plants grow back over bare soil

**P53.** Work started, money may have moved, then it stopped

**P54.** Not constructed

**P55.** Never rises at all, just noise

**P56.** No sign of construction at that location

**P57.** The vegetation clue matters. On an abandoned site the soil is disturbed first, then greenery slowly returns. That regrowth pattern is visible from space and is a strong hint that work stopped rather than finished.

**P58.**   5.  THE TECH STACK, EXPLAINED SIMPLY  

**P60.** Five layers. Each one has a job, and the tools under it are just the tools that do that job.

**P61.** What happens when someone uses the system

**P63.** A project takes several minutes to check, because we are downloading and processing dozens of satellite photos. So we never make the user wait on a loading screen. The request gets queued, a worker does the heavy lifting in the background, and the page updates when the result is ready.

**P64.** Every tool, and why it is there

**P65.** Tool

**P66.** What it actually is

**P67.** Why we use it

**P68.** Python

**P69.** The programming language everything is written in

**P70.** Every satellite and AI library we need already exists in Python

**P71.** React + Vite

**P72.** Tools for building the website the user sees

**P73.** Makes the dashboard fast and easy to update

**P74.** Leaflet

**P75.** A map library

**P76.** Shows projects as pins on an actual map instead of a boring list

**P77.** Recharts

**P78.** A charting library

**P79.** Draws the promised-vs-measured progress curve

**P80.** FastAPI

**P81.** The web server that receives requests

**P82.** Fast, simple, and written in Python like the rest of our code

**P83.** Celery + Redis

**P84.** A job queue — a waiting line for slow tasks

**P85.** One project takes minutes; the queue runs it in the background

**P86.** Google Earth Engine

**P87.** Google's archive of satellite imagery, with servers to process it

**P88.** Free access to decades of Sentinel-2 and Landsat, without downloading terabytes

**P89.** Sentinel-2

**P90.** European satellite, photographs everywhere every 5 days at 10 m detail

**P91.** Our main source of images — free and frequent

**P92.** Landsat 8/9

**P93.** American satellites, coarser (30 m) but going back decades

**P94.** Used for older baselines where Sentinel-2 did not exist yet

**P95.** Rasterio + GDAL

**P96.** Libraries for reading and writing satellite image files

**P97.** Satellite images are not JPEGs; they carry coordinates and many colour bands

**P98.** GeoPandas

**P99.** A spreadsheet library that understands shapes and locations

**P100.** Lets us work with road lines and site boundaries as data

**P101.** PyTorch

**P102.** The library used to build and train AI models

**P103.** Industry standard for deep learning, and free

**P104.** TorchGeo

**P105.** PyTorch add-on made for satellite data

**P106.** Handles the awkward parts of feeding imagery into a model

**P107.** FC-Siam-diff

**P108.** A change-detection model (our baseline)

**P109.** Simple and fast; if our fancy model cannot beat it, we have learnt something

**P110.** BIT transformer

**P111.** A newer change-detection model (our main one)

**P112.** Better at long thin things like roads, which is exactly our case

**P113.** OpenCV

**P114.** A general image-processing toolkit

**P115.** Cleaning masks, measuring shapes, basic image operations

**P116.** PostgreSQL + PostGIS

**P117.** A database that understands geography

**P118.** Stores projects, coordinates and results, and can answer questions like 'what is within 200 m of this point'

**P119.** Docker

**P120.** A way to package software so it runs the same everywhere

**P121.** Our laptops, the college machine and the server all behave identically

**P122.** QGIS

**P123.** Desktop mapping software

**P124.** For manually eyeballing a site when we are checking our own results

**P125.**   6.  IF SOMEONE ASKS YOU IN THE CORRIDOR  

**P126.** The 20-second version

**P127.** Governments announce that roads and buildings are finished, and the proof is paperwork from the same contractor being paid. We use free satellite photos to check whether the construction actually happened, and flag the projects where the ground does not match the claim.

**P128.** The 60-second version

**P129.** Every few days, satellites photograph all of India, and those photos are free and public. So for any government project we can pull images from before it started, while it was being built, and after it was declared finished.

**P130.** An AI model compares those images and marks what changed. We convert those marks into real measurements — kilometres of road, square metres of building — at several points in time, which gives us a progress curve.

**P131.** Then we put that curve next to the promised one. If they match, the project is verified. If our curve stops halfway, it was partly built. If it rises and then goes flat while plants grow back, it was abandoned. If nothing ever changes, it was never built.

**P132.** The output is a score with imagery to back it up. It is not proof of fraud — it is a way for an auditor to know which sites to visit first.

**P133.** If someone asks what your part is

**P134.** Pick your slide and say it in one line. For example: “I work on the imagery pipeline — fetching the right photos from Earth Engine, removing clouds, and lining the images up so the AI is comparing the same ground.”

**P135.**   7.  WORDS THAT COME UP  

**P136.** Word

**P137.** Plain meaning

**P138.** Satellite imagery

**P139.** Photos of the Earth taken from space

**P140.** Resolution (10 m)

**P141.** One pixel covers 10 metres by 10 metres of ground. Smaller number = more detail

**P142.** Revisit time

**P143.** How often a satellite photographs the same place again. Sentinel-2 is about 5 days

**P144.** Change detection

**P145.** Comparing two photos of the same place taken at different times, and marking what is new

**P146.** Mask

**P147.** A black-and-white image where white marks the interesting parts

**P148.** Epoch

**P149.** One point in time in our series — we take about six between start and claimed completion

**P150.** Progress curve

**P151.** A graph of how much was built, over time

**P152.** Composite

**P153.** Several photos of the same window merged into one clean, cloud-free picture

**P154.** Co-registration

**P155.** Shifting images slightly so the same pixel means the same place in all of them

**P156.** Cloud masking

**P157.** Deleting the cloudy parts of a photo so they are not mistaken for change

**P158.** Model / neural network

**P159.** A program that learnt a task from examples instead of being given rules

**P160.** Training / fine-tuning

**P161.** Teaching the model using thousands of labelled example image pairs

**P162.** Benchmark dataset

**P163.** A public set of examples everyone tests on, so results can be compared fairly

**P164.** LEVIR-CD, WHU, OSCD

**P165.** The three benchmark datasets we train and test on

**P166.** F1 score

**P167.** A single number for accuracy that balances false alarms against missed detections

**P168.** Confidence

**P169.** How much the system trusts its own answer, based on cloud cover and model agreement

**P170.** Ground truth

**P171.** The correct answer, decided by humans, used to check whether the system is right

**P172.** Rule of thumb for the viva: if you cannot explain a tool in one sentence without using another technical word, you do not need to mention it.

## GeoVerify_Project_Presentation (1).pptx

Original path: `/Users/krish/Downloads/GeoVerify_Project_Presentation (1).pptx`
SHA-256: `8b34cf9d70c52648abb18e5b9ab22ca7c4b5f7cb75bacc7c22e889d68905d9d2`

### Slide 1

RAMDEOBABAUNIVERSITY
IDEA LAB
PROJECT TITLE
GeoVerify: Satellite Verification of Public Infrastructure Claims
SEMESTER V
Did the road actually get built? Ask the satellite, not the paperwork.
TEAM
Harshit Widhwani (B-B4-49, Leader)      Soumya Jaiswal (B-B1-10)      Krish Potanwar (B-B2-21)
Mohisha Punwatkar (B-B1-12)      Ruchita Bhende (B-B3-46)
GUIDE
Prof. Ashwini Lokhande
DEPARTMENT
Artificial Intelligence and Cyber Security  ·  2026-27

### Slide 2

2
PROBLEM STATEMENT
18 September 2026
Slide 2 of 10
A road is marked complete, ₹20 crore is released, and nobody independently checks the ground.
HOW A PROJECT IS SIGNED OFF TODAY
CONTRACTOR
does the work
SELF-DECLARED FILE
measurement book, photos
DEPARTMENT
reviews the file
PAYMENT RELEASED
next instalment
Every piece of evidence in that chain is produced by the party being paid.
WHY THAT FAILS
Sample-based
Third-party inspection reaches only a fraction of sanctioned works.
Too late
Verification lands months after the instalment has been released.
Self-reported
Photos and measurement books carry no independent baseline.
Not repeatable
A site visit is a single snapshot; nothing tracks the site over time.
WHO CARRIES THE COST
Auditors and funding departments, with no scalable way to check before paying
Citizens, who fund works that may never have existed
Honest contractors, competing against projects that exist only on paper

### Slide 3

EXISTING SOLUTION / LITERATURE REVIEW
EXISTING SOLUTION
LIMITATION
WHAT GEOVERIFY ADDS
Manual third-party inspection
Sample-based, costly, arrives after payment
Screens every record, before the next instalment
Geotagged photo and MIS portals
Self-reported by the audited agency; no baseline
Evidence held by ESA and USGS, not the agency
Daudt 2018, Chen & Shi 2020, Chen 2022  ·  Siamese and transformer change detection
Answers “did the image change”; never tied to a claim
Same models, reconciled against declared dates and scope
Bastani 2018 — RoadTracer
Road graph from a single date; no growth tracking
Road length and width measured per epoch
Gorelick 2017 — Google Earth Engine
Serves imagery at scale; carries no verdict
Adds reconciliation, scoring and an audit report
RESEARCH GAP
Change detection and imagery platforms are studied separately. No published system ingests a declared project record, aligns imagery to its milestone timeline, measures progress in physical units and returns a scored, evidence-linked verdict.

### Slide 4

4
PROPOSED SOLUTION
Feed it the claim. It fetches the evidence, measures the ground, and reports the gap.
01
THE CLAIM
coordinates or route, sanctioned cost, scope, declared dates
02
THE EVIDENCE
Before / During / After stacks pulled through Earth Engine
03
THE MEASUREMENT
road length and width, or built-up area, per epoch
04
THE VERDICT
observed curve vs declared curve, scored with confidence
IT RETURNS ONE OF FOUR STATES
VERIFIED
curve meets the claim
PARTIALLY VERIFIED
built below scope
STALLED / ABANDONED
rise, then flat + regrowth
NOT CONSTRUCTED
no build signal at all
KEY INNOVATION
Published models stop at “these two images differ”.
GeoVerify asks whether the ground supports the completion claimed on that date, for that amount, and says how sure it is.
EXPECTED OUTCOME
A web platform that verifies a project end to end in under ten minutes, with imagery evidence and a downloadable audit report.
Advisory only: a ranked screening signal, never a fraud finding.

### Slide 5

5
OBJECTIVES
01
Ingest project records
identifier, coordinates or route, sanctioned cost, scope, declared dates
02
Automate the imagery pipeline
Sentinel-2 and Landsat retrieval, cloud masking, co-registration, normalisation
03
Detect construction
train and compare a Siamese FCN against a bitemporal transformer at 10 m
04
Quantify and classify
road length and corridor width, built-up area, then completed / stalled / absent
05
Score and present
discrepancy engine, dashboard, visual evidence, downloadable audit report
12-WEEK PLAN
W1-2
literature, schema, sites
W3-4
architecture and design
W5-9
build models and platform
W10-11
benchmark and validate
W12
report and demo
MEASURABLE TARGETS    verdict accuracy ≥ 75% on 40-60 sites    road length error ≤ 20%    under 10 minutes per project

### Slide 6

6
SYSTEM ARCHITECTURE / METHODOLOGY
PIPELINE
PROJECT RECORD
coordinates · cost · dates
IMAGERY
Sentinel-2 / Landsat via GEE
PREPROCESSING
cloud mask · co-register
CHANGE DETECTION
Siamese FCN · BIT
QUANTIFICATION
km of road · m² built-up
PROGRESS CURVE
measured value per epoch
RECONCILIATION
observed vs declared
SCORE & REPORT
verdict · confidence · PDF
THE THREE IMAGERY WINDOWS
BEFORE
6 months before sanction
DURING
start to claimed completion, about 6 epochs
AFTER
6 months after completion
Several scenes per window, combined into a median composite, so one cloudy day cannot decide a verdict.
DECIDING THE STATE
Abandonment reads as an early rise, a long flat stretch, then vegetation returning over bare soil.
CONFIDENCE
Built from cloud cover, usable scene count and whether both models agree. Low confidence mutes the verdict.

### Slide 7

7
IMPLEMENTATION
TECHNOLOGY STACK
INTERFACE
React + Vite
Leaflet
Recharts
swipe compare
SERVICE
FastAPI
Celery + Redis
REST job API
PDF export
INTELLIGENCE
PyTorch
TorchGeo
FC-Siam-diff
BIT transformer
OpenCV
GEOSPATIAL
Earth Engine API
Rasterio
GDAL
GeoPandas
QGIS
DATA & INFRA
Sentinel-2 L2A
Landsat 8/9
LEVIR-CD · WHU · OSCD
PostgreSQL + PostGIS
Docker
ALGORITHM
FC-Siam-diff as the baseline, BIT transformer as the main model, both fine-tuned on OSCD at 10 m.
Thresholds calibrated on a validation split, never hard-coded. A naive NDVI/NDBI difference is reported as the floor.
PROTOTYPE PLAN
Weeks 5-9 build the Earth Engine pipeline, the two models and the dashboard in parallel.
Frontend develops against mocked verdict JSON from week 6, so it never waits on training.

### Slide 8

8
RESULTS / PROTOTYPE
Each verdict state has its own curve shape. Separating those shapes is the whole job.
WHAT THE PROTOTYPE WILL SHOW
DASHBOARD
Map of projects ranked by discrepancy score, Before / During / After tiles with a swipe slider, change overlay, progress curve.
AUDIT REPORT (PDF)
Verdict, score and confidence, imagery evidence with scene IDs and dates, model versions, advisory disclaimer.
TARGETS WE WILL BE JUDGED ON
F1 ≥ 0.55
change detection, OSCD 10 m
≤ 20%
road length error, APLS
≥ 75%
verdict accuracy, 40-60 sites
< 10 min
record in, report out
Ground truth: 40-60 Indian sites hand-labelled from historical imagery across all four states, with finished works and empty plots as controls.

### Slide 9

9
INNOVATION, IMPACT, DELIVERABLES & FUTURE SCOPE
INNOVATION
·  Closes the loop between change detection and the declared record.
·  Progress reported in metres and square metres, not pixels.
·  Abandonment read from curve shape plus vegetation regrowth.
·  Confidence modelled from cloud cover, scene count, model agreement.
IMPACT
·  Wide-area screening at near-zero imagery cost.
·  A ranked shortlist replaces a random inspection sample.
·  Evidence held by ESA and USGS, not by the audited agency.
·  Method carries over to disaster relief and CSR verification.
FUTURE SCOPE
·  Sentinel-1 radar fallback through the monsoon months.
·  Super-resolution to sharpen 10 m imagery.
·  Bridge and culvert specific detectors.
·  Direct integration with tender and scheme portals.
DELIVERABLES
Working web platform
Trained detection models
Quantification modules
Scoring and reconciliation engine
Labelled Indian evaluation set
Benchmark results
PDF audit report
Documentation and ethics note
LIMITS WE STATE UP FRONT
At 10 m a two-lane road is roughly one pixel wide, so the system is scoped to works above 500 m of road or 500 m² of built-up area, and to outdoor, optically visible construction.
It cannot separate fraud from a legitimate delay, a court stay or a re-tendered scope change. No official or contractor is named, and every verdict needs human confirmation.

### Slide 10

CONCLUSION & REFERENCES
Free satellite imagery already holds an independent record of every construction site in India.
GeoVerify reads that record against what was claimed. It ingests a declared project, measures what physically changed at those coordinates across Before, During and After windows, and reports the gap with an explicit confidence value.
The result is a screening layer that tells an auditor where to spend a site visit first.
REFERENCES
[1]  Daudt, Le Saux, Boulch. Fully convolutional Siamese networks for change detection. IEEE ICIP, 2018.
[2]  Chen, Shi. Spatial-temporal attention change detection and the LEVIR-CD dataset. Remote Sensing, 2020.
[3]  Chen, Qi, Shi. Remote sensing image change detection with transformers. IEEE TGRS, 2022.
[4]  Bastani et al. RoadTracer: automatic extraction of road networks. IEEE CVPR, 2018.
[5]  Mnih, Hinton. Learning to detect roads in high-resolution aerial images. ECCV, 2010.
[6]  Gorelick et al. Google Earth Engine: planetary-scale geospatial analysis. RSE, 2017.
[7]  Drusch et al. Sentinel-2: ESA’s optical high-resolution mission. RSE, 2012.
[8]  Ji, Wei, Lu. Fully convolutional networks for building extraction (WHU dataset). IEEE TGRS, 2019.
Thank you. Questions welcome.
