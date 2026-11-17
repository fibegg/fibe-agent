#!/bin/sh

set -eu

REPO_OWNER="${FIBE_REPO_OWNER:-fibegg}"
REPO_NAME="${FIBE_REPO_NAME:-sdk}"
VERSION="${FIBE_VERSION:-${FIBE_CLI_VERSION:-latest}}"
VERSION="${VERSION#v}"
INSTALL_DIR="${FIBE_INSTALL_DIR:-/usr/local/bin}"
EXPECTED_SHA256="${FIBE_CLI_ARCHIVE_SHA256:-}"
SDK_SHA="${FIBE_SDK_SHA:-}"
TOKEN="${GH_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -s /run/secrets/gh_token ]; then
  TOKEN=$(tr -d '\r\n' < /run/secrets/gh_token)
fi

fail() { echo "ERROR: $*" >&2; exit 1; }
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) FIBE_ARCH=amd64 ;;
  aarch64|arm64) FIBE_ARCH=arm64 ;;
  *) fail "Unsupported Fibe CLI architecture: $ARCH" ;;
esac

RELEASE_JSON=$(mktemp)
COMMIT_JSON=$(mktemp)
ARCHIVE_PATH=$(mktemp)
CHECKSUMS_PATH=$(mktemp)
trap 'rm -f "$RELEASE_JSON" "$COMMIT_JSON" "$ARCHIVE_PATH" "$CHECKSUMS_PATH"' EXIT

api_request() {
  if [ -n "$TOKEN" ]; then
    curl -fsSL -H "Authorization: Bearer ${TOKEN}" -H 'Accept: application/vnd.github+json' "$1" -o "$2"
  else
    curl -fsSL -H 'Accept: application/vnd.github+json' "$1" -o "$2"
  fi || fail "Could not resolve Fibe SDK release metadata"
}
download_asset() {
  api_url=$(jq -r --arg name "$1" '.assets[] | select(.name == $name) | .url' "$RELEASE_JSON" | head -n 1)
  browser_url=$(jq -r --arg name "$1" '.assets[] | select(.name == $name) | .browser_download_url' "$RELEASE_JSON" | head -n 1)
  [ -n "$browser_url" ] && [ "$browser_url" != null ] || fail "Could not find release asset $1 for $TAG"
  if [ -n "$TOKEN" ] && [ -n "$api_url" ] && [ "$api_url" != null ]; then
    curl -fsSL -H "Authorization: Bearer ${TOKEN}" -H 'Accept: application/octet-stream' "$api_url" -o "$2"
  else
    curl -fsSL "$browser_url" -o "$2"
  fi || fail "Could not download Fibe SDK asset $1"
}

if [ -n "$EXPECTED_SHA256" ]; then
  # CI resolved the release before Docker cache selection. Do not resolve again.
  printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail 'Build requires an exact resolved Fibe CLI version'
  printf '%s\n' "$SDK_SHA" | grep -Eq '^[0-9a-f]{40}$' || fail 'Build requires the resolved SDK commit'
  printf '%s\n' "$EXPECTED_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail 'Build requires a valid archive SHA-256'
  TAG="v${VERSION}"
  ASSET_NAME="fibe_${VERSION}_linux_${FIBE_ARCH}.tar.gz"
  curl -fsSL "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${TAG}/${ASSET_NAME}" -o "$ARCHIVE_PATH" || fail "Could not download Fibe SDK asset $ASSET_NAME"
else
  if [ "$VERSION" = latest ] || [ -z "$VERSION" ]; then
    RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
    VERSION=""
  else
    printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail 'Fibe CLI version must be latest or an exact stable version'
    RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/v${VERSION}"
  fi
  echo "--> Resolving Fibe CLI ${VERSION:-latest} from ${REPO_OWNER}/${REPO_NAME}"
  api_request "$RELEASE_URL" "$RELEASE_JSON"
  TAG=$(jq -r '.tag_name // empty' "$RELEASE_JSON")
  printf '%s\n' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || fail 'Release has no stable Fibe CLI tag'
  jq -e '(.draft != true) and (.prerelease != true)' "$RELEASE_JSON" >/dev/null || fail 'Fibe CLI release is not published stable'
  [ -z "$VERSION" ] || [ "$TAG" = "v$VERSION" ] || fail "Release tag $TAG does not match requested Fibe CLI version"
  VERSION="${TAG#v}"
  ASSET_NAME="fibe_${VERSION}_linux_${FIBE_ARCH}.tar.gz"
  download_asset checksums.txt "$CHECKSUMS_PATH"
  EXPECTED_SHA256=$(awk -v name="$ASSET_NAME" '{ file=$2; sub(/^\*/, "", file); if (file == name) print $1 }' "$CHECKSUMS_PATH")
  [ "${#EXPECTED_SHA256}" -eq 64 ] || fail "Release $TAG publishes no unique SHA-256 for $ASSET_NAME"
  printf '%s\n' "$EXPECTED_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "Release $TAG publishes no valid SHA-256 for $ASSET_NAME"
  # Branch-valued target_commitish is not the release commit identity.
  api_request "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${TAG}" "$COMMIT_JSON"
  SDK_SHA=$(jq -r '.sha // empty' "$COMMIT_JSON")
  printf '%s\n' "$SDK_SHA" | grep -Eq '^[0-9a-f]{40}$' || fail 'Release tag has no exact SDK commit'
  download_asset "$ASSET_NAME" "$ARCHIVE_PATH"
fi

printf '%s  %s\n' "$EXPECTED_SHA256" "$ARCHIVE_PATH" | sha256sum --check --strict - || fail "Fibe SDK archive checksum mismatch for $ASSET_NAME"
echo "--> Installing Fibe CLI ${VERSION}; SDK commit ${SDK_SHA}; archive SHA-256 ${EXPECTED_SHA256}"
mkdir -p "$INSTALL_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$INSTALL_DIR" fibe
chmod +x "$INSTALL_DIR/fibe"
