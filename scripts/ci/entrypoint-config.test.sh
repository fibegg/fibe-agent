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

# Execute the production function using isolated absolute-path fixtures. Only
# filesystem locations change; selection, caching and installer logic are real.
fixture="$tmp_dir/runtime"
mkdir -p "$fixture"
sed -e "s|/usr/local/bin/install-fibe.sh|$fixture/install-fibe.sh|g" \
    -e "s|/app/scripts/install-fibe.sh|$fixture/fallback-install-fibe.sh|g" \
    -e "s|/usr/local/bin/fibe|$fixture/baked-fibe|g" \
    "$repo_root/docker-entrypoint.sh" > "$fixture/entrypoint.sh"

write_binary() {
  printf '#!/bin/sh\nprintf "Fibe %s\\n"\n' "$2" > "$1"
  chmod +x "$1"
}

run_case() (
  name="$1"
  selection="$2"
  case_expected_version="$3"
  case_expected_installer="$4"
  case_expected_success="$5"
  unset FIBE_VERSION FIBE_CLI_VERSION FIBE_CANDIDATE_BUILD FIBE_CANDIDATE_CLI_VERSION
  export DATA_DIR="$fixture/data" FIBE_AGENT_ENTRYPOINT_SOURCE_ONLY=1
  export FIBE_ENTRYPOINT_CONFIG_CANDIDATES="$fixture/fibe.yml"
  export FIBE_TEST_INSTALL_LOG="$fixture/install.log"
  rm -rf "$DATA_DIR" "$fixture/lookup.log" "$fixture/install.log" "$fixture/install-fibe.sh"
  mkdir -p "$DATA_DIR/.fibe/bin"
  write_binary "$fixture/baked-fibe" 0.2.46
  write_binary "$DATA_DIR/.fibe/bin/fibe" 0.2.41
  printf 'cliVersion: "v0.2.45"\n' > "$fixture/fibe.yml"
  cat > "$fixture/install-fibe.sh" <<'INSTALLER'
#!/bin/sh
set -eu
if [ "${1:-}" = --latest-version ]; then
  echo lookup >> "${FIBE_TEST_INSTALL_LOG%/*}/lookup.log"
  [ -z "${FIBE_TEST_LOOKUP_FAILED:-}" ] || exit "$FIBE_TEST_LOOKUP_FAILED"
  echo "${FIBE_TEST_LATEST:-0.2.46}"
  exit
fi
printf '%s|%s\n' "${FIBE_VERSION:-}" "${FIBE_CLI_VERSION:-}" > "$FIBE_TEST_INSTALL_LOG"
version="${FIBE_TEST_INSTALLED_VERSION:-${FIBE_VERSION:-${FIBE_CLI_VERSION:-0.2.46}}}"
[ "$version" != latest ] || version=0.2.46
printf '#!/bin/sh\nprintf "Fibe %s\\n"\n' "$version" > "$FIBE_INSTALL_DIR/fibe"
chmod +x "$FIBE_INSTALL_DIR/fibe"
INSTALLER
  case "$selection" in
    yaml) ;;
    version-env) export FIBE_VERSION=v0.2.44 FIBE_CLI_VERSION=0.2.43 ;;
    cli-env) export FIBE_CLI_VERSION=v0.2.43 ;;
    latest-env) export FIBE_VERSION=latest FIBE_CLI_VERSION=0.2.43 ;;
    latest-cli-env) export FIBE_CLI_VERSION=latest ;;
    latest-yaml) printf 'cliVersion: latest\n' > "$fixture/fibe.yml" ;;
    default) printf 'agentProvider: mock\n' > "$fixture/fibe.yml" ;;
    missing-credential) export FIBE_TEST_LOOKUP_FAILED=77; rm "$fixture/fibe.yml" ;;
    upgrade|lookup-error)
      printf 'agentProvider: mock\n' > "$fixture/fibe.yml"
      if [ "$selection" = upgrade ]; then export FIBE_TEST_LATEST=0.2.48; else export FIBE_TEST_LOOKUP_FAILED=1; fi
      ;;
    cached) write_binary "$DATA_DIR/.fibe/bin/fibe" 0.2.45; (cd "$DATA_DIR/.fibe/bin" && sha256sum fibe > fibe.sha256) ;;
    baked) printf 'cliVersion: v0.2.46\n' > "$fixture/fibe.yml" ;;
    missing-pinned) rm "$fixture/install-fibe.sh" ;;
    missing-default) rm "$fixture/install-fibe.sh"; printf 'agentProvider: mock\n' > "$fixture/fibe.yml" ;;
    wrong-install) export FIBE_TEST_INSTALLED_VERSION=0.2.43 ;;
    candidate-baked) export FIBE_CANDIDATE_BUILD=1 FIBE_CANDIDATE_CLI_VERSION=0.3.0-rc.1+1234567; write_binary "$fixture/baked-fibe" "$FIBE_CANDIDATE_CLI_VERSION"; printf 'cliVersion: %s\n' "$FIBE_CANDIDATE_CLI_VERSION" > "$fixture/fibe.yml" ;;
    candidate-default) export FIBE_CANDIDATE_BUILD=1 FIBE_CANDIDATE_CLI_VERSION=0.3.0-rc.1+1234567; write_binary "$fixture/baked-fibe" "$FIBE_CANDIDATE_CLI_VERSION"; printf 'agentProvider: mock\n' > "$fixture/fibe.yml" ;;
    candidate-mismatch) export FIBE_CANDIDATE_BUILD=1 FIBE_CANDIDATE_CLI_VERSION=0.3.0-rc.1+1234567 ;;
    candidate-latest) export FIBE_CANDIDATE_BUILD=1 FIBE_CANDIDATE_CLI_VERSION=0.3.0-rc.1+1234567; printf 'cliVersion: latest\n' > "$fixture/fibe.yml" ;;
    candidate-old-cache) export FIBE_CANDIDATE_BUILD=1 FIBE_CANDIDATE_CLI_VERSION=0.3.0-rc.1+1234567; write_binary "$fixture/baked-fibe" "$FIBE_CANDIDATE_CLI_VERSION"; write_binary "$DATA_DIR/.fibe/bin/fibe" 0.2.45 ;;
    candidate-same-version-different-bytes)
      export FIBE_CANDIDATE_BUILD=1 FIBE_CANDIDATE_CLI_VERSION=0.3.0-rc.1+1234567
      write_binary "$fixture/baked-fibe" "$FIBE_CANDIDATE_CLI_VERSION"
      printf 'cliVersion: %s\n' "$FIBE_CANDIDATE_CLI_VERSION" > "$fixture/fibe.yml"
      write_binary "$DATA_DIR/.fibe/bin/fibe" "$FIBE_CANDIDATE_CLI_VERSION"
      printf 'touch "%s"\n' "$fixture/untrusted-cache-executed" >> "$DATA_DIR/.fibe/bin/fibe"
      ;;
  esac
  if ( . "$fixture/entrypoint.sh"; ensure_runtime_fibe ) > "$fixture/$name.log" 2>&1; then
    actual_success=yes
  else
    actual_success=no
  fi
  assert_eq "$case_expected_success" "$actual_success" "$name outcome"
  if [ "$case_expected_success" = yes ]; then
    if [ "$selection" = candidate-same-version-different-bytes ]; then
      cmp "$fixture/baked-fibe" "$DATA_DIR/.fibe/bin/fibe"
      assert_eq no "$([ -f "$fixture/untrusted-cache-executed" ] && printf yes || printf no)" "$name cached bytes never executed"
    fi
    assert_eq "$case_expected_version" "$("$DATA_DIR/.fibe/bin/fibe" version | awk '{print $2}')" "$name installed version"
  fi
  case "$selection" in
    missing-credential|default|latest-*|upgrade|lookup-error) assert_eq lookup "$(cat "$fixture/lookup.log")" "$name checked latest exactly once" ;;
    *) assert_eq no "$([ -f "$fixture/lookup.log" ] && printf yes || printf no)" "$name skipped latest lookup" ;;
  esac
  if [ "$selection" = missing-credential ]; then
    grep -q 'Skipped latest Fibe CLI check: no usable GitHub credential' "$fixture/$name.log"
    cmp "$fixture/baked-fibe" "$DATA_DIR/.fibe/bin/fibe"
  fi
  if [ "$selection" = wrong-install ] || [ "$selection" = lookup-error ]; then
    assert_eq 0.2.41 "$("$DATA_DIR/.fibe/bin/fibe" version | awk 'NR==1 { print $2 }')" "$name kept previous CLI"
  fi
  if [ "$case_expected_installer" = skip ]; then
    assert_eq no "$([ -f "$fixture/install.log" ] && printf yes || printf no)" "$name installer skipped"
  elif [ "$case_expected_installer" != unchecked ]; then
    assert_eq "$case_expected_installer" "$(cat "$fixture/install.log")" "$name installer request"
  fi
  printf 'ok - %s\n' "$name"
)

