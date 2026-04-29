#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Smart entrypoint: detect whether the container is running in production
# (built dist/ is present) or development (source code is mounted, no dist/).
# ---------------------------------------------------------------------------

# Default to container-safe Nx behavior, but let compose/environment override it.
export NX_DAEMON="${NX_DAEMON:-false}"
export NX_NATIVE_FILE_WATCHER="${NX_NATIVE_FILE_WATCHER:-false}"
export npm_config_cache="${npm_config_cache:-/home/node/.npm}"
RUNTIME_FIBE_BIN_DIR="${DATA_DIR:-/app/data}/.fibe/bin"
RUNTIME_FIBE_BIN="${RUNTIME_FIBE_BIN_DIR}/fibe"
DEV_DEPS_LOCK_DIR="${DEV_DEPS_LOCK_DIR:-/app/.nx/dev-deps-install.lock}"
DEV_DEPS_LOCK_TIMEOUT_SECONDS="${DEV_DEPS_LOCK_TIMEOUT_SECONDS:-600}"
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

dev_deps_signature() {
  {
    node --version
    npm --version
    uname -m
    for file in package.json package-lock.json bun.lock nx.json; do
      [ -f "$file" ] && sha256sum "$file"
    done
    find apps -maxdepth 2 -name package.json -print 2>/dev/null | sort | while IFS= read -r file; do
      sha256sum "$file"
    done
  } | sha256sum | awk '{print $1}'
}

dev_deps_current() {
  signature="$1"
  [ -f node_modules/.npm_dev_installed ] || return 1
  [ -f node_modules/.npm_dev_signature ] || return 1
  [ "$(cat node_modules/.npm_dev_signature 2>/dev/null)" = "$signature" ]
}

acquire_dev_deps_lock() {
  mkdir -p "$(dirname "$DEV_DEPS_LOCK_DIR")"
  waited=0

  while ! mkdir "$DEV_DEPS_LOCK_DIR" 2>/dev/null; do
    waited=$((waited + 1))
    if [ "$waited" -eq 1 ] || [ $((waited % 10)) -eq 0 ]; then
      echo "[entrypoint] Waiting for dev dependency install lock..."
    fi
    if [ "$waited" -ge "$DEV_DEPS_LOCK_TIMEOUT_SECONDS" ]; then
      echo "[entrypoint] Timed out waiting for dev dependency install lock after ${DEV_DEPS_LOCK_TIMEOUT_SECONDS}s" >&2
      return 1
    fi
    sleep 1
  done
}

release_dev_deps_lock() {
  rmdir "$DEV_DEPS_LOCK_DIR" 2>/dev/null || true
}

install_dev_deps() {
  mkdir -p node_modules
  desired_signature="$(dev_deps_signature)"
  dev_deps_current "$desired_signature" && return

  acquire_dev_deps_lock
  trap 'release_dev_deps_lock' EXIT INT TERM HUP

  if dev_deps_current "$desired_signature"; then
    release_dev_deps_lock
    trap - EXIT INT TERM HUP
    return
  fi

  echo "[entrypoint] Installing dev dependencies..."
  clean_dev_node_modules
  prepare_dev_writable_paths
  if [ "$(id -u)" = "0" ]; then
    su node -c "cd /app && npm install --prefer-offline --no-audit --no-fund --package-lock=false"
  else
    npm install --prefer-offline --no-audit --no-fund --package-lock=false
  fi

  printf '%s\n' "$desired_signature" > node_modules/.npm_dev_signature
  touch node_modules/.npm_dev_installed
  if [ "$(id -u)" = "0" ]; then
    chown node:node node_modules/.npm_dev_signature node_modules/.npm_dev_installed 2>/dev/null || true
  fi

  release_dev_deps_lock
  trap - EXIT INT TERM HUP
}

