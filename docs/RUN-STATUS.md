# OncoWatch Run Status

_Last updated: 2026-07-03_

## Status
- Run 1 — complete
- Run 2 — complete
- Run 3 — complete
- Run 4 — complete
- Run 5 — in progress
- Run 6 — pending
- Run 7 — pending

## Notes
- Run 1 shipped the real ClinicalTrials.gov connector, PubMed abstract-aware evidence, normalization, scoring improvements, and backend tests.
- Run 2 shipped the onboarding JSON-serialization fix, onboarding flow stabilization, richer trial/evidence fields in the UI, migration regression tests, and repo/docs cleanup.
- Run 3 shipped deterministic briefing ranking/grouping, dashboard/run-change surfacing, report briefing summaries/previews, and backend tests for ranking/report structure.
- Run 4 shipped the visual overhaul: calmer sidebar/navigation, stronger page hierarchy, improved briefing cards, richer finding presentation, cleaner onboarding framing, and upgraded responsive spacing across the core desktop views.
- 2026-07-03 (Claude-native run, outside the numbered sequence): repo hygiene (SECURITY/CONTRIBUTING/SAFETY docs, `npm run test:privacy`, README badges, firstlighthq.com/privacy page); Claude Desktop extension (`packages/mcp-server`, `firstlight.mcpb`) over a new consent-gated read-only `/api/mcp/*` gateway (migration 0004); first-party Anthropic API provider alongside OpenRouter with per-provider routes and an in-app provider picker (migration 0005); **fixed the frozen-sidecar boot bug** — `serve.py` loaded the app via uvicorn's `"app.main:app"` string, which PyInstaller cannot trace, so packaged sidecars did not bundle the application modules; the app is now imported statically and the packaged binary boots and serves (worth re-verifying the full packaged .app during the next release QA). Anthropic partnership assets live in `docs/partners/anthropic.md` + git-ignored `outreach/`.
- Run 5 is ready to start: connector honesty / remaining fake-feed risk.
- If a scheduled continuation check fires while an OncoWatch Codex run is actively modifying files, it should do nothing and leave the active run alone.
- After each run finishes, update this file so the next continuation step can pick up the next unfinished run cleanly.
