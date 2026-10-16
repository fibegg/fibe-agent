# Agent backend boundaries

Audit actor `AuthenticatedUser` means the Agent shared credential was validated by
the guard. It does not identify a specific human account. An Authorization header
on an open route does not establish that actor. Audit serialization and normal HTTP
request logging redact credential query values, including repeated and encoded
parameter names; the original request remains available for routing and browser
transport authentication. This does not remove existing historical logs or redact
arbitrary application payloads.

Codex app-server turns require the explicit `completed` terminal status and visible
output. Unknown or missing terminal status is a failed protocol outcome. OpenCode
turn errors remain failures even after visible output. Partial output remains
available to the caller. An OpenCode stored session is a resumable session identity
created before a turn, not a success receipt. These failures do not replay prompts.

Preview diagnostics fetch at most six responses (an initial request and five
followed redirects). `finalUrl`, status, and response headers describe the last
fetched response. `nextUrl`, when present, is an observed redirect target that was
not fetched because of the limit or a cycle. Invalid redirects remain finite
diagnostic failures.

Provider capture transitions are serialized. Readiness and child proxy environment
hints appear only after the listener starts. Failed startup cleans owned resources;
if cleanup fails, references remain available for a later cleanup retry. Disable
closes the proxy's client and upstream sockets before removing its environment
hints. Listener close has a two-second failure deadline. Settings PATCH requests
serialize transition and persistence, reconcile unchanged saved capture bits, and
attempt to restore the previous effective capture state if persistence fails.
Settings publish a complete new file by atomic rename; memory changes only after that write succeeds. No original-file backup is created. A double failure of
persistence and restoration is reported as requiring a retry. Shutdown refuses
new enable transitions.

File browser reads, raw responses, saves, uploads, folder collection and traversal
use the configured workspace plus repositories returned by the current local
Playground link's repository view. Encountering a symlink does not grant another
root. Both lexical and resolved relative paths enforce ignored names, including
`.git` and `node_modules`. A broken link or a target outside those roots is denied.
New parents are created relative to admitted directory descriptors. Every open
walks from a trusted root descriptor with no-follow directory and final-file opens;
raw routes return those read bytes rather than reopening a validated path string.
Python 3 is required for these descriptor operations. Each operation has a
ten-second child deadline, 32 MiB file limit and 48 MiB request/result limit.
Directory metadata resolves links within one helper process and examines at most
10,000 entries. Recursive traversal stops when a directory's descriptor identity
(device and inode) repeats in its current ancestry. Separate repository aliases
remain visible in separate branches. A depth limit of 50 also remains.

Configured roots and current CLI repository metadata are administrative authority.
An administrator moving an already admitted directory inode or creating hard-link
aliases remains within that trust boundary. This is not an absolute filesystem
sandbox or a defense against a malicious process with equivalent filesystem
authority. Concurrent edits to the same admitted file are not versioned by this
API. Metadata-only `getFilePath` results must never be reopened for content I/O.

State sync and hydration each have a 30-second attempt deadline, including response
body reads. Failed sync keeps the newest pending state and retries with exponential
spacing from one to 30 seconds; retry count is not globally exhausted. Existing
401/403 terminal handling remains. Shutdown aborts owned requests, clears pending
timers and refuses new work. It does not cancel a provider turn or promise delivery
of pending state after shutdown.

The Docker development runner waits for actual child exit or close, not signal
delivery. It sends TERM, waits three seconds, then sends KILL and waits one further
second. The API watcher gets its configured inner child grace plus two seconds
(default five seconds) so it can finish its own child cleanup before escalation. It reports failure if the owned child still has not exited; it does not
signal unrelated processes.
