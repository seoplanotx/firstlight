# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**Firstlight** (formerly **OncoWatch**) is a **local-first desktop application**
that helps cancer patients and families monitor new oncology research, organize
what may matter, and bring structured, source-backed summaries to their oncology
team. It is an *information monitoring and summarization* tool — **not** a
diagnostic system, not a treatment recommender, and not a substitute for an
oncologist. Every surfaced finding requires clinician review.

Read `README.md` for product framing and the `docs/` folder for deep dives
before making non-trivial changes.

### Naming: Firstlight vs. oncowatch

The product was renamed from OncoWatch to Firstlight. The user-facing name is
**Firstlight** everywhere (window title, installer, reports, UI copy). But many
**internal identifiers intentionally keep the legacy `oncowatch` name** for
backward compatibility — do **not** rename these without a deliberate data/key
migration:

- On-disk data folder (`OncoWatch`) and DB file (`oncowatch.sqlite3`) — see `backend/app/core/paths.py`
- `ONCOWATCH_*` development environment variables — see `backend/app/core/config.py`
- The OS-keychain service that stores the master encryption key
- The `ai.oncowatch.desktop` bundle identifier and the `oncowatch-backend` sidecar
- Python package name `oncowatch-backend`, npm package `oncowatch`/`oncowatch-desktop`

When in doubt: **new user-facing strings say Firstlight; existing internal
identifiers stay `oncowatch`.**

## Architecture

Three runtime layers. The UI talks **only** to the local API — there is no
required cloud backend.

```
Tauri shell (Rust)  ──spawns──►  FastAPI backend (Python, sidecar binary)
   apps/desktop/src-tauri            backend/app  (http://127.0.0.1:17845)
        │                                  │
        └── hosts WebView ─► React UI ─────┘ (HTTP /api)
              apps/desktop/src
```

- **Shell**: Tauri 2 (Rust). Spawns the backend sidecar, owns the menu-bar/system-tray
  lifecycle, native notifications, and keeps the app running in the background for the
  scheduler. See `apps/desktop/src-tauri/src/main.rs`.
- **Frontend**: React 18 + TypeScript + Vite. Calls the backend over HTTP. Dev server on
  port 1420.
- **Backend**: FastAPI + SQLAlchemy 2 + SQLite, on `127.0.0.1:17845`. APScheduler for
  scheduled runs, ReportLab for PDFs, alembic for migrations.

### Core principles (keep these intact)

- **Local-first**: patient data stays on-device by default.
- **Rules-first, LLM-second**: deterministic matching/scoring drives the product. The LLM
  is limited to summarization, cautious explanation, discussion-question generation, and
  missing-info prompts — **never** the primary relevance engine.
- **Auditability**: every surfaced item stores source, dates, rationale, cautions, and score.
- **Truthful scope**: only claim what is real today. Don't present treatment decisions,
  trial-eligibility certainty, "best treatment" rankings, or diagnostic claims. Default
  language stays cautious ("may be relevant", "worth discussing with your oncology team").
- **Two privacy modes** (see `docs/privacy-modes.md`):
  - **Local-only**: no AI provider receives case context.
  - **De-identified AI assist**: only minimized oncology context (no identifying fields)
    may be sent to a selected provider, after explicit disclosure acknowledgement.
  De-identification logic lives in `backend/app/services/deidentification_service.py` — treat
  its boundary as a safety guarantee, not a convenience.

## Repository layout

```
backend/                 Python FastAPI service
  app/
    main.py              FastAPI app + lifespan (logging, bootstrap, scheduler)
    serve.py             Sidecar entrypoint (oncowatch-backend console script)
    api/
      router.py          Mounts all routers under /api
      routes/            One module per resource (findings, runs, reports, …)
      deps.py            FastAPI dependencies (DB session, etc.)
    connectors/          Research source connectors (see "Connectors" below)
    core/                config, logging, paths, release (version), security (crypto)
    db/                  base, session, migrations (alembic runner), custom types
    models/              SQLAlchemy ORM models
    schemas/             Pydantic request/response schemas
    services/            Business logic (the heart of the app)
    utils/               Small helpers (dates)
  alembic/               Migration env + versions
  scripts/seed_demo.py   Contributor-only demo data seeding (NOT public scope)
  tests/                 unittest suite (test_*.py per service/area)
  pyproject.toml         Deps, optional [build] extra (pyinstaller), console script

apps/desktop/            Tauri desktop app
  src/                   React + TS frontend
    App.tsx              Boot/retry, onboarding gate, HashRouter routes
    pages/               One component per route (Dashboard, Findings, Trials, …)
    components/          Reusable UI (Card, Badge, Layout, Sidebar, …)
    features/            Larger flows (onboarding wizard, profile form, AI setup)
    lib/                 api.ts (HTTP client), types.ts, helpers, *.test.ts(x)
    test/setup.ts        Vitest setup
  src-tauri/             Rust shell (main.rs, tauri.conf.json, capabilities, icons)

docs/                    Architecture and feature docs (read these!)
scripts/                 Build helpers (build_backend_sidecar.py, build_macos_dmg.sh, set_version.py)
e2e/                     Playwright smoke test (onboarding.spec.ts)
site/ + marketing/       Static marketing site and deck assets
docker/                  docker-compose for local backend (dev convenience)
```

