# Firstlight Safety Design

This document explains, for a technically literate reviewer, how Firstlight
keeps its scope honest and its users' data private — and how to verify those
claims against the code and tests in this repository.

**The one-paragraph version:** Firstlight is an information monitoring tool
for cancer patients and families. Deterministic rules — not a language model —
decide what research surfaces and why. Patient data stays on the device,
encrypted at rest. If the user opts in to AI assistance, the only payload that
can leave the device is a minimized, de-identified packet built by a single
audited function, and everything the model sends back passes through
fail-closed validators that reject advice-shaped language entirely. Every
guarantee below is enforced in code and covered by tests you can run with one
command: `npm run test:privacy`.

## 1. Scope guarantees

Firstlight **never** presents:

- treatment decisions or recommendations
- trial-eligibility determinations or certainty
- "best treatment" rankings or comparisons
- diagnostic claims

Default language stays cautious by construction: "may be relevant", "worth
discussing with your oncology team", "requires clinician review",
"insufficient information to determine fit". Every surfaced finding stores its
source, dates, rationale, cautions, and score for audit. The app states in its
UI, reports, and documentation that every finding requires clinician review.

## 2. Rules first, LLM second

The language model is **never the relevance engine**. Deterministic matching
and scoring (`backend/app/services/matching_service.py`) decide what surfaces,
against structured connector data from public sources (ClinicalTrials.gov,
PubMed, openFDA, Europe PMC).

The LLM's entire job, when enabled, is two narrow generation tasks in
`backend/app/services/llm_service.py`:

1. drafting short **clinician-discussion questions**, and
2. writing a **one-line neutral case framing**.

Both have deterministic fallbacks — if the model is unavailable, misbehaves,
or fails validation, the product still works and simply omits the AI text.

## 3. Two privacy modes

| | Mode 1 — Local-only (default) | Mode 2 — De-identified AI assist (opt-in) |
| --- | --- | --- |
| Patient data leaves device | Never | Never — only a minimized de-identified packet |
| LLM calls | None | Two narrow tasks (above) |
| Enablement | Default | Explicit opt-in **plus** disclosure acknowledgement |

Mode 2's disclosure states plainly that de-identified cancer context can still
be sensitive and goes to a third-party provider under that provider's terms.
See `docs/privacy-modes.md` for the full boundary specification.

## 4. The de-identification boundary

All Mode 2 payloads are built by **one function** —
`build_deidentified_case_packet()` in
`backend/app/services/deidentification_service.py` — and every LLM client call
re-asserts the invariant with `assert_deidentified_packet()` before any
network request. The packet contract is enforced in five layers:

**a. Structural allowlist.** The packet may contain *only* these paths; any
unexpected key, nested object, or list anywhere raises `DeidentificationError`:

```
packet:            privacy_mode · task · profile_context · findings · safety_instructions
profile_context:   cancer_type · subtype · stage_group · general_location ·
                   travel_radius_miles · biomarkers[{name, variant, status}]
findings[]:        type · title · source_name · external_identifier · structured_tags
```

**b. Blocked-key screen.** 23 identity-shaped key names (`display_name`,
`dob`, `mrn`, `notes`, `doctor`, `hospital`, `phone`, `email`, `address`,
`profile_id`, …) are rejected at any depth, case-insensitively.

**c. Content scans.** Every string in the packet is scanned for identity-
shaped *values*: emails, phone numbers, local filesystem paths, ZIP codes,
city+state patterns, clinician/facility vocabulary, well-known cancer-center
names, exact dates in multiple formats, month-day mentions, standalone years,
and person-name shapes (with a medical-vocabulary filter so "EGFR Mutation" is
not mistaken for a name). Any hit fails the packet.

**d. Profile-derived identity terms.** The patient's own name (and initial +
surname variants) are extracted from the local profile and searched for across
the entire packet — so a name that leaked into any field is caught even though
the name itself never appears in the allowlist.

**e. Generalization before inclusion.** Location is reduced to state/region
level (`generalize_location_label` — street, city, and ZIP detail never
qualifies); staging free-text is reduced to a coarse group like "Stage IV" or
"metastatic" (`generalize_stage_or_context`). The `task` field must be one of
six allowlisted task names.

**Failure mode: closed.** Any violation raises `DeidentificationError` and no
request is made. There is no "send anyway" path.

## 5. Output validation — fail closed

Model output is untrusted. `llm_service.py` gates it on the way back in:

- **Unsafe-language rejection.** Sixteen pattern families reject
  advice-shaped output: *should / start / switch / prescribe / enroll*,
  *eligible / eligibility / qualify / candidate for*, *recommend*, *benefit
  from*, *appropriate / good fit*, *dose / dosing*, *rank / choose / compare*,
  *respond*, *diagnose / diagnosis / prove*, *best treatment*, *final
  decision*.
