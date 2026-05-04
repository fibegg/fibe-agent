# Multi-Conversation Runtime Notes

This document captures how multi-conversation support currently works in
`fibe-agent`, what each provider can actually do, how queue/steer degradation is
handled, and what is still planned.

The short version:

- Fibe conversations are the product-level threads.
- Provider-native sessions are implementation details attached to Fibe
  conversations.
- The workspace is shared where possible so files, `CLAUDE.md`, `GEMINI.md`,
  skills, and MCP config remain common.
- Runtime state that represents chat history or provider state is scoped per
  conversation.
- Model, effort, provider auth, and agent identity are global agent settings.

## Vocabulary

`conversation`
: A Fibe-owned thread. This is what the UI lists and switches between.

`default`
: The first normal user conversation. It uses the legacy root conversation data
  directory for backward compatibility. It is visible, writable, and
  non-deletable.

`inbox`
: The system conversation. It is the target for API/system sends when no
  `conversationId` is supplied. It is read-only from the UI, hidden while empty,
  and non-deletable.

`provider session`
: A provider-native thread/session id such as a Claude SDK session id, a Codex
  app-server thread id, an OpenCode `ses_...` id, or a Gemini CLI session UUID.
  These ids are persisted in per-conversation marker files.

`workspace`
: The directory a provider sees as its working directory. We now prefer a shared
  workspace per provider, rooted under the default conversation data dir, so all
  conversations see the same files and instructions.

`state dir`
: The conversation-specific data directory where Fibe stores per-conversation
  messages, activities, uploads, and provider session markers.

`native session support`
: A strategy tells the orchestrator whether the provider can preserve context
  itself for the active conversation. If true, Fibe does not inject prior Fibe
  message history into the next provider prompt. If false, Fibe builds prompt
  context from stored Fibe messages.

## Conversation Model

The conversation registry is owned locally by `fibe-agent`.

Current IDs:

| Conversation | ID | Storage | UI | Delete |
| --- | --- | --- | --- | --- |
| Default | `default` | legacy root conversation data dir | visible, writable | no |
| Inbox | `inbox` | `DATA_DIR/conversations/inbox` | hidden while empty, read-only | no |
| User-created | UUID | `DATA_DIR/conversations/<uuid>` | visible, writable | yes |

Conversation metadata lives in:

```text
DATA_DIR/conversations/index.json
```

Deleted conversation cleanup failures are recorded in:

```text
DATA_DIR/conversations/tombstones.json
```

The manager retries tombstoned directory cleanup after startup and on a timer.

Visible conversation metadata includes:

- `id`
- `title`
- `createdAt`
- `lastMessageAt`
- `messageCount`
- `readonly`
- `system`
- `hiddenWhenEmpty`
- `isProcessing`

`GET /api/conversations` returns visible user conversations plus non-empty
`inbox`. `inbox` is still addressable by id even when hidden from the list.

## Conversation-Scoped State

These stores are conversation-scoped:

- messages
- activity log
- raw provider traffic
- uploads
- pending steer messages inside provider strategies
- provider session markers
- local MCP prompts and UI prompts emitted with `conversationId`

These are intentionally global per agent:

- model
- effort
- provider credentials and auth
- agent name / identity
- runtime provider selection
- shared filesystem workspace for providers that support it
- local playground links and external project directories

Agent name is global because it describes the running agent instance, not a
single conversation. Conversation title is the thread-level display name.

## Path Policy

For Codex, OpenCode, and Gemini, the helper `ProviderConversationPaths` applies
this policy:

- workspace path comes from `getDefaultConversationDataDir()` when available.
- active provider session marker comes from `getConversationDataDir()`.
- default/no-provider cases may read old legacy markers from the workspace.
- UUID conversations do not inherit legacy workspace markers.

That means a user-created conversation shares provider files with `default`, but
keeps its native provider session marker in its own state dir.

Provider workspace subdirs:

| Provider | Shared workspace subdir | Marker file |
| --- | --- | --- |
| Claude SDK | `claude_workspace` | `.claude_session` |
| Claude CLI | `claude_workspace` | `.claude_session` |
| Codex | `codex_workspace` | `.codex_session` |
| OpenCode | `opencode_workspace` | `.opencode_session` |
| Gemini | `gemini_workspace` | `.gemini_session` |
| Cursor | `cursor_workspace` | `.cursor_session` |

