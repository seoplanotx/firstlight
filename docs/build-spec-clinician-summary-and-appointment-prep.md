# Build Spec: Clinician Summary page + Appointment Prep sheet

Status: DRAFT (ready to implement)
Author: Alfred (for Tucker Coffey)
Target: Firstlight (OncoWatch) desktop app
Scope: Two features, shipped together. Both reuse existing data; no new connectors,
no new models, no schema migration required.

---

## 0. Why these two

Firstlight already collects everything needed to send a family into an oncology
visit prepared. What it does not yet do is *present that data the way a clinician
consumes it* (dense, structured, scannable in ~20 seconds) and *hand the family a
single sheet the doctor takes seriously*.

- **Clinician Summary page** = an in-app, clinician-framed view of the active case
  (profile header + ranked findings, condensed). On-screen, reviewable, clinical
  terms on by default.
- **Appointment Prep sheet** = a one-page-first printable/exportable PDF the family
  brings to the visit: case snapshot, top things to raise, questions, info to
  confirm. A third report type alongside the existing two.

They share one new backend assembly layer so the on-screen page and the PDF stay in
sync and stay deterministic.

## 1. Hard constraints (do not violate)

These are inherited from `CLAUDE.md` / `README.md` and are non-negotiable:

- **Rules-first, LLM-second.** Deterministic ranking/assembly drives both features.
  The LLM may only be used for the optional one-line case framing and is gated
  behind privacy mode + disclosure, with a deterministic fallback. It is NEVER the
  relevance engine.
