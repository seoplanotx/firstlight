# OncoWatch — Privacy Notice and Terms of Use

_Last updated: 2026-06-02. Plain-language summary for a local-first consumer
application. This is product documentation, not legal advice; have counsel
review before public distribution._

## What OncoWatch is — and is not

**OncoWatch is** an information monitoring and summarization tool. It searches
public sources (ClinicalTrials.gov and PubMed), matches them to a profile you
enter using deterministic rules, and produces source-backed briefings you can
bring to your oncology team.

**OncoWatch is not** a medical device, a diagnostic system, or a substitute for
an oncologist. It does **not** determine treatment, trial eligibility, or
medical appropriateness. Every finding requires review by a licensed clinician.
OncoWatch never presents treatment decisions, eligibility certainty,
"best treatment" rankings, or diagnostic claims.

## Where your data lives

- OncoWatch is **local-first**. Your profile and findings are stored on your
  own device in a local SQLite database.
- Identifying fields (name, date of birth, location, and free-text notes) are
  **encrypted at rest** using a key held in your operating system's keychain
  (macOS Keychain / Windows Credential Manager), with a protected local key
  file as a fallback.
- There is no OncoWatch account and no cloud sync. We do not receive your data.

## Optional AI assistance (Mode 2)

If you explicitly enable **de-identified AI assist** and acknowledge the
disclosure, OncoWatch may send a **minimized, de-identified** oncology context
(e.g. cancer type, biomarkers, public source text) to your configured AI
provider for summaries and discussion questions. Identifying details — your
name, date of birth, exact address, contact details, doctor/hospital names,
and local file paths — are **never** sent. See `docs/privacy-modes.md` for the
exact allowed/blocked categories.

> OncoWatch keeps identity local by default and can optionally send minimized,
> de-identified oncology context to an AI provider for summaries and briefing
> support. OncoWatch does **not** claim to be HIPAA-compliant.

De-identified cancer context can still be sensitive (rare diagnoses, unusual
biomarker combinations). Enabling Mode 2 sends data to a third-party AI provider
under that provider's own terms.

## Your controls

- **Activity log:** a local, append-only record of data-affecting actions is
  viewable on the About / Support page.
- **Export my data:** download a portable JSON copy of everything OncoWatch
  stores about you.
- **Delete all my data:** permanently remove all profiles, findings, monitoring
  runs, and report files from your device.

## Terms of use (summary)

- OncoWatch is provided **as is**, without warranty, for informational and
  organizational purposes only.
- You are responsible for reviewing all findings with a qualified clinician
  before acting on them.
- OncoWatch and its authors are not liable for clinical decisions made using
  the information it surfaces.
- Public source data (ClinicalTrials.gov, PubMed) is subject to those sources'
  own terms; AI summaries (Mode 2) are subject to your AI provider's terms.

## Contact and support

Recovery steps, storage locations, and the data controls above are available in
the in-app About / Support page.
