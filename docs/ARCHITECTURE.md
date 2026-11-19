# Architecture

Reference for providers, strategies, authentication, persistence, prompts, local
MCP tools, the Gemma router and API modules. Repository rules for contributors
and coding agents are in [`AGENTS.md`](../AGENTS.md); the REST and WebSocket
contract is in [`API.md`](API.md); every setting is in
[`fibe.example.yml`](../fibe.example.yml).

## Request flow

The API (`apps/api`) connects Chat to an agent provider. Each WebSocket message
passes through **OrchestratorService**, **StrategyRegistryService** and the
active **AgentStrategy**, which runs or contacts the provider and streams the
response over the same socket.

```
Chat UI --ws--> OrchestratorService --> GemmaRouterService (local Ollama, optional)
                       |                        | injects tool hint
                       v                        v
               StrategyRegistryService <---------
                       |
        GeminiStrategy, ClaudeStrategy, OpenCodeStrategy, ...
```

One HTTP upgrade dispatcher serves `/ws` for chat and `/ws-terminal` for PTY
sessions, so their listeners do not compete.

## Providers

| `AGENT_PROVIDER` | Aliases | Transport | Image tag |
| --- | --- | --- | --- |
| `gemini` | | `@google/gemini-cli` CLI | `gemini` |
| `antigravity` | | Antigravity CLI (`agy`) | `antigravity` |
| `claude-code` (default) | | `@anthropic-ai/claude-agent-sdk` (in-process SDK) | `claude-code` |
| `openai-codex` | `openai` | `@openai/codex` CLI | `openai-codex` |
| `cursor` | | `cursor-agent` CLI | `cursor` |
| `opencode` | `opencodex` | `opencode-ai` CLI | `opencode` |
| `mock` | | built in, no CLI | none |

Set `AGENT_PROVIDER` explicitly in production. `mock` echoes configurable fake
responses for local UI work without a key. Provider runtime details:
[`providers/runtime-contracts.md`](providers/runtime-contracts.md),
[`providers/antigravity.md`](providers/antigravity.md); pinned tool versions:
[`runtime-tools.md`](runtime-tools.md).

Strategies live in `apps/api/src/app/strategies/`: one `<name>.strategy.ts` per
provider, `abstract-cli.strategy.ts` (shared base for CLI-process strategies),
`tool-use-to-event.ts` (Claude SDK tool events), `strategy-registry.service.ts`
(resolves `AGENT_PROVIDER`) and `strategy.types.ts` (`AgentStrategy`,
`AuthConnection`, `StreamingCallbacks`, `TokenUsage`).

### `AgentStrategy`

Required: `executeAuth(connection)`, `submitAuthCode(code)`, `cancelAuth()`,
`clearCredentials()`, `executeLogout(connection)`, `checkAuthStatus()`,
`executePromptStreaming(prompt, model, onChunk, callbacks?, systemPrompt?, runtimeOptions?)`.

Optional: `ensureSettings()` (write provider config before the first run),
`getWorkingDir()`, `prepareWorkingDir()`, `getModelArgs(model)`, `listModels()`,
`interruptAgent()`, `steerAgent(message)` (steer or queue while busy),
`hasNativeSessionSupport()`.

## Authentication modes

- `oauth` (default): the client sends `initiate_auth`; the server emits
  `auth_url_generated`, `auth_device_code` or `auth_manual_token` (Claude paste
  flow); the user completes it; the server emits `auth_success`.