clean_dev_node_modules() {
  mkdir -p node_modules
  find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} +

  for modules_dir in apps/*/node_modules; do
    [ -e "$modules_dir" ] || continue
    rm -rf "$modules_dir"
  done
}

ensure_node_owns_path() {
  path="$1"
  [ -e "$path" ] || return 0
  node_owner="$(id -u node):$(id -g node)"
  path_owner="$(stat -c '%u:%g' "$path" 2>/dev/null || true)"
  if [ "$path_owner" != "$node_owner" ]; then
    chown node:node "$path" 2>/dev/null || true
  fi
}

ensure_node_owns_tree() {
  path="$1"
  [ -e "$path" ] || return 0
  node_owner="$(id -u node):$(id -g node)"
  path_owner="$(stat -c '%u:%g' "$path" 2>/dev/null || true)"
  if [ "$path_owner" != "$node_owner" ]; then
    chown -R node:node "$path" 2>/dev/null || true
  fi
}

prepare_dev_writable_paths() {
  if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/node_modules /app/.nx /app/data /tmp/.nx-cache /home/node/.npm
    ensure_node_owns_path /app/node_modules
    ensure_node_owns_path /tmp/.nx-cache
    ensure_node_owns_path /app/data
    ensure_node_owns_tree /home/node/.npm
    for workspace_dir in /app/apps/*; do
      [ -d "$workspace_dir" ] || continue
      ensure_node_owns_path "$workspace_dir"
    done
    ensure_node_owns_tree /app/.nx
  fi
}

prepare_runtime_home() {
  runtime_home="$1"
  [ "$(id -u)" = "0" ] || return

  runtime_config_home="${XDG_CONFIG_HOME:-$runtime_home/.config}"
  runtime_data_home="${XDG_DATA_HOME:-$runtime_home/.local/share}"
  runtime_state_home="${XDG_STATE_HOME:-$runtime_home/.local/state}"
  runtime_cache_home="${XDG_CACHE_HOME:-$runtime_home/.cache}"

  mkdir -p \
    "$runtime_home" \
    "$runtime_config_home" \
    "$runtime_data_home" \
    "$runtime_state_home" \
    "$runtime_cache_home" \
    "$runtime_home/.claude" \
    "$runtime_home/claude_workspace"

  for path in \
    "$runtime_home" \
    "$runtime_config_home" \
    "$runtime_data_home" \
    "$runtime_state_home" \
    "$runtime_cache_home" \
    "$runtime_home/.claude" \
    "$runtime_home/claude_workspace" \
    "$runtime_home/audit.log" \
    "$runtime_home/.claude/settings.json" \
    "$runtime_home/.claude.json" \
    "$runtime_home/claude_workspace/.mcp.json"; do
    ensure_node_owns_path "$path"
  done
}

run_dev_command() {
  command="$1"
  runtime_home="${HOME:-/home/node}"
  if [ "$(id -u)" = "0" ] && [ "$runtime_home" = "/root" ]; then
    runtime_home="/home/node"
  fi

  if [ "$(id -u)" = "0" ]; then
    prepare_runtime_home "$runtime_home"
    exec su node -c "export HOME=${runtime_home} PATH=${RUNTIME_FIBE_BIN_DIR}:\$PATH; cd /app && ${command}"
  fi

  exec sh -c "export HOME=${runtime_home} PATH=${RUNTIME_FIBE_BIN_DIR}:\$PATH; cd /app && ${command}"
}

ensure_runtime_fibe() {
  mkdir -p "$RUNTIME_FIBE_BIN_DIR"

  current_version=""
  if [ -x "$RUNTIME_FIBE_BIN" ]; then
    current_version=$("$RUNTIME_FIBE_BIN" version 2>/dev/null | awk 'NR==1 { print $2 }')
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

  installer=""
  for candidate in /usr/local/bin/install-fibe.sh /app/scripts/install-fibe.sh; do
    if [ -f "$candidate" ]; then
      installer="$candidate"
      break
    fi
  done

  rm -f "$RUNTIME_FIBE_BIN"

  if [ -z "$installer" ]; then
    if [ -x /usr/local/bin/fibe ]; then
      echo "[entrypoint] install-fibe.sh not found; copying baked fibe from /usr/local/bin/fibe"
      cp /usr/local/bin/fibe "$RUNTIME_FIBE_BIN"
      chmod +x "$RUNTIME_FIBE_BIN"
    else
      echo "[entrypoint] ERROR: no fibe installer or baked fibe binary found" >&2
      exit 1
    fi
  else
    echo "[entrypoint] Using fibe installer at ${installer}"
    FIBE_INSTALL_DIR="$RUNTIME_FIBE_BIN_DIR" sh "$installer"
  fi

  if [ "$(id -u)" = "0" ]; then
    chown -R node:node "${DATA_DIR:-/app/data}/.fibe" 2>/dev/null || true
  fi

  installed_version=$("$RUNTIME_FIBE_BIN" version 2>/dev/null | awk 'NR==1 { print $2 }')
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
  prepare_dev_writable_paths

  if [ "$#" -gt 0 ]; then
    dev_command="$*"
  else
    dev_command="${FIBE_AGENT_DEV_COMMAND:-bun run dev:docker}"
  fi

  echo "[entrypoint] Starting dev command: ${dev_command}"
  run_dev_command "$dev_command"
fi
