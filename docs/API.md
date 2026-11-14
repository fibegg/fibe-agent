# API

NestJS + Fastify API for `apps/api`.

**Base URL:** `http://localhost:3000/api` when served with `nx serve api`.

Chat and tests share route constants from `shared/api-paths.ts` (`API_PATHS.*`, `API_PATH_UPLOADS_BY_FILENAME`).

## Configuration and authentication

Canonical FIBE configuration uses `hostRoot` and `hostRootDomain`; child CLI
environment uses `HOST_ROOT` and `HOST_ROOT_DOMAIN`. Removed Marquee keys are
rejected with the replacement name, including settings overridden by another
source. Local Playground browser operations use `/api/playgrounds/` routes;
legacy Playroom routes are absent. Candidate CLI/image preparation is documented
in `AGENTS.md` under Candidate CLI builds.

Set `agentPassword` in `fibe.yml` or `FIBE_SETTINGS_JSON` to protect the API. `AGENT_PASSWORD` alone does not enable HTTP or WebSocket guards; it is an output passed to child processes after settings load.

With `agentPassword` set, `Bearer` routes require `Authorization: Bearer <password>` or `?token=<password>`, and WebSockets use the query token. `No` routes remain public. Without a password, guarded routes are open and login reports `No authentication required`.

Source audit caveat: legacy `/api/conversations` routes currently lack `AgentAuthGuard` despite their bearer labels below. Their existing auth behavior is unchanged here; the new prompt-answer route explicitly uses the guard. See the mobile contract for this recorded mismatch.

Several values that look like env vars are Fibe settings first:

