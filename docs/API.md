# API

Nest Fastify API (project `api`).

**Base URL:** `http://localhost:3000/api` when served with `nx serve api`.

Path constants are defined in `shared/api-paths.ts` (`API_PATHS.*`, `API_PATH_UPLOADS_BY_FILENAME`) and used by the chat app and tests so routes stay in sync.

## REST Endpoints

| Method | Path            | Auth  | Description                                                                 |
|--------|-----------------|-------|-----------------------------------------------------------------------------|
| GET    | /api            | No    | Returns `{ message: 'Hello API' }`                                          |
| GET    | /api/health     | No    | Health check. Returns `{ status: 'ok' }`. Use for readiness/liveness probes. |
| POST   | /api/auth/login | No    | Body `{ password? }`. Returns `{ success, message?, token? }` or 401       |
| GET    | /api/messages   | Bearer| Returns array of messages `{ id, role, body, created_at, imageUrls?, story? }[]` (story = activity timeline for assistant messages)     |
| GET    | /api/activities | Bearer| Returns array of stored activities `{ id, created_at, story }[]` (whole story per activity, same shape as in `activity.json`).            |
| GET    | /api/activities/by-entry/:entryId | Bearer| Returns the activity that contains the given story entry id (e.g. `act-1773772973309-a3rp0me`). Same response as `GET /api/activities/:activityId`. 404 if not found. |
| GET    | /api/activities/:activityId | Bearer| Returns a single activity `{ id, created_at, story }`. 404 if not found.   |
| GET    | /api/activities/:activityId/:storyId | Bearer| Returns the activity; 404 if activity not found or story entry is not in that activity. Use for deep links to a specific story within an activity. |
| GET    | /api/uploads/:filename | Bearer | Serves an uploaded file (images, voice, or document attachments).        |
| POST   | /api/uploads           | Bearer | Upload a file (multipart form field `file`). Returns `{ filename }`. Allowed: images, audio, PDF, Excel, Word, text, CSV, JSON, etc. Blocked: executables and scripts. Max 20MB. |
| GET    | /api/model-options | Bearer | Returns string array of model names from `MODEL_OPTIONS` env                |
| GET    | /api/playgrounds   | Bearer | Returns file tree of `./playground` (or `PLAYGROUNDS_DIR`) as JSON array   |
| GET    | /api/playgrounds/file | Bearer | Query `path` = relative path. Returns `{ content: string }`; 404 if not found or not a file. |

When `AGENT_PASSWORD` is set, `GET /api/messages`, `GET /api/activities`, `GET /api/model-options`, `GET /api/playgrounds`, and `GET /api/playgrounds/file` require `Authorization: Bearer <password>` or `?token=<password>`.

## Container logging

All API logs are written as **one JSON object per line** to stdout/stderr so container and log aggregators can parse and filter by level, context, or request ID.

| Env var     | Values (case-insensitive) | Description |
|-------------|----------------------------|-------------|
| `LOG_LEVEL` | `error`, `warn`, `info` (default), `log`, `debug`, `verbose` | Minimum level emitted. `info` and `log` are equivalent. |

**Log shape:** `{ "timestamp": "<ISO8601>", "level": "log", "context": "<optional>", "message": "<string>", ... }`

- **Application logs:** `context` is the class or module name (e.g. `OrchestratorService`, `Credentials`, `Bootstrap`).
- **HTTP requests:** Each request is logged once on response with `context: "http"`, `message: "request"`, plus `requestId`, `method`, `url`, `statusCode`, `durationMs`. Request ID is taken from `x-request-id` or generated.
- **WebSocket:** Connection and disconnect with `context: "ws"`, `message: "connect"` or `"disconnect"`; each client action is logged with `message: "action"` and `action: "<action name>"` (e.g. `send_chat_message`).

## WebSocket

**Path:** `/ws` (same host/port as the API, no `/api` prefix).

**Query:** `?token=<password>` when `AGENT_PASSWORD` is set.

**Behaviour:**

- Only one client can be the active session at a time. When a second client connects, the **first** client is closed with code `4002` and reason "Session taken over by another client"; the second client becomes active. The displaced client can show "Your session was taken over by another client" and offer Reconnect (user clicks when they want to try again).
- Unauthorized connections (wrong or missing token when password is required) are closed with code `4001`.

**Close codes:** `4001` = Unauthorized; `4002` = Session taken over by another client (displaced client only).

### Client → Server (JSON)

