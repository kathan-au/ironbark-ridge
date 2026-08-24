# WRITEUP.md — Ironbark Ridge Take-Home

## How to run everything

### Option A: Docker (recommended — runs the whole stack with one command)

**Prerequisites:** Docker Desktop, an Anthropic API key.

1. Create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=your_actual_key_here
```

2. Start everything:
```bash
docker compose up --build
```
This builds and starts PostgreSQL, Adminer (DB GUI), the backend API, and the frontend.
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Adminer: http://localhost:8081 (server: `postgres`, user: `ironbark`, password: `ironbark_dev_password`, database: `ironbark_ridge`)

3. The database starts empty. Populate it once, from the host machine:
```bash
docker cp backend/schema.sql ironbark-db:/schema.sql
docker exec -it ironbark-db psql -U ironbark -d ironbark_ridge -f /schema.sql
docker cp backend/migration_ai_findings.sql ironbark-db:/migration_ai_findings.sql
docker exec -it ironbark-db psql -U ironbark -d ironbark_ridge -f /migration_ai_findings.sql

cd backend
npm install
node src/ingest/ingestFuel.js
node src/ingest/ingestElectricity.js
node src/ingest/ingestIncidents.js
node src/ingest/ingestSuppliers.js
node src/ingest/ingestEmissionFactors.js
node src/ai/classifyIncidents.js
```
(These connect to the same Postgres container via `localhost:5432`, using `backend/.env`.)

4. Refresh http://localhost:5173 — the dashboard should show real data.

### Option B: Local development (no Docker for the app itself)
```bash
docker compose up -d postgres adminer
cd backend && npm install && cp .env.example .env   # fill in ANTHROPIC_API_KEY
# run schema + ingestion as in step 3 above
npm run dev   # backend on :3000

