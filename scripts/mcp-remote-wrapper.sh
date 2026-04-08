#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# mcp-remote-wrapper — auto-restart wrapper for mcp-remote.
#
# mcp-remote (v0.1.x) has zero reconnection logic. When the upstream MCP
# server restarts (e.g. Rails Puma reload during development), the HTTP/SSE
# connection drops and mcp-remote exits immediately. Claude Code / Gemini CLI
# then marks those tools as "no longer available" for the rest of the session.
#
# This wrapper catches exits and restarts mcp-remote, keeping the parent
# process alive so the AI agent CLI still sees a running MCP child process
# and re-discovers tools on reconnection.
#
# Usage: mcp-remote-wrapper <url> [--allow-http] [--header ...] [...]
#        (same arguments as mcp-remote)
# ─────────────────────────────────────────────────────────────────────────────

MAX_RETRIES=${MCP_REMOTE_MAX_RETRIES:-15}
RETRY_DELAY=${MCP_REMOTE_RETRY_DELAY:-3}
attempt=0

while [ "$attempt" -lt "$MAX_RETRIES" ]; do
  mcp-remote "$@"
  exit_code=$?

  # Clean exit (e.g. graceful shutdown) — don't restart
  [ "$exit_code" -eq 0 ] && exit 0

  attempt=$((attempt + 1))
  echo "[mcp-remote-wrapper] process exited ($exit_code), retry $attempt/$MAX_RETRIES in ${RETRY_DELAY}s..." >&2
  sleep "$RETRY_DELAY"
done

echo "[mcp-remote-wrapper] max retries ($MAX_RETRIES) exhausted, giving up" >&2
exit 1
