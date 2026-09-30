# Antigravity runtime

The agent supports Antigravity CLI (`agy`) with either Google OAuth or Gemini
API-key authentication. Keep the CLI version pinned in the provider installation
manifest and verify both published Linux architectures.

## Models and effort

Refresh the model selector to run `agy models`. Its model slugs depend on the
account and authentication provider. A selected model is passed with `--model`;
an empty model uses the CLI default. Unknown models fail instead of silently
falling back. Existing low, medium and high effort choices pass through directly;
xhigh and max use the CLI's highest supported effort, high.

## Authentication

OAuth sign-in runs the CLI in a dedicated terminal because Google reads pasted
codes from the controlling terminal. The Chat sign-in flow forwards its URL and
writes the submitted code to that terminal. Canceling closes the terminal. Native
credentials and legacy injected keyrings stay inside the configured session
home. Configure `SESSION_DIR` (or `ANTIGRAVITY_HOME`) to keep authentication
isolated from the operator's global CLI home.

For `agentAuthMode: api-token`, provide `GEMINI_API_KEY` through protected runtime
settings or submit it through the sign-in dialog. The runtime sets
`modelProvider: gemini` in `.gemini/antigravity-cli/settings.json`, preserves other
settings and passes the saved key to child processes. The agent also translates
its existing `GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` aliases into the
CLI's required `GEMINI_API_KEY` variable. A nonempty key or injected native auth
state indicates local credential availability; a successful provider response is
required to prove those credentials work.

## Responses and conversation scope

Each prompt uses `--output-format stream-json` with closed stdin. Assistant text
deltas appear immediately; tool steps and terminal token usage are forwarded to
Chat. A zero process exit alone does not mean success: the runtime requires a
terminal `SUCCESS` result with nonempty response text. Interrupted, canceled,
invalid, waiting, incomplete or malformed responses fail visibly.

The successful result's conversation ID is saved inside that FIBE conversation.
The next prompt resumes only that ID. Result text belongs to the current turn,
so there is no transcript-prefix stripping or guessed cache-session selection.
Missing provider sessions clear the saved marker and allow a fresh retry.
Steering is queued for the following turn; interruption stops the current CLI.

## Verification

The focused contract tests cover structured events, terminal states, scoped
resume, model/effort flags, API-key settings, and a real Node terminal for OAuth
code entry and cancellation. They use a deterministic CLI fixture. Live Google
OAuth, model access and tool execution additionally require a configured external
provider probe; fixture tests do not establish that provider access works.

Primary contracts checked on 2026-09-30:

- [Google installation and authentication](https://www.antigravity.google/docs/cli/install/)
- [Google headless flags, event shapes and terminal results](https://www.antigravity.google/docs/cli/headless/)
- [Google CLI reference](https://www.antigravity.google/docs/cli/reference/)
