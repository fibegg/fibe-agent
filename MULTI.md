# Multi-conversation runtime

Fibe conversations are the product-level threads; provider-native sessions are implementation details attached to them. Files, `CLAUDE.md`, `GEMINI.md`, skills and MCP config live in a shared provider workspace; chat history and provider session state are per conversation; model, effort, provider auth and agent identity are global. Routes and events: [`docs/API.md`](docs/API.md).

## Conversations

| Conversation | ID | Storage | UI | Delete |
| --- | --- | --- | --- | --- |
| Default | `default` | `DATA_DIR/default` | visible, writable | no |
| Inbox | `inbox` | `DATA_DIR/conversations/inbox` | hidden while empty, read-only | no |
| User-created | UUID | `DATA_DIR/conversations/<uuid>` | visible, writable | yes |

`fibe-agent` owns the registry in `DATA_DIR/conversations/index.json` (`id`, `title`, `createdAt`, `lastMessageAt`, `messageCount`, `readonly`, `system`, `hiddenWhenEmpty`, `isProcessing`). `inbox` is the target of API/system sends without a `conversationId`; it stays addressable while hidden and `GET /api/conversations` lists it only once it has messages. Unknown ids return `404` (WebSocket close `4004`). A WebSocket binds to one conversation and conversation-specific events carry `conversationId` and reach only its sessions.

Per conversation: messages, activity log, raw provider traffic, uploads, pending steer text inside strategies, provider session markers, local MCP prompts. Global per agent: model, effort, provider credentials and auth, agent name, provider selection, the shared provider workspace, local playground links and external project directories.

## Paths

`ProviderConversationPaths` (Codex, OpenCode, Gemini, Antigravity; Claude SDK follows the same layout) takes the workspace from `getDefaultConversationDataDir()` and the session marker from `getConversationDataDir()`. Shared workspaces live under the default conversation data dir (for example `DATA_DIR/default/codex_workspace`). Only `default` may read a legacy marker from the workspace; UUID conversations never inherit one.

| Provider | Workspace | Marker |
| --- | --- | --- |
| Claude SDK | `claude_workspace` | `.claude_session` |
| Codex | `codex_workspace` | `.codex_session` (app-server thread id) |
| OpenCode | `opencode_workspace` | `.opencode_session` (`ses_...` id) |
| Gemini | `gemini_workspace` | `.gemini_session` (Gemini session UUID) |
| Antigravity | `antigravity_workspace` | `.antigravity_session` |
| Cursor | `cursor_workspace` inside the conversation dir (not shared, not on `ProviderConversationPaths`) | `.cursor_session` |

The file browser shows the shared workspace whatever the conversation. Deleting a conversation removes its messages, activity, uploads and marker, never the shared workspace.

## Send semantics

One active turn per conversation; different conversations run in parallel, each with its own `SessionContext` and strategy instance. A busy same-conversation send follows `busyPolicy`:

- `reject`: busy/conflict, the message is not appended.
- `queue`: append now, run as the next turn (`drainQueuedTurns()` drains serially).
- `steer`: append now, call the strategy's `steerAgent` with the text, then queue an empty follow-up turn. Strategies that only store the text as pending input (OpenCode, Gemini, Antigravity, Claude SDK) deliver it through that empty turn. Presence of `steerAgent` is reported as `resolvedPolicy: "steer"`, which therefore means "accepted through the steer path", not necessarily injected into the running turn; `resolution` and `fallbackReason` in `docs/API.md` give the precise outcome.

## Providers

| Provider | Transport | Native isolation | True steer | Shared workspace |
| --- | --- | --- | --- | --- |
| Claude SDK | `@anthropic-ai/claude-agent-sdk` | yes | no: interrupt, text folded into next turn | yes |
| Codex | `codex app-server` (default) or `codex exec` | yes | yes, `turn/steer` | yes |
| OpenCode | `opencode serve` (default) or `opencode run --format json` | yes | no, queued pending input | yes |
| Gemini | headless `gemini -p` / `--resume` | best effort | no, queued | yes |
| Antigravity | headless `agy` / `--conversation` | best effort | no, queued | yes |
| Cursor | CLI resume | partial | no | no |

**Claude SDK** (`claude-sdk.strategy.ts`): each user turn starts a fresh `query({ prompt: asyncQueue, options })` that resumes the marker's session; the query lives only while the turn runs. With no marker and a UUID conversation, the Fibe UUID is passed as SDK `sessionId`; a session id reported later is persisted. Native session support is reported, so Fibe history is not replayed. The resolved local `claude` executable is passed as `pathToClaudeCodeExecutable` instead of relying on the optional native binary package. Inline stdio MCP servers, including `fibe-local`, are recreated with each query: keep needed state in files, Fibe APIs or the provider session.

