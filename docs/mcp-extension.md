# Claude Desktop extension (MCP)

Firstlight ships an optional Desktop Extension for Claude Desktop —
`packages/mcp-server/`, packaged as `firstlight.mcpb` — that gives Claude
**read-only** access to what the local Firstlight app has found. This page
covers the architecture, the privacy boundary, how to build it, and the
Anthropic Connectors Directory submission checklist.

## Architecture

```
Claude Desktop ──spawns──► firstlight .mcpb (Node, stdio MCP server)
                                 │  Authorization: Bearer <connection code>
                                 ▼
                    http://127.0.0.1:17845/api/mcp/*   (read-only gateway)
                                 │
                    FastAPI backend services (the running Firstlight app)
```

- The extension is a thin client: **all privacy decisions live in the Python
  backend**, next to `deidentification_service.py` where the tests are.
- It only knows the `/api/mcp/*` routes (`backend/app/api/routes/mcp_gateway.py`);
  raw profiles, notes, audit logs, and exports are not reachable through them.
- The Tauri shell keeps the backend alive while Firstlight sits in the menu
  bar / system tray, so the extension works whenever the app is "running" in
  any form. If the app was quit, tools return a friendly "open Firstlight"
  error instead of failing cryptically.

## Consent and access control

- Off by default. The user enables it in **Firstlight → Settings → Claude
  Desktop connection**, which generates a **connection code**
  (`secrets.token_urlsafe(32)`), stores it encrypted (same machinery as
  provider API keys), and shows it once.
- The user pastes the code into the extension's settings in Claude Desktop
  (the manifest marks it `sensitive`, so Claude Desktop keychains it).
- Every `/api/mcp/*` request requires the enabled flag (else `403`) and the
  bearer code (constant-time compare, else `401`). Disabling clears the token;
  re-enabling rotates it. Both actions are audit-logged.
- Honest limits: the code proves deliberate setup and provides revocation; it
  is not a defense against malicious local software (see SAFETY.md §5a/§9).

## What crosses the boundary

| Exposed | Never exposed |
| --- | --- |
| Findings from public sources with match rationale, cautions, evidence snippets | Name, DOB, contacts, exact location, clinician/facility names |
| De-identified case packet (via `build_deidentified_case_packet()`, fail-closed) | Free-text notes, files, audit log, data exports |
| Clinician summary (case header replaced with the de-identified context) | `match_debug`, `llm_metadata`, `raw_summary`, run `error_text` |
| Monitoring run history (counts, sources, timestamps) | Anything matching the 23 blocked identity keys |

`backend/tests/test_mcp_gateway.py` enforces this: every MCP payload is walked
for blocked identity keys, and the case-context response must pass
`assert_deidentified_packet()`. These tests run in `npm run test:privacy`.

## Build and test

```bash
npm run test:mcp     # vitest suite for the extension
npm run build:mcpb   # bundle (esbuild) + `mcpb pack` -> packages/mcp-server/firstlight.mcpb
```

Manual smoke test: install the `.mcpb` in Claude Desktop (Settings →
Extensions), paste a fresh connection code, and ask Claude "what's my
Firstlight status?" Then quit Firstlight and confirm the friendly
"Firstlight isn't running" tool error.

Version bumps flow through `scripts/set_version.py`, which updates
`packages/mcp-server/package.json` and `manifest.json` alongside the app.

## Connectors Directory submission checklist

Anthropic's directory requirements mapped to what we have:

- [x] Working MCP server with accurate tool metadata — six tools, all
      `readOnlyHint: true`
- [x] Clear documentation — `packages/mcp-server/README.md` + this page
- [x] Support channel — GitHub issues (in the manifest `support` field)
- [x] **Privacy policy URL** — https://firstlighthq.com/privacy/
- [x] Safety annotations on every tool (read-only; no destructive tools)
- [ ] Desktop Extensions interest form (submit `firstlight.mcpb` details)
- [ ] Directory submission via the submission portal / correct form for
      local desktop extensions (see claude.com/docs/connectors/building/submission)
- Hosting requirement is N/A for a local extension (nothing is hosted; the
  server talks to `127.0.0.1` only)

## License

`packages/mcp-server/` is Apache-2.0 (see its `LICENSE`); the rest of the
repository remains AGPL-3.0-only.