Cursor still uses older strategy code and has not been fully generalized through
`ProviderConversationPaths`.

## API Surface

Conversation CRUD and reads:

```text
GET    /api/conversations
POST   /api/conversations
PATCH  /api/conversations/:id
PATCH  /api/conversations/:id/title
DELETE /api/conversations/:id
GET    /api/conversations/:id/messages
GET    /api/conversations/:id/activities
GET    /api/conversations/:id/provider-traffic
POST   /api/conversations/:id/agent/send-message
```

Flat legacy/system send:

```text
POST /api/agent/send-message
```

`POST /api/agent/send-message` accepts:

- `text`
- `conversationId`
- `busyPolicy`
- `images`
- `attachmentFilenames`

If `conversationId` is missing or blank, the target is `inbox`.

`POST /api/conversations/:id/agent/send-message` targets the path id and returns
`404` for unknown conversations.

The WebSocket binds a client to one conversation. Events that are conversation
specific include `conversationId` and are broadcast only to sessions attached to
that conversation.

## Send Semantics

Each conversation can have one active turn at a time. Different conversations
can process in parallel because each active conversation has its own
`SessionContext` and provider strategy instance.

Same-conversation busy sends use a `busyPolicy`.

### `reject`

Return busy/conflict and do not append the user message.

### `queue`

Append the user message immediately, then enqueue it as the next turn after the
current provider run finishes.

The queued turns are drained serially by `drainQueuedTurns()`.

### `steer`

Append the user message immediately, then try to inject it into the active
provider run.

Current orchestrator flow:

1. Save and emit the user message.
2. If the active strategy has `steerAgent`, call it with the saved text.
3. Push a queued turn with empty text.
4. After the current turn finishes, drain that queued empty turn.

The empty queued turn matters because strategies such as OpenCode and Gemini
store the steer text internally as a pending message. The follow-up empty turn
lets the provider strategy consume that pending text as the next prompt.

Important limitation: the orchestrator currently treats the presence of
`steerAgent` as support for `resolvedPolicy: "steer"`. Some strategies implement
`steerAgent` as graceful queueing, not true in-flight steering. See provider
details below.

## Provider Matrix

| Provider | Current transport | Native conversation isolation | True steer | Queue fallback | Shared workspace |
| --- | --- | --- | --- | --- | --- |
| Claude SDK | Anthropic Claude Agent SDK | yes | yes | yes | yes |
| Claude CLI | `claude -p` / `--resume` | yes | partial/interruption style | yes | yes |
| Codex | `codex app-server` by default | yes | yes via `turn/steer` | yes | yes |
| OpenCode | `opencode serve` by default | yes | no | yes | yes |
| Gemini | headless `gemini -p` / `--resume` | best effort | no | yes | yes |
| Cursor | CLI resume | partial/older | no/older fallback | yes | not fully generalized |

## Claude SDK

Primary file:

```text
apps/api/src/app/strategies/claude-sdk.strategy.ts
```

Transport:

- Uses `@anthropic-ai/claude-agent-sdk`.
- Uses SDK `query({ prompt: asyncQueue, options })`.
- Keeps an SDK query/iterator record per Fibe conversation.
- Sends follow-up turns by enqueueing SDK user messages into the same SDK query.

Workspace/session:

- Working directory is the shared `claude_workspace`.
- Session marker is `.claude_session`.
- The marker lives in the active conversation state dir.
- `default` can fall back to a legacy marker in the workspace.
- UUID conversations do not inherit legacy default markers.

Session id rules:

- If a marker exists, the SDK resumes that marker.
- If no marker exists and the Fibe conversation id is a UUID, Fibe passes that
  UUID as SDK `sessionId`.
- If the SDK later reports a session id, Fibe persists it to `.claude_session`.
- `default` and `inbox` are not UUIDs, so they use normal marker compatibility.

Steer:

- `interruptAgent()` calls the SDK query interrupt flow.
- Claude SDK supports real in-flight interruption/steering behavior through the
  SDK query object and queued input.
- `steerAgent` is treated as true steer for Claude SDK.

Native session support:

- The strategy reports native session support.
- Fibe relies on Claude SDK/session state for provider context instead of
  replaying Fibe messages.

Auth:

- Provider auth remains shared per agent.
- The strategy resolves the local `claude` executable and passes it to the SDK
  with `pathToClaudeCodeExecutable`.
