# Firstlight extension for Claude Desktop

A [Desktop Extension (`.mcpb`)](https://github.com/modelcontextprotocol/mcpb) that
gives Claude **read-only** access to what your local
[Firstlight](https://firstlighthq.com) app has found — so you can ask Claude
things like *"what's new for my case this week?"* or *"help me prepare
questions about finding 12 for Thursday's appointment."*

Everything stays on your machine except what you already agreed to share:
Claude sees findings from public research sources, Firstlight's match
rationale, and a **de-identified** case outline. It never sees your name, date
of birth, contacts, exact location, clinician or hospital names, notes, or
files — Firstlight's fail-closed de-identification boundary
([SAFETY.md](https://github.com/seoplanotx/firstlight/blob/main/SAFETY.md))
enforces that in code, and this extension can only reach Firstlight's
consent-gated, read-only gateway (`/api/mcp`), not the app's other local data.

## Install

1. In **Firstlight**: Settings → **Claude Desktop connection** → *Turn on and
   get a connection code*. Copy the code (it's shown once).
2. In **Claude Desktop**: Settings → Extensions → install `firstlight.mcpb`
   (double-clicking the file also works).
3. Paste the connection code into the extension's settings.
4. Keep Firstlight running (it lives in the menu bar / system tray).

To revoke access at any time: Firstlight → Settings → Claude Desktop
connection → *Turn off*, or generate a new code to invalidate the old one.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_firstlight_status` | App version, profile presence, monitoring status, enabled sources |
| `list_recent_findings` | Findings with rationale, cautions, and source links |
| `get_finding` | One finding in full detail (evidence, fit, gaps) |
| `get_deidentified_case_context` | The de-identified case outline only |
| `get_latest_clinician_summary` | Prioritized findings + discussion questions + data gaps |
| `list_monitoring_runs` | Recent source-check history |

All tools are read-only (`readOnlyHint`). Firstlight is an information
monitoring tool, not medical advice — it never determines treatment, trial
eligibility, or medical appropriateness, and every finding requires clinician
review.

## Troubleshooting

- **"Firstlight isn't running"** — open the Firstlight app; it must be running
  (menu bar / system tray counts) for the extension to answer.
- **"Claude Desktop access is turned off"** — turn it on in Firstlight
  Settings → Claude Desktop connection.
- **"The connection code doesn't match"** — generate a new code in Firstlight
  and update it in the extension's settings in Claude Desktop.

## Build from source

```bash
npm install
npm run build          # bundles src/ -> dist/index.js
npm test               # vitest
npm run pack           # dist + manifest -> firstlight.mcpb
```

## License

Apache-2.0 (this package only — the Firstlight application is AGPL-3.0-only).
See [LICENSE](LICENSE).