| Fibe setting              | Env promotion               | Description                                                                                                                                                                                                                               |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentPassword`           | `AGENT_PASSWORD`            | Enables API and WebSocket bearer-token auth. Configure this in `fibe.yml` or `FIBE_SETTINGS_JSON`.                                                                                                                                        |
| `modelOptions`            | `MODEL_OPTIONS`             | Comma-separated string or YAML/JSON list returned by `GET /api/model-options`.                                                                                                                                                            |
| `defaultModel`            | `DEFAULT_MODEL`             | Initial model; falls back to the first `modelOptions` entry.                                                                                                                                                                              |
| `dataDir`                 | `DATA_DIR`                  | Base persistence dir, default `<cwd>/data`.                                                                                                                                                                                               |
| `systemPrompt`            | `SYSTEM_PROMPT`             | Inline prompt content from `fibe.yml` or `FIBE_SETTINGS_JSON`; settings promotion exposes it to child processes. A bare process env value is not a direct API input. If absent, the API loads the bundled `dist/assets/SYSTEM_PROMPT.md`. |
| `hostRoot`             | `HOST_ROOT`              | Host root, default `/opt/fibe`; the local playground CLI receives `<hostRoot>/playgrounds` as `HOST_ROOT`.                                                                                                                  |
| `postInitScript`          | `POST_INIT_SCRIPT`          | Shell command run once after startup; state is exposed at `GET /api/init-status`.                                                                                                                                                         |
| `websocketMaxConnections` | `WEBSOCKET_MAX_CONNECTIONS` | Maximum connected chat WebSockets before oldest-client eviction; default `5`.                                                                                                                                                             |

Direct process inputs include `PORT`, `PLAYGROUNDS_DIR`, `LOG_LEVEL`, `AGENT_PROVIDER`, `AGENT_AUTH_MODE`, provider keys, `FIBE_API_KEY`, `FIBE_DOMAIN`, `FIBE_AGENT_ID`, `CONVERSATION_ID`, CORS and frame settings, and provider runtime values such as `SESSION_DIR`.

## REST endpoints

All paths below include the `/api` global prefix.

| Method | Path                                           | Auth   | Description                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/health`                                  | No     | Health check. Returns `{ status: 'ok' }`.                                                                                                                                                                                                        |
| POST   | `/api/auth/login`                              | No     | Body `{ password? }`. Returns `{ success, message?, token? }` or `401`.                                                                                                                                                                          |
| GET    | `/api/runtime-config`                          | No     | Runtime chat config: avatar settings, provider label, Simplicate flag and lockChatModel boolean.                                                                                                                                               |
| GET    | `/api/messages`                                | Bearer | Default conversation messages enriched with activity usage.                                                                                                                                                                                      |
| GET    | `/api/activities`                              | Bearer | Default conversation activity timeline.                                                                                                                                                                                                          |
| GET    | `/api/activities/by-entry/:entryId`            | Bearer | Activity containing a story entry id.                                                                                                                                                                                                            |
| GET    | `/api/activities/:activityId`                  | Bearer | Single activity.                                                                                                                                                                                                                                 |
| GET    | `/api/activities/:activityId/:storyId`         | Bearer | Activity containing a specific story entry.                                                                                                                                                                                                      |
| GET    | `/api/model-options`                           | Bearer | Configured model names from the `modelOptions` Fibe setting.                                                                                                                                                                                     |
| POST   | `/api/model-options/refresh`                   | Bearer | Returns configured models plus any models listed by the active provider strategy.                                                                                                                                                                |
| GET    | `/api/playgrounds`                             | Bearer | File tree rooted at `PLAYGROUNDS_DIR` or `./playground`.                                                                                                                                                                                         |
| GET    | `/api/playgrounds/stats`                       | Bearer | Size/count stats for the active playground directory.                                                                                                                                                                                            |
| GET    | `/api/playgrounds/urls`                        | Bearer | Detected playground service URLs.                                                                                                                                                                                                                |
| GET    | `/api/playgrounds/repos`                       | Bearer | Canonical linked playground repos from `fibe local playgrounds info --view repos`, including `repo_root` for explicit git operations.                                                                                                            |
| GET    | `/api/playgrounds/preview-diagnostics?url=...` | Bearer | Preview URL diagnostics; `400` for missing/invalid URL.                                                                                                                                                                                          |
| GET    | `/api/playgrounds/diff?repo=...&file=...`      | Bearer | Git diff for an explicitly selected linked repo. `repo` may be service, repository, id, link path, or repo root; required when multiple repos are linked.                                                                                              |
| GET    | `/api/playgrounds/file?path=...`               | Bearer | Read a playground file. Empty path returns `{ content: '' }`.                                                                                                                                                                                    |
| GET    | `/api/playgrounds/file/raw?path=...`           | Bearer | Stream a playground file with inferred content type.                                                                                                                                                                                             |
| PUT    | `/api/playgrounds/file`                        | Bearer | Body `{ path, content }`. Creates or overwrites a file in the playground.                                                                                                                                                                        |
| POST   | `/api/playgrounds/upload?dir=...`              | Bearer | Multipart playground upload. Returns `{ ok: true, path }`.                                                                                                                                                                                       |
| POST   | `/api/playgrounds/git-stage`                   | Bearer | Body `{ files, confirm, repo? }`. Stage git files in the selected repo; `repo` is required when multiple repos are linked.                                                                                                                       |
| POST   | `/api/playgrounds/git-commit`                  | Bearer | Body `{ message, confirm, repo? }`. Commit staged playground changes in the selected repo.                                                                                                                                                       |
| POST   | `/api/playgrounds/git-branch`                  | Bearer | Body `{ create, repo? }`. Create or inspect branch state in the selected repo.                                                                                                                                                                   |
| POST   | `/api/playgrounds/git-push`                    | Bearer | Body `{ remote?, branch?, confirm, repo? }`. Push playground git changes from the selected repo.                                                                                                                                                 |
| POST   | `/api/playgrounds/git-pr`                      | Bearer | Body `{ title?, body?, confirm, repo? }`. Create a draft PR with `gh` from the selected repo.                                                                                                                                                    |
| GET    | `/api/playgrounds/browse?path=...`               | Bearer | Flat Fibe CLI listing from `fibe --output json local playgrounds info --view names`; only selector-visible playgrounds with source mounts are returned. Any non-empty `path` currently returns `[]`; `404` means the CLI/listing is unavailable. |
| POST   | `/api/playgrounds/link`                          | Bearer | Body `{ path }`, where `path` is the Fibe local playground name. Delegates to `fibe local playgrounds link <name> --link-dir <PLAYGROUNDS_DIR>`. Missing/invalid `path` returns `404`; CLI/link failure returns `400`.                           |
| POST   | `/api/playgrounds/unlink`                        | Bearer | Body `{ confirm: true }`. Clears the current `PLAYGROUNDS_DIR` link directory while preserving the directory itself, so a playground can be linked again from the UI.                                                                            |
| GET    | `/api/playgrounds/current`                       | Bearer | Returns `{ current }` from `PLAYGROUNDS_DIR/.current_playground.json`, or `null`.                                                                                                                                                                |
| GET    | `/api/agent-files`                             | Bearer | Agent-generated file tree, optionally scoped by `?conversationId=`.                                                                                                                                                                              |
| GET    | `/api/agent-files/stats`                       | Bearer | Agent-generated file stats.                                                                                                                                                                                                                      |
| GET    | `/api/agent-files/file?path=...`               | Bearer | Read an agent-generated file.                                                                                                                                                                                                                    |
| GET    | `/api/agent-files/file/raw?path=...`           | Bearer | Stream an agent-generated file.                                                                                                                                                                                                                  |
| PUT    | `/api/agent-files/file`                        | Bearer | Body `{ path, content }`. Save an agent-generated file.                                                                                                                                                                                          |
| POST   | `/api/agent-files/upload?dir=...`              | Bearer | Multipart upload into agent-generated files.                                                                                                                                                                                                     |
| POST   | `/api/uploads?conversationId=...`              | Bearer | Multipart attachment upload. Returns `{ filename, storedFilename, originalFilename, mediaType, size, kind }`. Blocked: executables/scripts. Max size: 20 MiB.                                                                                                                                              |
| GET    | `/api/uploads/:filename?conversationId=...`    | Bearer | Serve an uploaded attachment. Filename must be a safe basename.                                                                                                                                                                                  |
| GET    | `/api/agent/status`                            | Bearer | Default/session status: auth, processing, queue count, and last error.                                                                                                                                                                           |
| POST   | `/api/agent/send-message`                      | Bearer | Async integration/webhook send. Body `{ text, images?, attachmentFilenames?, conversationId?, busyPolicy?, requestId?, storeGeneration? }`. Returns `202 { accepted, messageId, resolvedPolicy?, executionState?, resolution, fallbackReason? }`.                                                                            |
| POST   | `/api/agent/interrupt`                         | Bearer | Interrupt a running provider turn. Body may include `{ conversationId? }`.                                                                                                                                                                       |
| DELETE | `/api/agent/queue/:turnId`                     | Bearer | Remove a queued turn, using body `conversationId` when needed.                                                                                                                                                                                   |
| PATCH  | `/api/agent/queue/:turnId`                     | Bearer | Update queued turn text/policy.                                                                                                                                                                                                                  |
| POST   | `/api/agent/queue/reorder`                     | Bearer | Reorder queued turns.                                                                                                                                                                                                                            |
| GET    | `/api/conversations`                           | Bearer | List visible conversations with processing state.                                                                                                                                                                                                |
| POST   | `/api/conversations`                           | Bearer | Create a conversation. Body may include `id`, `conversationId`, `conversation_id`, and `title`.                                                                                                                                                  |
| PATCH  | `/api/conversations/:id/title`                 | Bearer | Rename a conversation.                                                                                                                                                                                                                           |
| PATCH  | `/api/conversations/:id`                       | Bearer | Update conversation metadata, currently title.                                                                                                                                                                                                   |
| DELETE | `/api/conversations/:id`                       | Bearer | Delete a user-created conversation and its state directory. Protected conversations return `{ ok: false }`.                                                                                                                                      |
| GET    | `/api/conversations/:id/messages`              | Bearer | Messages for one conversation.                                                                                                                                                                                                                   |
| GET    | `/api/conversations/:id/activities`            | Bearer | Activity log for one conversation.                                                                                                                                                                                                               |
| GET    | `/api/conversations/:id/live`                  | Bearer | Live stream/queue state, pendingPrompts, streamId and revision for one conversation.                                                                                                                                                                                        |
| GET    | `/api/conversations/:id/provider-traffic`      | Bearer | Raw provider traffic for one conversation.                                                                                                                                                                                                       |
| POST   | `/api/conversations/:id/agent/send-message`    | Bearer | Send to a specific conversation; retains `201` success (unscoped send uses `202`). Unknown id returns `404`.                                                                                                                                                                                       |
| POST   | `/api/conversations/:id/agent/interrupt`       | Bearer | Interrupt a specific conversation.                                                                                                                                                                                                               |
| DELETE | `/api/conversations/:id/queue/:turnId`         | Bearer | Remove a queued turn for one conversation.                                                                                                                                                                                                       |
| PATCH  | `/api/conversations/:id/queue/:turnId`         | Bearer | Update a queued turn for one conversation.                                                                                                                                                                                                       |
| POST   | `/api/conversations/:id/queue/reorder`         | Bearer | Reorder one conversation's queue.                                                                                                                                                                                                                |
| GET    | `/api/provider-traffic?conversationId=...`     | Bearer | Raw provider traffic for the requested or default conversation.                                                                                                                                                                                  |
| GET    | `/api/fibe-sync-settings`                      | Bearer | Current Fibe sync/raw-provider-capture settings.                                                                                                                                                                                                 |
| PATCH  | `/api/fibe-sync-settings`                      | Bearer | Update Fibe sync settings.                                                                                                                                                                                                                       |
| GET    | `/api/init-status`                             | Bearer | Post-init script state.                                                                                                                                                                                                                          |
| GET    | `/api/data-privacy/export`                     | Bearer | Export default conversation core data.                                                                                                                                                                                                           |
| DELETE | `/api/data-privacy`                            | Bearer | Delete default conversation data and clear in-memory stores.                                                                                                                                                                                     |
| GET    | `/api/agent-mode`                              | Bearer | Current agent mode display string.                                                                                                                                                                                                               |
| POST   | `/api/agent-mode`                              | Bearer | Set mode by key or display string. Valid keys: `exploring`, `casting`, `overseeing`, `build`.                                                                                                                                                    |
| POST   | `/api/local-tool-call`                         | Bearer | Internal loopback endpoint for the bundled local MCP stdio server.                                                                                                                                                                               |