- If the SDK optional native binary is missing, use the resolved installed
  Claude binary path rather than relying on optional package artifacts.

Notes:

- Shared workspace means `CLAUDE.md`, skills, MCP configs, and project files are
  shared.
- Conversation isolation comes from separate SDK sessions/markers, not separate
  workspaces.

## Claude CLI

Primary file:

```text
apps/api/src/app/strategies/claude-code.strategy.ts
```

Transport:

- Spawns Claude CLI in print/headless mode.
- Resumes with a stored `.claude_session` marker.
- Parses stream/JSON output for text, usage, reasoning, and tool events.

Workspace/session:

- Uses shared `claude_workspace`.
- Uses `.claude_session` marker.
- Default can read legacy workspace marker.

Steer:

- This is older than the SDK path.
- The process can be interrupted.
- True provider-native turn steering is weaker than SDK and Codex app-server.
- Queue remains the reliable fallback.

When possible, prefer the Claude SDK strategy for multi-conversation Claude.

## OpenAI Codex

Primary file:

```text
apps/api/src/app/strategies/openai-codex.strategy.ts
```

Transport:

- Uses `codex app-server --listen stdio://` by default.
- Falls back to `codex exec` when app-server is disabled.

Transport overrides:

```text
CODEX_AGENT_TRANSPORT=app-server
CODEX_AGENT_TRANSPORT=appserver
CODEX_AGENT_TRANSPORT=exec
CODEX_AGENT_TRANSPORT=cli
CODEX_USE_APP_SERVER=0
CODEX_USE_APP_SERVER=false
CODEX_USE_APP_SERVER=no
```

Workspace/session:

- Shared workspace is `codex_workspace`.
- Session marker is `.codex_session`.
- The marker stores the Codex app-server thread id.
- Marker path is conversation-scoped.

App-server behavior:

- Starts an app-server process over stdio JSON-RPC.
- Starts or resumes a thread for the conversation.
- Runs turns against that thread.
- Captures `threadId` and `turnId`.
- Stores the thread id in `.codex_session`.

Steer:

- True in-flight steer is supported.
- `steerAgent(message)` calls:

```text
turn/steer
```

with:

- `threadId`
- `expectedTurnId`
- text input

Interrupt:

- `interruptAgent()` calls:

```text
turn/interrupt
```

with the active `threadId` and `turnId`.

Graceful degradation:

- If `turn/steer` fails, the strategy logs and queues the message internally for
  the next turn.
- If app-server is disabled, `codex exec` cannot provide the same quality of
  steering. Queue is the safe behavior.

Native session support:

- The strategy reports native session support when it can read a stored session
  marker.
- If no marker exists, Fibe may inject Fibe history context.

Notes:

- App-server is the right shape for multi-conversation Codex because it exposes
  thread/turn primitives and steering APIs.
- The Fibe UUID is not assumed to be the Codex thread id; Codex owns native
  thread ids and Fibe stores a mapping via `.codex_session`.

## OpenCode

Primary file:

```text
apps/api/src/app/strategies/opencode.strategy.ts
```

Helper:

```text
apps/api/src/app/strategies/http-app-server-process.ts
```

Transport:

- Uses `opencode serve` by default.
- Communicates with OpenCode over HTTP and SSE.
- Falls back to `opencode run --format json` when app-server is disabled.

Transport overrides:

```text
OPENCODE_AGENT_TRANSPORT=app-server
OPENCODE_AGENT_TRANSPORT=appserver
OPENCODE_AGENT_TRANSPORT=run
OPENCODE_AGENT_TRANSPORT=cli
OPENCODE_USE_APP_SERVER=0
OPENCODE_USE_APP_SERVER=false
OPENCODE_USE_APP_SERVER=no
```

Workspace/session:

- Shared workspace is `opencode_workspace`.
- Session marker is `.opencode_session`.
- The marker stores the OpenCode session id.
- OpenCode session ids must match OpenCode's own format, typically `ses_...`.
  Fibe UUIDs are not valid OpenCode session ids.

HTTP/SSE APIs used:

```text
POST /session
GET  /session/:id
POST /session/:id/message
GET  /event
POST /session/:id/abort
GET  /global/health
```

Event mapping:

- message/text deltas become visible chat chunks.
- reasoning deltas become activity reasoning chunks.
- tool events become Fibe tool activity.
- `session.error` becomes a provider error.
- `session.idle` ends the current reasoning/turn.

