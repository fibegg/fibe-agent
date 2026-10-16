#!/bin/sh

set -eu

REPO_OWNER="${FIBE_REPO_OWNER:-fibegg}"
REPO_NAME="${FIBE_REPO_NAME:-sdk}"
VERSION="${FIBE_VERSION:-${FIBE_CLI_VERSION:-}}"
PIN_FILE="${FIBE_CLI_PIN_FILE:-/usr/local/share/fibe/provider-versions.json}"
PIN_VERSION=$(jq -er '.fibeCli.version' "$PIN_FILE")
VERSION="${VERSION#v}"
VERSION="${VERSION:-$PIN_VERSION}"
if [ "$VERSION" != "$PIN_VERSION" ]; then
  echo "ERROR: Requested Fibe CLI version does not match its checksum pin" >&2
  exit 1
fi
INSTALL_DIR="${FIBE_INSTALL_DIR:-/usr/local/bin}"
TOKEN=""

if [ -n "${GH_TOKEN:-}" ]; then
  TOKEN="${GH_TOKEN}"
elif [ -f /run/secrets/gh_token ] && [ -s /run/secrets/gh_token ]; then
  TOKEN=$(tr -d '\r\n' < /run/secrets/gh_token)
fi

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)
    FIBE_ARCH="amd64"
    ;;
  aarch64|arm64)
    FIBE_ARCH="arm64"
    ;;
  *)
    echo "ERROR: Unsupported Fibe CLI architecture: $ARCH" >&2
    exit 1
    ;;
esac

EXPECTED_SHA256=$(jq -er --arg arch "$FIBE_ARCH" '.fibeCli.linuxArchiveSha256[$arch] | select(test("^[0-9a-f]{64}$"))' "$PIN_FILE")

TAG="v$VERSION"
RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG}"
echo "--> Installing checksum-pinned Fibe CLI release ${TAG} from ${REPO_OWNER}/${REPO_NAME}"

RELEASE_JSON=$(mktemp)
ARCHIVE_PATH=$(mktemp)
cleanup() {
  rm -f "$RELEASE_JSON" "$ARCHIVE_PATH"
}
trap cleanup EXIT

if [ -n "$TOKEN" ]; then
  curl -fsSL \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "$RELEASE_URL" \
    -o "$RELEASE_JSON"
else
  curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    "$RELEASE_URL" \
    -o "$RELEASE_JSON"
fi

TAG=$(jq -r '.tag_name // empty' "$RELEASE_JSON")
if [ "$TAG" != "v$PIN_VERSION" ]; then
  echo "ERROR: Release tag does not match the source checksum pin" >&2
  exit 1
fi

FILE_VERSION="${TAG#v}"
ASSET_NAME="fibe_${FILE_VERSION}_linux_${FIBE_ARCH}.tar.gz"
ASSET_API_URL=$(jq -r --arg name "$ASSET_NAME" '.assets[] | select(.name == $name) | .url' "$RELEASE_JSON" | head -n 1)
ASSET_BROWSER_URL=$(jq -r --arg name "$ASSET_NAME" '.assets[] | select(.name == $name) | .browser_download_url' "$RELEASE_JSON" | head -n 1)

if [ -z "$ASSET_BROWSER_URL" ] || [ "$ASSET_BROWSER_URL" = "null" ]; then
  echo "ERROR: Could not find release asset ${ASSET_NAME} for ${TAG}" >&2
  echo "Available assets:" >&2
  jq -r '.assets[].name' "$RELEASE_JSON" >&2
  exit 1
fi

echo "--> Downloading ${ASSET_NAME}"
if [ -n "$TOKEN" ] && [ -n "$ASSET_API_URL" ] && [ "$ASSET_API_URL" != "null" ]; then
  curl -fsSL \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/octet-stream" \
    "$ASSET_API_URL" \
    -o "$ARCHIVE_PATH"
else
  curl -fsSL "$ASSET_BROWSER_URL" -o "$ARCHIVE_PATH"
fi

# Verify the downloaded archive before extraction or changing the install directory.
printf '%s  %s\n' "$EXPECTED_SHA256" "$ARCHIVE_PATH" | sha256sum --check --strict -

mkdir -p "$INSTALL_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$INSTALL_DIR" fibe
chmod +x "$INSTALL_DIR/fibe"
