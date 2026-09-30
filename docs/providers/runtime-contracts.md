# Provider runtime contracts

These contracts were checked against official documentation and the installed
Linux CLI distributions on 2026-09-30. Installation versions belong in the
provider manifest; example `cliVersion` values describe this checked snapshot.

Use an explicit `SESSION_DIR` for native authentication state. Credential
availability checks do not prove that a key works, that OAuth remains valid, or
that the account can use a selected model. Run configured external probes for
that evidence and report unconfigured probes as skipped.

## Codex

Codex uses the CLI app-server protocol. Model discovery opens a separate control
process, initializes it, walks every `model/list` page and closes it. Refreshing
the model picker does not replace an active prompt process. The catalog is
account-dependent; the maintained Rails fallback lists `gpt-6.1-sol`,
`gpt-6-astra` and `gpt-6-luna`, with Sol first. Explicit saved model choices and
administrator configuration retain precedence.

The example pins CLI 0.159.2 and uses root-level `model` in `config.toml`.
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

## Verification scope

Focused provider tests cover parsing, terminal errors, tools/usage, credential
formats, model discovery, session continuation and interruption/steering. They
use deterministic CLI/SDK fixtures. Antigravity additionally exercises OAuth
code entry in a real Node terminal; see `antigravity.md` for its protocol.

Real unauthenticated CLI checks confirmed missing-auth behavior, Cursor status
JSON and login URLs, OpenCode model output, and Gemini's installed stream-schema
implementation. Authenticated API, OAuth, account models and tool execution are
separate external-provider gates; do not claim them from fixture tests.