Steer:

- OpenCode app-server does not expose a Codex-style `turn/steer`.
- `steerAgent(message)` stores the message as pending provider input.
- The orchestrator's queued empty follow-up turn delivers that pending input as
  the next prompt.
- This is graceful degradation, not true in-flight steer.

Interrupt:

- `interruptAgent()` aborts active SSE/prompt controllers.
- If an app-server session is active, it calls:

```text
POST /session/:id/abort
```

Native session support:

- The strategy currently reports native session support.
- The app-server session id and OpenCode session model are trusted to carry
  context.

Notes:

- `opencode.json` is prepared in the shared workspace to avoid permission
  prompts for external directory, bash, edit, and similar tools.
- Legacy `opencode run` mode writes a marker, but app-server should be preferred
  for real multi-conversation isolation.

## Gemini CLI

Primary file:

```text
apps/api/src/app/strategies/gemini.strategy.ts
```

Transport:

- Uses headless Gemini CLI:

```text
gemini -p=<prompt>
gemini --resume <session-id> -p=<prompt>
```

- This is best-effort multi-conversation support.
- We do not currently use Gemini ACP mode.

Known CLI capabilities observed:

- `-p` / `--prompt`
- `--resume <latest|index|uuid>`
- `--list-sessions`
- `--delete-session`
- `--output-format text|json|stream-json`
- `--acp`

Workspace/session:

- Shared workspace is `gemini_workspace`.
- Session marker is `.gemini_session`.
- The marker stores Gemini's generated session UUID.

First turn:

1. Run Gemini without `--resume`.
2. Capture stdout/stderr for visible output and errors.
3. Scan Gemini's global project temp sessions under:

```text
GEMINI_CONFIG_DIR/tmp/<project>/chats/session-*.json
```

4. Match session files by normalized `.project_root` equal to the shared
   workspace path.
5. Capture `sessionId` from the newest matching session file.
6. Persist it to the active conversation `.gemini_session`.

Follow-up turns:

- If `.gemini_session` contains a UUID, run:

```text
gemini --resume <uuid> -p=<prompt>
```

Legacy compatibility:

- Older builds wrote an empty marker and resumed `latest`.
- Only `default`/legacy may translate that old marker to `--resume latest`.
- UUID conversations never inherit `latest`, because that would leak context
  across conversations.

Failure handling:

- If Gemini exits successfully but produces no visible output, Fibe clears the
  marker and rejects the turn so a bad native session is not persisted.
- If resume fails with a missing-session style error, Fibe clears only that
  conversation's marker.
- If no session UUID can be captured after a successful first run, Fibe logs a
  warning and future turns use Fibe history injection until a native marker is
  available.

Native session support:

- Returns true only when a stored session marker exists.
- Without a marker, Fibe injects stored Fibe message history into the prompt.

Steer:

- Gemini headless mode has no supported in-flight steering boundary.
- `steerAgent(message)` queues the message internally.
- The orchestrator's queued empty follow-up turn delivers it after the current
  turn finishes.
- This is queue fallback, not true steer.

Why not ACP yet:

- `--acp` means Gemini speaks Agent Communication Protocol over stdio.
- To use it well, Fibe needs to become an ACP client.
- ACP also expects client-side services such as filesystem access/proxying.
- That is a bigger architecture change than headless `-p` prompts.

## Cursor

Primary file:

```text
apps/api/src/app/strategies/cursor.strategy.ts
```

Transport:

- Uses Cursor CLI-style execution and resume markers.

Workspace/session:

- Uses `cursor_workspace`.
- Uses `.cursor_session`.
- This provider has not yet been brought fully onto the shared
  `ProviderConversationPaths` abstraction.

Steer:

- No current Codex-style true steer path is documented in the strategy.
- Queue and interrupt remain the safe degradation paths.

Status:

- Cursor should be treated as older/partial multi-conversation support until it
  is audited and refactored like Codex/OpenCode/Gemini.

## Deletion And Cleanup

`default` and `inbox` are protected and cannot be deleted.

User-created conversations can be deleted even if processing.

Delete flow:

1. Broadcast a conversation-deleted event.
2. Destroy sessions attached to that conversation.
3. Interrupt active provider work.
4. Remove metadata from `index.json`.
5. Remove the conversation state directory.
6. If removal fails, write a tombstone and retry later.

