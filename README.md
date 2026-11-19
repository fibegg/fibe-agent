<p align="center">
  <img src="https://docs.fibe.gg/img/logo.png" alt="Fibe" width="180" />
</p>

<h1 align="center">Fibe Agent</h1>

<p align="center">
  <strong>A coding agent with streaming chat, an inline editor, a terminal, and multiple providers.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/fibegg/fibe-agent" alt="Version" />
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-1.4.2-000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://nx.dev"><img src="https://img.shields.io/badge/Nx-22-143055?logo=nx&logoColor=white" alt="Nx" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HIPAA-Ready-5cb43a.svg" alt="HIPAA Ready" />
  <img src="https://img.shields.io/badge/SOC%202-Compliant-5cb43a.svg" alt="SOC 2 Compliant" />
  <img src="https://img.shields.io/badge/GDPR-Ready-5cb43a.svg" alt="GDPR Ready" />
  <img src="https://img.shields.io/badge/CCPA-Ready-5cb43a.svg" alt="CCPA Ready" />
  <img src="https://img.shields.io/badge/OWASP-Secured-informational.svg" alt="OWASP" />
  <img src="https://img.shields.io/badge/SCS-Scanned-informational.svg" alt="Supply Chain Security" />
</p>

---

**Fibe Agent** combines a **NestJS + Fastify** API with a **React + Vite** client. It runs Gemini, Antigravity, Claude Code, OpenAI Codex, Cursor, OpenCode, or a mock provider over a streaming WebSocket. The client includes chat, a **CodeMirror 6 editor**, an **xterm.js terminal**, activity history, file editing, voice input, attachments, `@` file references, OAuth, Light/Dark themes, and iframe support.

## Features at a glance

| Area | Details |
| --- | --- |
| **Agent providers** | `gemini`, `antigravity`, `claude-code`, `openai-codex`, `cursor`, `opencode`, or `mock`, selected with `AGENT_PROVIDER`. Supports OAuth and API tokens. |
| **Streaming chat** | WebSocket at `/ws` with per-chunk streaming, reasoning/thinking steps, tool-call and file-created events, token usage, and agent interrupt. |
| **Code editor** | CodeMirror 6 with highlighting for 15+ languages, unsaved-change indicators, shortcuts, and REST-backed saves. |
| **Interactive terminal** | xterm.js terminal backed by `node-pty` over `/ws-terminal`, spawning shells in the playground directory. |
| **Activity sidebar** | Agent reasoning, tool calls, file operations, and status in chronological order. |
| **File explorer** | Real-time playground file tree; open, edit, view, and save files without leaving the chat. |
| **Voice input** | Records with `MediaRecorder` and sends the audio as an attachment. |
| **Gemma MCP Router** | Optional local Ollama model (`gemma3:4b`) that classifies intent and suggests MCP tools. |
| **File attachments** | Images, audio, PDF, Office, CSV, JSON, or text files up to 20 MB each. |
| **`@`-mention files** | Type `@` to reference playground files; the API injects their contents into the prompt. |
| **Conversation persistence** | Messages, activity, model and effort choices, uploads, and provider sessions by conversation id. |
| **Fibe integration** | `FibeSyncService`, `postMessage` auto-auth, and iframe embedding with parent-controlled theming. |
| **Security** | Helmet (CSP, frame-ancestors), rate limiting (100 req/min), shared-password bearer auth, multipart validation. |
| **Structured logging** | One JSON object per line with request IDs and HTTP/WebSocket context; `LOG_LEVEL`. |
| **Testing** | Co-located unit tests (Bun for the API, Vitest for Chat), plus end-to-end suites for the API and Chat. |
| **Docker** | Multi-arch (`linux/amd64`, `linux/arm64`) GHCR images per provider, published by the Compose CI in [`ci.yml`](ci.yml). |

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
    Gemma["Gemma Router\n(local Ollama)"]
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
  Orch --> Gemma
  Gemma --> Strategies
  Strategies --> Gemini
  Strategies --> Claude
  Strategies --> Codex
  Strategies --> OpenCode
```

## Quick start

Requires [Bun](https://bun.sh); the version is pinned in `package.json`.

```sh
bun install
bun run dev                                      # API http://localhost:3000 (/api/health), Chat http://localhost:3100
AGENT_PROVIDER=mock bunx nx serve api            # no provider CLI or key needed
API_URL=http://localhost:3000 bunx nx serve chat # Chat against an API on another host
```

Chat's Vite server proxies `/api` and `/ws` to the API. For password protection set `agentPassword` in `fibe.yml` or `FIBE_SETTINGS_JSON`; `AGENT_PASSWORD` alone does not enable authentication.

Fibe containers receive one built-in local stdio MCP entry through `MCP_CONFIG_JSON` (`fibe mcp serve --yolo` with `FIBE_API_KEY` and `FIBE_DOMAIN`), which keeps the bundled CLI and MCP tools aligned without a daemon. Expose Fibe only once per environment to avoid duplicate tools.

## Documentation

| Document | Contents |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Rules for contributors and coding agents: layout, lockfiles, CI, focused tests, images, adding a provider |
| [fibe.example.yml](fibe.example.yml), [.env.example](.env.example) | Every setting with its default; local process variables |
| [docs/API.md](docs/API.md) | REST, WebSocket, structured output, delivery identities, persistence, local MCP tools, Gemma router and logging contract |
| [MULTI.md](MULTI.md) | Multi-conversation runtime and per-provider session behaviour |
| [contracts/mobile-client.md](contracts/mobile-client.md) | Mobile client request, response and event contract |
| [docs/providers/runtime-contracts.md](docs/providers/runtime-contracts.md) | Providers, `AgentStrategy`, authentication modes, credential injection, provider CLI/SDK runtime contracts |
| [docs/runtime-tools.md](docs/runtime-tools.md) | Tool and provider CLI pins, pin drift report and bump routine, image smoke checks |
| [apps/api/BACKEND_BOUNDARIES.md](apps/api/BACKEND_BOUNDARIES.md) | API module map and backend boundaries |
| [prompts/README.md](prompts/README.md) | System prompt reference library |

## Embedding (iframe)

- **Auto-auth:** the parent posts `{ action: 'auto_auth', password: '…' }`; Chat signs in.
- **Theme control:** the parent posts `{ action: 'set_theme', theme: 'light'|'dark' }` (requires `VITE_THEME_SOURCE=frame`); `winter` and `halloween` are normalized to `light` and `dark`.

## Light and Dark appearance

The interface uses a neutral monochrome palette, Plus Jakarta Sans, solid surfaces and standard controls. Editor and terminal chrome follow the theme; syntax, ANSI and status colors keep their meaning. Tony Stark mode keeps its separate interface. Waiting messages use ordinary status text regardless of prompt keywords.

The `chat-theme` storage key and `fibe_theme_changed` event are unchanged. Canonical themes are `light` and `dark`; `winter` migrates to `light`, and `halloween`, `dracula`, `midnight` and `contrast` migrate to `dark`. Startup follows the system preference without saving an inferred choice.

## License

MIT. See `package.json`.
