# Firstlight × Anthropic

**Claude Science accelerates the scientists. Firstlight is built for the
people waiting on that science.**

## What Firstlight is

[Firstlight](https://firstlighthq.com) is a free, open-source, local-first
desktop app for cancer patients and their families. It monitors public
oncology research — ClinicalTrials.gov, PubMed, openFDA drug updates, Europe
PMC preprints — against one patient's structured case, deterministically
scores what may matter, and produces source-backed, printable summaries the
family brings to their oncology team. It was built in memory of Judy Coffey:
the original version surfaced a promising trial-stage combination that her
oncologist agreed was worth trying. She passed before she could begin.
Firstlight exists so no other family finds what matters too late.

It is deliberately **not** a diagnostic tool or treatment recommender. It
never claims eligibility, never ranks treatments, and every finding says so —
the product's job is to make the conversation with the oncologist better.

## Why it's relevant to Anthropic

Anthropic's health work is expanding on two fronts: research (Claude Science,
Claude for Life Sciences) and consumer health (Apple Health connectors,
explaining results, appointment prep). Firstlight sits exactly where those
fronts meet — a working, auditable example of **safe patient-facing oncology
AI**, already Claude-native:

- **Claude is the default model.** Claude Sonnet has been Firstlight's
  recommended model since the first public release; the app now supports the
  first-party Anthropic API directly, alongside OpenRouter.
- **A Claude Desktop extension** (`firstlight.mcpb`, Apache-2.0) gives Claude
  read-only, consent-gated access to what Firstlight found — findings with
  rationale and cautions, and a case outline that is de-identified **by
  construction**. A patient can ask Claude "what's new for my case this week,
  and help me prepare questions for Thursday" grounded in their own monitored
  data, with identity never crossing the boundary.
- **Rules-first, LLM-second.** Deterministic matching decides what surfaces;
  Claude summarizes and drafts clinician-discussion questions behind
  fail-closed validators that reject advice-shaped language entirely.
- **A verifiable privacy boundary.** All Mode 2 payloads flow through a single
  audited function with a structural allowlist, 23 blocked identity keys,
  content scans, and profile-derived identity rejection — failing closed.
  `npm run test:privacy` runs the whole guarantee as a test suite.
  ([SAFETY.md](../../SAFETY.md))
- **Local-first.** Patient data stays on-device, encrypted at rest with the
  key in the OS keychain. No account, no telemetry, no Firstlight server.

## Why this is not "just chat with Claude"

Claude already reads ClinicalTrials.gov and PubMed. Firstlight is the piece a
chat session can't be: an **always-on local monitoring appliance** for one
patient's case — scheduled background runs, longitudinal change detection,
deterministic audit trails (source, date, rationale, cautions, score on every
finding), patient/caregiver triage UX, and clinician-ready printed reports.
Claude makes Firstlight's summaries better; Firstlight gives Claude a
privacy-preserving, always-current surface for the highest-stakes health
questions a family ever asks.

## What we're looking for

1. **Research credits** to fund the Claude-native roadmap: a published
   de-identification and guardrail evaluation harness, and open patterns for
   safe patient-facing oncology summarization.
2. **Connectors Directory / Desktop Extensions listing** for the Firstlight
   extension.
3. A **case study or mention** in Anthropic's health/life-sciences narrative —
   the patient-side complement to Claude Science.
4. Longer-term: a **design partnership** on evaluating and hardening
   patient-facing oncology AI.

## Facts at a glance

| | |
| --- | --- |
| Code | [github.com/seoplanotx/firstlight](https://github.com/seoplanotx/firstlight) (AGPL-3.0; MCP extension Apache-2.0) |
| Platforms | macOS + Windows, signed/notarized installers |
| Sources | ClinicalTrials.gov, PubMed, openFDA, Europe PMC |
| Safety design | [SAFETY.md](../../SAFETY.md) + `npm run test:privacy` (47 tests) |
| Privacy policy | [firstlighthq.com/privacy](https://firstlighthq.com/privacy/) |
| Claude integration | First-party API provider + Claude Desktop extension ([docs](../mcp-extension.md)) |
| Author | Tucker Coffey — [tucker@tuckercoffey.com](mailto:tucker@tuckercoffey.com) |
