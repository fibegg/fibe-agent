# Agents

Repository reference for providers, configuration, authentication, conversation scope, images and local development. REST and WebSocket contracts: [`docs/API.md`](docs/API.md). Multi-conversation and provider session behaviour: [`MULTI.md`](MULTI.md). Provider runtime contracts: [`docs/providers/runtime-contracts.md`](docs/providers/runtime-contracts.md). Tool pins and image checks: [`docs/runtime-tools.md`](docs/runtime-tools.md).

## Overview

The API (`apps/api`, NestJS + Fastify, :3000) connects Chat (`apps/chat`, React + Vite, :3100) to an agent provider. Each WebSocket message passes through `OrchestratorService`, optionally `GemmaRouterService` (local Ollama tool hint), `StrategyRegistryService` and the active `AgentStrategy`, which runs or contacts the provider and streams the response over the same socket. One HTTP upgrade dispatcher serves `/ws` (chat) and `/ws-terminal` (PTY), so their listeners do not compete.

## Providers

| `AGENT_PROVIDER` | Aliases | Transport | Docker tag |
| --- | --- | --- | --- |
| `gemini` | | `@google/gemini-cli` CLI | `gemini` |
| `antigravity` | | Antigravity CLI (`agy`) | `antigravity` |
| `claude-code` (default) | | `@anthropic-ai/claude-agent-sdk` (in-process SDK) | `claude-code` |
| `openai-codex` | `openai` | `@openai/codex` CLI | `openai-codex` |
| `cursor` | | `cursor-agent` CLI | `cursor` |
| `opencode` | `opencodex` | `opencode-ai` CLI | `opencode` |
| `mock` | | built-in, echoes fake responses (no API key needed) | none |

Unset `AGENT_PROVIDER` means `claude-code`; set it explicitly in production.

Strategies live in `apps/api/src/app/strategies/`: one `<provider>.strategy.ts` per provider (`claude-sdk.strategy.ts` for Claude Code), `abstract-cli.strategy.ts` (base for CLI-process strategies), `tool-use-to-event.ts` (Claude SDK tool events), `strategy-registry.service.ts` (resolves `AGENT_PROVIDER`) and `strategy.types.ts` (`AgentStrategy`, `AuthConnection`, `StreamingCallbacks`, `TokenUsage`).

`AgentStrategy` required methods: `executeAuth(connection)`, `submitAuthCode(code)`, `cancelAuth()`, `clearCredentials()`, `executeLogout(connection)`, `checkAuthStatus()`, `executePromptStreaming(prompt, model, onChunk, callbacks?, systemPrompt?, runtimeOptions?)`. Optional: `ensureSettings()` (write provider config before first run), `getWorkingDir()`, `prepareWorkingDir()`, `getModelArgs(model)`, `listModels()`, `interruptAgent()`, `steerAgent(message)` (steer or queue while busy), `hasNativeSessionSupport()`.

## Environment variables

[`fibe.example.yml`](fibe.example.yml) lists every setting; `.env.example` covers local process variables and `FIBE_SETTINGS_JSON`. Settings (`agentPassword`, `modelOptions`, `dataDir`, `systemPrompt`, `hostRoot`, `postInitScript`, ...) come from `fibe.yml` or `FIBE_SETTINGS_JSON` and are then passed to child processes as environment variables.