## Development workflow

### Prerequisites
- Node.js 22.x (`.nvmrc`), Python 3.11+ (`.python-version`), Rust stable (`rust-toolchain.toml`),
  plus Tauri OS prerequisites for desktop builds.

### Setup
```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -e .

# Frontend / desktop (from repo root)
nvm use && npm install
```

### Run (root scripts)
```bash
npm run dev            # backend + desktop together (concurrently)
npm run dev:backend    # uvicorn on 127.0.0.1:17845, --reload
npm run dev:desktop    # tauri dev (Vite on 1420)
```

### Checks — run the relevant ones before pushing (these mirror CI)
```bash
npm run lint           # frontend typecheck (tsc --noEmit)
npm run build:frontend # vite build
npm run test:frontend  # vitest (frontend unit tests)
npm run test:backend   # backend unittest suite
npm run test:e2e       # Playwright onboarding smoke test
npm run check:rust     # builds sidecar + cargo check on the Tauri crate
```

Backend tests directly (verbose):
```bash
cd backend && PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -v
```

### CI (`.github/workflows/ci.yml`) runs on every PR
- `backend-tests` — unittest suite
- `frontend-checks` — `npm run lint` + `npm run build:frontend`
- `frontend-tests` — vitest
- `frontend-smoke` — Playwright e2e
- `macos-desktop-build` / `windows-desktop-build` — full desktop bundle

Match these locally before pushing. Release packaging is in `.github/workflows/release.yml`
and `docs/release-checklist.md`.

## Backend conventions

- **Layering**: `routes` (thin, HTTP + schema) → `services` (business logic) → `models`
  (ORM). Put real logic in services, not route handlers. Schemas in `schemas/` validate
  request/response shapes.
- Adding an endpoint: create/extend a module in `app/api/routes/`, then mount it in
  `app/api/router.py` with an explicit `prefix` and `tags`. All routes live under `/api`.
- `from __future__ import annotations` at the top of every module; modern typing
  (`int | None`, built-in generics).
- Dataclasses use `@dataclass(slots=True)` (see connectors, config).
- **Times** are UTC — use `app.utils.dates.utcnow()`, not `datetime.now()`.
- **Migrations**: schema is managed by alembic. `app/db/migrations.py` runs migrations on
  startup (`ensure_schema_up_to_date`) and handles the legacy-baseline stamp. Add a new
  revision under `backend/alembic/versions/` when you change a model; cover it with a test
  in `test_migrations.py`.
- **Encryption at rest**: identifying fields are encrypted via custom SQLAlchemy types
  (`app/db/types.py`) using a master key (`app/core/security.py`) stored in the OS keychain.
  Don't log or export decrypted identifying data; don't weaken the de-identification boundary.
- **Paths**: never hardcode storage locations. Use `app.core.paths.get_app_paths()`. Tests
  and dev can override via `ONCOWATCH_DATA_DIR` / `ONCOWATCH_CONFIG_DIR` / `ONCOWATCH_CACHE_DIR`.
- **Version** is centralized in `app/core/release.py` (`APP_VERSION`); use `scripts/set_version.py`
  to bump versions across the repo.

### Tests (backend)
- Plain `unittest` (no pytest, no shared `conftest.py`). One `test_<area>.py` per service.
- Tests build an **in-memory SQLite engine** from `app.db.base.Base` and a `sessionmaker`,
  then construct ORM objects directly (see `tests/test_findings_service.py` for the pattern).
- Keep tests deterministic and offline — connectors that hit the network are tested against
  recorded/mocked HTTP, not live endpoints.

## Connectors (research sources)

Connectors live in `backend/app/connectors/` and implement `BaseConnector`
(`base.py`): a `fetch(context) -> list[ConnectorRecord]` method and a `healthcheck()`.
They are wired up in `registry.py`.

