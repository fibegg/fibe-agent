# API

Nest Fastify API (project `api`).

**Base URL:** `http://localhost:3000/api` when served with `nx serve api`.

## REST Endpoints

| Method | Path            | Auth  | Description                                                                 |
|--------|-----------------|-------|-----------------------------------------------------------------------------|
| GET    | /api            | No    | Returns `{ message: 'Hello API' }`                                          |
| POST   | /api/login      | No    | Body `{ password? }`. Returns `{ success, message?, token? }` or 401       |
| GET    | /api/messages   | Bearer| Returns array of messages `{ id, role, body, created_at, imageUrls? }[]`     |
| GET    | /api/uploads/:filename | Bearer | Serves an uploaded image file (from chat attachments)        |
| GET    | /api/model-options | Bearer | Returns string array of model names from `MODEL_OPTIONS` env                |
| GET    | /api/playgrounds   | Bearer | Returns file tree of `./playground` (or `PLAYGROUNDS_DIR`) as JSON array   |

When `AGENT_PASSWORD` is set, `GET /api/messages`, `GET /api/model-options`, and `GET /api/playgrounds` require `Authorization: Bearer <password>` or `?token=<password>`.

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
| send_chat_message  | `{ text, images? }`  | Send user message (optional base64 data URL array `images`) and stream  |
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
| message             | id?, role, body, created_at, imageUrls? | Persisted message (imageUrls = upload filenames) |
| stream_start        | —                   | Start of assistant stream            |
| stream_chunk        | text                | Chunk of assistant response          |
| stream_end          | —                   | End of stream                        |
| model_updated       | model               | Current model name                   |