- **Strict batch semantics for questions.** If *any* generated question trips
  an unsafe pattern, the **entire batch is discarded** (`return []`), not just
  the offending line — one bad generation is treated as evidence the batch
  can't be trusted.
- **Review-framing requirement.** A question that never mentions review or
  discussion with the care team is rejected even if nothing unsafe matched.
- **Case framing limits.** One line, ≤ 320 characters, same unsafe-language
  screen; otherwise it becomes the empty string.
- **Exceptions fail closed.** Network errors, malformed responses, timeouts —
  all return empty results. Deterministic content still renders.

The system prompts also instruct the model against advice and identity
inference, but **nothing relies on the model following instructions** — the
gates above enforce the contract regardless.

## 5a. The Claude Desktop connection (MCP gateway)

Firstlight ships an optional [Claude Desktop extension](packages/mcp-server/)
that lets Claude read what Firstlight found. It obeys the same boundary as
Mode 2, enforced server-side in `backend/app/services/mcp_gateway_service.py`:

- **Off by default.** The user turns it on in Settings and receives a
  one-time connection code; the backend stores only an encrypted copy. Turning
  it off (or generating a new code) revokes access immediately. Enable/disable
  events are recorded in the audit log.
- **A dedicated read-only namespace** (`/api/mcp/*`) serves privacy
  projections: public source data plus non-identifying match rationale. Case
  context is available *only* as the de-identified packet from
  `build_deidentified_case_packet()` — the same fail-closed function Mode 2
  uses. Raw profiles, notes, audit logs, exports, and internal match/LLM
  metadata are not reachable through this namespace, and the response schemas
  (`backend/app/schemas/mcp.py`) act as field allowlists.
- **Honest scope of the token.** The connection code is a consent and
  revocation mechanism and proof of deliberate setup — not a hard security
  boundary against malicious local software, since the rest of the local API
  is currently unauthenticated on `127.0.0.1` (see §9). Extending token
  enforcement to all routes is planned hardening.

## 6. Encryption and key handling

Identifying profile fields (name, date of birth, location, free-text notes)
are encrypted at rest via custom SQLAlchemy types (`backend/app/db/types.py`)
using Fernet (AES-128-CBC + HMAC). The master key lives in the OS keychain
(macOS Keychain / Windows Credential Manager) with a permission-restricted
local key file as fallback (`backend/app/core/security.py`). API keys for AI
providers are encrypted with the same machinery. Decrypted identifying data is
never logged.

## 7. User transparency and control

- **Activity log** — a local, append-only audit record of data-affecting
  actions, visible in the app.
- **Export my data** — full portable JSON export.
- **Delete my data** — permanent local deletion of profiles, findings, runs,
  and reports.
- **No account, no telemetry, no cloud sync.** There is no Firstlight server.

## 8. Verify it yourself

```bash
npm run test:privacy
```

runs the safety-critical test modules:

| Module | What it proves |
| --- | --- |
| `backend/tests/test_deidentification_service.py` | Packet allowlist, blocked keys, content scans, identity-term rejection, generalization |
| `backend/tests/test_llm_service.py` | Deid gate fires before any network call; unsafe output is rejected; fail-closed behavior |
| `backend/tests/test_heartbeat_service.py` | The packet actually sent during monitoring runs is the de-identified packet |
| `backend/tests/test_clinician_summary_service.py` | Same guarantee for clinician-summary generation |
| `backend/tests/test_mcp_gateway.py` | Claude Desktop gateway: off-by-default, token auth, no blocked identity key in any payload, case context passes the deid assertion |

The full suite is `npm run test:backend`; CI runs it on every pull request.

## 9. Honest limitations

- **Firstlight does not claim HIPAA compliance.** It is a consumer tool that
  keeps data local; it is not a covered entity's system of record.
- **De-identified is not anonymous.** A rare diagnosis plus an unusual
  biomarker combination can be distinctive. The Mode 2 disclosure says so, and
  Mode 2 stays off unless the user turns it on.
- **The content scans are heuristics.** They are defense-in-depth on top of
  the structural allowlist — the allowlist is the primary guarantee; the scans
  catch what allowlisted *values* might smuggle in.
- **The trust boundary is the user's device.** The backend binds to
  `127.0.0.1` only, but other software running as the same user could read
  local data — as with any local-first desktop app. Firstlight does not defend
  against a compromised machine.
- **Third-party terms apply in Mode 2.** The de-identified packet goes to the
  user's chosen AI provider under that provider's terms; Firstlight minimizes
  what is sent but cannot control what a provider does with it.