run_case yaml-pin-different-from-cached-and-baked yaml 0.2.45 '0.2.45|' yes
run_case fibe-version-precedes-cli-env-and-yaml version-env 0.2.44 '0.2.44|' yes
run_case cli-env-precedes-yaml cli-env 0.2.43 '0.2.43|' yes
run_case latest-version-clears-lower-priority-pin latest-env 0.2.46 skip yes
run_case latest-cli-env latest-cli-env 0.2.46 skip yes
run_case latest-yaml latest-yaml 0.2.46 skip yes
run_case default-checks-latest-then-uses-baked default 0.2.46 skip yes
run_case default-installs-new-stable-release upgrade 0.2.48 '0.2.48|' yes
run_case missing-credential-starts-with-verified-image-and-reports missing-credential 0.2.46 skip yes
run_case lookup-failure-keeps-existing-binary lookup-error '' skip no
run_case matching-cache-preserved cached 0.2.45 skip yes
run_case matching-baked-copied baked 0.2.46 skip yes
run_case missing-installer-rejects-pin-mismatch missing-pinned '' skip no
run_case missing-installer-cannot-check-latest missing-default '' skip no
run_case wrong-installed-version-rejected wrong-install '' unchecked no
run_case candidate-matching-baked-never-downloads candidate-baked 0.3.0-rc.1+1234567 skip yes
run_case candidate-default-keeps-baked-version candidate-default 0.3.0-rc.1+1234567 skip yes
run_case candidate-mismatch-refuses-release-download candidate-mismatch '' skip no
run_case candidate-latest-refuses-release-download candidate-latest '' skip no
run_case candidate-old-matching-cache-refused candidate-old-cache '' skip no
run_case candidate-same-version-replaced-before-execution candidate-same-version-different-bytes 0.3.0-rc.1+1234567 skip yes
