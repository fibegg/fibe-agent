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
RUNTIME_FIBE_BIN_DIR="${DATA_DIR:-/app/data}/.fibe/bin"
export PATH="${RUNTIME_FIBE_BIN_DIR}:$PATH"

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
    npm install --prefer-offline --no-audit --no-fund --package-lock=false
    touch node_modules/.npm_dev_installed
    chown_dev_paths
  fi
}

chown_dev_paths() {
  if [ "$(id -u)" = "0" ]; then
    chown -R node:node /app/node_modules /app/.nx /app/data 2>/dev/null || true
  fi
}

run_dev_command() {
  command="$1"

  if [ "$(id -u)" = "0" ]; then
    exec su node -c "export HOME=/home/node PATH=${RUNTIME_FIBE_BIN_DIR}:\$PATH; cd /app && ${command}"
  fi

  exec sh -c "export HOME=/home/node PATH=${RUNTIME_FIBE_BIN_DIR}:\$PATH; cd /app && ${command}"
}

ensure_runtime_fibe() {
  mkdir -p "$RUNTIME_FIBE_BIN_DIR"

  if [ -z "${FIBE_VERSION:-}" ] && [ -x "${RUNTIME_FIBE_BIN_DIR}/fibe" ]; then
    echo "[entrypoint] Using existing runtime fibe from ${RUNTIME_FIBE_BIN_DIR}/fibe"
    return
  fi

  current_version=""
  if [ -x "${RUNTIME_FIBE_BIN_DIR}/fibe" ]; then
    current_version=$("${RUNTIME_FIBE_BIN_DIR}/fibe" version 2>/dev/null | awk 'NR==1 { print $2 }')
  fi

  desired_version="${FIBE_VERSION:-}"
  normalized_desired="${desired_version#v}"

  if [ -n "$normalized_desired" ] && [ "$current_version" = "$normalized_desired" ]; then
    echo "[entrypoint] Using cached runtime fibe ${current_version}"
    return
  fi

  if [ -n "$normalized_desired" ]; then
    echo "[entrypoint] Installing runtime fibe ${normalized_desired}"
  else
    echo "[entrypoint] Installing runtime fibe latest"
  fi

  if [ ! -x /usr/local/bin/install-fibe.sh ]; then
    echo "[entrypoint] install-fibe.sh not found; skipping runtime fibe install"
    return
  fi

  FIBE_INSTALL_DIR="$RUNTIME_FIBE_BIN_DIR" /usr/local/bin/install-fibe.sh
  installed_version=$("${RUNTIME_FIBE_BIN_DIR}/fibe" version 2>/dev/null | awk 'NR==1 { print $2 }')
  echo "[entrypoint] Runtime fibe ready: ${installed_version:-unknown}"
}

ensure_runtime_fibe

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
  chown_dev_paths
  chown -R node:node /tmp/.nx-cache 2>/dev/null || true

  dev_command="${FIBE_AGENT_DEV_COMMAND:-npx nx reset && npx nx run-many --targets=serve,dev --parallel=2}"

  echo "[entrypoint] Starting API + Chat dev servers..."
  run_dev_command "$dev_command"
fi