Send endpoints return `400` for empty text, `403` when provider authentication is required, `404` for an unknown conversation, and `409` when the busy policy rejects the request. A `202` response includes `{ accepted, messageId }` and may include `conversationId` and `resolvedPolicy`.

## Persistence

`dataDir` defaults to `<cwd>/data`. The default conversation stores messages, activity, model and effort state, uploads, init status, and provider session markers under `<dataDir>/<FIBE_AGENT_ID or CONVERSATION_ID or default>`.

Named conversations are indexed in `dataDir/conversations/index.json` and stored under `dataDir/conversations/<id>/`. Supported providers share the default workspace but keep session markers per conversation. `encryptionKey` enables AES-256-GCM for JSON written through `SequentialJsonWriter`.

Uploads are conversation-scoped. `POST /api/uploads` and `GET /api/uploads/:filename` accept `conversationId`; omitted values target the default conversation.

## Container logging

The API writes one JSON object per line to stdout or stderr for filtering by level, context, and request ID.

| Env or setting    | Description                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`       | `error`, `warn`, `info` (default), `log`, `debug`, `verbose` (case-insensitive). `info` and `log` are equivalent.                                                                               |
| `dataDir`         | Base directory for persistence. Configure via `fibe.yml` or `FIBE_SETTINGS_JSON`; it is promoted to `DATA_DIR` for child/runtime helpers.                                                       |
| `postInitScript`  | Optional shell script run once on first container load. Configure via Fibe settings.                                                                                                            |
| `hostRoot`     | Base Host directory for Fibe local playground discovery. Configure via Fibe settings.                                                                                                        |
| `PLAYGROUNDS_DIR` | Active workspace path for file explorer, editor, uploads into playground, and terminal cwd. The Fibe CLI manages local playground linking; fibe-agent does not validate symlink targets itself. |

### Provider and frontend environment

`AGENT_PROVIDER` accepts `mock`, `gemini`, `antigravity`, `claude-code`, `openai`, `openai-codex`, `cursor`, `opencode`, and `opencodex` (`opencodex` is an alias of `opencode`). `AGENT_AUTH_MODE` accepts `oauth` or `api-token`.

In `api-token` mode, provider strategies read their provider-specific API key env vars:

| Provider             | API-token env vars                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude               | `ANTHROPIC_API_KEY`                                                                                                                                 |
| OpenAI / Codex       | `OPENAI_API_KEY`                                                                                                                                    |
| Gemini / Antigravity | `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`                                                                                  |
| Cursor               | `CURSOR_API_KEY`                                                                                                                                    |
| OpenCode             | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` |

