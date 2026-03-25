<p align="center">
  <img src="https://docs.fibe.gg/img/logo.png" alt="Fibe" width="180" />
</p>

<h1 align="center">Fibe Agent</h1>

<p align="center">
  <strong>A full-stack AI coding agent — streaming chat, inline code editor, interactive terminal, and multi-provider orchestration in a production Nx monorepo.</strong>
</p>

<p align="center">
  <a href="https://github.com/fibegg/fibe-agent/actions/workflows/ci.yml"><img src="https://github.com/fibegg/fibe-agent/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/version-1.10.2-blue.svg" alt="Version 1.10.2" />
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen.svg" alt="Coverage 100%" />
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-1.3.11-000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://nx.dev"><img src="https://img.shields.io/badge/Nx-22-143055?logo=nx&logoColor=white" alt="Nx" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" />
</p>

---

**Fibe Agent** pairs a **NestJS + Fastify** API with a **React + Vite** chat client. The API orchestrates coding agents (Gemini, Claude Code, OpenAI Codex, OpenCode, or a mock provider) over a streaming WebSocket. The UI delivers a rich coding environment: streaming markdown chat, a **CodeMirror 6 inline editor**, an **xterm.js interactive terminal**, an activity/thinking sidebar, a file explorer with unsaved-change tracking, voice input, drag-&-drop file attachments, `@`-mention file references, and OAuth flows — all with light/dark theming and iframe-embedding support.

## Features at a glance

| Area | Details |
|------|---------|
| **Multi-provider agents** | `gemini`, `claude-code`, `openai-codex`, `opencode`, `mock` — select via `AGENT_PROVIDER`. OAuth and API-token auth modes. |
| **Streaming chat** | WebSocket at `/ws` with per-chunk streaming, reasoning/thinking steps, tool-call and file-created events, token usage, and agent interrupt. |
| **Inline code editor** | CodeMirror 6 with syntax highlighting for 15+ languages (JS/TS, Python, Go, Rust, Java, C++, CSS, HTML, Markdown, SQL, YAML, …), unsaved-change indicators, keyboard shortcuts, and REST-backed file persistence. |
| **Interactive terminal** | xterm.js terminal backed by `node-pty`, connected via WebSocket at `/ws-terminal`, spawning shell sessions in the playground directory. |
| **Activity sidebar** | Chronological timeline of agent thinking steps, tool calls, file operations, and reasoning with color-coded status (idle → thinking → complete). |
| **File explorer** | Real-time file tree of the playground via `PlaygroundWatcherService`; open, edit, view, and save files without leaving the chat. |
| **Voice input** | Browser `MediaRecorder` voice recorder that uploads audio and sends it as a message attachment. |
| **File attachments** | Drag-&-drop or click-to-upload images, audio, PDF, Excel, Word, CSV, JSON, text — up to 20 MB per file. |
| **`@`-mention files** | Type `@` in the chat input to reference playground files; the API injects their contents into the agent prompt. |
| **Conversation persistence** | Messages, activities, model choice, uploads, and provider session state scoped by conversation id (`FIBE_AGENT_ID` / `CONVERSATION_ID`). |
| **Fibe integration** | `FibeSyncService`, `postMessage` auto-auth, and iframe embed support with parent-controlled theming. |
| **Security** | Helmet (CSP, frame-ancestors), rate limiting (100 req/min), JWT-style bearer token auth, multipart validation. |
| **Structured logging** | One JSON object per line to stdout; request IDs, HTTP and WebSocket context, configurable via `LOG_LEVEL`. |
| **100% unit coverage** | Every module has co-located spec files; Playwright e2e for API and Chat. |
| **Docker** | Multi-arch (`linux/amd64`, `linux/arm64`) images published to GHCR per provider on every push to `main` / `dev`. |

## Architecture

```mermaid
flowchart LR
  subgraph UI ["Chat UI — React + Vite :3100"]
    Chat["Streaming Chat"]
    Editor["CodeMirror 6\nEditor"]
    Terminal["xterm.js\nTerminal"]
    Sidebar["Activity\nSidebar"]
    Explorer["File\nExplorer"]
  end

  subgraph API ["NestJS + Fastify API :3000"]
    WS["/ws\n(chat)"]
    WSTerm["/ws-terminal\n(shell)"]
    REST["/api/*"]
    Orch["Orchestrator"]
    Strategies["Strategy\nRegistry"]
  end

  subgraph Providers ["Agent Providers"]
    Gemini["Gemini CLI"]
    Claude["Claude Code"]
    Codex["OpenAI Codex"]
    OpenCode["OpenCode"]
  end

  Chat --> WS
  Terminal --> WSTerm
  Editor --> REST
  Explorer --> REST
  Sidebar --> REST
  WS --> Orch
  WSTerm --> Orch
  REST --> Orch
  Orch --> Strategies
  Strategies --> Gemini
  Strategies --> Claude
  Strategies --> Codex
  Strategies --> OpenCode
```