Provider cleanup expectations:

- Claude SDK should interrupt/close SDK records.
- Codex app-server should interrupt active turn and close the app-server
  process.
- OpenCode app-server should abort the active session and close SSE/prompt
  controllers.
- Gemini should kill the spawned CLI process.
- Marker files disappear when the conversation state dir is removed.

Because the workspace is shared, deleting a UUID conversation does not delete
the shared provider workspace. It deletes that conversation's messages,
activities, uploads, and provider session marker. This is intentional. Shared
workspace files are agent-level state.

## Raw Provider Traffic

Raw provider traffic is conversation-scoped.

The CONNECT proxy embeds/extracts the conversation id so captured provider
requests can be written to the correct conversation's provider traffic store.

Current endpoints:

```text
GET /api/conversations/:id/provider-traffic
GET /api/provider-traffic?conversationId=<id>
```

If no conversation id is supplied to the flat provider-traffic endpoint, it
falls back to `default`.

## Activity And Local MCP

Activity stores are conversation-scoped.

Real-time activity events are broadcast to the active conversation:

- reasoning start/chunk/end
- tool events
- task complete
- errors
- usage/token updates

Local MCP events include `conversationId` where relevant:

- ask user
- confirm action
- show image
- notify
- set title

That prevents one conversation's UI prompt or activity event from appearing in
another conversation's browser session.

## File Browser

The file browser reads provider working directories using the active
conversation id.

For providers migrated to the shared workspace policy, the browser shows the
same provider workspace regardless of conversation. This is desired because
workspace state is shared while native provider sessions are isolated.

Important distinction:

- file browser/workspace: shared
- messages/activity/uploads/session markers: conversation-scoped

## Rails Sync Contract

Fibe-agent sync should send an explicit `conversation_id`.

Rules:

- Missing legacy sync means `default`.
- API/system sends without `conversationId` target `inbox`.
- Rails mirror records should exist for `default`, `inbox`, and UUID
  conversations.
- Existing Rails rows should be backfilled to `default`, not `inbox`.

Rails schema contract:

- `agent_conversations` mirror table.
- Unique key: `[agent_id, client_id]`.
- `agent_messages.agent_conversation_id`.
- `agent_activities.agent_conversation_id`.
- `agent_raw_providers.agent_conversation_id`.
- Sync upserts scoped by `[agent_id, agent_conversation_id, client_id]`.

Rails is observability/history. Fibe-agent remains the runtime owner of thread
creation, switching, provider context, and live UI behavior.

## Provider Session IDs And Fibe UUIDs

Fibe UUIDs are useful when a provider accepts arbitrary session ids.

Current situation:

- Claude SDK can be seeded with the Fibe UUID for UUID conversations when no
  marker exists.
- Codex owns thread ids; Fibe stores the returned id.
- OpenCode requires `ses_...` ids; Fibe UUIDs are not valid OpenCode ids.
- Gemini owns session UUIDs; Fibe captures and stores the returned id.
- Cursor behavior should be rechecked before assuming Fibe UUID compatibility.

Therefore Fibe cannot eliminate all mappings. The provider marker file is still
the durable mapping from Fibe conversation id to provider-native session id.

## Context Isolation Guarantees

For migrated providers, provider context isolation comes from distinct
provider-native sessions per Fibe conversation.

Shared things can still affect behavior:

- same filesystem workspace
- same `CLAUDE.md` / `GEMINI.md` / provider instruction files
- same MCP server config
- same provider auth
- same global model/effort
- same external services or tools
- same local cache directories when provider CLIs use global caches

Those are intentional shared agent-level state unless noted otherwise.

The provider prompt/context sent to the model should be conversation-isolated
once a native session marker exists. For providers without a marker or without
native session support, Fibe injects only that conversation's Fibe message
history.

## Docker Stop/Start

On container stop:

- in-memory sessions and active strategy records are lost.
- active provider processes are terminated with the container.
- queued in-memory turns are lost unless they were already persisted as user
  messages.

On container start:

- conversations reload from `index.json`.
- messages/activity reload from each conversation store.
- provider session markers reload from conversation state dirs.
- default remains backed by the legacy root data dir.
- tombstoned deletion cleanup is retried.

Provider-specific restart behavior:

