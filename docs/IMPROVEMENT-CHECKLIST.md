# Firstlight improvement checklist (tracked)

**Status as of:** 2026-07-13  
**Repo:** OncoWatch / Firstlight (`v0.3.0` baseline)  
**Owner:** Tucker + Hermes

Priority order from product review. Check boxes as work ships.

## Ranked work

### 1. Auto-update (real keys + release artifacts) — ALREADY LIVE (verified 2026-07-13)
- [x] Release signing keypair exists (generated 2026-06-13; private key + password backed up in `~/Projects/firstlight-signing-backup/KEY-INFO.txt`, never committed)
- [x] `plugins.updater.pubkey` in `tauri.conf.json` is the real public key (matches backup)
- [x] Endpoint `.../releases/latest/download/latest.json` confirmed
- [x] `createUpdaterArtifacts` stays **off** in the committed config by design — `release.yml` enables it at release time via `src-tauri/updater.release.json` so dev/CI builds never need the key
- [x] CI secrets `TAURI_SIGNING_PRIVATE_KEY` (+ password) already wired — proven by v0.3.0 release assets (`.sig` files + `latest.json` published by CI)
- [x] Startup update check already present in Tauri `main.rs`
- [x] Document ops in `docs/auto-update-setup.md` + release checklist

### 2. Source health / `last_error` visibility
- [x] Dashboard “Where we looked” from last run
- [x] Settings: last success + last error per source
- [x] Dashboard fallback: persistent source health when no run statuses

### 3. Connector honesty / no demo in public product
- [x] Public sources only in settings API (`PUBLIC_SOURCE_KEYS`)
- [x] Bootstrap disables demo connectors + purges demo findings
- [x] Monitoring only runs public connectors
- [x] Onboarding demo profile gated behind `ONCOWATCH_ALLOW_DEMO_CONTENT=1`
- [x] Regression test for demo hard-disable

### 4. Plain-language relevance (no raw “Match score”)
- [x] Finding cards show relevance label + short explainer
- [x] Remove raw score from default family UI

### 5. Packaged-app release smoke ritual
- [x] `docs/packaged-smoke-checklist.md`
- [x] `scripts/packaged_smoke_checklist.sh` (prints/gates checklist)

### 6. Bulk triage on Findings
- [x] Backend bulk action endpoint
- [x] UI multi-select + bulk discuss / set aside

### 7. Persist Findings sort/filters
- [x] localStorage preferences for sort, type filter, include dismissed, source, date range

### 8. Date-range + source filters
- [x] Findings toolbar filters by source + date range (client-side on loaded set)

### 9. Multi-profile switcher
- [x] Activate profile API
- [x] Sidebar / Patient Details profile switcher + create second profile path

### 10. Document-assisted profile setup (regex-first)
- [x] Backend extract-from-text service (local, no LLM required)
- [x] Profile page paste → review → apply candidates
- [ ] Optional later: de-identified AI assist extraction (Mode 2 only)

## Verification before release
- [ ] `npm run test:backend`
- [ ] `npm run lint` + `npm run test:frontend`
- [ ] `npm run test:privacy`
- [ ] Clean-machine packaged smoke (macOS + Windows when cutting release)
- [ ] No demo sources enabled without env flag

## Notes
- User-facing product name remains **Firstlight**; internal `oncowatch` identifiers stay until a deliberate migration.
- Auto-update cannot be fully “live” until Tucker generates and installs real updater keys (secrets stay out of git).
