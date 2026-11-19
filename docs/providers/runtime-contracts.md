# Provider runtime contracts

Checked on 2026-09-30 against official documentation and the installed Linux CLIs (pins in
`docs/runtime-tools.md`). Example `cliVersion` values select the FIBE CLI used by
MCP tools, not provider CLIs.

Use an explicit `SESSION_DIR` for native authentication state. Credential
availability checks do not prove that a key works, that OAuth remains valid, or
that the account can use a selected model. Run configured external probes for
that evidence and report unconfigured probes as skipped.

## Providers and strategies

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
responses for local UI work without a key.

Each WebSocket message passes through `OrchestratorService`, the optional
`GemmaRouterService` (see `docs/API.md`), `StrategyRegistryService` and the
active `AgentStrategy`, which runs or contacts the provider and streams the
response over the same socket. One HTTP upgrade dispatcher serves `/ws` (chat)
and `/ws-terminal` (PTY), so their listeners do not compete.

Strategies live in `apps/api/src/app/strategies/`: one `<name>.strategy.ts` per
provider (`claude-sdk.strategy.ts` for Claude Code), `abstract-cli.strategy.ts`
(shared base for CLI-process strategies), `tool-use-to-event.ts` (Claude SDK
tool events), `strategy-registry.service.ts` (resolves `AGENT_PROVIDER`) and
`strategy.types.ts` (`AgentStrategy`, `AuthConnection`, `StreamingCallbacks`,
`TokenUsage`).

`AgentStrategy` requires `executeAuth(connection)`, `submitAuthCode(code)`,
`cancelAuth()`, `clearCredentials()`, `executeLogout(connection)`,
`checkAuthStatus()` and
`executePromptStreaming(prompt, model, onChunk, callbacks?, systemPrompt?, runtimeOptions?)`.
Optional: `ensureSettings()` (write provider config before the first run),
`getWorkingDir()`, `prepareWorkingDir()`, `getModelArgs(model)`, `listModels()`,
`interruptAgent()`, `steerAgent(message)` (steer or queue while busy; see
`MULTI.md`) and `hasNativeSessionSupport()`.

## Authentication modes

- `oauth` (default): the client sends `initiate_auth`; the server emits
  `auth_url_generated`, `auth_device_code` or `auth_manual_token` (Claude paste
  flow); the user completes it; the server emits `auth_success`.
