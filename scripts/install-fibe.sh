#!/bin/sh

set -eu

REPO_OWNER="${FIBE_REPO_OWNER:-fibegg}"
REPO_NAME="${FIBE_REPO_NAME:-sdk}"
VERSION="${FIBE_VERSION:-}"
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
    FIBE_ARCH="amd64"
    ;;
esac

if [ -n "$VERSION" ]; then
  TAG="$VERSION"
  case "$TAG" in
    v*) ;;
    *) TAG="v$TAG" ;;
  esac
  RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG}"
  echo "--> Installing pinned Fibe CLI release ${TAG} from ${REPO_OWNER}/${REPO_NAME}"
else
  RELEASE_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
  echo "--> Resolving latest Fibe CLI release from ${REPO_OWNER}/${REPO_NAME}"
fi

RELEASE_JSON=$(mktemp)
cleanup() {
  rm -f "$RELEASE_JSON" /tmp/fibe.tar.gz
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
if [ -z "$TAG" ]; then
  echo "ERROR: Could not resolve Fibe CLI release tag from ${RELEASE_URL}" >&2
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
    -o /tmp/fibe.tar.gz
else
  curl -fsSL "$ASSET_BROWSER_URL" -o /tmp/fibe.tar.gz
fi

tar -xzf /tmp/fibe.tar.gz -C /usr/local/bin fibe
chmod +x /usr/local/bin/fibe