- Claude SDK resumes from `.claude_session`.
- Claude CLI resumes from `.claude_session`.
- Codex app-server starts a new app-server process and resumes the stored thread
  id from `.codex_session`.
- OpenCode starts a new app-server process and resumes/uses the stored OpenCode
  session id from `.opencode_session`.
- Gemini resumes with the stored Gemini session UUID from `.gemini_session`.

## Edge Cases

### No provider output

Several strategies reject a successful zero-output run and avoid saving the
session marker. This prevents corrupt or wrong native sessions from poisoning a
conversation.

### Missing or stale native session

Strategies detect provider-specific missing-session errors where possible. The
current conversation's marker is cleared, and later turns can fall back to Fibe
history injection.

### `steer` reported but queued internally

OpenCode and Gemini expose `steerAgent` so the orchestrator can preserve the
message through the same path. Internally they queue the content because there
is no true provider steer API in the current transport.

This means `resolvedPolicy: "steer"` can currently mean "accepted through the
steer path" rather than "the provider definitely injected it into the active
turn".

### Shared workspace deletion

Deleting a UUID conversation does not delete shared workspace files. That means
project files and instructions survive conversation deletion.

### `inbox` hidden while empty

`inbox` exists even when hidden. It becomes visible in the list only once it has
messages.

### Legacy marker leakage

Only `default` can read legacy workspace markers. UUID conversations must have
explicit conversation marker files.

### Queue durability

Queued turns are currently runtime memory. The user message is persisted
immediately, but the queued turn itself is not a durable job.

If the container stops before the queue drains, the message remains in history
but the queued provider execution will not automatically resume.

### Parallel filesystem writes

Cross-conversation provider runs can happen in parallel and share one workspace.
This is desired but it means two conversations can modify the same files at the
same time. Provider sessions are isolated; filesystem mutations are not.

## Testing Checklist

Core runtime:

- `default` is visible, writable, non-deletable, and uses the legacy root.
- `inbox` is read-only in UI, hidden while empty, API-writable, and
  non-deletable.
- UUID conversations store metadata under `DATA_DIR/conversations/index.json`.
- Unknown conversation ids return `404`.
- Same-conversation `reject`, `queue`, and `steer` behave as expected.
- Cross-conversation turns can run concurrently.
- Model/effort changes broadcast globally.
- Delete while processing aborts provider work and removes conversation state.

Per-provider:

- Claude SDK creates separate SDK sessions per conversation.
- Claude SDK UUID conversations can seed SDK `sessionId` from Fibe UUID.
- Codex app-server stores and resumes `.codex_session`.
- Codex `turn/steer` works during active turns.
- OpenCode app-server stores and resumes `.opencode_session`.
- OpenCode steer degrades to queued pending input.
- Gemini first run captures a Gemini session UUID.
- Gemini follow-up uses `--resume <uuid>`.
- Gemini stale markers clear on missing-session failures.
- Gemini steer degrades to queued pending input.

UI:

- Conversation dropdown switches active conversation.
- Sidebar conversation list switches active conversation.
- Refresh does not send `[SYSCHECK]` when messages are present.
- Active processing indicator appears per conversation.
- `inbox` renders no chat input.
- Queue is the default action when active conversation is processing.
- Steer is explicit.

Rails/sync:

- fibe-agent sends `conversation_id` with messages/activity/raw-provider sync.
- Missing legacy sync maps to `default`.
- Rails backfills old rows to `default`.
- Rails groups Scrolls/history by `agent_conversation_id`.

## Operational Debug Notes

Conversation metadata:

```text
DATA_DIR/conversations/index.json
```

Default conversation data:

```text
DATA_DIR/
```

Inbox data:

```text
DATA_DIR/conversations/inbox/
```

UUID conversation data:

```text
DATA_DIR/conversations/<uuid>/
```

Provider markers:

```text
DATA_DIR/.claude_session
DATA_DIR/conversations/<uuid>/.claude_session
DATA_DIR/conversations/<uuid>/.codex_session
DATA_DIR/conversations/<uuid>/.opencode_session
DATA_DIR/conversations/<uuid>/.gemini_session
```

Shared provider workspaces:

```text
DATA_DIR/claude_workspace/
DATA_DIR/codex_workspace/
DATA_DIR/opencode_workspace/
DATA_DIR/gemini_workspace/
```

Useful failure checks:

