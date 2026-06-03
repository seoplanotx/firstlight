# Product screenshots

Real screenshots of every Coffey screen, used by the promotional deck
(`../build_deck.py` reads them from `raw/`).

They are captured from the **actual app** — the real React UI talking to the
real local FastAPI backend — seeded with the contributor-only demo connectors
(offline, deterministic, no real patient data).

## Files

| File | Purpose |
| --- | --- |
| `raw/*.png` | The screenshots (dashboard, findings, trials, updates, reports, profile, settings, support, onboarding). |
| `seed.py` | Seeds an isolated DB with demo content + a demo profile + reports. |
| `capture.mjs` | Drives headless Chromium to screenshot each route. |
| `capture.sh` | Boots a seeded backend + Vite dev server and runs the capture. |

## Regenerate

```bash
# one-time tooling (kept out of the project's package.json on purpose —
# @sparticuz/chromium pulls a ~60MB headless Chromium binary):
npm i -D puppeteer-core @sparticuz/chromium

# backend must be importable (e.g. a venv with `pip install -e backend`)
PYTHON_BIN=backend/.venv/bin/python bash marketing/screenshots/capture.sh

# then rebuild the deck so it picks up the new images
python marketing/build_deck.py
```

The capture uses `puppeteer-core` + `@sparticuz/chromium` so it works in
environments where the Playwright browser CDN is blocked. Screenshots are taken
at the desktop window size (1360×900) and downscaled to 1600px wide for the deck.

> The demo content is themed around a non-small-cell-lung-cancer / EGFR profile
> purely to populate the screens. It is illustrative, not real medical data.
