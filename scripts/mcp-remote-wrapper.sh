#!/bin/sh
# Restart mcp-remote after a dropped HTTP/SSE connection so
# the parent agent can rediscover tools when the upstream server returns.
# Usage: mcp-remote-wrapper <url> [--allow-http] [--header ...] [...]

MAX_RETRIES=${MCP_REMOTE_MAX_RETRIES:-30}
RETRY_DELAY=${MCP_REMOTE_RETRY_DELAY:-5}
INITIAL_WAIT=${MCP_REMOTE_INITIAL_WAIT:-0}
attempt=0

url="$1"

if [ "$INITIAL_WAIT" -gt 0 ] 2>/dev/null; then
  echo "[mcp-remote-wrapper] waiting ${INITIAL_WAIT}s before first connection attempt..." >&2
  sleep "$INITIAL_WAIT"
fi

if [ -n "$url" ] && command -v curl >/dev/null 2>&1; then
  preflight_attempts=0
  preflight_max=10
  while [ "$preflight_attempts" -lt "$preflight_max" ]; do
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
    if [ "$http_code" != "000" ]; then
      echo "[mcp-remote-wrapper] server reachable (HTTP $http_code), starting mcp-remote" >&2
      break
    fi
    preflight_attempts=$((preflight_attempts + 1))
    echo "[mcp-remote-wrapper] server not reachable, preflight $preflight_attempts/$preflight_max..." >&2
    sleep 3
  done
fi

while [ "$attempt" -lt "$MAX_RETRIES" ]; do
  mcp-remote "$@"
  exit_code=$?

  # Do not restart after a graceful shutdown.
  [ "$exit_code" -eq 0 ] && exit 0

  attempt=$((attempt + 1))
  echo "[mcp-remote-wrapper] process exited ($exit_code), retry $attempt/$MAX_RETRIES in ${RETRY_DELAY}s..." >&2
  sleep "$RETRY_DELAY"
done

echo "[mcp-remote-wrapper] max retries ($MAX_RETRIES) exhausted, giving up" >&2
exit 1
