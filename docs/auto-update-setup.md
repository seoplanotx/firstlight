# Auto-update setup (Firstlight)

The Tauri updater plugin is wired in code. Public releases still need **your**
signing keypair and CI secrets before in-app updates work.

## Current code state
- Plugin registered in `apps/desktop/src-tauri/src/main.rs`
- Startup `check_for_updates` runs after launch
- Endpoint template points at GitHub Releases `latest.json`
- `bundle.createUpdaterArtifacts` is enabled so release builds can emit `.sig` files

## One-time key generation (do on a secure machine)

```bash
cd apps/desktop
npm run tauri -- signer generate -w ../../.secrets/firstlight-updater.key
```

- Keep the **private** key out of git (`.secrets/` is gitignored).
- Copy the printed **public** key into `apps/desktop/src-tauri/tauri.conf.json`
  under `plugins.updater.pubkey`.

## CI secrets
- `TAURI_SIGNING_PRIVATE_KEY` — private key contents
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — if you set one

## Per-release
1. Build signed desktop artifacts with updater signatures.
2. Publish installer + `latest.json` + `.sig` files to the GitHub release.
3. Install previous version on a clean machine and confirm it offers the update.

**Status (2026-07-13): live.** The keypair was generated 2026-06-13 (private key +
password backed up in `~/Projects/firstlight-signing-backup/KEY-INFO.txt`), the real
pubkey is embedded in `tauri.conf.json`, and CI secrets are wired — v0.3.0 shipped
with `.sig` updater artifacts and `latest.json`. Note: `createUpdaterArtifacts`
deliberately stays **off** in the committed config; `release.yml` switches it on at
release time via `src-tauri/updater.release.json` so dev and CI verification builds
never need the signing key.
