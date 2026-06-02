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

Auto-update depends on a signing keypair and a hosting endpoint, so it is
configured once as release infrastructure rather than in app code:

1. Generate an updater keypair: `npm --workspace apps/desktop run tauri signer generate -- -w ./oncowatch-updater.key`
2. Add the **public** key to `apps/desktop/src-tauri/tauri.conf.json` under
   `plugins.updater.pubkey`, and set `plugins.updater.endpoints` to the hosted
   `latest.json` URL.
3. Add `tauri-plugin-updater` to `Cargo.toml` and register it in `main.rs`,
   and add `updater:default` to the desktop capability.
4. Store the **private** key (and its password) as CI secrets
   (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) and
   enable `createUpdaterArtifacts` so signed update bundles are produced.
5. Publish `latest.json` + signed artifacts to the endpoint per release.

Until this is configured, releases are install-only (no in-app update).

## Release handoff

- record the shipped version and git commit
- attach known issues and any post-release monitoring notes
- keep the previous signed DMG and Windows installer available for rollback
- include support notes covering log collection, the activity log, and the
  in-app data export/delete controls
