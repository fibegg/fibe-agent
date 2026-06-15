#!/bin/sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

FIBE_AGENT_ENTRYPOINT_SOURCE_ONLY=1
export FIBE_AGENT_ENTRYPOINT_SOURCE_ONLY
# shellcheck source=/dev/null
. "$repo_root/docker-entrypoint.sh"

assert_eq() {
  expected="$1"
  actual="$2"
  label="$3"

  if [ "$actual" != "$expected" ]; then
    printf 'not ok - %s\nexpected: %s\nactual: %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

if ! runtime_fibe_config_candidates | grep -qx '/app/fibe.yml'; then
  printf 'not ok - default config candidates must include /app/fibe.yml\n' >&2
  exit 1
fi

cat > "$tmp_dir/fibe.yml" <<'YAML'
agentProvider: opencode
cliVersion: "v0.2.41" # pinned by registry warmup
YAML

FIBE_ENTRYPOINT_CONFIG_CANDIDATES="$tmp_dir/fibe.yml"
export FIBE_ENTRYPOINT_CONFIG_CANDIDATES
assert_eq "v0.2.41" "$(runtime_fibe_config_version)" "reads quoted cliVersion with comments"

cat > "$tmp_dir/blank.yml" <<'YAML'
agentProvider: opencode
YAML

FIBE_ENTRYPOINT_CONFIG_CANDIDATES="$tmp_dir/blank.yml
$tmp_dir/fibe.yml"
export FIBE_ENTRYPOINT_CONFIG_CANDIDATES
assert_eq "v0.2.41" "$(runtime_fibe_config_version)" "continues past config files without cliVersion"

printf 'ok - docker entrypoint config lookup\n'
