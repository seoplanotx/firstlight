# Packaged-app smoke checklist (Firstlight)

Run this on a **clean machine** for each public release (macOS DMG and Windows NSIS).

## Preflight
- [ ] CI green on the release tag
- [ ] Version bumped consistently (root `package.json`, Tauri conf, `APP_VERSION`)
- [ ] Changelog / release notes list known issues

## Install + boot
- [ ] Install artifact without developer tools installed
- [ ] App launches; local backend starts (no terminal)
- [ ] Onboarding completes without blocking on external source downtime
- [ ] Support page shows data/log/report paths

## Core product path
- [ ] Create/edit patient profile
- [ ] Manual “Check now” run completes
- [ ] Dashboard shows new/changed sections OR an honest empty state
- [ ] “Where we looked” shows per-source ok/trouble
- [ ] Findings list triage (discuss / set aside) works, including bulk actions
- [ ] Clinician summary + printable report generate
- [ ] Export my data / delete my data controls work

## Trust / safety
- [ ] Disclaimer visible
- [ ] No demo feeds or demo findings in a default install
- [ ] Privacy mode defaults to local-only
- [ ] Identifying fields not readable as plain text in SQLite

## Packaging-specific
- [ ] Quit and relaunch; data persists
- [ ] Sidecar backend still serves after relaunch
- [ ] (When updater keys live) previous version can detect this release

## Sign-off
- Build version: ________
- Git SHA: ________
- Tester: ________
- Date: ________
- Result: pass / fail (notes): ________