**Codex** (`openai-codex.strategy.ts`): `codex app-server --listen stdio://` JSON-RPC; starts or resumes the conversation's thread and stores its id (Codex owns thread ids, Fibe UUIDs are not used). Steer calls `turn/steer` with `threadId`, `expectedTurnId` and text; on failure the text is queued for the next turn. Interrupt calls `turn/interrupt`. Native session support is reported only when a marker exists; otherwise Fibe history is injected. Transport overrides: `CODEX_AGENT_TRANSPORT=app-server|appserver|exec|cli`, `CODEX_USE_APP_SERVER=0|false|no`; `exec` cannot steer.

**OpenCode** (`opencode.strategy.ts`, `http-app-server-process.ts`): HTTP + SSE against `opencode serve` (`POST /session`, `GET /session/:id`, `POST /session/:id/message`, `GET /event`, `POST /session/:id/abort`, `GET /global/health`). Text deltas become chat chunks, reasoning deltas activity reasoning, tool events Fibe tool activity, `session.error` a provider error, `session.idle` the end of the turn. Interrupt aborts SSE/prompt controllers and the active session. `opencode.json` in the workspace avoids permission prompts. Overrides: `OPENCODE_AGENT_TRANSPORT=app-server|appserver|run|cli`, `OPENCODE_USE_APP_SERVER=0|false|no`.

**Gemini** (`gemini.strategy.ts`): first turn runs without `--resume`, then finds the newest `GEMINI_CONFIG_DIR/tmp/<project>/chats/session-*.json` whose normalized `.project_root` equals the shared workspace and stores its `sessionId`; later turns run `gemini --resume <uuid> -p=<prompt>`. Only `default` may translate an old empty marker to `--resume latest`. A successful run with no visible output clears the marker and fails the turn; a missing-session error clears only that conversation's marker; if no UUID is captured, Fibe history is injected until one exists. ACP (`--acp`) is not used: it would require Fibe to act as an ACP client with filesystem services.

## Lifecycle

Delete (user-created only, allowed while processing): broadcast deletion, destroy attached sessions, interrupt provider work (Claude SDK closes its query, Codex interrupts and closes the app-server, OpenCode aborts the session and closes SSE, Gemini kills the CLI), remove the entry from `index.json`, remove the state directory; a failed removal is recorded in `DATA_DIR/conversations/tombstones.json` and retried after startup and on a timer.

Restart: conversations, messages, activity and markers reload from disk and tombstones are retried; providers resume from their markers (Codex and OpenCode start a new app-server and resume the stored thread/session). In-memory sessions and provider processes are lost. A turn cut off by a restart gets an interrupted notice; persisted REST requests (sent with `requestId`) are re-admitted, and running ones become `outcome_unknown`; other queued turns are in memory only and are lost, though their user messages stay in history (`docs/API.md`, scheduled delivery identities).

Raw provider traffic: the CONNECT proxy embeds the conversation id so captures land in the right store (`GET /api/conversations/:id/provider-traffic`; the flat `GET /api/provider-traffic?conversationId=` defaults to `default`). Activity and local MCP events (ask user, confirm, show image, notify, set title) carry `conversationId` so they never reach another conversation's UI.

## Fibe sync contract

Sync sends an explicit `conversation_id`; missing legacy sync means `default`, and old Fibe records are backfilled to `default`, not `inbox`. Mirror records: `agent_conversations` unique on `[agent_id, client_id]`; `agent_messages`, `agent_activities` and `agent_raw_providers` carry `agent_conversation_id`; upserts are scoped by `[agent_id, agent_conversation_id, client_id]`. Fibe is observability/history; `fibe-agent` owns thread creation, switching, provider context and live UI behaviour.

## Isolation and known limits

- Provider context is isolated by distinct native sessions once a marker exists; without one, only that conversation's Fibe history is injected. The marker file remains the durable mapping because Codex, OpenCode and Gemini own their ids.
- Shared on purpose: workspace files, instruction files, MCP config, provider auth, model/effort, external tools and global CLI caches. Parallel conversations can edit the same files at the same time.
- Strategies reject a successful zero-output run without saving a marker, and clear a stale marker on provider-specific missing-session errors.

## Debugging

- A new conversation shows old messages: check the conversation id in the UI and the `/api/conversations/:id/messages` request.
- Empty file browser in a UUID conversation: check workspace path resolution and whether the strategy uses `ProviderConversationPaths`.
- `[SYSCHECK]` repeats after refresh: the UI loaded an empty or wrong conversation id or the message fetch failed.
- Steer accepted but output unchanged: the provider only queues (table above).
- Gemini lost context: inspect `.gemini_session` and Gemini's temp session files for the workspace project root.
