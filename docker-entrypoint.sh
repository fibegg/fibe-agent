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

fix_file_limits() {
  mkdir -p /etc/security/limits.d
  printf '*  soft  nofile  1048576\n*  hard  nofile  1048576\n' > /etc/security/limits.d/99-nofile.conf
}

setup_docker_group() {
  if [ -n "$DOCKER_HOST_GID" ]; then
    groupadd -g "$DOCKER_HOST_GID" docker_host 2>/dev/null || true
    usermod -aG docker_host node 2>/dev/null || true
  fi
}

install_dev_deps() {
  if [ ! -f node_modules/.npm_dev_installed ]; then
    echo "[entrypoint] Installing dev dependencies..."
    rm -rf node_modules/*
    npm install --prefer-offline --no-audit --no-fund
    chown -R node:node /app/node_modules
    touch node_modules/.npm_dev_installed
  fi
}

if [ -f /app/dist/main.js ]; then
  # ── PRODUCTION: pre-built image, just run the compiled bundle ──────────────
  echo "[entrypoint] dist/main.js found — starting production server"
  exec node /app/dist/main.js
else
  # ── DEVELOPMENT: source code is mounted, dist/ is absent ──────────────────
  echo "[entrypoint] No dist/main.js — running in dev mode (source mounted)"

  cd /app
  fix_file_limits || true # WIP
  setup_docker_group
  install_dev_deps
  chown -R node:node /tmp/.nx-cache 2>/dev/null || true

  echo "[entrypoint] Starting API + Chat dev servers..."
  exec su node -c "export HOME=/home/node; cd /app && npx nx reset && npx nx run-many --targets=serve,dev --parallel=2"
fi