| Name | Default | Source | Description |
| --- | --- | --- | --- |
| `PORT` | `3000` | env | API listen port |
| `AGENT_PROVIDER` / `agentProvider` | `claude-code` | env or setting | Active provider |
| `AGENT_AUTH_MODE` / `agentAuthMode` | `oauth` | env or setting | `oauth` browser/device flow, or `api-token` env-key mode |
| `agentPassword` | none | setting | Enables `/api` and `/ws` bearer auth; promoted to `AGENT_PASSWORD` for children (that env alone enables nothing) |
| `modelOptions` | none | setting | Selector models, comma-separated or YAML/JSON list |
| `defaultModel` | first `modelOptions` | setting | Pre-selected model |
| `claudeEffort` / `CLAUDE_EFFORT` | `max` | setting or env | Default Claude effort (`low`, `medium`, `high`, `xhigh`, `max`) |
| `dataDir` | `<cwd>/data` | setting | Base persistence directory |
| `FIBE_AGENT_ID` | none | env | Default conversation storage id set by Fibe |
| `CONVERSATION_ID` | none | env | Fallback default conversation storage id |
| `systemPrompt` | bundled prompt | setting | Inline system prompt; unset loads `dist/assets/SYSTEM_PROMPT.md` |
| `PLAYGROUNDS_DIR` | `<dataDir>/<storage-id>/playground` | env | Shared root for file explorer, shells and CLI/MCP tools; explicit override wins |
| `hostRoot` | `/opt/fibe` | setting | Host local data root; the Fibe CLI receives its `playgrounds` subdirectory |
| `postInitScript` | none | setting | Shell script run once on first boot; state at `GET /api/init-status` |
| `SESSION_DIR` / `sessionDir` | provider default | env or setting | Provider config/session dir |
| `AGENT_CREDENTIALS_JSON` / `agentCredentials` | none | env or setting | JSON map of credential file names to content, injected at startup |
| `encryptionKey` | none | setting | AES-256-GCM data-at-rest encryption |
| `FIBE_API_KEY` | none | env | Fibe platform API key for sync |
| `fibeSyncEnabled` / `FIBE_SYNC_ENABLED` | `false` | setting or env | Enable Fibe platform sync |
| `CORS_ORIGINS` | `localhost:3100,localhost:4300` | env | Allowed CORS origins |
| `FRAME_ANCESTORS` | `*` | env | CSP `frame-ancestors`; restrict in production |
| `LOG_LEVEL` | `info` | env | `error`, `warn`, `info`, `debug`, `verbose` |
| `MCP_CONFIG_JSON` / `mcpConfig` | none | env or setting | Stdio/HTTP MCP servers injected into provider config. Fibe deployments include one local `fibe mcp serve --tools core --yolo` entry with `FIBE_API_KEY` and `FIBE_DOMAIN`; keep it unique per environment |
| `DOCKER_MCP_CONFIG_JSON` | none | env | Extra Docker MCP servers merged with `MCP_CONFIG_JSON` |
| `ASK_USER_TIMEOUT_MS` | `300000` | env | Wait for an operator reply before blocking local MCP tools time out |
| `gemmaRouterEnabled`, `ollamaUrl`, `gemmaModel`, `gemmaConfidenceThreshold`, `gemmaTimeoutMs` | see `fibe.example.yml` | setting or env | Optional local Gemma router |

`PLAYGROUNDS_DIR` is resolved to an absolute path at startup and exported to provider and MCP children; blank means `<dataDir>/<storage-id>/playground` with the same sanitized storage id as other data (or `default`). The data directory must be writable by the runtime user; linking replaces the directory atomically, so its parent must be writable too. Explicit and linked overrides are preserved; relative overrides are resolved before tools change directory. Bare provider tool calls need SDK/CLI 0.3.3 or newer to honour this default. Fibe stdio MCP entries receive the shared path and Host variables explicitly, because MCP clients may filter inherited environment; other MCP servers are left intact.

Provider API keys (`AGENT_AUTH_MODE=api-token`): Gemini `GEMINI_API_KEY`; Claude Code `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`; OpenAI Codex `OPENAI_API_KEY`; Cursor `CURSOR_API_KEY`; OpenCode `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY` or `DEEPSEEK_API_KEY`.

Chat runtime config (served by `GET /api/runtime-config`): `API_URL` (API on another host; default same origin), `LOCK_CHAT_MODEL` (`true` disables the model selector), `ASSISTANT_AVATAR_URL` / `ASSISTANT_AVATAR_BASE64`, `USER_AVATAR_URL` / `USER_AVATAR_BASE64` (base64 wins), `VITE_THEME_SOURCE` (`localStorage` default, or `frame` to accept `set_theme` `light`/`dark` from a parent via `postMessage`; `winter`/`halloween` are normalized), `VITE_HIDE_THEME_SWITCH`, `SIMPLICATE` (start in Simplicate mode).

## Gemma router

