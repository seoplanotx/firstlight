# Firstlight - Value-Add Implementation Plan

**Date:** 2026-07-22
**Author:** Tucker + Alfred
**Baseline:** v0.4.0 (`package.json`)
**Scope:** 5 prioritized value-adds from the codebase review. Build order for the
first three is **#3 -> #2 -> #1** (safety-ascending: #1 ingests raw report text and
ships last, through the production-review gate).

---

## Guiding constraints (non-negotiable)

Every feature below inherits the app's existing safety contract. Do not weaken it.

1. **Local-first by default.** Nothing leaves the device unless the user has
   explicitly switched `privacy_mode` to `deidentified_ai_assist` AND acknowledged the
   disclosure (`settings_service.update_settings`).
2. **Never diagnostic / never advice.** No feature may state or imply eligibility,
   treatment recommendations, ranking of options, or a diagnosis. Reuse the fail-closed
   validators in `llm_service.py` (`_UNSAFE_QUESTION_PATTERNS`) and extend them for prose.
3. **Only whitelisted payloads leave.** Anything sent to a cloud provider must pass an
   `assert_*` gate. Patient identity terms are rejected by `_reject_local_identity_terms`.
4. **Calm, plain, non-alarmist UI** (`PRODUCT.md`): no red badges, no urgency mechanics,
   line-SVG icons only, plain language default with a clinical toggle.
5. **AI is optional and additive.** With no key configured, every feature must degrade
   gracefully to the existing deterministic behavior.

---

## #3 - Plain-language "What this means" (BUILD FIRST)

**Why first:** highest felt value for a stressed, non-technical family, and the *lowest*
privacy risk of the three - the input is **public source text** (PubMed abstracts,
ClinicalTrials.gov summaries), not patient data. Best portfolio demo.

**What it does:** For any finding, on demand, generate a 2-4 sentence plain-English
explanation of what the abstract/trial text actually says, with a persistent
"Plain-language summary - not medical advice; discuss with your care team" frame.

### Key safety insight
The finding's public text legitimately contains facility names, dates, and years
(e.g., "a Phase III trial at Duke, 2024"). The existing `assert_deidentified_packet`
would *reject* that text (it scrubs dates/facilities). So plain-language must NOT reuse
the case-packet path. Instead:
- Build a **public-finding packet** that whitelists only public, source-derived fields:
  `title`, `type`, `source_name`, `summary` (raw/normalized), `evidence_snippet`,
  `structured_tags`. Explicitly excludes all profile/patient fields.
- Belt-and-suspenders: run `_reject_local_identity_terms(packet, active_profile)` so the
  patient's name can never ride along even if it somehow appeared in source text.
- Output passes a new fail-closed prose validator `validate_plain_language()` that rejects
  advice/eligibility/recommendation/diagnosis language and requires a non-empty result;
  on any failure it returns "" and the UI shows nothing (fail closed).

### Backend
- **Migration** (`backend/alembic/`): add to `findings`:
  `plain_language_summary` (Text, null), `plain_language_generated_at` (DateTime, null),
  `plain_language_provider` (String, null), `plain_language_model` (String, null).
  A dedicated column (not `llm_metadata`) because `upsert_finding` overwrites
  `llm_metadata` every run. Invalidate the cache in `upsert_finding` when `content_hash`
  changes (clear the four columns on "changed").
- **`llm_service.py`**: add `_PLAIN_LANGUAGE_SYSTEM_PROMPT` + `_BaseLLMClient.explain_finding()`
  (mirrors `generate_case_framing`), and `validate_plain_language(text)`.
- **New module `services/public_finding_service.py`** (or a function in
  `deidentification_service.py`): `build_public_finding_packet(finding)` +
  `assert_public_finding_packet(packet)` (whitelist keys; no profile data).
- **`findings_service.py`**: `generate_plain_language(session, finding_id)` -
  checks privacy mode + provider (`settings_service.get_active_provider`), builds packet,
  calls LLM, validates, caches, returns Finding. Cached result returns instantly.
- **Route** (`routes/findings.py`): `POST /findings/{id}/plain-language` -> `FindingRead`.
  Returns 409 with a friendly message if AI assist is off.
- **Schema** (`schemas/finding.py`): expose `plain_language_summary`.

### Frontend
- `FindingSummaryCard.tsx` / finding detail: when AI assist is on, a quiet
  "Explain in plain language" action; render the cached summary under a labeled block.
- Reuse `useLanguageMode()` - plain mode surfaces the button prominently; clinical mode
  keeps it available but understated.
- Empty/off state: if AI assist is off, a one-line "Turn on optional AI help in Settings"
  link, never nagging.

### Tests
- `validate_plain_language` strips advice ("you should", "eligible", "recommend").
- `build_public_finding_packet` never contains profile identity; `assert_public_finding_packet`
  rejects unexpected keys.
- Cache invalidation on content change.
- Route returns 409 when AI off; 200 + cached on second call.

**Effort:** ~1 focused build session. **Risk:** low. **Value:** highest.

---

## #2 - Daily briefing + native notification (BUILD SECOND)

**Why:** the product's success metric is literally "opens the app in the morning, knows
what's new in minutes" (`PRODUCT.md`). Today that requires manually opening and hunting.
Low risk - no new cloud data; mostly wiring existing pieces.

**What it does:** (a) On a completed monitoring run, fire a calm native OS notification:
"Firstlight: 3 new items to review." (b) A concise, ranked "Today's briefing" band at the
top of the Today page summarizing the top items, driven by the existing
`build_briefing_snapshot`.

