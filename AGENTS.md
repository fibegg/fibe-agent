# fibe-agent: rules for contributors and coding agents

Fibe Agent is the Agent runtime: a NestJS + Fastify API (`apps/api`) that runs
one coding-agent provider (Claude Code, Codex, Gemini, Antigravity, Cursor,
OpenCode or a mock) and a React + Vite Chat client (`apps/chat`). It ships as
one container image per provider.

This file holds the rules you need to change the repository safely. Reference
material lives elsewhere; link to it instead of copying it here:

| Topic | Where |
| --- | --- |
| REST and WebSocket contract, settings promotion, persistence, local MCP tools, Gemma router, logging | [`docs/API.md`](docs/API.md) |
| Every setting with defaults | [`fibe.example.yml`](fibe.example.yml), local variables in [`.env.example`](.env.example) |
| Providers, `AgentStrategy`, auth modes, credential injection, provider runtime contracts | [`docs/providers/runtime-contracts.md`](docs/providers/runtime-contracts.md) |
| Conversations, provider sessions, steering and queueing | [`MULTI.md`](MULTI.md) |
| Pinned tool versions, pin drift report and bump routine, image checks | [`docs/runtime-tools.md`](docs/runtime-tools.md) |
| API module map and layering rules | [`apps/api/BACKEND_BOUNDARIES.md`](apps/api/BACKEND_BOUNDARIES.md) |
| Prompt library | [`prompts/README.md`](prompts/README.md) |

Keep this file under 16 KB: `scripts/ci/check-agents-md-size.mjs` fails CI
above that, because agent tools load it into every session and some cut it off
at a fixed size.

## Layout

```
apps/api/         NestJS API: /api/*, /ws (chat), /ws-terminal (PTY); Bun tests
apps/chat/        React + Vite Chat; Vitest tests
apps/e2e-api/     API end-to-end tests (Bun, against the built API)
apps/e2e-chat/    Chat end-to-end tests (Playwright)
shared/           Types, WebSocket constants and API paths shared by API and Chat
contracts/        Client contracts (generative chat, mobile client) and presets
scripts/          Image install helpers (install-provider, install-fibe, wrappers)
scripts/ci/       CI steps, image build helpers, repository checks and their tests
ci.yml            The real CI pipeline (a Compose file run as a managed job)
Dockerfile        Release image recipe (multi-stage, multi-arch)
Dockerfile.dev    Development image for `bun run dev:docker`
docker-entrypoint.sh  Container start: settings, credentials, Fibe CLI, launch
playground/       Local Agent working directory (file explorer root; not tracked)
data/             Local persisted conversations, activity and uploads (not tracked)
```

Tooling: Bun (exact version in `packageManager` in `package.json`) and Node 24
(`.nvmrc`, needed for `node-pty`). Nx runs project targets. Keep both lockfiles:
`bun.lock` is authoritative (CI runs `bun install --frozen-lockfile`) and
`package-lock.json` stays for npm compatibility; `apps/api/package-lock.json`
pins the API runtime dependencies installed in the image with `npm ci`.

## Ground rules

- A push to `main` starts the managed CI job, which runs every check and then
  builds and publishes all provider images (about 50 minutes). Never push to
  find out whether something works; run the focused checks below first.
  Building or pushing images is a separately authorized operation.
- Change behaviour together with its tests. A test that fails twice is a real
  failure; do not weaken assertions to get past it.
- Coverage is not enforced. Chat can produce a v8 report locally
  (`bunx vitest run --coverage` in `apps/chat`), but no threshold exists and CI
  does not collect coverage.
- Pin every version exactly: npm dependencies, base images, downloaded tools
  (with SHA-256 or SHA-512), provider CLIs. A missing pin fails the build; it
  never falls back to `latest`. The Fibe CLI is the deliberate exception (see
  Images).
- User-visible copy names no internal details; put diagnostics in logs.
- Configuration added for the API goes into `fibe.example.yml` (settings) or
  `.env.example` (process variables) and `docs/API.md`, not into new tables
  here.

## How CI really runs

`ci.yml` is a Docker Compose file that the Fibe platform runs as a managed job
for pushed commits. GitHub Actions is not used. Each service wraps its command in
`scripts/ci/ci-step.mjs`, which:

1. waits until the steps in `CI_REQUIRED_STEPS` have written results, and
   records `blocked` without running if any of them did not pass;
2. runs the command and writes `/results/<step>.json` with `status`,
   `exit_code`, `duration_ms` (command time), `waited_ms` (dependency wait),
   `flaky` (files reported as `FLAKY <file>`) and, on failure, the output tail.