Chat detects standalone and embedded modes. Unless set, `VITE_THEME_SOURCE` and `VITE_LOCALE_SOURCE` use `localStorage` when standalone and `frame` in an iframe. Embedded mode hides theme and locale controls unless their hide settings are explicitly false.

**Log shape:** `{ "timestamp": "<ISO8601>", "level": "log", "context": "<optional>", "message": "<string>", ... }`

- Application logs use the class or module name as `context`.
- HTTP requests are logged once on response with `context: "http"`, `message: "request"`, plus `requestId`, `method`, `url`, `statusCode`, and `durationMs`.
- WebSocket connects, disconnects, and client actions are logged with `context: "ws"`.

## WebSocket `/ws`

**Path:** `/ws` on the same host/port as the API, with no `/api` prefix.

**Query params:**

| Param                    | Description                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `token`                  | Required only when `agentPassword` is configured.                                                         |
| `conversation_id` or `c` | Conversation id to bind the session to. Defaults to `default`; unknown non-default ids close with `4004`. |

**Behavior:**

- Multiple chat WebSocket sessions may be connected at once. The limit is `websocketMaxConnections` / `WEBSOCKET_MAX_CONNECTIONS`, default `5`.
- When the limit is reached, the oldest connected session is evicted with close code `4002` and reason `Session taken over by another client`.
- Unauthorized connections close with `4001`.
- On connect, the server sends `{ type: "conversation_id", conversationId }`.
- Session count changes are broadcast as `sessions_updated`.