### Backend
- Reuse `findings_service.build_briefing_snapshot` / `rank_findings_for_briefing`
  (already power the dashboard and reports) - no new ranking logic.
- Ensure the monitoring run summary exposes `new_count` / `changed_count` and the top N
  titles for the notification body (already in `MonitoringRun.summary_json` +
  `dashboard_service`). Add a small `notification_payload` helper if needed.

### Desktop (Tauri)
- `tauri-plugin-notification` v2 is already a dependency (`src-tauri/Cargo.toml`) and
  `notification:default` is already granted (`capabilities/default.json`). Minimal wiring.
- On run-complete (`lib/backgroundMonitoring.ts`), request permission once, then
  `sendNotification({ title, body })` when `new_count + changed_count > 0`. Respect a new
  Settings toggle `notify_on_new_findings` (default on) and quiet hours (no notifications
  23:00-08:00, matching the non-alarmist ethos).
- Clicking the notification focuses the window on the Today page.

### Frontend
- Add a "Today's briefing" summary band to `DashboardPage.tsx`: counts + the single
  highest-priority item per section, each a one-line plain-language headline, with
  "Review all" deep-links. Calm styling; no red.
- Settings: `notify_on_new_findings` toggle.

### Scope guard
- **In scope:** notifications while the app is running + on launch; scheduled runs via the
  existing `scheduler_service` while open.
- **Out of scope (stretch, note it):** true closed-app background monitoring (needs a
  login-item/agent) - log the limitation, don't fake it.

### Tests
- Notification body composition (counts + top titles, quiet-hours suppression).
- Settings toggle round-trips.
- Briefing band renders top item per section; empty state when no run yet.

**Effort:** ~1 build session. **Risk:** low. **Value:** high (habit / retention).

---

## #1 - AI-assisted profile extraction from a pasted report (BUILD THIRD, GATED)

**Why last:** biggest onboarding value (biomarkers drive 100% of matching), but it ingests
**raw pathology/molecular report text = real PHI**. Highest privacy risk. Ships only after
a production-review pass.

**Current state:** local regex extraction is DONE (`profile_extraction_service.extract_profile_candidates`,
route `POST /profiles/extract-from-text`, paste->review->apply UI on ProfilePage). This is
the one open item in `IMPROVEMENT-CHECKLIST.md` ("Optional later: de-identified AI assist
extraction (Mode 2 only)").

### Safety design (the hard part)
Do **not** send the raw report to the cloud. Instead:
1. Run existing local regex extraction first (unchanged).
2. Run a **local redaction pass** over the pasted text reusing the identity regexes in
   `deidentification_service` (emails, phones, MRNs, names, dates, facilities, city/state,
   ZIPs -> replaced with `[redacted]`).
3. **Assert** the redacted text is clean. If it still trips any identity pattern, **refuse**
   the AI call and fall back to regex-only, telling the user plainly.
4. Only if `privacy_mode == deidentified_ai_assist` + provider configured + the user opts in
   *per paste*, send the redacted excerpt to the LLM to extract additional structured
   candidates (cancer type, biomarkers, therapies, stage) as strict JSON.
5. Whitelist/validate the AI output to the candidate shape; never auto-apply; user confirms
   every field (existing review UI).

### Backend
- `profile_extraction_service.py`: add `redact_report_text()` + `extract_profile_candidates_ai()`
  that composes regex + (gated) AI, merging/deduping candidates and tagging their source
  ("local" vs "AI-suggested").
- `llm_service.py`: add `extract_profile_candidates()` client method with a strict
  extraction system prompt + JSON output validation.
- Route: extend `POST /profiles/extract-from-text` with an `allow_ai` flag, or add
  `POST /profiles/extract-from-text/ai`. Returns candidates + provenance + any refusal reason.

### Frontend
- ProfileForm paste panel: an opt-in "Use AI to help read this report" checkbox, visible only
  when AI assist is enabled; shows provenance badges on suggested fields; refusal message is
  calm and non-blocking.

### Gate
- Run the **production-review skill** on this feature before it ships (standing rule:
  pressure-test PHI-handling automations). Document the redaction guarantees + failure modes.

### Tests
- `redact_report_text` removes names/MRNs/dates/facilities/emails/phones.
- AI path refuses (falls back) when redaction can't clear the text.
- AI disabled -> identical to today's regex behavior.
- Output validation rejects non-candidate / advice-shaped AI output.

**Effort:** ~1-2 build sessions incl. review. **Risk:** high (PHI). **Value:** high.

---

## #4 - Visit-outcome loop (deferred, next after the top 3)

Close the circle: mark clinician questions answered, log what the oncologist said, build a
per-profile timeline. New `visit` model + migration + page; patterns already exist on
`DoctorVisitPage`/`ClinicianSummaryPage`. Medium effort, medium-high value (turns a monitor
into a companion across visits).

## #5 - Trial eligibility "fit check" (deferred flagship)

The ClinicalTrials.gov connector already stores `inclusion_excerpt` / `exclusion_excerpt` /
`eligibility_criteria_excerpt` in `match_debug.record_payload` - matching currently ignores
them. Parse criteria and show **meets / doesn't meet / unknown** against the profile, never
"you qualify" (same fail-closed discipline). Hard (criteria parsing is messy + safety-critical)
but the raw material is already captured. Highest-stakes family task; build once #1-#3 land.

---

## Verification ritual (every feature, before calling it done)
- `npm run test:backend`
- `npm run test:frontend` + `npm run lint`
- `npm run test:privacy` (the de-identification / LLM safety suite - MUST stay green)
- For #1: clean-machine packaged smoke + production-review sign-off.
