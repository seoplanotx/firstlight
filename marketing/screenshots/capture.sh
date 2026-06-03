#!/usr/bin/env bash
# Boot a seeded local Coffey instance and capture real screenshots of every screen.
#
#   PYTHON_BIN=backend/.venv/bin/python bash marketing/screenshots/capture.sh
#
# Produces PNGs in marketing/screenshots/raw/. Requires:
#   - npm install (root)  +  the backend installed in PYTHON_BIN's environment
#   - puppeteer-core + @sparticuz/chromium (devDependencies)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PYTHON_BIN="${PYTHON_BIN:-python}"
BACKEND_PORT=17847
FRONTEND_PORT=1422
WORK="$ROOT/marketing/screenshots/.work"

export ONCOWATCH_ENV=test
export ONCOWATCH_BACKEND_HOST=127.0.0.1
export ONCOWATCH_BACKEND_PORT="$BACKEND_PORT"
export ONCOWATCH_DATA_DIR="$WORK/data"
export ONCOWATCH_CONFIG_DIR="$WORK/config"
export ONCOWATCH_CACHE_DIR="$WORK/cache"
export ONCOWATCH_ALLOW_DEMO_CONTENT=1
export SHOT_BASE="http://127.0.0.1:$FRONTEND_PORT"

rm -rf "$WORK"; mkdir -p "$WORK/data" "$WORK/config" "$WORK/cache"

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

echo "==> starting backend (empty DB)"
( cd backend && exec "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" ) &
pids+=($!)
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1 && break || sleep 1
done

echo "==> starting vite dev server"
( VITE_API_BASE="http://127.0.0.1:$BACKEND_PORT" npm --workspace apps/desktop run dev -- \
    --host 127.0.0.1 --port "$FRONTEND_PORT" ) >/tmp/vite.log 2>&1 &
pids+=($!)
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$FRONTEND_PORT" >/dev/null 2>&1 && break || sleep 1
done

echo "==> capturing onboarding (pre-seed)"
node marketing/screenshots/capture.mjs onboarding

echo "==> seeding demo content"
( cd backend && "$PYTHON_BIN" "$ROOT/marketing/screenshots/seed.py" )

echo "==> capturing app screens"
node marketing/screenshots/capture.mjs app

echo "==> done; screenshots in marketing/screenshots/raw/"