- **No new clinical claims.** No treatment decisions, no eligibility certainty, no
  "best option" ranking, no diagnostic language. Keep the cautious vocabulary
  ("may be relevant", "worth discussing with your oncology team", "possible fit
  based on currently entered profile data", "requires clinician review").
- **Local-first / privacy boundary intact.** Do not send identifying fields to any
  provider. If AI assist is used, route through
  `deidentification_service.build_deidentified_case_packet` exactly like
  `heartbeat_service` does today.
- **Encryption at rest.** Patient name and other identifying fields are encrypted
  columns. Do NOT persist decrypted identifying data into any JSON column (the
  existing report service already documents this; follow the same rule - see
  `report_service.write_report`, the `summary_json` comment).
- **Internal naming.** New user-facing strings say **Firstlight**. Do not rename the
  internal `oncowatch` identifiers.
- **Layering.** Routes thin -> services do the work -> models/ORM. Keep `types.ts`
  in sync with Pydantic schemas. `lint` is `tsc --noEmit`; keep it strict.

## 2. Data already available (no new collection)

From `PatientProfile` (`backend/app/models/profile.py`):
- `cancer_type`, `subtype`, `stage_or_context`, `current_therapy_status`
- `location_label`, `travel_radius_miles`
- `biomarkers[]` -> `{name, variant, status}`
- `therapy_history[]` -> `{therapy_name, therapy_type, line_of_therapy, status, start_date, end_date}`
- `would_consider[]`, `would_not_consider[]`
- identifying (encrypted): `profile_name`, `display_name`, `date_of_birth`, `notes`

From `Finding` (`backend/app/models/finding.py`):
- `type` (`clinical_trials` | `literature` | `drug_updates` | `biomarker`)
- `title`, `source_name`, `source_url`, `external_identifier` (NCT id / PMID / etc.)
- `relevance_label`, `score`, `confidence`, `status` (`new`/`changed`/`unchanged`)
- `why_it_surfaced`, `why_it_may_not_fit`, `matching_gaps[]`
- `match_debug.normalized_facts.record` -> `recruitment_bucket`,
  `evidence_freshness_bucket`, plus other normalized trial facts
- `user_action` (`none`/`discuss`/`dismissed`)
- `evidence_items[]` -> `{label, snippet, source_url, source_identifier, published_at}`

Existing reusable logic:
- `findings_service.rank_findings_for_briefing`, `trial_priority_key`,
  `literature_priority_key`, `build_briefing_snapshot`
- `heartbeat_service.deterministic_briefing_questions`
- `report_service.build_report_bytes` / `write_report` (ReportLab PDF pipeline)

---

## 3. Feature A - Clinician Summary page (in-app)

### 3.1 Backend

New service: `backend/app/services/clinician_summary_service.py`

Function: `build_clinician_summary(session, *, profile, findings) -> dict`

Deterministic assembly. Returns a structured payload:

```
{
  "generated_at": <iso8601 utc>,
  "case_header": {
    "cancer_type": str,
    "subtype": str | null,
    "stage_or_context": str | null,
    "current_therapy_status": str | null,
    "location_label": str | null,        # location is identifying-ish; see note
    "travel_radius_miles": int | null,
    "biomarkers": [{"name","variant","status"}],
    "lines_of_therapy": [
      {"therapy_name","therapy_type","line_of_therapy","status","start_date","end_date"}
    ],
    "would_consider": [str],
    "would_not_consider": [str]
  },
  "case_framing": {                       # one-line plain synthesis, optional AI
    "text": str,
    "generation": {"mode","status","provider","model"}   # mirrors heartbeat
  },
  "trial_findings":   [ <CondensedFinding> ],   # type == clinical_trials, ranked
  "research_findings":[ <CondensedFinding> ],   # literature/drug_updates/biomarker
  "discussion_questions": [str],          # deterministic_briefing_questions
  "data_gaps": [ {"label","finding_count","examples":[str]} ],  # reuse blocker shape
  "disclaimer": DISCLAIMER
}
```

`CondensedFinding`:
```
{
  "id": int,
  "type": str,
  "title": str,
  "source_name": str,
  "source_url": str | null,
  "identifier": str,            # external_identifier (NCT / PMID)
  "relevance_label": str,
  "score": float,
  "status": str,
  "recruitment_bucket": str | null,   # trials only, from match_debug
  "freshness_bucket": str | null,
  "why_it_surfaced": str | null,
  "why_it_may_not_fit": str | null,
  "matching_gaps": [str],
  "user_action": str
}
```

Rules:
- Exclude `user_action == "dismissed"` (reuse `list_findings` default, which already
  filters dismissed).
- Trials sorted by `trial_priority_key`; research by `literature_priority_key`.
- Cap each list (default 12 trials, 12 research) - configurable constant in the
  service. The page is a scan, not the full feed.
- `data_gaps` reuses `findings_service._build_confidence_blockers` over the combined
  top items (promote it to a public name or call via a thin wrapper - do not
  duplicate the logic).
- `discussion_questions` = `deterministic_briefing_questions(profile, findings)`.

`case_framing` AI assist (optional, same gate as `heartbeat_service._ai_questions`):
- Local-only mode OR no disclosure OR no provider -> deterministic fallback string,
  e.g. `"{cancer_type} {subtype}, {stage_or_context}; {n} trial and {m} research
  items flagged for clinician review."` Status object records `deterministic_fallback`.
- De-identified AI assist mode -> add a `clinician_case_framing` task to
  `deidentification_service.build_deidentified_case_packet` and a
  `generate_case_framing` method on `OpenRouterClient`, validated like
  `validate_clinician_questions` (length-bounded, no prescriptive verbs). On any
  failure -> deterministic fallback. NEVER block page render on the LLM.

Schema: `backend/app/schemas/clinician_summary.py` (Pydantic models mirroring the
payload above: `ClinicianSummaryRead`, `CaseHeader`, `CondensedFinding`,
`CaseFraming`, `DataGap`).

Route: `backend/app/api/routes/clinician_summary.py`
- `GET /api/clinician-summary?profile_id=<optional>` -> `ClinicianSummaryRead`
- Resolve profile via `get_profile`/`get_active_profile` (same pattern as
  `reports.generate_report`). 400 if no profile.
- Mount in `app/api/router.py` with `prefix="/clinician-summary"`, `tags=["clinician-summary"]`.

Privacy/location note: `location_label` is an `EncryptedString`. It is fine to
return it over the loopback API to the local UI (the UI already shows profile data),
but it must NOT be written into any persisted JSON column. The Clinician Summary
page is read-only and persists nothing, so this is satisfied by not adding any
write path.

### 3.2 Frontend

- Route: add `{ path: 'clinician', element: <ClinicianSummaryPage /> }` to the
  children array in `apps/desktop/src/App.tsx`.
- Sidebar: add to `primaryItems` in `components/Sidebar.tsx`:
  `{ to: '/clinician', label: 'Summary for the Doctor' }` (place it directly above
  "Reports for the Doctor" - they are the doctor-facing pair).
- Page: `apps/desktop/src/pages/ClinicianSummaryPage.tsx`
  - Fetch via new `api.getClinicianSummary()` in `lib/api.ts`
    (`GET /clinician-summary`), typed against new `ClinicianSummary*` types in
    `lib/types.ts`.
  - Layout (reuse existing components):
    - Page header + eyebrow ("Prepared for your oncology team"), disclaimer callout.
    - **Case header card** - `Card` with a compact two-column key/value grid:
      diagnosis, subtype, stage, therapy status, biomarkers (chips via `Badge`),
      lines of therapy (small table), would/would-not-consider.
    - **Case framing** line under the header (muted), with a small badge when it was
      AI-generated vs deterministic (reuse the `question_generation` status convention).
    - **Trials to review** section and **Research to review** section, each rendering
      `CondensedFinding` rows: title (links to `source_url`), identifier (NCT/PMID),
      `relevance_label` + recruitment chip via `Badge`, `why_it_surfaced` /
      `why_it_may_not_fit`, gaps. Consider reusing `FindingSummaryCard` /
      `TrialDetailsGrid` if they fit; otherwise a tighter row component is fine.
    - **Questions** list and **Data gaps** list (reuse `BriefingBlockers` for gaps -
      it already renders the `{label, finding_count, examples}` shape).
  - **Clinical terms default ON here.** Use `lib/languageMode.ts`. The rest of the
    app defaults to plain language; this page may default to clinical terms (or add a
    per-page toggle). Keep cautious phrasing regardless of mode.
  - States: loading block, `PageErrorState` with retry, `EmptyState` when no findings.
  - A "Make appointment prep sheet" button here that calls the same generate flow as
    Feature B (deep-link convenience), plus a print affordance (`window.print()` with
    a print stylesheet scoped to the summary) so the on-screen page itself is
    printable.

### 3.3 Tests (Feature A)

Backend (`unittest`, in-memory SQLite, build ORM objects directly - see
`tests/test_findings_service.py` pattern):
- `tests/test_clinician_summary_service.py`:
  - assembles header from a profile with biomarkers + therapy history
  - trials vs research split + ordering matches priority keys
  - dismissed findings excluded
  - caps enforced
  - deterministic framing when local-only; AI path mocked for the assist case
  - data_gaps populated from `matching_gaps`
Frontend (`vitest` + Testing Library):
- `ClinicianSummaryPage.test.tsx`: renders header fields, trial/research sections,
  questions, gaps; error + empty states; clinical-terms label rendering.

---

## 4. Feature B - Appointment Prep sheet (PDF report type)

A third report type, `appointment_prep`, alongside `daily_summary` and `full_review`.
One-page-first, designed to be handed to the clinician.

### 4.1 Backend

In `backend/app/services/report_service.py`:
- Extend `_report_title`: add `"appointment_prep" -> "Appointment Prep Sheet"`.
  (Refactor the binary ternary into a dict map of `report_type -> title` so three
  types are explicit and a fourth is trivial.)
- Add a dedicated builder branch. Rather than overloading `build_report_bytes`'s
  long-form layout, add `build_appointment_prep_bytes(profile, findings, *, summary)`
  (or branch inside `build_report_bytes` on `report_type == "appointment_prep"`).
  Layout, top to bottom, tuned to fit ~1 page for a typical case:
  1. Title: "Firstlight - Appointment Prep Sheet", generated timestamp, disclaimer
     (small).
  2. **Case snapshot** - condensed single table: diagnosis/subtype/stage, current
     therapy status, key biomarkers (comma-joined), location/travel. Reuse
     `_profile_rows` but trimmed (drop empty rows).
  3. **Top things to raise** - top N (default 5-6) ranked findings
     (`rank_findings_for_briefing`, then take across trials+research), each as ONE
     tight block: `title` + identifier (NCT/PMID), one-line status
     (new/changed/recruitment), and a single `why_it_surfaced` line. No appendix
     dump here.
  4. **Questions for your oncology team** - `deterministic_briefing_questions`
     (cap 5).
  5. **Information to bring or confirm** - top `matching_gaps` aggregated
     (reuse the blocker builder), framed as "details that would help your team
     assess fit".
  6. Footer disclaimer line.
- Use the existing ReportLab styles helper; add a compact style if needed. Keep the
  evidence appendix OUT of this report type (that is what `full_review` is for).
- `write_report` already accepts arbitrary `report_type` and builds the briefing
  snapshot; ensure it routes to the prep builder when
  `report_type == "appointment_prep"`. Keep the `summary_json` persistence rule
  (no patient name in JSON). Reuse the small `section_limit` for the snapshot.
- `can_render_test_pdf` (health check) can stay on `daily_summary`; optionally add a
  smoke for the new type.

No schema change: `ReportExport.report_type` is a free String; `ReportGenerateRequest`
already takes `report_type: str`.

### 4.2 Frontend

In `apps/desktop/src/pages/ReportsPage.tsx`:
- Add a third button in the "Make a report" card:
  `Make appointment prep sheet` -> `generate('appointment_prep')`.
- Update the report-type display name logic. Currently two places use a binary
  ternary (`report_type === 'daily_summary' ? ... : 'Full Oncology Review Report'`)
  in both the preview header and the history list. Replace with a shared
  `reportTypeLabel(type)` helper:
  - `daily_summary` -> "Daily Summary Report"
  - `full_review` -> "Full Oncology Review Report"
  - `appointment_prep` -> "Appointment Prep Sheet"
- `generate` notice text: add the appointment-prep case.
- `download` filename: already templated as `firstlight-${reportType}.pdf` - fine.
- The latest-briefing preview reuses `summary_json.sections`; the prep report still
  writes a briefing snapshot, so the preview keeps working.

`lib/api.ts` and `lib/types.ts`: no change strictly required (generateReport already
takes an arbitrary payload), but add an `appointment_prep` to any
`ReportType` union if one exists in `types.ts` (check and keep in sync).

### 4.3 Tests (Feature B)

Backend (`unittest`):
- `tests/test_report_service.py` (extend or add):
  - `appointment_prep` produces non-empty PDF bytes for a populated profile
  - `_report_title`/`reportTypeLabel` mapping covers all three
  - top-things-to-raise respects the cap and ranking
  - no patient `profile_name` leaks into `summary_json`
Frontend (`vitest`):
- `ReportsPage.test.tsx` (add if absent): third button triggers
  `generateReport({report_type:'appointment_prep'})`; label helper renders all three.

---

## 5. Docs to update

- `docs/api-routes.md` - add `GET /api/clinician-summary`.
- `docs/architecture.md` - note the new `clinician_summary_service` and the third
  report type.
- `README.md` "PDF export" section - list the third report type
  (Appointment Prep Sheet) and what it contains.
- `docs/ux-roadmap.md` / `docs/NEXT-CODEX-RUNS.md` - mark these as shipped.

## 6. CI / local checks (mirror `.github/workflows/ci.yml`)

Run before pushing:
```
npm run lint            # tsc --noEmit
npm run build:frontend
npm run test:frontend   # vitest
npm run test:backend    # unittest
npm run test:e2e        # playwright onboarding smoke
```
Backend direct:
```
cd backend && PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s tests -v
```

## 7. Suggested implementation order

1. Backend `clinician_summary_service` + schema + route + tests (pure data, no UI).
2. Frontend `ClinicianSummaryPage` + api/types + sidebar/route + tests.
3. Backend `appointment_prep` report type + tests.
4. Frontend ReportsPage third button + label helper + tests.
5. Print stylesheet for the on-screen Clinician Summary.
6. Docs pass.
7. Full CI-equivalent run; manual desktop dev smoke (`npm run dev`) with a seeded
   profile to eyeball the page and the generated PDF.

## 8. Out of scope (explicitly)

- New connectors or data sources.
- Eligibility scoring beyond the existing deterministic match/gaps output.
- Any cloud sync or sharing/transmission of the sheet.
- Renaming internal `oncowatch` identifiers.
- Multi-profile aggregation (one active profile per summary/sheet, as today).

## 9. Open questions for Tucker

1. Clinical-terms default: should the Clinician Summary page default to clinical
   terms ON, or respect the global plain-language setting with a per-page toggle?
2. Appointment Prep "top things to raise" cap: 5 or 6 items for the one-page target?
3. Should "Summary for the Doctor" live in the primary nav (each-day group) or feel
   more like a report (next to Reports)? Spec currently puts it in primary nav,
   directly above Reports.