- If a new conversation shows old messages, inspect conversation id selection in
  the UI and the `/api/conversations/:id/messages` request.
- If file browser is empty in a UUID conversation, inspect provider workspace
  path resolution and whether the strategy uses `ProviderConversationPaths`.
- If `[SYSCHECK]` repeats after refresh, the UI likely loaded an empty/incorrect
  conversation id or failed message fetch.
- If `steer` appears accepted but did not affect active output, check whether
  the provider supports true in-flight steering or queued fallback only.
- If Gemini loses context, inspect `.gemini_session` and Gemini's temp session
  files for the shared workspace project root.

## PLANNED

This section lists known gaps and likely next improvements.

### Make Steering Capability Explicit

Current strategy shape exposes `steerAgent`, but that does not distinguish true
steer from queued fallback.

Planned:

- Add a provider capability API, for example:

```text
getTurnControlCapabilities(): {
  queue: true;
  nativeSteer: boolean;
  interrupt: boolean;
  durableQueue: boolean;
}
```

- Return a more precise `resolvedPolicy`, such as:

```text
steer
queue
steer_degraded_to_queue
reject
started
```

### Durable Queue

Queued turns are currently in memory.

Planned:

- Persist queued turns per conversation.
- Resume/drain durable queued turns after container restart.
- Mark queued user messages as queued/running/completed/failed.
- Allow cancellation of queued turns.

### Gemini ACP Client

Best-effort Gemini currently uses headless `gemini -p` and `--resume`.

Planned:

- Implement Fibe as a Gemini ACP client.
- Own the JSON-RPC lifecycle over stdio.
- Provide/proxy filesystem services expected by ACP.
- Investigate whether ACP supports long-running conversation sessions,
  cancellation, and better prompt updates.
- If ACP supports mid-turn updates, map Fibe `steer` to ACP-native behavior.
- If ACP still lacks steering, keep graceful queue degradation but gain better
  lifecycle control.

### Cursor Refactor

Cursor is still on older strategy code.

Planned:

- Move Cursor to `ProviderConversationPaths`.
- Share `cursor_workspace`.
- Keep `.cursor_session` conversation-scoped.
- Re-audit native session id behavior and whether Fibe UUIDs can be used.
- Add explicit queue/steer/interrupt capability reporting.

### Provider Session Registry

Marker files work but are low-level.

Planned:

- Add a provider session registry per conversation.
- Store provider id, native session id, created/updated timestamps, and
  transport.
- Keep marker files as compatibility shims or migration inputs.
- Expose provider session metadata in debug endpoints.

### Rails Conversation Sync Hardening

Planned:

- Ensure every sync payload includes `conversation_id`.
- Add Rails API coverage for messages/activity/raw providers by conversation.
- Add Scrolls grouping and filters by conversation.
- Add SDK/CLI flags for conversation list/get/send.
- Distinguish `default` and `inbox` clearly in Rails mirror records.

### Shared Workspace Concurrency Controls

Parallel conversations can write the same files.

Planned:

- Add visible warnings when multiple conversations are editing the same
  workspace.
- Consider per-file write activity indicators.
- Consider optional workspace write locks for destructive operations.
- Keep provider sessions parallel by default.

### Deletion Semantics Hardening

Planned:

- Make provider cleanup acknowledgements observable.
- Surface tombstoned cleanup state in a debug endpoint.
- Add tests where deletion races with active provider output.
- Ensure deleted conversation events close all UI surfaces immediately.

### Import Existing Provider Sessions

V1 does not import existing native provider sessions except compatibility marker
fallbacks.

Planned:

- List provider-native sessions where APIs allow it.
- Let users attach/import a native session into a Fibe conversation.
- Avoid importing global `latest` into UUID conversations by default.

### Better Provider Feature Matrix In Code

This document has a provider matrix, but code should expose the same facts.

Planned:

- Make strategy capabilities introspectable.
- Show capability status in a debug endpoint.
- Let UI choose labels/actions based on capabilities:
  - true steer
  - queue fallback
  - interrupt available
  - native session available
  - app-server transport active

### End-To-End Smoke Tests

Planned:

- One agent, two conversations, concurrent sends.
- Verify provider-native session ids differ.
- Verify shared workspace is the same.
- Verify messages/activity/raw traffic stay separate.
- Verify refresh does not resubmit syscheck.
- Verify delete while processing aborts and cleans only conversation state.

