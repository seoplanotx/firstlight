# Contributing to Firstlight

Thank you for helping. Firstlight exists so that families facing cancer can
catch relevant new research early and bring it to their oncology team. That
mission shapes how we accept changes.

## The non-negotiables

Firstlight's safety and privacy guarantees are product requirements, not
preferences. Pull requests that weaken them will not be merged, no matter how
useful the feature:

- **No treatment, eligibility, or diagnostic claims** — anywhere, ever.
  User-facing language stays cautious ("may be relevant", "worth discussing
  with your oncology team"). See [SAFETY.md](SAFETY.md).
- **Rules-first, LLM-second** — deterministic matching decides what surfaces;
  the LLM only summarizes and drafts discussion questions, behind fail-closed
  validators.
- **The de-identification boundary is a safety guarantee** — nothing
  identifying leaves the device. Treat
  `backend/app/services/deidentification_service.py` as security-critical code.
- **Local-first** — no feature may require an account, cloud sync, or sending
  patient data off-device.

Run `npm run test:privacy` before and after touching anything near these
boundaries.

## Getting set up

Prerequisites: Node.js 22.x (`.nvmrc`), Python 3.11+ (`.python-version`), Rust
stable (`rust-toolchain.toml`), plus the [Tauri OS prerequisites](https://tauri.app/start/prerequisites/)
for desktop builds.

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -e .

# Frontend / desktop (from repo root)
nvm use && npm install

# Run everything (backend + desktop)
npm run dev
```

Conventions (layering, naming, migrations, UTC dates, schema/type sync) are
documented in [CLAUDE.md](CLAUDE.md) — it is written for AI assistants but is
the canonical conventions reference for humans too. Two that trip people up:

- New user-facing strings say **Firstlight**; internal identifiers keep the
  legacy `oncowatch` name (data folder, env vars, keychain service, bundle id).
- Any SQLAlchemy model change needs an alembic revision under
  `backend/alembic/versions/` plus coverage in `backend/tests/test_migrations.py`.

## Checks — run before pushing (these mirror CI)

```bash
npm run lint             # frontend typecheck (tsc --noEmit)
npm run build:frontend   # vite build
npm run test:frontend    # vitest
npm run test:backend     # backend unittest suite
npm run test:privacy     # de-identification + LLM guardrail suite
npm run test:e2e         # Playwright onboarding smoke test
npm run check:rust       # sidecar build + cargo check
```

Backend tests are plain `unittest` (no pytest), one `test_<area>.py` per
service, built on an in-memory SQLite engine — see
`backend/tests/test_findings_service.py` for the pattern. Keep tests
deterministic and offline; connectors are tested against recorded/mocked HTTP.

## Pull requests

- Keep PRs focused; explain the *why*, not just the *what*.
- Add or extend tests for behavior you change.
- Update the relevant `docs/` page when behavior or scope changes.
- Expect review through the safety lens above.

## Licensing of contributions

Firstlight is licensed under **AGPL-3.0-only** (see [LICENSE](LICENSE)). By
contributing, you agree that your contributions are licensed under the same
license as the files you modify. One exception today:
[`packages/mcp-server/`](packages/mcp-server/) (the Claude Desktop extension)
is **Apache-2.0** — a `LICENSE` file in that directory says so, and
contributions there are accepted under Apache-2.0.

## Security issues

Please don't report vulnerabilities in public issues — see
[SECURITY.md](SECURITY.md) for private reporting.