| action             | payload      | Description                    |
|--------------------|-------------|--------------------------------|
| check_auth_status  | —           | Request current auth status    |
| initiate_auth      | —           | Start provider auth flow       |
| submit_auth_code   | `{ code }`  | Submit OAuth/code              |
| cancel_auth        | —           | Cancel ongoing auth           |
| reauthenticate     | —           | Clear credentials and re-auth |
| logout             | —           | Log out from provider         |
| send_chat_message  | `{ text, images?, audio?, audioFilename?, attachmentFilenames? }`  | Send user message; optional `images` (base64), optional `audio` (base64), `audioFilename` or `attachmentFilenames` (from POST /api/uploads); stream response. Message text may contain `@path` references to playground files (e.g. `@src/index.ts`); the API injects those files’ contents and attached file paths into the prompt. |
| submit_story       | `{ story }` | Submit activity story (array of `{ id, type, message, timestamp, details?, command?, path? }`) for the last assistant message; call after stream ends. Entries with `command` (e.g. tool_call) or `path` (e.g. file_created) are shown as terminal/file blocks in the UI. |
| get_model          | —           | Request current model          |
| set_model          | `{ model }` | Set model name                 |
| interrupt_agent    | —           | Stop the current agent run; server sends `stream_end` with accumulated text so far. |

### Server → Client (JSON)

Each message is an object with a `type` and optional extra fields.

| type                | Extra fields        | Description                          |
|---------------------|---------------------|--------------------------------------|
| auth_status         | status, isProcessing| authenticated \| unauthenticated    |
| auth_url_generated  | url                 | OAuth URL to open                    |
| auth_device_code    | code                | Device code to display               |
| auth_manual_token   | —                   | Prompt for manual token (e.g. Claude)|
| auth_success        | —                   | Auth completed                       |
| logout_output       | text                | Logout CLI output                    |
| logout_success      | —                   | Logout completed                     |
| error               | message             | Error message                        |
| message             | id?, role, body, created_at, imageUrls?, story? | Persisted message (imageUrls = upload filenames; story = activity timeline for assistant messages) |
| stream_start        | model?              | Start of assistant stream; optional current model name for thinking UI |
| stream_chunk        | text                | Chunk of assistant response          |
| stream_end          | —                   | End of stream                        |
| model_updated       | model               | Current model name                   |
| reasoning_start     | —                   | Start of reasoning/thinking stream (optional) |
| reasoning_chunk     | text                | Chunk of reasoning text              |
| reasoning_end       | —                   | End of reasoning stream              |
| thinking_step       | id, title, status, details?, timestamp | Discrete thinking step (status: pending \| processing \| complete) |
| tool_call           | name, path?, summary?, command? | Tool invocation; `command` is the run command text for terminal-style display. |
| file_created        | name, path?, summary? | File created by agent                |

The client can build a chronological **story** (activity timeline) from `stream_start`, `reasoning_start` / `reasoning_chunk` / `reasoning_end`, `thinking_step`, `tool_call`, and `file_created` events, which arrive in order during a response.

## Embedding the chat app (iframe)

When the chat app is loaded inside an iframe (e.g. Phoenix frame), the following apply.

### Environment variables (chat app, `VITE_*`)

| Variable | Values | Description |
|----------|--------|-------------|
| `VITE_THEME_SOURCE` | `localStorage` (default), `frame` | `localStorage`: theme from local storage + in-app toggle. `frame`: theme is driven by parent via postMessage (see below). |
| `VITE_HIDE_THEME_SWITCH` | `1`, `true`, `yes` | Hide the theme toggle in the UI so the parent/iframe can control theme via postMessage. |

### postMessage: parent → chat iframe

- **Auto-auth:** `{ action: 'auto_auth', password: '<internal_password>' }` — chat calls `POST /api/auth/login` and stores the token.
- **Set theme:** `{ action: 'set_theme', theme: 'light' | 'dark' }` — applied when `VITE_THEME_SOURCE=frame`. Theme is also persisted to `localStorage` so it survives refresh.

## Agent providers and auth modes

The backend talks to external model providers via CLI-based strategies. Two env vars control which agent is active and how it authenticates:

- `AGENT_PROVIDER`: `mock` | `gemini` | `claude-code` | `openai` | `openai-codex` | `opencode` (default `claude-code`)
- `AGENT_AUTH_MODE`: `oauth` (default) | `api-token`

When `AGENT_AUTH_MODE=api-token`, the strategies skip interactive OAuth/device flows and rely on provider API tokens from env vars:

- Claude Code: `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`)
- Gemini: `GEMINI_API_KEY`
- OpenAI Codex: `OPENAI_API_KEY`
- OpenCode: any of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` (existing behavior)

In `api-token` mode:

- `check_auth_status` uses the presence of these env vars as the source of truth.
- `initiate_auth` immediately succeeds when the relevant env var is set; otherwise it reports `unauthenticated` without opening a browser.