- `api-token` (`AGENT_AUTH_MODE=api-token`): the provider key variable is the
  source of truth. `initiate_auth` succeeds at once when it is set and reports
  `unauthenticated` otherwise, without opening a browser. Use it for Docker, CI
  and key-only environments. Key variables per provider are listed in
  [`docs/API.md`](../API.md#provider-and-frontend-environment).

`AGENT_CREDENTIALS_JSON` (setting `agentCredentials`) maps file names to
content. `credential-injector.ts` writes them into `SESSION_DIR` with mode
`0600` before the strategy starts, so an Agent starts signed in; `SESSION_DIR`
must be set with it and file names with path separators are skipped. Examples:
Gemini `{ "agent_token.txt": "ya29.xxx" }`; Claude Code and OpenCode
`{ "auth.json": "{\"api_key\":\"...\"}" }`; Codex (OAuth only)
`{ "auth.json": "{\"access_token\":\"...\"}" }`.

| Provider | `SESSION_DIR` in the image |
| --- | --- |
| `gemini`, `antigravity` | `/home/node/.gemini` |
| `claude-code` | `/home/node/.claude` |
| `openai-codex` | `/home/node/.codex` |
| `cursor` | `/home/node/.cursor` |
| `opencode` | `/home/node/.local/share/opencode` |

## Codex

Codex uses the CLI app-server protocol. Model discovery opens a separate control
process, initializes it, walks every `model/list` page and closes it. Refreshing
the model picker does not replace an active prompt process. The catalog is
account-dependent; the maintained Rails fallback lists `gpt-6.1-sol`,
`gpt-6-astra` and `gpt-6-luna`, with Sol first. Explicit saved model choices and
administrator configuration retain precedence.

The example pins CLI 0.159.3 and uses root-level `model` in `config.toml`.
Effort is passed through the app-server contract, including `max` and `ultra`.
The installed unauthenticated app-server catalog and generated schema were
checked separately from the deterministic streaming, model pagination and
session tests. Neither proves authenticated generation or account entitlement.

## Claude Code

Claude uses the Agent SDK control and streaming protocols. API-token mode uses
`ANTHROPIC_API_KEY`; OAuth uses `CLAUDE_CODE_OAUTH_TOKEN` or an OAuth token submitted
to the sign-in dialog. These credential kinds remain separate. A pasted API key
must not be exported as an OAuth token. Logout removes the saved manual token.

Model refresh calls SDK `supportedModels()` on a temporary control channel and
closes it without sending a user prompt. Account model aliases can evolve; the
example uses `haiku`, `sonnet` and `opus`. A selected Chat model takes precedence
over a provider argument; the provider argument remains available as a fallback
when Chat does not choose a model. Effort is passed through the SDK option.

Each user turn opens a fresh SDK query and resumes the saved provider session.
Text deltas, tool blocks, reasoning and usage are forwarded separately. A stream
that ends before its terminal result fails even if it produced visible text.
Interruption cancels the active query, and steering queues the next turn.

- [Anthropic model configuration](https://code.claude.com/docs/en/model-config)
- [Agent SDK TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Agent SDK release history](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)

## Gemini CLI

API-token mode configures `security.auth.selectedType: gemini-api-key`; OAuth
uses `oauth-personal` and native Google credentials. A manually submitted API key
is stored with mode 0600 in the configured Gemini directory and survives a
process restart. `GEMINI_CLI_HOME` identifies the parent of `.gemini`, while
`SESSION_DIR` identifies `.gemini` itself. Logout clears local credentials.

Prompt execution closes stdin, owns the structured output flags, and binds the
prompt with `-p=<text>`. The runtime records `init.session_id`, streams assistant
message content, forwards `tool_use`/`tool_result`, and maps terminal
`stats.input_tokens`/`stats.output_tokens`. It requires `result.status: success`;
partial output and an exit code of zero alone do not complete a turn. Existing
JSON and JSONL cache recovery remains available for visible current-turn text.

Gemini exposes model selection through CLI aliases and `/model`, rather than a
machine-readable `models` command. The maintained selector supplies these
aliases; individual model access needs an external probe. Native session UUIDs
are stored per FIBE conversation, and steering is queued for the following turn.

- [Google headless protocol](https://geminicli.com/docs/cli/headless/)
- [Google authentication](https://geminicli.com/docs/get-started/authentication/)
- [Google model selection](https://geminicli.com/docs/cli/model-selection/)

## Cursor

API-token mode accepts `CURSOR_API_KEY` or a pasted key. Native OAuth starts
`cursor-agent login` with `NO_OPEN_BROWSER=1`, forwards the browser URL, and waits
for the CLI to finish. Cancellation terminates the child. Native authentication
status uses `cursor-agent status --format json`; all processes preserve the
configured `CURSOR_CONFIG_HOME`. Native `CURSOR_AUTH_TOKEN` is also supported.

Model refresh uses account-visible `cursor-agent models` IDs, excluding display
labels and status text. An empty selected model uses Cursor's default.

Prompt execution owns `--print`, `--force`, `--output-format stream-json` and
`--stream-partial-output`. Assistant events with a timestamp and no
`model_call_id` are deltas, including repeated text. Buffered flushes with a
`model_call_id` and final snapshots repeat previously streamed text and are
suppressed. A terminal `result` must have `subtype: success` and no `is_error`;
incomplete and unsuccessful results never save a new session marker.

- [Cursor authentication](https://cursor.com/docs/cli/reference/authentication)
- [Cursor parameters](https://cursor.com/docs/cli/reference/parameters)
- [Cursor streaming output](https://cursor.com/docs/cli/reference/output-format)

## OpenCode

The sign-in dialog retains its OpenRouter API-key default. Environment keys and
injected native `auth.json` provider entries support API credentials and OAuth.
When `SESSION_DIR` ends in `opencode`, `XDG_DATA_HOME` points at its parent.
Other directory names use a local XDG alias so the CLI reads and refreshes
credentials in the same scoped home. Native entries use provider
maps such as `{ "anthropic": { "type": "api", "key": "..." } }` or the CLI's
OAuth shape. The existing manual `{ "api_key": "...", "provider": "..." }`
format remains supported through environment translation.

Model refresh runs `opencode models --refresh`, filters out its status header,
and returns unique `provider/model` IDs only after a successful process exit.
The HTTP app-server remains the default transport. The optional `run` transport
resumes the exact saved session with `--session`; a legacy marker retains its
one-time latest-session migration. The example uses supported `--auto`, while
permission settings and structured output remain owned by the runtime.

- [OpenCode CLI, authentication, models and run flags](https://opencode.ai/docs/cli/)
- [OpenCode app-server contract](https://opencode.ai/docs/server/)

## Antigravity

`agy` supports Google OAuth or a Gemini API key. `agy models` fills the selector
(account-dependent slugs); a selected model goes to `--model`, an empty one uses the
CLI default, unknown models fail. Effort low/medium/high passes through; xhigh and
max map to high.

OAuth runs the CLI in a dedicated terminal because Google reads pasted codes from
the controlling terminal; Chat forwards the URL and writes the submitted code there,
and cancel closes the terminal. Keep credentials (native and legacy injected
keyrings) in the configured `SESSION_DIR` or `ANTIGRAVITY_HOME`, not the operator's
global home. For `api-token`, provide `GEMINI_API_KEY` (aliases `GOOGLE_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY` are translated) via protected settings or the
sign-in dialog; the runtime sets `modelProvider: gemini` in
`.gemini/antigravity-cli/settings.json`, keeping other settings.

Each prompt uses `--output-format stream-json` with closed stdin; text deltas,
tool steps and terminal usage are forwarded. Success requires a terminal `SUCCESS`
result with nonempty text; interrupted, canceled, invalid, waiting, incomplete or
malformed responses fail visibly. The result's conversation ID is saved in that
FIBE conversation and only that ID is resumed (no transcript stripping or guessed
cache session); a missing session clears the marker for a fresh retry. Steering is
queued for the next turn; interruption stops the CLI.

- [Installation and authentication](https://www.antigravity.google/docs/cli/install/)
- [Headless flags, events and results](https://www.antigravity.google/docs/cli/headless/)
- [CLI reference](https://www.antigravity.google/docs/cli/reference/)

## Verification scope

Focused provider tests cover parsing, terminal errors, tools/usage, credential
formats, model discovery, session continuation and interruption/steering. They
use deterministic CLI/SDK fixtures. Antigravity additionally exercises OAuth
code entry and cancellation in a real Node terminal.

Real unauthenticated CLI checks confirmed missing-auth behavior, Cursor status
JSON and login URLs, OpenCode model output, and Gemini's installed stream-schema
implementation. Authenticated API, OAuth, account models and tool execution are
separate external-provider gates; do not claim them from fixture tests.
