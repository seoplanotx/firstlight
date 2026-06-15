# Features & UX Roadmap

Firstlight is built for cancer patients and families — an audience that skews older,
stressed, and medically non-expert. UX work prioritizes calm, plain language, and never
pressuring anyone to guess. This roadmap tracks improvements to the two highest-leverage
areas: **profile entry guidance** (the profile drives all matching) and the
**findings & triage workflow** (where families decide what to bring to the doctor).

## Shipped

### Profile entry guidance — `apps/desktop/src/features/profile/ProfileForm.tsx`
- **Autocomplete prompts** for cancer type, biomarker name, and therapy name via native
  `<datalist>` (`apps/desktop/src/lib/clinicalSuggestions.ts`). Suggestions are
  non-binding — free text is always accepted.
- **Collapsible "what is this?" help** (`<details>`) explaining biomarkers and
  subtype/stage in plain language, including where to find them on a report.
- **Inline validation** for the required cancer type field, with a focused, spoken
  (`role="alert"`) message instead of the silent browser tooltip.
- **Unsaved-changes guard** (`apps/desktop/src/pages/ProfilePage.tsx`) that warns before
  the window closes/reloads or the user navigates to another in-app page with edits pending.

### Findings & triage workflow — `apps/desktop/src/pages/FindingsPage.tsx`
- **Sort control**: Most relevant (default, preserves the backend
  `rank_findings_for_briefing` ranking) and Newest (by content date).
- **Action confirmation + Undo**: setting an item aside or adding it to the doctor list
  shows a `role="status"` confirmation with a working Undo for several seconds.
- **Query-aware empty state**: echoes the active search/filters and offers a one-click
  "Clear search and filters".

## Tier 2 — next iteration

- **Bulk triage**: multi-select findings (checkboxes) to set aside / add to the doctor
  list in one action. Needs a batch path in `backend/app/services/findings_service.py`
  (or sequential calls) and selection state on the Findings page.
- **Persistent saved views**: remember the last sort + filter in `localStorage`, mirroring
  the `useSyncExternalStore` pattern in `apps/desktop/src/lib/languageMode.ts`.
- **Date-range & source filters** on the Findings page, plus surfacing per-source
  `last_error` from `SourceConfig` so users see when a source failed.
- **Server-side sort by score**: add a `sort` query param to `GET /api/findings`
  (currently `list_findings` orders by `updated_at` desc) for large datasets.
- **Relevance interpretation**: replace the raw `Match score` number in
  `FindingSummaryCard` / `TrialDetailsGrid` with the plain `relevance_label` plus a short
  "what this means" explainer.

## Tier 3 — larger features

- **Document-assisted profile setup**: paste a pathology/molecular report and extract
  candidate biomarkers/therapies for the user to confirm (local regex first; optional
  de-identified AI assist via the existing `deidentification_service` + OpenRouter path).
  High value for the hardest part of onboarding — needs careful safety review.
- **Multi-profile management UI**: the data model already supports multiple
  `PatientProfile`s; add switching/active-profile UI for families tracking more than one
  person.
- **Deeper accessibility pass**: link underlines for WCAG, `aria-label`s on icon/link
  buttons, table semantics for detail grids, and focus trapping in the onboarding wizard.
