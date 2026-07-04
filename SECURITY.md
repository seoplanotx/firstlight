# Security Policy

Firstlight handles sensitive health context for cancer patients and their
families. Security reports are taken seriously and handled with care.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release (0.2.x) | ✅ |
| Older releases | ❌ — please update to the latest release |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via GitHub's private vulnerability reporting:
[github.com/seoplanotx/firstlight/security/advisories/new](https://github.com/seoplanotx/firstlight/security/advisories/new)
(repository **Security** tab → *Report a vulnerability*).

Please include reproduction steps, the affected version, and your assessment of
impact. **Never include real patient data in a report** — use invented profile
values (the repository's test fixtures show the expected shapes).

Firstlight is maintained by a solo maintainer. Expect an acknowledgement within
**7 days** and a good-faith fix timeline proportional to severity. Credit is
offered in release notes unless you prefer otherwise. There is no bug bounty.

## What is especially in scope

The guarantees below are load-bearing for the people who use Firstlight, so
reports against them are the highest priority:

1. **The de-identification boundary** — any way to get identifying data
   (names, dates of birth, contact details, clinician/facility names, precise
   locations, local file paths, free-text notes) into a payload that leaves the
   device in de-identified AI-assist mode. See
   `backend/app/services/deidentification_service.py` and [SAFETY.md](SAFETY.md).
2. **Encryption at rest** — weaknesses in how identifying fields are encrypted
   (`backend/app/db/types.py`) or how the master key is stored and retrieved
   (`backend/app/core/security.py`, OS keychain with protected-file fallback).
3. **The local API surface** — the backend binds to `127.0.0.1:17845`; anything
   that exposes it beyond the local machine (e.g. binding changes, CORS or
   request-forgery vectors that let a web page read patient data).
4. **Safety-scope bypasses** — ways to make the app emit treatment advice,
   eligibility determinations, or diagnostic claims past the fail-closed output
   validators in `backend/app/services/llm_service.py`.
5. **Packaging and update integrity** — installer or sidecar tampering vectors.

Out of scope: issues requiring a fully compromised machine (Firstlight's trust
model assumes the user's own device is trusted), and the content or accuracy of
third-party research sources.