Optional local intent classification through [Ollama](https://ollama.com):

```sh
docker run -d --name ollama -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
docker exec ollama ollama pull gemma3:4b
# .env: GEMMA_ROUTER_ENABLED=true OLLAMA_URL=http://localhost:11434 GEMMA_MODEL=gemma3:4b
#       GEMMA_CONFIDENCE_THRESHOLD=0.75 GEMMA_TIMEOUT_MS=30000
```

At startup `GemmaRouterService` probes `GET /api/tags` and warms the model with a one-token prompt; if Ollama is down it probes again before each request and the request continues without a hint. It picks tools from the `MCP_CONFIG_JSON` list and, above the confidence threshold, prepends `[SYSTEM]Suggested MCP tools: ...[/SYSTEM]` to the provider prompt only (stored messages are unchanged). `claude-code` receives `.mcp.json` through `--mcp-config <path>`, independent of project trust. `skipped: true` in logs means Ollama is not running or the model is not pulled.

## Authentication

`oauth` (default): client sends `initiate_auth`; server emits `auth_url_generated`, `auth_device_code` or `auth_manual_token` (Claude paste flow); the user completes it; server emits `auth_success`.

`api-token`: the provider key env var is the source of truth; `initiate_auth` succeeds at once when it is present, otherwise reports `unauthenticated` without a browser. Use it for Docker, CI and key-only environments.

Credential injection: `credential-injector.ts` writes each `AGENT_CREDENTIALS_JSON` entry into `SESSION_DIR` (mode `0600`) before the strategy starts; `SESSION_DIR` must be set with it, and file names containing path separators are skipped. Examples: Gemini `{ "agent_token.txt": "ya29.xxx" }`; Claude Code and OpenCode `{ "auth.json": "{\"api_key\":\"...\"}" }`; Codex (OAuth only) `{ "auth.json": "{\"access_token\":\"...\"}" }`.

## Conversation persistence

Messages, activities, uploads, init status and provider session markers are scoped by conversation id; model and effort are global agent settings. The default storage id is `FIBE_AGENT_ID`, else `CONVERSATION_ID`, else `default` (`ConfigService.getConversationDataDir()`):

```
dataDir/
├── <default-storage-id>/   messages.json activity.json model.json effort.json uploads/ init-status/
└── conversations/
    ├── index.json
    └── <conversation-id>/  messages.json activity.json uploads/ provider session markers
```

Provider workspaces are shared from the default conversation data dir where supported; session markers are per conversation so each Fibe conversation resumes its own native thread (details in `MULTI.md`).

Steering: when a user sends while a turn runs, the orchestrator calls the strategy's `steerAgent()`, which steers natively or interrupts/queues so the text reaches the next prompt or the CLI's resume flags.

## Prompts

The runtime system prompt is the `systemPrompt` setting (owned by Fibe and passed in), else the bundled `dist/assets/SYSTEM_PROMPT.md` (source `apps/api/src/assets/SYSTEM_PROMPT.md`). [`prompts/`](prompts/README.md) is a reference library and is never loaded by path. Provider strategies run in full-allowed modes where applicable, so safety policy is runtime/provider configuration plus the injected prompt.

```yaml
# fibe.yml (or FIBE_SETTINGS_JSON='{"systemPrompt":"..."}')
systemPrompt: |
  You are a TypeScript expert.
```

## Local MCP tools

Every MCP-capable provider receives a built-in stdio server `fibe-local` in its MCP config. `local-mcp.server.ts` posts to the loopback `POST /api/local-tool-call`; `LocalMcpService` forwards events through the orchestrator WebSocket to Chat.

| Tool | Blocking | Result |
| --- | --- | --- |
| `ask_user` | yes, until the operator answers (`QuestionCard`) | `{ answer }` |
| `confirm_action` | yes, yes/no before a destructive action (`ConfirmCard`) | `{ confirmed }` |
| `show_image` | no; `url` or `base64` + `mimeType` | `{ ok: true }` |
| `set_mode` / `get_mode` | no; `exploring`, `casting`, `overseeing`, `build` | `{ ok, mode }` / `{ mode }` |
| `notify` | no; toast `info`, `success`, `warning`, `error` | `{ ok: true }` |
| `set_title` | no; activity run title | `{ ok: true }` |

Blocking calls time out after `ASK_USER_TIMEOUT_MS`.

## Docker images

GitHub CLI 2.102.0 is installed from immutable release archives with explicit amd64/arm64 SHA-256 in both Dockerfiles (its apt repository keeps only the current version, so an apt pin is not rebuildable).

### Latest stable CLI release

`scripts/ci/cli-build.mjs` resolves GitHub's latest stable published SDK release once, before Docker cache selection; build inputs carry the exact version, tag commit and Linux archive checksums, both Docker recipes verify the archive before installing, and image labels record version, commit and hashes. An explicit stable `FIBE_CLI_VERSION` overrides latest; resolution or checksum errors fail the build. At runtime an Agent may request an explicit released version, or `latest`/none, which resolves once per startup, verifies the published `checksums.txt` and logs version, commit and hash; a new release reaches Agents on restart. `GH_TOKEN` authenticates GitHub API requests when available.

### Candidate CLI builds

Staging uses `hostRoot` / `hostRootDomain`, `HOST_ROOT` / `HOST_ROOT_DOMAIN` and `FIBE_HOST_ID`; removed Marquee settings fail with an error naming the replacement (no alias). Selector routes are `/api/playgrounds/{browse,link,unlink,current}`; CLI JSON uses `spec`.

Set `FIBE_CANDIDATE_BUILD=1`, `FIBE_CLI_VERSION=0.3.0-rc.1+<sdk-sha7>`, `FIBE_SDK_SHA=<full SDK SHA>`, `FIBE_CLI_BINARY_PATH=<local Linux binary>`, `FIBE_CLI_BINARY_SHA256=<64 hex>`; `FIBE_CANDIDATE_PLATFORM` is `linux/amd64` (default) or `linux/arm64`, one architecture per checksum. The build helper verifies checksum and ELF architecture before registry authentication, stages an ignored `.candidate-cli/fibe` and refuses to overwrite a different staged binary (move it before selecting another candidate). Both recipes copy and verify it, check its version and record `gg.fibe.cli.version`, `gg.fibe.cli.sdk.sha`, `gg.fibe.cli.binary.sha256`; nothing is downloaded. Candidate builds emit only `<provider>-cand-<cli-version>-<agent-sha7>-<arch>` tags with separate cache refs, never `latest*` or SHA tags; select existing candidate images by digest. The entrypoint uses the matching baked candidate and fails before downloads on a mismatched or `latest` request. The Compose CI environment forwards these inputs; the binary path must be readable inside the `/app` mount (for example `/app/.candidate-cli/fibe`). Building and pushing images is a separate authorized operation.

### Tags and running

The root Compose CI file [`ci.yml`](ci.yml) publishes multi-arch images when its `ci-build-<provider>` services run: `ghcr.io/<owner>/fibe-agent:<provider>-latest`, `<provider>-latest-dev` (dev branch) and `<provider>-<git-sha>`. `--build-arg AGENT_PROVIDER=<value>` bakes the provider and installs its CLI plus git, docker, ripgrep, fd, Python, Deno, uv, ffmpeg, ImageMagick, Playwright/Chromium, sqlite3 and pandoc; `dist/` and `chat/` are copied last for cache reuse. Failed managed CI runs keep bounded, redacted failure details in the `ci-results-notify` service logs; read them after teardown.

```sh
docker run -p 3000:3000 -e AGENT_PROVIDER=gemini -e GEMINI_API_KEY=... -e AGENT_AUTH_MODE=api-token \
  ghcr.io/<owner>/fibe-agent:gemini-latest
```

`SESSION_DIR` per provider: gemini and antigravity `/home/node/.gemini`, claude-code `/home/node/.claude`, openai-codex `/home/node/.codex`, cursor `/home/node/.cursor`, opencode `/home/node/.local/share/opencode`.

## Local development

Bun (version in `package.json` `packageManager`) and Node 24 (`.nvmrc`, for `node-pty`).

```sh
bun install
cp .env.example .env              # set AGENT_PROVIDER and keys
bun run dev                       # API :3000 + Chat :3100
bunx nx serve api                 # API only; AGENT_PROVIDER=mock needs no key
bunx nx serve chat                # Chat only
bun run dev:docker                # Docker/Mutagen API + Chat, serialized API restarts
bun run ci                        # lint + build + typecheck + test (ci:notest skips tests)
bun run test                      # or bunx nx test api|chat; specs co-located, 100% coverage
bun run e2e                       # or bunx nx e2e e2e-api|e2e-chat
```

Cross-repository link-path regression (candidate CLI and real file-browser services as UID 1000 with root-owned `/app`, no network, no live data); build the Linux CLI for the Docker engine architecture first:

```sh
scripts/ci/playground-link-path.test.sh /absolute/path/to/linux/fibe /absolute/path/to/artifacts/link-path
```

## API modules

Under `apps/api/src/app/`: `orchestrator` (runs, streaming, session state), `strategies`, `gemma-router`, `agent` (`POST /api/agent/send-message`), `agent-files`, `auth` (bearer guard, login), `conversation`, `messages` / `message-store`, `activity` / `activity-store`, `model-options` / `model-store` / `effort-store`, `playgrounds` (tree watcher, REST, browser, linker), `uploads`, `terminal` (`node-pty` over `/ws-terminal`), `local-mcp`, `provider-traffic`, `fibe-sync`, `github-token-refresh` (Codex), `init-status`, `persistence`, `config`, `audit`, `crypto` (AES-256-GCM), `data-privacy` (export/delete), `runtime-config`.

## Adding a new provider

1. Create `apps/api/src/app/strategies/<name>.strategy.ts` implementing `AgentStrategy`; extend `AbstractCliStrategy` for a CLI binary.
2. Add a `case` in `strategy-registry.service.ts`.
3. Install the CLI in the Dockerfile `cli` and final stages (pin it per `docs/runtime-tools.md`) and create its session directory.
4. Document provider keys in `.env.example` and this file.
5. Add `<name>.strategy.test.ts` following the existing strategies.
6. Add a `ci-build-<provider>` service to [`ci.yml`](ci.yml). The GitHub Actions workflow is disabled as `.github/workflows/ci.yml.disabled`.