**Close codes:** `4001` = unauthorized; `4002` = oldest session evicted at connection cap; `4004` = unknown conversation id. Shared constants also define `4000` for older single-session takeover semantics, but the current multi-session server does not emit it.

### Client -> Server

| action                      | payload                                                                        | Description                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `check_auth_status`         | -                                                                              | Request provider auth status.                                                                                                  |
| `initiate_auth`             | -                                                                              | Start provider auth flow.                                                                                                      |
| `submit_auth_code`          | `{ code }`                                                                     | Submit OAuth/code.                                                                                                             |
| `cancel_auth`               | -                                                                              | Cancel in-progress auth.                                                                                                       |
| `reauthenticate`            | -                                                                              | Clear credentials and re-authenticate.                                                                                         |
| `logout`                    | -                                                                              | Log out from provider.                                                                                                         |
| `send_chat_message`         | `{ text, images?, audio?, audioFilename?, attachmentFilenames?, busyPolicy? }` | Send a user turn. Text may contain `@path` references to playground files; attachment filenames come from `POST /api/uploads`. |
| `queue_message`             | `{ text }`                                                                     | Explicitly queue a message while busy.                                                                                         |
| `steer_message`             | `{ text }`                                                                     | Try to steer the active run when the provider supports it.                                                                     |
| `submit_story`              | `{ story }`                                                                    | Submit activity story after stream end.                                                                                        |
| `get_model` / `set_model`   | `{ model }` for set                                                            | Read or update current model.                                                                                                  |
| `get_effort` / `set_effort` | `{ effort }` for set                                                           | Read or update Claude effort (`low`, `medium`, `high`, `xhigh`, `max`).                                                        |
| `interrupt_agent`           | -                                                                              | Stop the current provider run.                                                                                                 |
| `set_agent_mode`            | `{ mode }`                                                                     | Set agent mode.                                                                                                                |
| `answer_user_question`      | `{ promptId, answer }` (legacy `questionId` alias)                                                       | Reply to `ask_user_prompt`.                                                                                                    |
| `confirm_action_response`   | `{ promptId, confirmed }` (legacy `questionId` alias)                                                    | Reply to `confirm_action_prompt`.                                                                                              |
| `reset_conversation`        | -                                                                              | Archive current messages and start fresh.                                                                                      |

### Server -> Client

Each message is JSON with a `type` field.

| type                                                                                                                            | Description                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `conversation_id`                                                                                                               | Session conversation id sent immediately after connect.                   |
| `sessions_updated`                                                                                                              | Current connected chat WebSocket count.                                   |
| `auth_status`, `auth_url_generated`, `auth_device_code`, `auth_manual_token`, `auth_success`, `logout_output`, `logout_success` | Provider auth lifecycle.                                                  |
| `error`, `control_result`                                                                                                       | Error/control responses.                                                  |
| `message`                                                                                                                       | Persisted message event.                                                  |
| `stream_start`, `stream_chunk`, `stream_end`                                                                                    | Assistant stream lifecycle; `stream_end` may include `usage` and `model`. |
| `reasoning_start`, `reasoning_chunk`, `reasoning_end`, `thinking_step`, `tool_call`, `file_created`                             | Activity/thinking/story events.                                           |
| `activity_snapshot`, `activity_appended`, `activity_updated`                                                                    | Activity store synchronization.                                           |
| `playground_changed`                                                                                                            | Playground watcher changed.                                               |
| `model_updated`, `effort_updated`, `agent_mode_updated`                                                                         | Shared runtime state changes.                                             |
| `ask_user_prompt`, `confirm_action_prompt`, `show_image`, `notify`, `set_title`                                                 | Local MCP tool events for the chat UI.                                    |
| `conversation_reset`, `conversation_deleted`                                                                                    | Conversation lifecycle broadcasts.                                        |

