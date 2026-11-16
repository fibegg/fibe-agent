#!/bin/sh
# Browser launcher installed in place of Chrome/Chromium in the Agent image.
# The browser moves next to it as <name>.real: Chrome loads its resources from
# the directory of /proc/self/exe, so it must stay in its own directory.
#
# Chrome's sandbox needs unprivileged user namespaces. Agent hosts often deny
# them to containers (Docker's default seccomp and AppArmor profiles, Ubuntu's
# kernel.apparmor_restrict_unprivileged_userns=1), and Chrome then exits with
# "Failed to move to new namespace" before any page loads. The Agent container
# is the isolation boundary, so where those namespaces are unavailable (or the
# caller is root, which Chrome refuses to sandbox) the browser runs with
# --no-sandbox. FIBE_CHROME_SANDBOX=1 leaves the decision to Chrome and
# FIBE_CHROME_SANDBOX=0 always disables the sandbox. Arguments pass through
# unchanged.

real="$(readlink -f -- "$0").real"

sandbox_unavailable() {
  [ "$(id -u)" = 0 ] && return 0
  command -v unshare >/dev/null 2>&1 || return 0
  # The namespaces Chrome's own sandbox creates for its renderers.
  ! unshare --user --pid --net --fork true >/dev/null 2>&1
}

for arg in "$@"; do
  [ "$arg" = --no-sandbox ] && exec "$real" "$@"
done

case "${FIBE_CHROME_SANDBOX:-}" in
  1) exec "$real" "$@" ;;
  0) exec "$real" --no-sandbox "$@" ;;
esac

if sandbox_unavailable; then
  exec "$real" --no-sandbox "$@"
fi
exec "$real" "$@"
