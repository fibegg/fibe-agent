#!/bin/sh
set -e

# Use container-safe Nx defaults while honoring explicit overrides.
export NX_DAEMON="${NX_DAEMON:-false}"
export NX_NATIVE_FILE_WATCHER="${NX_NATIVE_FILE_WATCHER:-false}"
export npm_config_cache="${npm_config_cache:-/home/node/.npm}"
RUNTIME_FIBE_BIN_DIR="${DATA_DIR:-/app/data}/.fibe/bin"
RUNTIME_FIBE_BIN="${RUNTIME_FIBE_BIN_DIR}/fibe"
DEV_DEPS_LOCK_DIR="${DEV_DEPS_LOCK_DIR:-/app/.nx/dev-deps-install.lock}"
DEV_DEPS_LOCK_TIMEOUT_SECONDS="${DEV_DEPS_LOCK_TIMEOUT_SECONDS:-600}"
export PATH="${RUNTIME_FIBE_BIN_DIR}:$PATH"

runtime_fibe_config_candidates() {
  if [ -n "${FIBE_ENTRYPOINT_CONFIG_CANDIDATES:-}" ]; then
    printf '%s\n' "$FIBE_ENTRYPOINT_CONFIG_CANDIDATES"
    return
  fi

  printf '%s\n' \
    "${FIBE_SETTINGS_PATH:-}" \
    "${DATA_DIR:-/app/data}/fibe.yml" \
    /app/data/fibe.yml \
    /app/fibe.yml
}

runtime_fibe_config_version() {
  runtime_fibe_config_candidates | while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    [ -f "$candidate" ] || continue

    version="$(awk '
      /^[[:space:]]*cliVersion[[:space:]]*:/ {
        value = $0
        sub(/^[^:]*:[[:space:]]*/, "", value)
        sub(/[[:space:]]+#.*$/, "", value)
        gsub(/^[[:space:]"\047]+|[[:space:]"\047]+$/, "", value)
        if (value != "") {
          print value
          exit
        }
      }
    ' "$candidate")"
    if [ -n "$version" ]; then
      printf '%s\n' "$version"
      return
    fi
  done
}

copy_baked_runtime_fibe() {
  echo "[entrypoint] Using baked runtime fibe from /usr/local/bin/fibe"
  copied_fibe="${RUNTIME_FIBE_BIN}.copy.$$"
  cp /usr/local/bin/fibe "$copied_fibe" || return 1
  if ! chmod +x "$copied_fibe" || ! cmp -s /usr/local/bin/fibe "$copied_fibe" || ! mv -f "$copied_fibe" "$RUNTIME_FIBE_BIN"; then
    rm -f "$copied_fibe"
    return 1
  fi
  if [ "$(id -u)" = "0" ]; then
    chown -R node:node "${DATA_DIR:-/app/data}/.fibe" 2>/dev/null || true
  fi
  installed_version=$("$RUNTIME_FIBE_BIN" version 2>/dev/null | awk 'NR==1 { print $2 }')
  echo "[entrypoint] Runtime fibe ready: ${installed_version:-unknown}"
}

start_secret_service() {
  [ "${AGENT_PROVIDER:-}" = "antigravity" ] || [ -n "${ANTIGRAVITY_HOME:-}" ] || return 0
  command -v dbus-launch >/dev/null 2>&1 || return 0

  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    export XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"
  fi
  mkdir -p "$XDG_RUNTIME_DIR"
  chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true

  if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    eval "$(dbus-launch --sh-syntax)"
    export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID
  fi

  if command -v gnome-keyring-daemon >/dev/null 2>&1; then
    printf '\n' | gnome-keyring-daemon --unlock --components=secrets >/dev/null 2>&1 || true
    gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1 || true
  fi
}

secret_service_setup_command() {
  printf '%s' 'if { [ "${AGENT_PROVIDER:-}" = "antigravity" ] || [ -n "${ANTIGRAVITY_HOME:-}" ]; } && command -v dbus-launch >/dev/null 2>&1; then if [ -z "${XDG_RUNTIME_DIR:-}" ]; then export XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"; fi; mkdir -p "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true; if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then eval "$(dbus-launch --sh-syntax)"; export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID; fi; if command -v gnome-keyring-daemon >/dev/null 2>&1; then printf "\n" | gnome-keyring-daemon --unlock --components=secrets >/dev/null 2>&1 || true; gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1 || true; fi; fi'
}

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

  runtime_antigravity_home="${ANTIGRAVITY_HOME:-}"
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

  if [ -n "$runtime_antigravity_home" ]; then
    mkdir -p "$runtime_antigravity_home"
  fi

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

  if [ -n "$runtime_antigravity_home" ]; then
    ensure_node_owns_tree "$runtime_antigravity_home"
  fi
}

run_dev_command() {
  command="$1"
  runtime_home="${HOME:-/home/node}"
  if [ "$(id -u)" = "0" ] && [ "$runtime_home" = "/root" ]; then
    runtime_home="/home/node"
  fi

  if [ "$(id -u)" = "0" ]; then
    prepare_runtime_home "$runtime_home"
    exec su node -c "export HOME=${runtime_home} PATH=${RUNTIME_FIBE_BIN_DIR}:\$PATH; $(secret_service_setup_command); cd /app && ${command}"
  fi

  exec sh -c "export HOME=${runtime_home} PATH=${RUNTIME_FIBE_BIN_DIR}:\$PATH; cd /app && ${command}"
}