## Quick start

**Prerequisite:** [Bun](https://bun.sh) (version pinned in `packageManager` in `package.json`).

```sh
bun install
bun run dev
```

| URL | Description |
|-----|-------------|
| [http://localhost:3000](http://localhost:3000) | API — health at `/api/health` |
| [http://localhost:3100](http://localhost:3100) | Chat UI — Vite proxies `/api` and `/ws` to the API |

**No provider CLI?** Use the mock agent:

```sh
AGENT_PROVIDER=mock bunx nx serve api
```

**API on a different host?**

```sh
API_URL=http://localhost:3000 bunx nx serve chat
```

**Password-protected?** Set `AGENT_PASSWORD` and sign in from the chat UI before sending messages.

### Run services separately

| App | Command | Port |
|-----|---------|------|
| API | `bunx nx serve api` | 3000 |
| Chat | `bunx nx serve chat` | 3100 |

## Project layout

```
fibe-agent/
├── apps/
│   ├── api/          # NestJS + Fastify — WebSocket /ws & /ws-terminal, REST /api/*
│   ├── chat/         # React + Vite — chat, editor, terminal, sidebar, explorer
│   ├── e2e-api/      # Playwright e2e for the API
│   └── e2e-chat/     # Playwright e2e for the Chat UI
├── shared/           # Shared TS types, WS constants, API path helpers
├── docs/
│   └── API.md        # REST, WebSocket, and logging contract
├── playground/       # Agent working directory (file explorer root)
└── data/             # Persisted messages, activities, uploads (per conversation)
```

### API modules

| Module | Responsibility |
|--------|---------------|
| `orchestrator` | Drives agent runs, streams chunks, manages session state |
| `strategies` | Provider adapters: `gemini`, `claude-code`, `openai-codex`, `opencode`, `mock` |
| `agent` | `POST /api/agent/send-message` — async webhook endpoint |
| `agent-files` | File watcher + REST for agent-generated files |
| `auth` | Bearer token guard, login endpoint |
| `messages` | Message store + REST |
| `activity` / `activity-store` | Activity timeline store + REST |
| `model-options` / `model-store` | Model selection state + REST |
| `playgrounds` | File tree watcher + REST (`/api/playgrounds`) |
| `uploads` | Multipart upload + file serving |
| `terminal` | `node-pty` shell sessions over `/ws-terminal` |
| `steering` | Runtime steering/override hints for the orchestrator |
| `fibe-sync` | Syncs conversation state back to the Fibe platform |
| `github-token-refresh` | Refreshes GitHub OAuth tokens for Codex |
| `init-status` | Tracks `POST_INIT_SCRIPT` execution state |
| `persistence` | Base persistence helpers |
| `config` | Central env-config service |

## Environment

Copy `.env.example` to `.env` and fill in the relevant keys.

### API

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API listen port |
| `AGENT_PROVIDER` | `gemini` | Active agent: `gemini` \| `claude-code` \| `openai-codex` \| `opencode` \| `mock` |
| `AGENT_AUTH_MODE` | `oauth` | `oauth` — interactive browser/device flow; `api-token` — env-var key only |
| `AGENT_PASSWORD` | — | When set, all `/api` and `/ws` endpoints require `Authorization: Bearer <password>` |
| `MODEL_OPTIONS` | — | Comma-separated model names shown in the model selector (e.g. `flash-lite,flash,pro`) |
| `DEFAULT_MODEL` | first in `MODEL_OPTIONS` | Pre-selected model |
| `DATA_DIR` | `./data` | Base data directory |
| `FIBE_AGENT_ID` | — | Conversation id (set by Fibe); data stored at `DATA_DIR/<id>/` |
| `CONVERSATION_ID` | — | Fallback conversation id for non-Fibe multi-conversation setups |
| `SYSTEM_PROMPT_PATH` | built-in | Path to custom system prompt file |
| `SYSTEM_PROMPT` | — | Inline system prompt (overrides file) |
| `PLAYGROUNDS_DIR` | `./playground` | Root for the file explorer and shell sessions |
| `POST_INIT_SCRIPT` | — | Shell script run once on first boot; state exposed at `/api/init-status` |
| `SESSION_DIR` | — | Provider config/session dir (e.g. `~/.gemini`, `~/.codex`) for credential injection |
| `AGENT_CREDENTIALS_JSON` | — | JSON object of credential files injected at startup (set by Fibe) |
| `FIBE_API_KEY` | — | Fibe platform API key for sync |
| `FIBE_API_URL` | — | Fibe platform API URL |
| `FIBE_SYNC_ENABLED` | — | Set to `true` to enable Fibe sync |
| `CORS_ORIGINS` | `localhost:3100,localhost:4300` | Comma-separated allowed CORS origins |
| `FRAME_ANCESTORS` | `*` | CSP `frame-ancestors` (restrict in production) |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug` \| `verbose` |

**Provider API keys** (used when `AGENT_AUTH_MODE=api-token`):

| Provider | Key variable(s) |
|----------|----------------|
| Gemini | `GEMINI_API_KEY` |
| Claude Code | `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` |
| OpenAI Codex | `OPENAI_API_KEY` |
| OpenCode | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY` |

### Chat (Vite, optional)

| Variable | Description |
|----------|-------------|
| `API_URL` | API base URL when running on a different host (default: same origin) |
| `LOCK_CHAT_MODEL` | Set to `true` to disable the model selector |
| `ASSISTANT_AVATAR_URL` | Custom avatar URL for the AI side of chat |
| `USER_AVATAR_URL` | Custom avatar URL for the user side of chat |
| `VITE_THEME_SOURCE` | `localStorage` (default) or `frame` — drive theme from parent via `postMessage` |
| `VITE_HIDE_THEME_SWITCH` | `1` / `true` — hide the in-app theme toggle |

## API summary

Full spec: [docs/API.md](docs/API.md).

### REST

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Health / readiness probe |
| `POST` | `/api/auth/login` | No | Password login → `{ token }` |
| `GET` | `/api/messages` | Bearer | Conversation message history |
| `GET` | `/api/activities` | Bearer | Activity timeline list |
| `GET` | `/api/activities/:id` | Bearer | Single activity |
| `GET` | `/api/model-options` | Bearer | Available model names |
| `GET` | `/api/playgrounds` | Bearer | Playground file tree |
| `GET` | `/api/playgrounds/file?path=…` | Bearer | Read a playground file |
| `POST` | `/api/uploads` | Bearer | Upload file (≤ 20 MB) |
| `GET` | `/api/uploads/:filename` | Bearer | Serve uploaded file |
| `POST` | `/api/agent/send-message` | Bearer | Async message (webhooks/integrations) → `202` |
| `GET` | `/api/init-status` | Bearer | Post-init script status |

### WebSocket `/ws`

Connect with `?token=<password>` when `AGENT_PASSWORD` is set. Only one active session at a time; a new connection displaces the old one (close code `4002`).

**Key client→server actions:** `send_chat_message`, `interrupt_agent`, `set_model`, `initiate_auth`, `submit_auth_code`, `cancel_auth`, `reauthenticate`, `logout`.

**Key server→client events:** `stream_start`, `stream_chunk`, `stream_end`, `reasoning_start/chunk/end`, `thinking_step`, `tool_call`, `file_created`, `auth_status`, `model_updated`.

### WebSocket `/ws-terminal`

Bidirectional shell I/O between xterm.js and a `node-pty` shell spawned in `PLAYGROUNDS_DIR`.

## Lockfiles

The repo keeps **`bun.lock`** (Bun, CI, Docker) and **`package-lock.json`** (npm compatibility). Never delete `bun.lock` before running `bun install` — workspace installs can fail. CI always uses `bun install --frozen-lockfile`.

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `bun run dev` | API + Chat in parallel |
| `build` | `bun run build` | Build all apps |
| `lint` | `bun run lint` | Lint all projects |
| `test` | `bun run test` | Unit tests (100% coverage) |
| `typecheck` | `bun run typecheck` | TypeScript type-check |
| `e2e` | `bun run e2e` | Playwright e2e suites |
| `ci` | `bun run ci` | Lint + build + typecheck + test |
| `ci:notest` | `bun run ci:notest` | Lint + build + typecheck only |

## Container images

CI builds and pushes multi-arch (`linux/amd64`, `linux/arm64`) images on every push to `main` or `dev`:

```
ghcr.io/<owner>/fibe-agent:<provider>-latest
ghcr.io/<owner>/fibe-agent:<provider>-<git-sha>

# latest-dev for the dev branch:
ghcr.io/<owner>/fibe-agent:<provider>-latest-dev
```

Providers: `gemini`, `claude-code`, `openai-codex`, `opencode`. Pass `AGENT_PROVIDER` as a build arg; see [Dockerfile](Dockerfile) and [ci.yml](.github/workflows/ci.yml).

## Embedding (iframe)

The chat can run inside a `<iframe>` in another app (e.g. Fibe):

- **Auto-auth:** parent posts `{ action: 'auto_auth', password: '…' }` → chat logs in automatically.
- **Theme control:** parent posts `{ action: 'set_theme', theme: 'light'|'dark' }` (requires `VITE_THEME_SOURCE=frame`).

## License

MIT — see `package.json`.
