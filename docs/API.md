# API

Nest Fastify API (project `api`).

**Base URL:** `http://localhost:3000/api` when served with `nx serve api`.

## REST Endpoints

| Method | Path            | Auth  | Description                                                                 |
|--------|-----------------|-------|-----------------------------------------------------------------------------|
| GET    | /api            | No    | Returns `{ message: 'Hello API' }`                                          |
| GET    | /api/health     | No    | Health check. Returns `{ status: 'ok' }`. Use for readiness/liveness probes. |
| POST   | /api/auth/login | No    | Body `{ password? }`. Returns `{ success, message?, token? }` or 401       |
| GET    | /api/messages   | Bearer| Returns array of messages `{ id, role, body, created_at, imageUrls?, story? }[]` (story = activity timeline for assistant messages)     |
| GET    | /api/activity   | Bearer| Returns array of stored activities `{ id, created_at, story }[]` (whole story per response, same shape as in `activity.json`)            |
| GET    | /api/uploads/:filename | Bearer | Serves an uploaded file (images or voice recordings from chat attachments)        |
| POST   | /api/uploads           | Bearer | Upload a voice file (multipart form field `file`). Returns `{ filename }`. Max 20MB. |
| GET    | /api/model-options | Bearer | Returns string array of model names from `MODEL_OPTIONS` env                |
| GET    | /api/playgrounds   | Bearer | Returns file tree of `./playground` (or `PLAYGROUNDS_DIR`) as JSON array   |
| GET    | /api/playgrounds/file | Bearer | Query `path` = relative path. Returns `{ content: string }`; 404 if not found or not a file. |

When `AGENT_PASSWORD` is set, `GET /api/messages`, `GET /api/activity`, `GET /api/model-options`, `GET /api/playgrounds`, and `GET /api/playgrounds/file` require `Authorization: Bearer <password>` or `?token=<password>`.

## WebSocket

**Path:** `/ws` (same host/port as the API, no `/api` prefix).

**Query:** `?token=<password>` when `AGENT_PASSWORD` is set.

**Behaviour:**

- Only one client can be connected at a time. A second connection is closed with code `4000` and reason "Another session is already active".
- Unauthorized connections (wrong or missing token when password is required) are closed with code `4001`.

### Client → Server (JSON)

| action             | payload      | Description                    |
|--------------------|-------------|--------------------------------|
| check_auth_status  | —           | Request current auth status    |
| initiate_auth      | —           | Start provider auth flow       |
| submit_auth_code   | `{ code }`  | Submit OAuth/code              |
| cancel_auth        | —           | Cancel ongoing auth           |
| reauthenticate     | —           | Clear credentials and re-auth |
| logout             | —           | Log out from provider         |
| send_chat_message  | `{ text, images?, audio?, audioFilename? }`  | Send user message; optional `images` (base64), optional `audio` (base64), or `audioFilename` (from POST /api/uploads); stream response. Message text may contain `@path` references to playground files (e.g. `@src/index.ts`); the API injects those files’ contents into the prompt. |
| submit_story       | `{ story }` | Submit activity story (array of `{ id, type, message, timestamp, details?, command?, path? }`) for the last assistant message; call after stream ends. Entries with `command` (e.g. tool_call) or `path` (e.g. file_created) are shown as terminal/file blocks in the UI. |
| get_model          | —           | Request current model          |
| set_model          | `{ model }` | Set model name                 |

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
| `VITE_HIDE_HEADER_LOGO` | `1`, `true`, `yes` | Hide the Phoenix logo in header, sidebar, and login. |
| `VITE_THEME_SOURCE` | `localStorage` (default), `frame` | `localStorage`: theme from local storage + in-app toggle. `frame`: theme is driven by parent via postMessage (see below). |
| `VITE_HIDE_THEME_SWITCH` | `1`, `true`, `yes` | Hide the theme toggle in the UI so the parent/iframe can control theme via postMessage. |

### postMessage: parent → chat iframe

- **Auto-auth:** `{ action: 'auto_auth', password: '<internal_password>' }` — chat calls `POST /api/auth/login` and stores the token.
- **Set theme:** `{ action: 'set_theme', theme: 'light' | 'dark' }` — applied when `VITE_THEME_SOURCE=frame`. Theme is also persisted to `localStorage` so it survives refresh.