| Step | Runs | Needs |
| --- | --- | --- |
| `ci-setup` | Toolchain check, `bun install --frozen-lockfile`, clears results | |
| `ci-lint` | `check-agents-md-size.mjs`, `check-dockerignore.mjs`, then `bun run ci:notest` (lint, build, typecheck) | setup |
| `ci-test` | `node --test` over the CI script tests, then `bun run test` (API and Chat unit tests) | setup |
| `ci-scan` | Trivy file-system scan, HIGH and CRITICAL with fixes available | setup |
| `ci-build-common` | Warms the shared `runtime-base` and `builder` image caches | lint, test, scan |
| `ci-build-<provider>` | Builds, pushes and verifies one multi-arch provider image | build-common |
| `ci-results-notify` | Waits for every expected result, prints the summary, notifies | all |

`ci-results-notify` is the only watched service. Its summary lists each step
with its duration and every flaky test file; on failure it prints a bounded,
redacted failure payload (secrets and authorization values are removed before
truncation) and uploads it when an upload token is configured. After a failed
run, read that service's logs first. Tunables passed through `ci.yml`:
`NX_PARALLEL`, `NPM_CONFIG_JOBS`, `API_TEST_CONCURRENCY`, the
`CI_DEPENDENCY_WAIT_*` and `CI_RESULTS_WAIT_*` timeouts and the `BUILDX_*` /
`BUILDKIT_*` build settings.

The API unit runner (`apps/api/scripts/run-tests.mjs`) runs each test file in
its own Bun process, two at a time (`API_TEST_CONCURRENCY`), retries a failed
file once, prints `FLAKY <file>` when the retry passes, keeps going after
failures, prints per-file durations and a summary, and fails only when a file
fails twice. Chat Vitest uses at most two workers to stay inside the 4 GB CI
container.

`bun run ci` runs the same checks locally (repository checks, CI script tests,
entrypoint test, then lint, build, typecheck and test for every project). It is
heavy; prefer the focused commands.

## Focused tests

Run the smallest set that proves the change, from the repository root unless
stated otherwise:

```sh
# API: one or more files (substring match on the path), same runner as CI
(cd apps/api && node scripts/run-tests.mjs agent-mode/agent-mode.store)
# API: a single file directly with Bun
(cd apps/api && bun test --preload ./test-setup.ts src/app/agent-mode/agent-mode.store.service.test.ts)
# Chat: one file
(cd apps/chat && bunx vitest run src/path/to/component.test.tsx)
# One project's lint or typecheck
bunx nx lint api
bunx nx typecheck chat
# CI scripts and repository checks
node --test scripts/ci/notify.test.mjs
node --test scripts/ci/provider-pins-report.test.mjs
node scripts/ci/check-dockerignore.mjs
node scripts/ci/check-agents-md-size.mjs
sh scripts/ci/entrypoint-config.test.sh
# End-to-end suites
bunx nx e2e e2e-api
bunx nx e2e e2e-chat
```

Unit tests sit next to the code (`*.test.ts`, `*.spec.ts`). API tests use
`bun:test`; Chat tests use Vitest with jsdom. Use a temporary directory and an
ephemeral port (`listen(0)`) in tests: API files run in parallel.

`scripts/ci/playground-link-path.test.sh <linux fibe binary> <artifact dir>`
is a focused Docker regression for Playground linking (runs the CLI and the
file-browser services as UID 1000 with a root-owned `/app`, without network);
it needs a Linux Fibe CLI built for the Docker engine's architecture.

For UI work without a provider key: `AGENT_PROVIDER=mock bunx nx serve api` and
`bunx nx serve chat` (API on 3000, Chat on 3100); `bun run dev` starts both.

## The `.dockerignore` allowlist

`.dockerignore` starts with `*`: everything is excluded and each path the image
needs is re-included with a `!` line. Under `scripts/` the rule is per file:

```
!scripts/
scripts/*
!scripts/install-provider.mjs
```

Every new `COPY scripts/<file>` (or any new top-level path) in either Dockerfile
needs its own `!scripts/<file>` line. Without it the build fails with "not
found" late in CI. `node scripts/ci/check-dockerignore.mjs` evaluates every
COPY/ADD source of both Dockerfiles with Docker's rules and prints the exact
line to add; it runs in `ci-lint`. A `<Dockerfile>.dockerignore` next to a
Dockerfile would take precedence over `.dockerignore` for that Dockerfile.

## Images

- One image per provider, baked in with `--build-arg AGENT_PROVIDER=<value>`,
  which installs that provider's CLI next to the shared tools (git, Docker CLI,
  ripgrep, fd, Python, Deno, uv, ffmpeg, ImageMagick, Playwright/Chromium,
  sqlite3, pandoc; versions in `docs/runtime-tools.md`). Release builds produce `linux/amd64` and `linux/arm64` and publish to GHCR as
  `<provider>-latest` (`main`), `<provider>-latest-dev` (`dev`) and
  `<provider>-<git-sha>`. Image tags: `gemini`, `antigravity`, `claude-code`,
  `openai-codex`, `cursor`, `opencode`.
