# Provider CLI drift

How `fibe-agent` manages provider CLI versions.

## Version policy

Provider CLIs are pinned by the shared image installer for both production and
development images. `package.json` declares exact versions for Claude Code,
OpenAI Codex, Gemini and OpenCode. `scripts/provider-versions.json` declares
Cursor's versioned download and Antigravity's architecture-specific archives
and checksums. Missing pins fail installation rather than selecting latest.

The installed CLI must pass `--version` and `--help`. Refresh pins against
official registries/installers, then verify provider contracts before publishing.
Local and standalone setups should use `bun install` and the lockfile. Use npm
only for compatibility tests.

## Drift report

`scripts/provider-pins-report.mjs` (`bun run provider:pins`) prints, for each
provider CLI pinned in `package.json` and `scripts/provider-versions.json`, the
pinned version, the latest version published on npm, a status (`current`,
`behind`, `ahead`, `unknown`) and the date and age in days of the commit that
introduced the pin. The Claude Agent SDK is listed with Claude Code because the
two are bumped together. Cursor and Antigravity have no registry lookup and show
`check installer`.

The report is read-only: it never edits a pin. It runs `npm view <package>
version` for each npm pin; `--offline` skips the registry and still prints pins
and ages. `--json` prints the rows for scripts, and `--root <dir>` reads another
checkout. Pin ages need Git history; a shallow clone shows `unknown`.

## Bump routine

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
4. Update the version table in `docs/runtime-tools.md` and any example pin in
   `docs/providers/`.
5. Run `node --test scripts/ci/install-provider.test.mjs` and that provider's
   strategy tests under `apps/api/src/app/strategies/`, then the provider's
   consumer cases at the next integration checkpoint. Provider-gated skips are
   reported as skips, not passes.
6. Commit the bump on its own, naming the provider and both versions. Building
   and publishing images remains a separate authorized operation; publish one
   bump and confirm the new image before starting the next provider.

If a bump breaks a strategy, keep the previous pin and record the blocking
change instead of carrying several providers forward at once.

## Configuration

Provider versions belong to agent releases. Standalone users can install a different global version, but parsing or connectivity may break.

`cliVersion` controls the runtime `fibe` CLI, not provider CLIs. The Docker entrypoint reads `FIBE_VERSION`, `FIBE_CLI_VERSION`, or `cliVersion` from `fibe.yml`. No strategy switches provider binaries or invokes `npx @provider/cli@<version>` dynamically.

## Compatibility matrix

Planned, not implemented. Supporting several CLI versions requires CI coverage for N-1 and N-2 releases. Tests currently use the version in `package.json`.

## Deprecation warnings

Planned, not implemented. Provider strategies may parse transport-specific stderr, but `AbstractCliStrategy` does not classify deprecation warnings. Pins protect supported providers; CI and provider tests must catch protocol drift when pinned releases change.
