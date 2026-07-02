#!/bin/bash
# ASKTRO SessionStart hook — installs dependencies so tests/linters work in
# Claude Code on the web. Idempotent and non-interactive.
set -euo pipefail

# Only run in the remote (web) environment; local machines manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[asktro] installing Cloud Functions deps…"
if [ -f "$ROOT/firebase/functions/package.json" ]; then
  npm --prefix "$ROOT/firebase/functions" install --no-audit --no-fund
fi

echo "[asktro] installing Admin portal deps…"
if [ -f "$ROOT/apps/admin/package.json" ]; then
  npm --prefix "$ROOT/apps/admin" install --no-audit --no-fund
fi

# Flutter SDK is not present in the web environment; only run pub get if it is.
if command -v flutter >/dev/null 2>&1; then
  echo "[asktro] Flutter found — fetching packages…"
  for dir in packages/shared_flutter apps/customer apps/astrologer; do
    if [ -f "$ROOT/$dir/pubspec.yaml" ]; then
      (cd "$ROOT/$dir" && flutter pub get) || true
    fi
  done
else
  echo "[asktro] Flutter SDK not present — skipping pub get (Node projects are ready)."
fi

echo "[asktro] session-start hook complete."
