#!/bin/sh
# Fetch a GitHub API resource or release asset with the selected owner's credential.
set -eu

github_fail() { echo "GitHub release: $*" >&2; exit 1; }

# EX_NOPERM lets an unpinned startup distinguish a missing or refused owner
# credential from a failed network request or an invalid release.
github_no_credential() { echo "GitHub release: $*" >&2; exit 77; }

github_release_token=
github_resolve_token() {
  github_release_token=${GH_TOKEN:-${GITHUB_TOKEN:-}}
  if [ -z "$github_release_token" ] && [ -s /run/secrets/gh_token ]; then
    github_release_token=$(cat /run/secrets/gh_token)
  fi
  if [ -z "$github_release_token" ] && [ -n "${FIBE_API_KEY:-}" ] && [ -n "${FIBE_GITHUB_CONNECTION_ID:-}" ]; then
    case "$FIBE_GITHUB_CONNECTION_ID" in ''|*[!0-9]*) github_fail "invalid GitHub connection" ;; esac
    case "${FIBE_GITHUB_CONNECTION_OWNER:-}" in
      Team) endpoint=team_git_installations ;;
      '') endpoint=installations ;;
      *) github_fail "invalid GitHub connection owner" ;;
    esac
    case "${FIBE_DOMAIN:-}" in
      '') github_fail "selected GitHub connection has no Fibe origin" ;;
      http://*|https://*) origin=$FIBE_DOMAIN ;;
      *) origin=https://$FIBE_DOMAIN ;;
    esac
    # This endpoint belongs to Fibe. Keep its bearer on that origin; refuse redirects.
    response=$({
      printf 'Authorization: Bearer %s\n' "$FIBE_API_KEY"
      if [ -n "${FIBE_OWNER_TYPE:-}" ] && [ -n "${FIBE_OWNER_ID:-}" ]; then
        printf 'X-Fibe-Expected-Owner-Type: %s\nX-Fibe-Expected-Owner-ID: %s\n' "$FIBE_OWNER_TYPE" "$FIBE_OWNER_ID"
      fi
    } | curl -q -fsS --max-time 30 -H @- -w '%{onerror}%{http_code}' "${origin%/}/api/$endpoint/$FIBE_GITHUB_CONNECTION_ID/token") || {
      case "$response" in
        401|403|404) github_no_credential "Fibe refused the selected GitHub connection (HTTP $response)" ;;
        *) github_fail "selected Fibe GitHub connection is unavailable" ;;
      esac
    }
    github_release_token=$(printf '%s' "$response" | jq -er '.token | select(type == "string" and length > 0)') || github_no_credential "selected Fibe GitHub connection returned no token"
  fi
  [ -n "$github_release_token" ] || github_no_credential "configure the owner's GitHub App connection or OAuth token before downloading"
}

github_api_get() {
  if [ -z "${github_release_token:-}" ]; then
    github_resolve_token
  fi
  # Preserve streaming output for callers requesting /dev/stdout.
  destination=$3
  [ "$destination" != /dev/stdout ] || destination=/dev/fd/3
  {
    status=$(printf 'Authorization: Bearer %s\n' "$github_release_token" |
      curl -q -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 180 \
        -H @- -H "Accept: $2" -o "$destination" -w '%{http_code} %header{x-ratelimit-remaining}' "https://api.github.com/repos/$1") || {
      case "$status" in
        '403 0'*) github_fail "GitHub rate limit exhausted" ;;
        '401 '*|'403 '*) github_no_credential "GitHub refused the selected credential (HTTP ${status%% *})" ;;
        *) github_fail "GitHub request failed (HTTP ${status%% *})" ;;
      esac
    }
  } 3>&1
}
# The installer sources the same authenticated client for metadata and assets.
[ "${0##*/}" = github-release.sh ] || return 0
case "$1" in
  --asset)
    repo=$2 tag=$3 name=$4 out=$5
    metadata=$(mktemp)
    trap 'rm -f "$metadata"' EXIT
    github_api_get "$repo/releases/tags/$tag" application/vnd.github+json "$metadata" || github_fail "cannot resolve $repo release $tag"
    id=$(jq -er --arg name "$name" '.assets[] | select(.name == $name) | .id | select(type == "number")' "$metadata") || github_fail "release $tag is missing $name"
    github_api_get "$repo/releases/assets/$id" application/octet-stream "$out" ;;
  *) github_api_get "$1" "$2" "$3" ;;
esac