ensure_runtime_fibe() {
  mkdir -p "$RUNTIME_FIBE_BIN_DIR"

  baked_version=""
  if [ -x /usr/local/bin/fibe ]; then
    baked_version=$(/usr/local/bin/fibe version 2>/dev/null | awk 'NR==1 { print $2 }')
  fi

  desired_version="${FIBE_VERSION:-${FIBE_CLI_VERSION:-}}"
  if [ -z "$desired_version" ]; then
    desired_version="$(runtime_fibe_config_version)"
  fi
  if [ "${FIBE_CANDIDATE_BUILD:-0}" = "1" ] && [ -z "$desired_version" ]; then
    desired_version="${FIBE_CANDIDATE_CLI_VERSION:-}"
    if [ -z "$desired_version" ]; then
      echo "[entrypoint] ERROR: candidate image has no baked CLI version" >&2
      return 1
    fi
  fi
  normalized_desired="${desired_version#v}"

  if [ "${FIBE_CANDIDATE_BUILD:-0}" = "1" ]; then
    expected_candidate="${FIBE_CANDIDATE_CLI_VERSION:-}"
    expected_candidate="${expected_candidate#v}"
    if [ "$normalized_desired" != "$expected_candidate" ] || [ "$baked_version" != "$expected_candidate" ]; then
      echo "[entrypoint] ERROR: candidate images require baked CLI ${expected_candidate}; release downloads are disabled" >&2
      return 1
    fi
    # Candidate identity is the checksum-verified baked bytes, not a version
    # reported by an executable retained in a writable data volume.
    copy_baked_runtime_fibe || return 1
    return
  fi

  # The release image already carries the checksum-verified stable CLI.
  if [ -z "$normalized_desired" ] || [ "$baked_version" = "$normalized_desired" ]; then
    if [ -z "$baked_version" ]; then
      echo "[entrypoint] Image is missing its verified Fibe CLI; rebuild the Agent image" >&2
      return 1
    fi
    if cmp -s /usr/local/bin/fibe "$RUNTIME_FIBE_BIN"; then
      echo "[entrypoint] Runtime fibe ready: $baked_version"
      return 0
    fi
    copy_baked_runtime_fibe
    return
  fi

  if [ -x "$RUNTIME_FIBE_BIN" ] && [ -f "$RUNTIME_FIBE_BIN.sha256" ] &&
     (cd "$RUNTIME_FIBE_BIN_DIR" && sha256sum --check --status fibe.sha256) &&
     [ "$("$RUNTIME_FIBE_BIN" version | awk 'NR==1 { print $2 }')" = "$normalized_desired" ]; then
    echo "[entrypoint] Using verified runtime fibe $normalized_desired"
    return 0
  fi

  installer=""
  for candidate in /usr/local/bin/install-fibe.sh /app/scripts/install-fibe.sh; do
    if [ -f "$candidate" ]; then
      installer="$candidate"
      break
    fi
  done
  if [ -z "$installer" ]; then
    echo "[entrypoint] No SDK installer for requested Fibe CLI $normalized_desired" >&2
    return 1
  fi
  (
    staging=$(mktemp -d "$RUNTIME_FIBE_BIN_DIR/.install.XXXXXXXX") || exit 1
    trap 'rm -rf "$staging"' EXIT
    echo "[entrypoint] Installing requested runtime fibe $normalized_desired"
    FIBE_VERSION="$normalized_desired" FIBE_CLI_VERSION= FIBE_INSTALL_DIR="$staging" sh "$installer" || exit 1
    installed_version=$("$staging/fibe" version | awk 'NR==1 { print $2 }')
    if [ "$normalized_desired" = latest ]; then
      printf '%s\n' "$installed_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "[entrypoint] Invalid stable CLI version" >&2; exit 1; }
    elif [ "$installed_version" != "$normalized_desired" ]; then
      echo "[entrypoint] Requested fibe $normalized_desired, installed ${installed_version:-unknown}" >&2
      exit 1
    fi
    (cd "$staging" && sha256sum fibe > fibe.sha256) || exit 1
    if [ "$(id -u)" = "0" ]; then
      chown node:node "$staging/fibe" "$staging/fibe.sha256" 2>/dev/null || true
    fi
    mv -f "$staging/fibe" "$RUNTIME_FIBE_BIN" && mv -f "$staging/fibe.sha256" "$RUNTIME_FIBE_BIN.sha256"
  ) || return 1
  echo "[entrypoint] Runtime fibe ready: $normalized_desired"
}

if [ "${FIBE_AGENT_ENTRYPOINT_SOURCE_ONLY:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

if ! ensure_runtime_fibe; then
  # Docker may remove an exhausted container before the operator can inspect its logs.
  (umask 077; printf '%s SDK bootstrap failed; check the requested CLI version and GitHub connection.\n' "$(date -u +%FT%TZ)" > "$RUNTIME_FIBE_BIN_DIR/../startup-error.log") || true
  exit 1
fi
rm -f "$RUNTIME_FIBE_BIN_DIR/../startup-error.log"

if [ -f /app/dist/main.js ]; then
  echo "[entrypoint] dist/main.js found: starting production server"
  start_secret_service
  exec node /app/dist/main.js
else
  echo "[entrypoint] No dist/main.js: running in dev mode (source mounted)"

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
