# Runtime tools

Both Docker recipes call `scripts/install-provider.mjs`. npm provider versions
come from exact root `package.json` dependencies; Cursor and Antigravity releases
come from `scripts/provider-versions.json`. Missing versions and unknown providers
fail the build. API runtime dependencies use their own `apps/api/package-lock.json`
and `npm ci`; the workspace builder uses `bun.lock`. CI checks cached Bun and
node-gyp versions before reusing them. The Antigravity manifest includes the publisher's SHA512 for each
architecture. Cursor uses its versioned download URL and a stable runtime path.

Reviewed on 2026-09-30:

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
| Fibe CLI | 0.2.45 | [release](https://github.com/fibegg/sdk/releases/tag/v0.2.45) |
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

For upgrades, query upstream stable releases, update package locks, update both
Docker recipes' helper pins, and refresh the binary manifest. Run:

```sh
node --test scripts/ci/install-provider.test.mjs
docker build --target cli --build-arg AGENT_PROVIDER=openai_codex -t fibe-agent-cli-check .
docker run --rm fibe-agent-cli-check codex --version
```

The Fibe CLI release is pinned in the manifest and both Docker recipes. Provider
and common-cache builds pass the exact `FIBE_CLI_VERSION` and record it in the
`gg.fibe.cli.version` image label. A release override must be an exact stable
version; changing it invalidates the Fibe installation layer. Update the manifest
and Docker defaults together when publishing a new SDK release.

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
MCP initialization and tool discovery, and an HTTP MCP bridge with a local dummy
authentication header. It does not contact provider APIs or use live tokens.

## Dependency advisory review at the publication checkpoint

The coherent root npm graph reports16 affected dependency nodes, including Nx's
exact Axios1.18.1 dependency and React Router6.30.6. The separately installed API
lock audited0 findings and API source has no Axios import.

The [Axios Node data-URL advisory](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r)
requires untrusted malformed data URLs. Inspected Nx callers use configured
cloud/tool URLs, fixed provider API paths and a bundle URL returned by the
configured cache service, rather than application user requests. This does not
prove operator configuration or compromised provider responses safe. The
upstream Nx23.2.1 exact dependency is retained; no forced override or downgrade
was applied. The affected version remains recorded in release evidence.

The chat uses createRoot and BrowserRouter in declarative client mode. The
[router hydration advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg)
explicitly excludes that mode. The
[router navigation advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
remains an affected-library finding; inspected callers use fixed routes or the
fixed `/activity/` prefix with stored identifier strings, and no pass-through
external navigation URL was found. This bounded review does not establish that
future callers are safe. Router6 compatibility is retained for this release.
No CSP/header policy changes were introduced for these findings.
