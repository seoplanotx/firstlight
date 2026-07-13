#!/usr/bin/env bash
# Prints the packaged smoke checklist and exits non-zero if required docs are missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECKLIST="$ROOT/docs/packaged-smoke-checklist.md"
IMPROVEMENTS="$ROOT/docs/IMPROVEMENT-CHECKLIST.md"

missing=0
for f in "$CHECKLIST" "$IMPROVEMENTS" "$ROOT/docs/auto-update-setup.md"; do
  if [[ ! -f "$f" ]]; then
    echo "MISSING: $f" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

echo "=== Firstlight packaged smoke checklist ==="
echo "Open and complete: $CHECKLIST"
echo
sed -n '1,120p' "$CHECKLIST"
echo
echo "Tracked improvements: $IMPROVEMENTS"
exit 0
