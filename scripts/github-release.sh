#!/bin/sh
# Fetch a GitHub API resource or release asset with the selected owner's credential.
set -eu

fail() { echo "GitHub release: $*" >&2; exit 1; }

token=${GH_TOKEN:-${GITHUB_TOKEN:-}}
if [ -z "$token" ] && [ -s /run/secrets/gh_token ]; then
  token=$(cat /run/secrets/gh_token)
fi
if [ -z "$token" ] && [ -n "${FIBE_API_KEY:-}" ] && [ -n "${FIBE_GITHUB_CONNECTION_ID:-}" ]; then
  case "$FIBE_GITHUB_CONNECTION_ID" in ''|*[!0-9]*) fail "invalid GitHub connection" ;; esac
  case "${FIBE_GITHUB_CONNECTION_OWNER:-}" in
    Team) endpoint=team_git_installations ;;
    '') endpoint=installations ;;
    *) fail "invalid GitHub connection owner" ;;
  esac
  case "${FIBE_DOMAIN:-}" in
    '') fail "selected GitHub connection has no Fibe origin" ;;
    http://*|https://*) origin=$FIBE_DOMAIN ;;
    *) origin=https://$FIBE_DOMAIN ;;
  esac
  # This endpoint belongs to Fibe. Keep its bearer on that origin; refuse redirects.
  response=$({
    printf 'Authorization: Bearer %s\n' "$FIBE_API_KEY"
    if [ -n "${FIBE_OWNER_TYPE:-}" ] && [ -n "${FIBE_OWNER_ID:-}" ]; then
      printf 'X-Fibe-Expected-Owner-Type: %s\nX-Fibe-Expected-Owner-ID: %s\n' "$FIBE_OWNER_TYPE" "$FIBE_OWNER_ID"
    fi
  } | curl -q -fsS --max-time 30 -H @- "${origin%/}/api/$endpoint/$FIBE_GITHUB_CONNECTION_ID/token") || fail "selected Fibe GitHub connection is unavailable"
  token=$(printf '%s' "$response" | jq -er '.token | select(type == "string" and length > 0)') || fail "selected Fibe GitHub connection returned no token"
fi
[ -n "$token" ] || fail "configure the owner's GitHub App connection or OAuth token before downloading"
api_get() {
  # Only GitHub receives the bearer. curl strips it on the release storage redirect.
  printf 'Authorization: Bearer %s\n' "$token" |
    curl -q -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 180 -H @- -H "Accept: $2" -o "$3" "https://api.github.com/repos/$1"
}
case "$1" in
  --asset)
    repo=$2 tag=$3 name=$4 out=$5
    metadata=$(mktemp)
    trap 'rm -f "$metadata"' EXIT
    api_get "$repo/releases/tags/$tag" application/vnd.github+json "$metadata" || fail "cannot resolve $repo release $tag"
    id=$(jq -er --arg name "$name" '.assets[] | select(.name == $name) | .id | select(type == "number")' "$metadata") || fail "release $tag is missing $name"
    api_get "$repo/releases/assets/$id" application/octet-stream "$out" ;;
  *) api_get "$1" "$2" "$3" ;;
esac
