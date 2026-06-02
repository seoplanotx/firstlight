# Packaging strategy

## Goals

- notarized direct-download DMG for macOS first
- no Python install required for patients
- no manual backend startup
- local SQLite storage
- local report generation

## Runtime packaging approach

### Desktop shell
Tauri is used as the desktop bundler layer and produces the signed `.app` bundle.

### Backend
The FastAPI service is compiled into a standalone binary with PyInstaller.

### Frontend
The React/Vite build is bundled into the Tauri application.

## Why sidecar packaging

Tauri supports bundling external binaries using `externalBin`, which is the cleanest way to ship a non-Rust backend alongside the UI. The app can then spawn the backend as a local child process without exposing backend startup to the end user.

## Build flow

1. Install backend build dependencies with `python -m pip install -e './backend[build]'`
2. Build the backend sidecar binary (`scripts/build_backend_sidecar.py` names it
   per Rust target triple, e.g. `oncowatch-backend-x86_64-pc-windows-msvc.exe`)
3. Build the platform bundle:
   - macOS: `npm run build:desktop` → `.app` then a DMG via `scripts/build_macos_dmg.sh`
   - Windows: `npm run build:desktop:win` → NSIS `*-setup.exe`

## Installer expectations

### Windows
- NSIS installer via the Tauri `nsis` bundle target (`npm run build:desktop:win`)
- backend sidecar included automatically through `externalBin`
- installer and sidecar should be Authenticode-signed before distribution

### macOS
- Tauri builds the `.app` bundle and the repo wraps it into the distributable DMG
- backend sidecar included inside the application bundle
- DMG created with `hdiutil` for non-interactive local/CI builds
- app must be code signed and notarized before distribution

## Update strategy

Auto-update uses Tauri's updater plugin and is configured as release
infrastructure (signing keypair + hosted endpoint) rather than in app code, so
the local-first storage design is unchanged. See the "Auto-update setup" section
of `docs/release-checklist.md` for the exact steps. Until that infra is in
place, releases are install-only.