- Shared runtime steps exist in both `Dockerfile` and `Dockerfile.dev`; change
  them together. The final stage copies the built `dist/` (API) and `chat/`
  bundles last so code changes do not invalidate the tool layers.
- Provider CLIs are installed by `scripts/install-provider.mjs` in both
  recipes: npm providers use the exact version from the root `package.json`;
  Cursor and Antigravity use `scripts/provider-versions.json` (Antigravity with
  per-architecture SHA-512). `bun run provider:pins` reports how far each pin
  is behind (read-only). Bump one provider at a time and run its strategy
  tests, following the routine in `docs/runtime-tools.md`.
- Tools downloaded from releases carry an explicit SHA-256 per architecture
  (for example the GitHub CLI, whose apt repository keeps only the current
  version, so an apt pin is not rebuildable).
- Fibe CLI: `scripts/ci/cli-build.mjs` resolves the latest stable published SDK
  release once before cache selection (this replaced the former fixed SDK pin);
  the build inputs carry the exact version, release commit and published
  archive checksums, both recipes verify the archive, and labels record
  `gg.fibe.cli.version`, `gg.fibe.cli.sdk.sha` and
  `gg.fibe.cli.archive.{amd64,arm64}.sha256`. An explicit stable
  `FIBE_CLI_VERSION` overrides latest; resolution or checksum errors fail the
  build. At runtime the entrypoint reuses an installed exact version, or
  resolves `latest` (or an explicit version) once per start, verifies the
  release's `checksums.txt` and logs version, commit and hash; a new release
  reaches Agents on restart. `GH_TOKEN` authenticates GitHub API requests when
  present; otherwise the public endpoint is used.

### Candidate CLI builds

To test an unreleased CLI, set `FIBE_CANDIDATE_BUILD=1`,
`FIBE_CLI_VERSION=<x.y.z-rc.n+sdk-sha7>`, `FIBE_SDK_SHA=<full SDK SHA>`,
`FIBE_CLI_BINARY_PATH=<local Linux binary>` and `FIBE_CLI_BINARY_SHA256=<hex>`;
`FIBE_CANDIDATE_PLATFORM` selects `linux/amd64` (default) or `linux/arm64`, one
architecture per checksum. The build helper verifies checksum and ELF
architecture before registry login, stages `.candidate-cli/fibe` (allowlisted,
git-ignored) and refuses to overwrite a different staged binary (move it
before selecting another candidate). Both recipes verify the staged binary and
label it with `gg.fibe.cli.binary.sha256`; nothing is downloaded. Candidate
images are tagged only `<provider>-cand-<cli-version>-<agent-sha7>-<arch>`,
use separate cache refs and never emit `latest*` or SHA tags; select them by
digest. The entrypoint uses the baked candidate and fails before any download
on a mismatched or `latest` request. The Compose CI forwards these inputs
(stable CI leaves them unset); the binary path must be readable under the
`/app` source mount (for example `/app/.candidate-cli/fibe`). Settings use `hostRoot` / `hostRootDomain`
(`HOST_ROOT` / `HOST_ROOT_DOMAIN` for child processes) and `FIBE_HOST_ID`;
removed settings fail with an error naming the replacement.

## Adding a provider

1. Strategy: `apps/api/src/app/strategies/<name>.strategy.ts` implementing
   `AgentStrategy` (`strategy.types.ts`); extend `AbstractCliStrategy` when it
   wraps a CLI. Add `<name>.strategy.test.ts` following the existing strategy
   tests.
2. Registry: add the `AGENT_PROVIDER` value and any aliases in
   `strategy-registry.service.ts`.
3. Install: add the CLI to `scripts/install-provider.mjs` (exact npm version in
   the root `package.json`, or a pinned release with checksum in
   `scripts/provider-versions.json`) and a case in
   `scripts/ci/install-provider.test.mjs`.
4. Image: add the session directory (`mkdir` and `chown` for `node`) to the
   provider conditional in the final stage of both Dockerfiles.
5. Configuration and docs: key variables in `.env.example`, settings in
   `fibe.example.yml`, the key table in `docs/API.md`, the provider and
   `SESSION_DIR` tables and a provider section in
   `docs/providers/runtime-contracts.md`, the version row in
   `docs/runtime-tools.md`, and a prompt in
   `prompts/providers/` if needed.
6. CI: a `ci-build-<provider>` service in `ci.yml` following the existing ones,
   the step in `CI_EXPECTED_STEPS` of `ci-results-notify`, the step in
   `imageSteps` and `imageStepLabels` in `scripts/ci/notify.mjs`, and a display
   name in `providerDisplayName` in `scripts/ci/lib.mjs`.
