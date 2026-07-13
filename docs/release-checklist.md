# OncoWatch release checklist (macOS + Windows)

OncoWatch ships as a signed macOS DMG and a signed Windows installer. Both
bundle the FastAPI backend as a PyInstaller sidecar; end users never install
Python or start a backend.

## Toolchain and CI

- `nvm use` so the repo uses Node 22.x from `.nvmrc`
- verify Python 3.11 is active
- verify Rust stable is active
- confirm GitHub Actions passed:
  - backend tests
  - frontend typecheck/build
  - frontend unit tests
  - frontend Playwright smoke test
  - macOS desktop build
  - Windows desktop build

## Local verification

- run `npm run lint`
- run `npm run build:frontend`
- run `npm run test:backend`
- run `npm run test:frontend`
- run `npm run check:rust`
- macOS: run `npm run build:desktop`
- Windows: run `npm run build:desktop:win`

## Clean-machine QA (run on macOS **and** Windows)

- install the artifact on a clean machine (DMG on macOS, NSIS installer on Windows)
- launch the app and confirm the local backend starts
- complete onboarding without any blocking health-check failures
- verify the app clearly says automatic runs only happen while OncoWatch is open
- run a manual monitoring cycle
- generate and download both report types
- open About / Support and confirm:
  - data, reports, logs, and config paths render
  - the activity (audit) log shows the actions you just took
  - "Export my data" produces a JSON file
  - "Delete all my data" wipes profiles/findings/reports after confirmation
- quit and reopen the app to confirm local data persists
- confirm the SQLite database on disk is not human-readable for identifying
  fields (profile name, DOB, location)

## Signing

### macOS
- sign the `.app` bundle with the release certificate
- sign the DMG if your release flow requires it
- submit the build for notarization and staple the ticket

### Windows
- sign the NSIS installer (`*-setup.exe`) and the bundled
  `oncowatch-backend-*.exe` sidecar with an Authenticode certificate
  (EV recommended to minimize SmartScreen friction)

## Auto-update setup (required infra before public GA)

The updater is already **wired in code**: `tauri-plugin-updater` is a
dependency, registered in `main.rs`, granted via the `updater:default`
capability, and configured in `apps/desktop/src-tauri/tauri.conf.json` under
`plugins.updater` (endpoint template + a placeholder public key). What remains
is signing-key and hosting infrastructure, which cannot live in the repo:

1. **Generate your own keypair** (do not reuse any placeholder):
   `npm --workspace apps/desktop run tauri -- signer generate -w ./oncowatch-updater.key`
2. Replace `plugins.updater.pubkey` in `tauri.conf.json` with **your** public
   key, and point `plugins.updater.endpoints` at your real hosted manifest URL.
3. Store the **private** key (and password, if set) as CI secrets
   (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
4. Add `"createUpdaterArtifacts": true` to the `bundle` config so signed update
   artifacts (`*.sig`) are produced during the release build.
5. Publish the update manifest + signed artifacts to the endpoint per release,
   and (optionally) call the updater plugin's check API on app startup.

> Note: the public key committed today is a **non-functional placeholder** so
> the app builds with the updater enabled; its private key was intentionally
> not retained. You must complete steps 1–2 before shipping real updates.

Until steps 1–5 are done, releases are install-only (no in-app update).

## Release handoff

- record the shipped version and git commit
- attach known issues and any post-release monitoring notes
- keep the previous signed DMG and Windows installer available for rollback
- include support notes covering log collection, the activity log, and the
  in-app data export/delete controls

## Related docs
- Auto-update setup: `docs/auto-update-setup.md`
- Packaged smoke: `docs/packaged-smoke-checklist.md`
- Improvement tracker: `docs/IMPROVEMENT-CHECKLIST.md`