Provider auth status payloads use `status: "authenticated"` or `status: "unauthenticated"`.
Structured error payloads may include `code: "NEED_AUTH"`, `code: "AGENT_BUSY"`, or `code: "BLOCKED"` so clients can render auth, busy, and blocked states without parsing message text.

## WebSocket `/ws-terminal`

**Path:** `/ws-terminal` on the same host/port as the API, with no `/api` prefix.

**Auth:** same `?token=<password>` behavior as `/ws`.

Each connection spawns a dedicated `node-pty` shell session in `PLAYGROUNDS_DIR`. Multiple terminal sessions can run at once. Client messages are raw strings written to PTY stdin, except JSON resize messages:

```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

Server messages are raw terminal output, batched roughly every 16 ms. The PTY is killed when the WebSocket closes or the PTY process exits.

### Scheduled delivery identities

REST send-message endpoints accept an optional caller-generated UUID `requestId`.
Caller-ID requests also require `storeGeneration` from the explicit authenticated
`GET /api/agent/status?deliveryScope=true&conversationId=...` handshake. Its
`deliveryScope` returns `{ accepted: true, conversationId, storeGeneration }`.
Without an explicit target, the handshake selects the only active conversation,
or Inbox when none is active; multiple active conversations are refused. Pin that
resolved conversation and generation before the first POST. Ordinary status
requests retain their previous response and do not initialize delivery metadata.
The existing user-message ID equals that UUID. Identical normalized requests replay
the original admission identity and resolution/fallback, while executionState reports current progress; different text, requested conversation, image inputs,
attachments or busy policy with that UUID return `409 { "error": "REQUEST_ID_CONFLICT" }`. Ordinary
manual messages continue to allocate their own identities.

Acceptance means the user message and pending request are durably stored. It does
not mean the provider finished the turn. `executionState` is pending, running,
completed, failed or outcome_unknown. Pending queued requests are recovered in
message order through existing routing after restart, retaining their saved
conversation and any operator edits. A strict running checkpoint precedes provider
or native steering effects. Running requests found at startup become
outcome_unknown: retry returns `409 REQUEST_OUTCOME_UNKNOWN` with the original
messageId and never repeats that uncertain effect. Terminal receipts retain their
identity. Storage failure before admission prevents provider/queue effects.

These identities are retained with their conversation messages. A fixed-size
`message-store-generation.json` sidecar holds the opaque scope UUID; `messages.json`,
archives, exports and control-plane history retain their message-array format.
History/privacy reset and intentional caller-message deletion invalidate the old
scope. Removing ordinary messages does not rotate it. An old scoped retry returns
`409 STORE_GENERATION_CHANGED` with its original messageId and cannot recreate a
deleted identity. Generation and row presence are checked after asynchronous
preparation and again before provider/steering effects.

Back up history and its sidecar together from a quiesced runtime. Restoring only
history creates a fresh scope and leaves old pending receipts unknown; restoring
only the sidecar with missing history also creates a fresh scope. Corrupt history
or metadata fails closed until explicit repair/reset. A consistent complete
restore retains identity and pending recovery. Rewinding a snapshot taken before
an effect cannot prove what happened afterward: use a fresh generation rather than
reusing such an old scope. There is no independent permanent delivery archive.
Interrupted provider operations remain uncertain and require review.

Scheduled delivery requires an upgraded runtime supporting this handshake. Rails
defers legacy runtimes with an explicit error instead of sending an unsafe retry.


## Attachment sends, prompts and stream recovery

The exact mobile request/response/event contract is [contracts/mobile-client.md](../contracts/mobile-client.md).

REST sends permit omitted/blank `text` when `images` or `attachmentFilenames` name existing uploads in the target conversation, or `images` contains image data URLs. Entirely empty messages remain 400; unknown upload identities on attachment-only sends return 400 `Uploaded file not found`. Existing text-bearing sends keep their upload validation/acceptance behavior. Image-only REST sends also accept image data URLs. Upload success does not imply that the provider can interpret that format. Limits remain 20 MiB per file; web composer limits remain five images plus five documents.

Successful sends include `resolution: "started" | "steered" | "queued"`. A steer fallback includes `fallbackReason`: `steer_unsupported_content` for attachment content unsupported by the strategy, `steer_unsupported` for a strategy without steering, or `steer_queued` for provider queue/restart behavior. Only immediate handled steering reports `steered`. Codex supports full file-path/OCR context in steering; other strategies queue attachment-bearing messages intact. `resolvedPolicy` remains the legacy provider/control policy field. Stop response and queue cancellation endpoints are unchanged.

Successful identified-send admission outcomes persist with the user message. Pending turns still recover through the existing delivery protocol; running turns found after restart still return `REQUEST_OUTCOME_UNKNOWN`. Only permanent validation rejections (invalid body/unknown uploaded file) are retained in process memory for the latest 1000 request IDs. Transient busy/auth/conversation availability rejections are re-evaluated on retry. Reusing a retained ID with a different normalized body returns `409 { "error": "REQUEST_ID_CONFLICT" }`. Reset/deletion invalidates the old store generation. Keep the original request UUID, delivery scope and payload after any uncertain send outcome.

Uploads preserve original filename, media type and byte size in `<storedFilename>.attachment.json` beside the stored file. History and `message` events retain existing filename arrays and include `attachments: [{ storedFilename, originalFilename, mediaType?, size?, kind: "image" | "document" }]`. Old records are returned without synthesized metadata; clients use the stored filename when original-name metadata is absent. Downloads retain their existing opaque URL identity and Content-Disposition header; clients choose display/export names from metadata. Web chat uses original names on document chips/downloads and image labels.

`GET /api/conversations/:id/live` includes `pendingPrompts`, each with a stable `promptId` (equal to legacy `questionId`), `kind: "question" | "confirmation"`, and the existing prompt payload. Prompt events carry both identities. Conversation-less prompts remain visible/answerable in every conversation; scope checks apply only to prompts with an explicit conversationId. Prompts remain available through socket reconnect until answered, timeout or runtime shutdown. They do not survive process restart.

`POST /api/conversations/:id/prompts/:promptId/answer` accepts `{ answer: string }` or `{ confirmed: boolean }`, returning `200 { accepted: true }`. Stale, unknown, wrong-conversation and wrong-kind answers return `409 { "error": "stale_prompt" }`. WebSocket `answer_user_question` and `confirm_action_response` carry `promptId` (legacy `questionId` accepted), and stale replies emit `{ type: "error", error: "stale_prompt", statusCode: 409 }`. Web chat fetches live prompts on reconnect and refreshes them after stale replies.

Gemma-routed CLI streams use the same conversation broadcasts and sequencing as provider streams. `stream_start`, `stream_chunk`, `stream_end`, and `queue_updated` carry `streamId` and a monotonically increasing per-conversation `revision`. The live snapshot carries the same epoch identity and latest revision. `queue_updated` contains the full `queue` and `queuedTurns` count after each insertion, removal, edit, reorder or drain. Queue entries include `imageUrls` and `attachmentFilenames` when present. Revisions and stream identity last for the runtime's conversation sequencing epoch and reset with a new identity on runtime restart or conversation deletion/recreation. Subscribe and buffer events before fetching history/live; apply only same-epoch events with revision greater than the snapshot. Refresh on a changed epoch. At stream completion refresh history and deduplicate persisted message IDs. There is no event replay endpoint.


## Native model and effort controls

Public `GET /api/runtime-config` adds `lockChatModel: boolean`, computed with the existing `truthy(process.env.LOCK_CHAT_MODEL)` helper (`1`, `true`, `yes`, ignoring surrounding whitespace/case; absent/other values are false). Native clients disable model selection when true and accept an absent field from older runtimes. Existing response fields remain unchanged.

Model options remain the existing authenticated `GET /api/model-options` string list. Current model and selection use unchanged WebSocket `get_model`, `set_model` `{ model }`, and `model_updated`. Effort choices are the fixed shared `EFFORT_OPTIONS`: `low`, `medium`, `high`, `xhigh`, `max`; use the existing `get_effort`, `set_effort` `{ effort }`, and `effort_updated`, as web chat does. No new effort/model option schema is introduced. The existing request-conflict error remains `REQUEST_ID_CONFLICT` (Contract mapping for logical `request_conflict`). Live processing/finalization fields also retain existing semantics; only sequencing fields are additive.