cd ../frontend && npm install
npm run dev   # frontend on :5173
```

### Running tests
```bash
cd backend
npm test
```
34 tests across 3 suites (emissions calculation, date parsing, supplier deduplication) — run automatically on every push via GitHub Actions.

**Security note:** rotate the Anthropic API key used during development before/after sharing this repository, since it lived in a local `.env` file during the build.

---

## Data problems found, and what I did about each

| File | Problem | Action | Why |
|---|---|---|---|
| `fuel_deliveries.csv` | Delivery dates in 3 formats (ISO, DD/MM/YYYY, Mon-YY) | Fixed | Parsed each explicitly; Mon-YY defaults to the 1st of the month (exact day unrecoverable) |
| `fuel_deliveries.csv` | Quantity in mixed units (L, litres, kL) | Fixed | kL → L is an exact, unambiguous ×1000 conversion |
| `fuel_deliveries.csv` | Cost formatted inconsistently (`"$182,946.64"` vs `132182.58`) | Fixed | Stripped `$` and `,` before parsing |
| `fuel_deliveries.csv` | November 2025 has zero recorded deliveries | Flagged (confirmed via query, not a pipeline bug) | Genuine data absence — worth asking the client whether this reflects a site shutdown or a missing export |
| `electricity_meter_readings.csv` | Meter MTR-06 missing entirely | Flagged | No data exists to fill or reject |
| `electricity_meter_readings.csv` | MTR-01 and MTR-02 both show ~65% consumption drops in March 2026 | Flagged, investigated | See "one insight" below — explained by a real operational event, not a data error |
| `incident_register.csv` | `INC-2025-011` used twice for two different events | Flagged, both kept | Suffixed the duplicate as `-DUP` rather than deleting either record |
| `incident_register.csv` | Severity coded inconsistently (words *and* numbers, even for the same recurring description type) | Fixed | Normalised to Low/Medium/High; 1→Low, 2→Medium, 3→High is an assumption not stated in the source |
| `incident_register.csv` | Several descriptions repeated verbatim across different IDs/dates | Flagged | Can't determine from available data whether genuinely recurring or a copy/paste shortcut |
| `suppliers.csv` | "Ironline Fuel Distributors Pty Ltd" vs "...P/L" (one row missing ABN) | Fixed | Merged via two-pass name/ABN matching; spend summed, not double-counted |
| `suppliers.csv` | "Blackwood Heavy Maintenance" vs "...Maintanence" (typo, shared ABN) | Fixed | Merged via shared ABN |
| `suppliers.csv` | TerraForm Rehabilitation Co: 7-digit ABN | Flagged | Real ABNs are 11 digits; couldn't validate |
| `suppliers.csv` | SafeGuard PPE Supplies: blank ABN | Flagged | No fallback identifier available |

**91 total data quality flags** across all sources (fuel: 40, electricity: 15, incidents: 32, suppliers: 4), all queryable and filterable via `/data-quality-report`.

**Assumptions made explicit:** company-suffix stripping for supplier matching (`Pty Ltd`, `P/L`, etc.) is tuned to this dataset's AU conventions, not general-purpose. The severity word↔number mapping is an inference, not stated anywhere in the source. Canonical supplier row on merge is selected by highest spend, not by data completeness.

---

## Going beyond core scope

The core scope (ingestion, API, AI layer, frontend, write-up) is complete. Beyond that, the following were also built:

- **Full Docker containerisation.** The core scope only asked that the reviewer be able to run the project; this goes further by containerising the backend and frontend themselves (not just the database), each with their own `Dockerfile`. The frontend uses a two-stage build (build the Vite app, then serve the static output with a minimal server) to keep the final image small. The whole stack — Postgres, Adminer, backend, frontend — starts with a single `docker compose up --build`.
- **CI via GitHub Actions.** A workflow runs the full 34-test suite automatically on every push and pull request against `main`. This was made straightforward by a deliberate architecture choice: the highest-risk logic (emissions math, date parsing, supplier deduplication) is extracted into pure functions with no database or network dependency, so CI needs no test database, no secrets, and no service containers — just Node and `npm test`.
- **Automated test suite.** 34 unit tests across three areas chosen specifically because they had already produced real bugs during development: emissions calculation math, date parsing (the source of two separate timezone bugs), and supplier deduplication (including a regression test for a genuine transitive-merge bug that was caught and fixed mid-build).
- **A statistical anomaly detector**, not just format/type validation. The electricity ingestion script flags any meter reading under 50% of that meter's own 18-month average — a step beyond checking whether values are present and well-formed. This is what surfaced the MTR-01/MTR-02 anomaly discussed below, which turned out to be a genuine, explainable operational event rather than noise.
- **A supplier deduplication algorithm**, not just exact-match cleaning. Suppliers were matched using a two-pass approach — group by normalised name, then merge any groups that also share a valid ABN — to correctly unify records even when one row's ABN was blank and the other's name had a typo. This went through a real debugging cycle (an initial single-key approach silently failed to merge some legitimate duplicates) before landing on the current, tested implementation.
- **A cross-dataset correlation**, not just single-file anomaly detection. The "one insight" below connects an electricity reading anomaly to a specific incident register entry and its stated cause — a finding that only exists when two different source files are read together, not something visible from either one alone.

---

## One insight I wasn't asked to find

The electricity anomaly in March 2026 (MTR-01 and MTR-02 both dropping to roughly a third of their normal consumption) isn't a data quality problem at all — it's explained by a real event already sitting in the incident register. `INC-2026-131` records a regional substation failure that caused a total loss of grid supply, with the site running on backup diesel generators continuously for approximately three weeks. A second incident from the same period, `INC-2026-134`, records crew fatigue from extended shifts covering generator operations during the outage — which the AI classification layer correctly flagged as psychosocial despite being logged under the generic `OTH` type code.

Put together, this means the March 2026 emissions figures tell a story a Scope 2-only view would miss: grid electricity emissions genuinely dropped that month, but this wasn't decarbonisation progress — it was displaced onto Scope 1 diesel combustion instead, which was very likely running at a higher emissions intensity than the grid mix it replaced. A sustainability lead skimming a Scope 2 chart in isolation could easily misread March 2026 as a good month. The two data points (the electricity dip and the substation-failure incident) only tell this story when read together, which is exactly the kind of cross-dataset correlation that's easy to miss when emissions and safety data are reviewed in separate reports.

---

## How I used AI tools, what they got wrong, and how I caught it

I used Claude as a coding assistant throughout the build, and separately, Claude Haiku (via the Anthropic API) as the AI classification layer for incident analysis.

**As a coding assistant — real issues hit and fixed during the build:**
- A timezone bug appeared **twice**, in two different endpoints: `Date.toISOString()` converts to UTC, silently shifting Australian (UTC+10) dates back a day or a month. Fixed both by using Postgres `to_char()` for date formatting instead of JavaScript `Date` objects — this eliminates the conversion step that caused the bug, rather than working around its symptoms.
- The AI classification script initially crashed on markdown-fenced JSON output (` ```json ... ``` `) despite explicit prompt instructions against it — added defensive fence-stripping in code rather than trusting the model to always comply with formatting instructions.
- The first classification run truncated mid-JSON at the `max_tokens` limit. Fixed by tightening the prompt's evidence-length requirement (under 15 words) and raising the token ceiling, rather than just raising the ceiling alone.
- Data quality flags duplicated on every re-run of ingestion scripts, because each script only truncated its own primary table, not its own flag rows in the shared `data_quality_flags` table. Fixed by scoping flag deletion to each script's own `source_table` before re-inserting.
- A `TRUNCATE ... CASCADE` on `incidents` silently wiped `ai_incident_findings` via the foreign key relationship during a routine re-ingestion test. Documented as a known fragility (see below) rather than papered over.
- A supplier deduplication bug: the initial single-key grouping approach failed to merge two rows of the same company when one row's ABN was blank (it grouped by ABN when present, by name when absent, so a row with an ABN and a row without could never land in the same group even for the same company). Fixed with a two-pass merge — group by normalised name first, then merge any groups that share a valid ABN — and verified with a dedicated regression test for exactly this transitive-merge scenario.

**As the AI classification layer — deliberate design choices and what was verified:**
- Chose Haiku over Sonnet deliberately: classifying 42 short incident descriptions into fixed categories doesn't need frontier-model reasoning depth, and the cost difference is significant at scale. Total run cost roughly 2,200 input and 3,700 output tokens — a fraction of a cent.
- **Grounding safeguard:** every AI-returned `incident_id` is validated against the real database before storage; anything unrecognised is rejected and logged, never silently inserted. Zero rejections occurred in practice, but the safeguard runs on every classification pass regardless.
- **What it got right:** correctly identified all 4 psychosocial-hazard incidents despite being coded under the generic `OTH` type in the source data — satisfying the requirement to catch these "regardless of how they were originally coded." Also caught 2 genuine severity mismatches: a fractured-forearm-requiring-surgery case and a lacerated-fingers-with-LTI case, both recorded as "Low" severity in the source register.
- **What I verified manually rather than trusting blindly:** cross-checked every psychosocial and severity-mismatch finding's `evidence` field against the actual source `description` before accepting any of them as legitimate. The frontend AI review panel shows both fields side by side for exactly this reason, so a reviewer can perform the same grounding check without needing to query the database directly.

---

## What I'd build next with another week

- Fix the `TRUNCATE CASCADE` fragility between `incidents` and `ai_incident_findings` — either avoid cascade on that relationship, or auto-chain AI classification to run immediately after incident ingestion so the two tables can never silently drift out of sync.
- Add a dedicated unit test for the AI grounding-rejection logic (an unrecognised `incident_id` should be rejected, not stored). The safeguard exists and works, but wasn't covered by an automated test given time constraints — the other three high-risk areas (emissions math, date parsing, supplier matching) were prioritised instead.
- Extract `ingestElectricity.js`'s period parser and anomaly-detection logic into the same tested `lib/` pattern used for fuel/incident dates and supplier matching.
- Link `suppliers` to `fuel_deliveries` properly (currently standalone dimensions) to enable genuine spend-vs-emissions reporting.
- Surface the March 2026 diesel-vs-electricity correlation as an explicit dashboard callout rather than a write-up note, since it's a genuinely actionable finding for a sustainability lead.
- Broaden the AU company-suffix list used in supplier name matching, or replace it with a proper fuzzy-matching library for robustness beyond this specific dataset.
- Add a database seeding step to the Docker Compose setup itself, so a fresh clone is fully working after a single `docker compose up --build` rather than requiring a manual ingestion pass afterward.

---

## A closing note

This was built in a single day. Given that, I've prioritised depth over breadth deliberately — a smaller set of things (the ingestion/cleaning pipeline, the AI grounding safeguards, the test suite, the Docker/CI setup) done properly and defensibly, rather than a longer feature list done thinly. Everything documented above — the bug list, the test counts, the flag counts — is real and reproducible, not aspirational.

Worth being upfront about: several parts of this workflow were new territory for me going in — containerising a full stack end-to-end, wiring up CI, and grounding an LLM's output against source records rather than trusting it outright. I'd treat that as a fair test of how quickly I can pick up a production-shaped workflow under real time pressure, rather than a caveat on the result. The debugging log in this write-up is the honest record of doing that in practice — including the mistakes, not just the fixes.
