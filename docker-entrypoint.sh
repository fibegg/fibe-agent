#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Smart entrypoint: detect whether the container is running in production
# (built dist/ is present) or development (source code is mounted, no dist/).
# ---------------------------------------------------------------------------

# Disable NX daemon — it crashes in container environments
export NX_DAEMON=false
# Use JS file-watcher instead of native binaries (macOS binaries won't load on Linux)
export NX_NATIVE_FILE_WATCHER=false

if [ -f /app/dist/main.js ]; then
  # ── PRODUCTION: pre-built image, just run the compiled bundle ──────────────
  echo "[entrypoint] dist/main.js found — starting production server"
  exec node /app/dist/main.js
else
  # ── DEVELOPMENT: source code is mounted, dist/ is absent ──────────────────
  echo "[entrypoint] No dist/main.js — running in dev mode (source mounted)"

  cd /app

  # Install / sync dependencies for the Linux platform inside the container.
  # Uses npm because bun may not be present in the base image at runtime.
  echo "[entrypoint] Installing dependencies..."
  npm install --prefer-offline --no-audit --no-fund

  echo "[entrypoint] Starting API + Chat dev servers..."
  exec npx nx run-many --targets=serve,dev --parallel=2
fi
