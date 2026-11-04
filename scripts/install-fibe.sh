#!/bin/sh

set -eu

REPO_OWNER="${FIBE_REPO_OWNER:-fibegg}"
REPO_NAME="${FIBE_REPO_NAME:-sdk}"
VERSION="${FIBE_VERSION:-${FIBE_CLI_VERSION:-}}"
PIN_FILE="${FIBE_CLI_PIN_FILE:-/usr/local/share/fibe/provider-versions.json}"
PIN_VERSION=$(jq -er '.fibeCli.version' "$PIN_FILE")
VERSION="${VERSION#v}"
# No version, or "latest", installs the newest SDK release. Image builds pass
# the pinned version explicitly.
if [ "$VERSION" = "latest" ]; then
  VERSION=""
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

if [ "$VERSION" = "$PIN_VERSION" ]; then
  EXPECTED_SHA256=$(jq -er --arg arch "$FIBE_ARCH" '.fibeCli.linuxArchiveSha256[$arch] | select(test("^[0-9a-f]{64}$"))' "$PIN_FILE")
else
  EXPECTED_SHA256=""
fi

if [ -n "$VERSION" ]; then
  RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/v${VERSION}"
  echo "--> Installing Fibe CLI release v${VERSION} from ${REPO_OWNER}/${REPO_NAME}"
else
  RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
  echo "--> Resolving the latest Fibe CLI release from ${REPO_OWNER}/${REPO_NAME}"
fi

RELEASE_JSON=$(mktemp)
ARCHIVE_PATH=$(mktemp)
CHECKSUMS_PATH=$(mktemp)
cleanup() {
  rm -f "$RELEASE_JSON" "$ARCHIVE_PATH" "$CHECKSUMS_PATH"
}
trap cleanup EXIT

download_asset() {
  api_url=$(jq -r --arg name "$1" '.assets[] | select(.name == $name) | .url' "$RELEASE_JSON" | head -n 1)
  browser_url=$(jq -r --arg name "$1" '.assets[] | select(.name == $name) | .browser_download_url' "$RELEASE_JSON" | head -n 1)
  if [ -z "$browser_url" ] || [ "$browser_url" = "null" ]; then
    echo "ERROR: Could not find release asset $1 for ${TAG}" >&2
    echo "Available assets:" >&2
    jq -r '.assets[].name' "$RELEASE_JSON" >&2
    exit 1
  fi
  if [ -n "$TOKEN" ] && [ -n "$api_url" ] && [ "$api_url" != "null" ]; then
    curl -fsSL \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Accept: application/octet-stream" \
      "$api_url" \
      -o "$2"
  else
    curl -fsSL "$browser_url" -o "$2"
  fi
}

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
if [ -z "$TAG" ] || { [ -n "$VERSION" ] && [ "$TAG" != "v$VERSION" ]; }; then
  echo "ERROR: Release tag ${TAG:-missing} does not match the requested Fibe CLI version" >&2
  exit 1
fi
FILE_VERSION="${TAG#v}"
ASSET_NAME="fibe_${FILE_VERSION}_linux_${FIBE_ARCH}.tar.gz"

if [ "$FILE_VERSION" = "$PIN_VERSION" ] && [ -z "$EXPECTED_SHA256" ]; then
  EXPECTED_SHA256=$(jq -er --arg arch "$FIBE_ARCH" '.fibeCli.linuxArchiveSha256[$arch] | select(test("^[0-9a-f]{64}$"))' "$PIN_FILE")
fi
if [ -z "$EXPECTED_SHA256" ]; then
  # Other versions are verified against the checksums the release workflow
  # published with the archives.
  download_asset checksums.txt "$CHECKSUMS_PATH"
  EXPECTED_SHA256=$(awk -v name="$ASSET_NAME" '$2 == name { print $1 }' "$CHECKSUMS_PATH" | head -n 1)
  if ! printf '%s' "$EXPECTED_SHA256" | grep -Eq '^[0-9a-f]{64}$'; then
    echo "ERROR: Release ${TAG} publishes no SHA-256 for ${ASSET_NAME}" >&2
    exit 1
  fi
fi

echo "--> Downloading ${ASSET_NAME}"
download_asset "$ASSET_NAME" "$ARCHIVE_PATH"

# Verify the downloaded archive before extraction or changing the install directory.
printf '%s  %s\n' "$EXPECTED_SHA256" "$ARCHIVE_PATH" | sha256sum --check --strict -

mkdir -p "$INSTALL_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$INSTALL_DIR" fibe
chmod +x "$INSTALL_DIR/fibe"