**Live connectors (public scope):**
- `clinicaltrials_gov` — ClinicalTrials.gov trial search
- `pubmed_literature` — PubMed, abstract-aware evidence snippets
- `openfda_drug_updates` — openFDA drug label/safety updates
- `europepmc_preprints` — Europe PMC preprints/literature

**Demo connectors** (`demo_*`, backed by `demo_catalog.json`) are **contributor-only** and
seeded via `backend/scripts/seed_demo.py`. They are **not** part of the public product —
don't surface them in user-facing flows or claim them as features.

Adding a connector: subclass `BaseConnector`, return normalized `ConnectorRecord`s, register
it in `registry.py`, share HTTP plumbing via `connectors/http.py` (retry/backoff so one flaky
source can't fail a whole run), and add tests. See `docs/connectors-and-matching.md` for the
normalization → matching → scoring pipeline.

## Frontend conventions

- React 18 function components + hooks. Routing via `react-router-dom` **HashRouter** (Tauri
  serves from a file origin). Routes are declared in `App.tsx`.
- All backend access goes through `src/lib/api.ts` (the `api` object + `ApiError`). Base URL
  is `import.meta.env.VITE_API_BASE || 'http://127.0.0.1:17845'`; requests are prefixed `/api`.
  Don't call `fetch` ad-hoc from components.
- Shared types in `src/lib/types.ts` mirror the backend Pydantic schemas — keep them in sync
  when you change an API shape.
- `lint` is `tsc --noEmit` — there is no ESLint; type safety is the gate. Keep it strict.
- Tests are **vitest** + Testing Library, colocated as `*.test.ts(x)`.
- Plain-language copy by default, with an optional clinical-terms mode (`lib/languageMode.ts`).
  Preserve the cautious, non-prescriptive tone in all user-facing strings.

## Tauri shell

- `src-tauri/src/main.rs` spawns the `oncowatch-backend` sidecar (release builds), manages the
  tray/menu-bar lifecycle, and keeps the app alive in the background for the scheduler (closing
  the window hides to tray; real quit is via the tray menu).
- Config is `tauri.conf.json`; sidecar binaries are declared via `externalBin`. Capabilities/
  permissions live in `src-tauri/capabilities/`.

## Packaging

The frontend is bundled by Tauri; the Python backend is compiled into a standalone sidecar via
PyInstaller (`scripts/build_backend_sidecar.py`, output in `dist-sidecar/`). The macOS `.app` is
wrapped into a deterministic `hdiutil` DMG (`scripts/build_macos_dmg.sh`).

```bash
nvm use && npm install
python -m pip install -e './backend[build]'
npm run build:desktop        # macOS .app + DMG
npm run build:desktop:win    # Windows NSIS installer
```

See `docs/packaging.md` and `docs/release-checklist.md` (signing/notarization/release handoff).

## Dev environment variables (legacy `ONCOWATCH_*` names)

End users never edit env files. The backend reads these only in development:

```
ONCOWATCH_ENV=development
ONCOWATCH_BACKEND_HOST=127.0.0.1
ONCOWATCH_BACKEND_PORT=17845
ONCOWATCH_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
ONCOWATCH_DATA_DIR / ONCOWATCH_CONFIG_DIR / ONCOWATCH_CACHE_DIR   # override storage (handy for tests)
```

## Docs index

- `docs/architecture.md` — runtime layers and module ownership
- `docs/api-routes.md` — endpoint reference
- `docs/connectors-and-matching.md` — connector behavior, normalization, scoring, tests
- `docs/onboarding.md` — first-run flow
- `docs/privacy-modes.md` / `docs/privacy-and-terms.md` — privacy boundary and policy
- `docs/storage.md` — local storage layout and behavior
- `docs/packaging.md` / `docs/release-checklist.md` — build and release
- `docs/RUN-STATUS.md` / `docs/NEXT-CODEX-RUNS.md` — historical run log / roadmap notes

## License

AGPL-3.0-only. Copyright © 2026 Tucker Coffey. New files should carry compatible licensing;
don't introduce dependencies incompatible with AGPL.

## When making changes — checklist

1. Keep the safety/scope guarantees intact (no treatment/diagnostic claims; cautious language;
   rules-first; privacy boundary).
2. Backend logic goes in `services/`; keep routes thin and schemas in sync with frontend `types.ts`.
3. New user-facing strings say **Firstlight**; leave internal `oncowatch` identifiers alone.
4. Add/extend tests (backend `unittest`, frontend `vitest`); run the CI-equivalent checks above.
5. Model change → alembic revision + migration test.
6. Update the relevant `docs/` page when behavior or scope changes.