- `api-token` (`AGENT_AUTH_MODE=api-token`): the provider key variable is the
  source of truth. `initiate_auth` succeeds at once when it is set and reports
  `unauthenticated` otherwise, without opening a browser. Key variables per
  provider are listed in [`API.md`](API.md#provider-and-frontend-environment);
  Claude Code also accepts `CLAUDE_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`.

### Credential injection

`AGENT_CREDENTIALS_JSON` (setting `agentCredentials`) maps file names to
content. `credential-injector.ts` writes them into `SESSION_DIR` with mode
`0600` before the strategy starts, so an Agent starts signed in. File names with
path separators are skipped. Examples: Gemini `agent_token.txt`; Claude Code,
Codex and OpenCode `auth.json`.

| Provider | `SESSION_DIR` in the image |
| --- | --- |
| `gemini`, `antigravity` | `/home/node/.gemini` |
| `claude-code` | `/home/node/.claude` |
| `openai-codex` | `/home/node/.codex` |
| `cursor` | `/home/node/.cursor` |
| `opencode` | `/home/node/.local/share/opencode` |

## Conversations and persistence

All agent state (messages, activities, uploads, init status, provider session
markers) is scoped by a conversation id. The default conversation stores data
under `dataDir/<FIBE_AGENT_ID or CONVERSATION_ID or default>/`; conversations
created through the API live under `dataDir/conversations/<id>/` with
`conversations/index.json`. Model and effort are global unless changed through
the runtime stores. Provider workspaces are shared from the default
conversation directory where supported, while provider session markers are per
conversation so each conversation resumes its own native provider thread.

`PLAYGROUNDS_DIR` defaults to `<dataDir>/<storage-id>/playground`; an explicit
value wins and is resolved to an absolute path before it is exported to
provider and MCP child processes. Fibe stdio MCP entries receive the path and
Host variables explicitly, because MCP clients may filter inherited
environment.

## Steering

When a user queues a message while the agent is busy, the orchestrator calls the
strategy's `steerAgent()`, which interrupts the running process and folds the
interrupted context and pending messages into the next prompt or the CLI's
resume flags. There is no file-system queue.

## Prompts

The runtime system prompt is the `systemPrompt` setting (`fibe.yml` or
`FIBE_SETTINGS_JSON`), else the bundled `dist/assets/SYSTEM_PROMPT.md`.
[`prompts/`](../prompts/README.md) is an authoring library of base and
per-provider variants; it is not loaded at runtime. Prompts for managed Fibe
runtimes are owned by the platform and passed in through `systemPrompt`.
Provider strategies run in full-access modes where applicable, so policy comes
from runtime configuration plus the injected prompt.

## Local MCP tools

Every provider that supports MCP receives a built-in stdio server, `fibe-local`
(`local-mcp.server.ts`), in its MCP configuration. It forwards calls over
loopback `POST /api/local-tool-call` to `LocalMcpService`, which emits WebSocket
events to Chat.

| Tool | Blocks the agent | Purpose |
| --- | --- | --- |
| `ask_user` | yes | Open question; Chat shows a question card; returns `{ answer }` |
| `confirm_action` | yes | Yes/no before a destructive action; returns `{ confirmed }` |
| `show_image` | no | Render an image (`url` or `base64` + `mimeType`) |
| `set_mode`, `get_mode` | no | Agent mode (`exploring`, `casting`, `overseeing`, `build`) |
| `notify` | no | Toast (`info`, `success`, `warning`, `error`) |
| `set_title` | no | Activity run title |

Blocking calls time out after `ASK_USER_TIMEOUT_MS` (default 300000).

## Gemma router (optional)

With `gemmaRouterEnabled` (or `GEMMA_ROUTER_ENABLED=true`) and a reachable
Ollama (`ollamaUrl`, `gemmaModel`, default `gemma3:4b`), `GemmaRouterService`
classifies each request locally and, above `gemmaConfidenceThreshold`, prepends
`[SYSTEM]Suggested MCP tools: ...[/SYSTEM]` to the provider prompt (stored
messages are unchanged). It probes `GET /api/tags` at startup, warms the model,
and probes again before later requests while Ollama is unavailable. A timeout or
missing model skips the hint (logs show `skipped: true`). `claude-code` receives
`.mcp.json` through `--mcp-config <path>`.

## API modules

Under `apps/api/src/app/`:

| Module | Responsibility |
| --- | --- |
| `orchestrator` | Agent runs, streaming, session state |
| `strategies` | Provider adapters and the strategy registry |
| `gemma-router` | Optional local intent classifier |
| `agent` | `POST /api/agent/send-message` and queue routes |
| `agent-files` | Agent-generated files |
| `auth` | Bearer guard and login |
| `messages`, `message-store` | Message history |
| `activity`, `activity-store` | Activity timeline |
| `model-options`, `model-store`, `effort-store` | Model list, model and effort |
| `playgrounds` | File tree, file REST, Playground browse and link |
| `uploads` | Multipart validation and file serving |
| `terminal` | `node-pty` shells over `/ws-terminal` |
| `fibe-sync` | Conversation sync to the Fibe platform |
| `github-token-refresh` | GitHub token refresh |
| `init-status` | `postInitScript` state |
| `persistence`, `config` | Persistence helpers, settings |
| `audit`, `crypto`, `data-privacy` | Audit log, data-at-rest encryption, export and delete |
| `runtime-config` | Runtime values for Chat |

Backend layering rules: [`apps/api/BACKEND_BOUNDARIES.md`](../apps/api/BACKEND_BOUNDARIES.md).
