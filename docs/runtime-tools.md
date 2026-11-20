# Runtime tools

Both Docker recipes call `scripts/install-provider.mjs`. npm provider versions
come from exact root `package.json` dependencies; Cursor and Antigravity releases
come from `scripts/provider-versions.json`. Missing versions and unknown providers
fail the build (never latest); each installed CLI must pass `--version` and `--help`.
Provider versions belong to agent releases: standalone installs of other versions may
break parsing or connectivity, and only the pinned version is tested. API runtime dependencies use their own `apps/api/package-lock.json`
and `npm ci`; the workspace builder uses `bun.lock`. CI checks cached Bun and
node-gyp versions before reusing them. The Antigravity manifest includes the publisher's SHA512 for each
architecture. Cursor uses its versioned download URL and a stable runtime path.

Reviewed on 2026-09-30. `bun run provider:pins` compares the provider pins with
the latest published versions; see [Pin drift and bumps](#pin-drift-and-bumps).

| Tool | Version | Upstream source |
| --- | --- | --- |
| Claude Code | 2.1.286 | [npm](https://www.npmjs.com/package/@anthropic-ai/claude-code) |
| Claude Agent SDK | 0.3.286 | [npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Anthropic SDK | 0.131.0 | [npm](https://www.npmjs.com/package/@anthropic-ai/sdk) |
| Codex | 0.159.3 | [npm](https://www.npmjs.com/package/@openai/codex) |
| Gemini CLI | 0.62.0 | [npm](https://www.npmjs.com/package/@google/gemini-cli) |
| OpenCode | 1.18.34 | [npm](https://www.npmjs.com/package/opencode-ai) |
| Cursor Agent | 2026.09.28-64d2043 | [installer](https://cursor.com/install) |
| Antigravity | 1.2.14 | [installer](https://antigravity.google/cli/install.sh) |
| Fibe CLI | Latest stable at build/startup | [releases](https://github.com/fibegg/sdk/releases/latest) |
| Bun | 1.4.2 | [release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2) |
| Docker CLI | 29.8.1 | [release](https://github.com/moby/moby/releases/tag/docker-v29.8.1) |
| GitHub CLI | 2.102.0 | [release](https://github.com/cli/cli/releases/tag/v2.102.0) |
| GitHub MCP | 1.12.2 | [release](https://github.com/github/github-mcp-server/releases/tag/v1.12.2) |
| Gitea MCP | 1.8.0 | [module](https://gitea.com/gitea/gitea-mcp) |
| uv | 0.12.21 | [release](https://github.com/astral-sh/uv/releases/tag/0.12.21) |
| Deno | 2.9.7 | [release](https://github.com/denoland/deno/releases/tag/v2.9.7) |
| node-gyp | 13.0.2 | [npm](https://www.npmjs.com/package/node-gyp) |
| mcp-remote | 0.14.3 | [npm](https://www.npmjs.com/package/mcp-remote) |
| Playwright MCP | 0.0.83 | [npm](https://www.npmjs.com/package/@playwright/mcp) |

Playwright MCP 0.0.83 depends on Playwright
`1.64.0-alpha-1790635538000`; the Docker browser installer uses this exact version
so its cached Chromium matches the helper. The application test runner uses the
stable Playwright release independently. Chrome is installed on amd64; arm64 uses
Debian Chromium at the same `CHROME_BIN` path. The Gitea MCP builder uses Go 1.27.1.

Chrome's sandbox needs user namespaces, which many Agent hosts deny to containers
(Docker's seccomp/AppArmor defaults, Ubuntu's `apparmor_restrict_unprivileged_userns`).
`scripts/chrome-sandbox-wrapper.sh` therefore replaces each Chrome/Chromium launcher and
adds `--no-sandbox` only where `unshare` cannot create them (`FIBE_CHROME_SANDBOX=1` opts
out); the MCP config writer also adds `--no-sandbox` to Playwright MCP entries that make
no sandbox choice.

## Pin drift and bumps

`scripts/provider-pins-report.mjs` (`bun run provider:pins`) prints, for each
provider CLI pinned in `package.json` and `scripts/provider-versions.json`, the
pinned version, the latest version published on npm, a status (`current`,
`behind`, `ahead`, `unknown`) and the date and age in days of the commit that
introduced the pin. The Claude Agent SDK is listed with Claude Code because the
two are bumped together, once for `package.json` and once for
`apps/api/package.json`, which the API runtime installs. Cursor and Antigravity
have no registry lookup and show `check installer`. The report is read-only: it
runs `npm view <package> version` per npm pin and never edits a pin. `--offline`
skips the registry and still prints pins and ages, `--json` prints the rows for
scripts and `--root <dir>` reads another checkout. Pin ages need Git history; a
shallow clone shows `unknown`.

Review pins once a month and before an image rebuild meant to pick up provider
releases. Bump one provider at a time:

1. Run `bun run provider:pins` and pick one provider that is `behind`.
2. Read that provider's release notes between the pinned and the new version for
   protocol, flag, authentication, configuration and model-list changes.
3. Change only that provider's exact pin. Claude Code means
   `@anthropic-ai/claude-code` and `@anthropic-ai/claude-agent-sdk` together,
   including the Agent SDK pin in `apps/api/package.json` and its lockfile. Cursor
   and Antigravity change in `scripts/provider-versions.json`: version, download
   URLs and, for Antigravity, the publisher's SHA512 for each architecture.
   Refresh `bun.lock` with `bun install`.
4. Update the version table above and any example pin in `docs/providers/`.
5. Run `node --test scripts/ci/install-provider.test.mjs` and that provider's
   strategy tests under `apps/api/src/app/strategies/`, then the provider's
   consumer cases at the next integration checkpoint. Provider-gated skips are
   reported as skips, not passes.
6. Commit the bump on its own, naming the provider and both versions. Building
   and publishing images remains a separate authorized operation; publish one
   bump and confirm the new image before starting the next provider.

If a bump breaks a strategy, keep the previous pin and record the blocking
change instead of carrying several providers forward at once.

## Other tools and image checks

For other tools, query upstream stable releases, update package locks, update
both Docker recipes' helper pins, and refresh the binary manifest. To check an
installed CLI in a built stage:

```sh
node --test scripts/ci/install-provider.test.mjs
docker build --target cli --build-arg AGENT_PROVIDER=openai_codex -t fibe-agent-cli-check .
docker run --rm fibe-agent-cli-check codex --version
```

Fibe CLI release resolution, verification and labels are described in `AGENTS.md` (Images, Candidate CLI builds); old Fibe fields in the provider manifest are no longer read. `cliVersion` (or `FIBE_VERSION` / `FIBE_CLI_VERSION`) selects only the runtime `fibe` CLI; no strategy switches provider binaries or runs `npx @provider/cli@<version>`. Each unpinned start checks the latest stable release before starting the Agent. The entrypoint exchanges the container’s Fibe runtime key and selected GitHub connection for an installation token over HTTP. A standalone container can supply its owner’s OAuth token in `GH_TOKEN` or `GITHUB_TOKEN`. If the owner credential is absent or refused, startup logs the skipped check and uses the verified image CLI. A matching verified CLI skips the asset download. A failed install leaves the previous CLI in place. For a direct development-image build, export the build owner's `GH_TOKEN` and resolve the release first (Node 24+):

```sh
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process';
import { resolveCliBuild, cliBuildArgs } from './scripts/ci/cli-build.mjs';
const release = await resolveCliBuild();
const result = spawnSync('docker', ['build', '-f', 'Dockerfile.dev',
  '--build-arg', `FIBE_CLI_VERSION=${release.version}`, ...cliBuildArgs(release),
  '-t', 'fibe-agent-dev', '.'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
JS
```

Repeat the CLI stage for all six providers on `linux/amd64` and `linux/arm64`.
Each installation executes the binary's version and help commands during the
build. This checks packaging and startup; credentialed provider execution still
requires the external provider probes.

Check common runtime tools in a built image as its non-root user:

```sh
docker run --rm --user node --entrypoint node \
  -v "$PWD/scripts:/audit:ro" <runtime-image> /audit/ci/runtime-smoke.mjs
```

The smoke check exercises the native terminal addon, both browser launch paths,
Chrome screenshots without sandbox flags (Playwright Chrome channel, the CLI and
the Playwright MCP), MCP initialization and tool discovery, and an HTTP MCP bridge with a local dummy
authentication header. It does not contact provider APIs or use live tokens.

## Dependency advisories

Retained knowingly at the last publication review: Nx's exact Axios 1.18.1
([data-URL advisory](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r)
needs untrusted malformed data URLs; Nx callers use configured URLs; the API lock has
no Axios) and React Router 6.30.6 (chat uses declarative `BrowserRouter`, excluded from
the [hydration advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg);
the [navigation advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
applies to the library, but callers use fixed routes or the `/activity/` prefix). This bounded
review does not prove operator-configured or compromised provider URLs, or future
callers, safe. No override, downgrade or CSP change was made; recheck when callers change.
