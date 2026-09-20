# API

NestJS + Fastify API for `apps/api`.

**Base URL:** `http://localhost:3000/api` when served with `nx serve api`.

Chat and tests share route constants from `shared/api-paths.ts` (`API_PATHS.*`, `API_PATH_UPLOADS_BY_FILENAME`).

## Configuration and authentication

Set `agentPassword` in `fibe.yml` or `FIBE_SETTINGS_JSON` to protect the API. `AGENT_PASSWORD` alone does not enable HTTP or WebSocket guards; it is an output passed to child processes after settings load.

With `agentPassword` set, `Bearer` routes require `Authorization: Bearer <password>` or `?token=<password>`, and WebSockets use the query token. `No` routes remain public. Without a password, guarded routes are open and login reports `No authentication required`.

Several values that look like env vars are Fibe settings first:

| Fibe setting              | Env promotion               | Description                                                                                                                                                                                                                               |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentPassword`           | `AGENT_PASSWORD`            | Enables API and WebSocket bearer-token auth. Configure this in `fibe.yml` or `FIBE_SETTINGS_JSON`.                                                                                                                                        |
| `modelOptions`            | `MODEL_OPTIONS`             | Comma-separated string or YAML/JSON list returned by `GET /api/model-options`.                                                                                                                                                            |
| `defaultModel`            | `DEFAULT_MODEL`             | Initial model; falls back to the first `modelOptions` entry.                                                                                                                                                                              |
| `dataDir`                 | `DATA_DIR`                  | Base persistence dir, default `<cwd>/data`.                                                                                                                                                                                               |
| `systemPrompt`            | `SYSTEM_PROMPT`             | Inline prompt content from `fibe.yml` or `FIBE_SETTINGS_JSON`; settings promotion exposes it to child processes. A bare process env value is not a direct API input. If absent, the API loads the bundled `dist/assets/SYSTEM_PROMPT.md`. |
| `marqueeRoot`             | `MARQUEE_ROOT`              | Host Marquee root, default `/opt/fibe`; the local playground CLI receives `<marqueeRoot>/playgrounds` as `MARQUEE_ROOT`.                                                                                                                  |
| `postInitScript`          | `POST_INIT_SCRIPT`          | Shell command run once after startup; state is exposed at `GET /api/init-status`.                                                                                                                                                         |
| `websocketMaxConnections` | `WEBSOCKET_MAX_CONNECTIONS` | Maximum connected chat WebSockets before oldest-client eviction; default `5`.                                                                                                                                                             |

Direct process inputs include `PORT`, `PLAYGROUNDS_DIR`, `LOG_LEVEL`, `AGENT_PROVIDER`, `AGENT_AUTH_MODE`, provider keys, `FIBE_API_KEY`, `FIBE_DOMAIN`, `FIBE_AGENT_ID`, `CONVERSATION_ID`, CORS and frame settings, and provider runtime values such as `SESSION_DIR`.

## REST endpoints

All paths below include the `/api` global prefix.

| Method | Path                                           | Auth   | Description                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/health`                                  | No     | Health check. Returns `{ status: 'ok' }`.                                                                                                                                                                                                        |
| POST   | `/api/auth/login`                              | No     | Body `{ password? }`. Returns `{ success, message?, token? }` or `401`.                                                                                                                                                                          |
| GET    | `/api/runtime-config`                          | No     | Runtime chat config exposed to the frontend: avatar settings, provider label, and Simplicate flag.                                                                                                                                               |
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
| GET    | `/api/playgrounds/diff?repo=...&file=...`      | Bearer | Git diff for an explicitly selected linked repo. `repo` may be service, prop, id, link path, or repo root; required when multiple repos are linked.                                                                                              |
| GET    | `/api/playgrounds/file?path=...`               | Bearer | Read a playground file. Empty path returns `{ content: '' }`.                                                                                                                                                                                    |
| GET    | `/api/playgrounds/file/raw?path=...`           | Bearer | Stream a playground file with inferred content type.                                                                                                                                                                                             |
| PUT    | `/api/playgrounds/file`                        | Bearer | Body `{ path, content }`. Creates or overwrites a file in the playground.                                                                                                                                                                        |
| POST   | `/api/playgrounds/upload?dir=...`              | Bearer | Multipart playground upload. Returns `{ ok: true, path }`.                                                                                                                                                                                       |
| POST   | `/api/playgrounds/git-stage`                   | Bearer | Body `{ files, confirm, repo? }`. Stage git files in the selected repo; `repo` is required when multiple repos are linked.                                                                                                                       |
| POST   | `/api/playgrounds/git-commit`                  | Bearer | Body `{ message, confirm, repo? }`. Commit staged playground changes in the selected repo.                                                                                                                                                       |
| POST   | `/api/playgrounds/git-branch`                  | Bearer | Body `{ create, repo? }`. Create or inspect branch state in the selected repo.                                                                                                                                                                   |
| POST   | `/api/playgrounds/git-push`                    | Bearer | Body `{ remote?, branch?, confirm, repo? }`. Push playground git changes from the selected repo.                                                                                                                                                 |
| POST   | `/api/playgrounds/git-pr`                      | Bearer | Body `{ title?, body?, confirm, repo? }`. Create a draft PR with `gh` from the selected repo.                                                                                                                                                    |
| GET    | `/api/playrooms/browse?path=...`               | Bearer | Flat Fibe CLI listing from `fibe --output json local playgrounds info --view names`; only selector-visible playgrounds with source mounts are returned. Any non-empty `path` currently returns `[]`; `404` means the CLI/listing is unavailable. |
| POST   | `/api/playrooms/link`                          | Bearer | Body `{ path }`, where `path` is the Fibe local playground name. Delegates to `fibe local playgrounds link <name> --link-dir <PLAYGROUNDS_DIR>`. Missing/invalid `path` returns `404`; CLI/link failure returns `400`.                           |
| POST   | `/api/playrooms/unlink`                        | Bearer | Body `{ confirm: true }`. Clears the current `PLAYGROUNDS_DIR` link directory while preserving the directory itself, so a playground can be linked again from the UI.                                                                            |
| GET    | `/api/playrooms/current`                       | Bearer | Returns `{ current }` from `PLAYGROUNDS_DIR/.current_playground.json`, or `null`.                                                                                                                                                                |
| GET    | `/api/agent-files`                             | Bearer | Agent-generated file tree, optionally scoped by `?conversationId=`.                                                                                                                                                                              |
| GET    | `/api/agent-files/stats`                       | Bearer | Agent-generated file stats.                                                                                                                                                                                                                      |
| GET    | `/api/agent-files/file?path=...`               | Bearer | Read an agent-generated file.                                                                                                                                                                                                                    |
| GET    | `/api/agent-files/file/raw?path=...`           | Bearer | Stream an agent-generated file.                                                                                                                                                                                                                  |
| PUT    | `/api/agent-files/file`                        | Bearer | Body `{ path, content }`. Save an agent-generated file.                                                                                                                                                                                          |
| POST   | `/api/agent-files/upload?dir=...`              | Bearer | Multipart upload into agent-generated files.                                                                                                                                                                                                     |
| POST   | `/api/uploads?conversationId=...`              | Bearer | Multipart attachment upload. Returns `{ filename }`. Blocked: executables/scripts. Max size: 20 MB.                                                                                                                                              |
| GET    | `/api/uploads/:filename?conversationId=...`    | Bearer | Serve an uploaded attachment. Filename must be a safe basename.                                                                                                                                                                                  |
| GET    | `/api/agent/status`                            | Bearer | Default/session status: auth, processing, queue count, and last error.                                                                                                                                                                           |
| POST   | `/api/agent/send-message`                      | Bearer | Async integration/webhook send. Body `{ text, images?, attachmentFilenames?, conversationId?, busyPolicy? }`. Returns `202 { accepted, messageId, resolvedPolicy? }`.                                                                            |
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
| GET    | `/api/conversations/:id/live`                  | Bearer | Non-durable live stream/queue state for one conversation.                                                                                                                                                                                        |
| GET    | `/api/conversations/:id/provider-traffic`      | Bearer | Raw provider traffic for one conversation.                                                                                                                                                                                                       |
| POST   | `/api/conversations/:id/agent/send-message`    | Bearer | Send to a specific conversation. Unknown id returns `404`.                                                                                                                                                                                       |
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
| `marqueeRoot`     | Base Marquee directory for Fibe local playground discovery. Configure via Fibe settings.                                                                                                        |
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
| `answer_user_question`      | `{ questionId, answer }`                                                       | Reply to `ask_user_prompt`.                                                                                                    |
| `confirm_action_response`   | `{ questionId, confirmed }`                                                    | Reply to `confirm_action_prompt`.                                                                                              |
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
