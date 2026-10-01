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

## Configuration

Provider versions belong to agent releases. Standalone users can install a different global version, but parsing or connectivity may break.

`cliVersion` controls the runtime `fibe` CLI, not provider CLIs. The Docker entrypoint reads `FIBE_VERSION`, `FIBE_CLI_VERSION`, or `cliVersion` from `fibe.yml`. No strategy switches provider binaries or invokes `npx @provider/cli@<version>` dynamically.

## Compatibility matrix

Planned, not implemented. Supporting several CLI versions requires CI coverage for N-1 and N-2 releases. Tests currently use the version in `package.json`.

## Deprecation warnings

Planned, not implemented. Provider strategies may parse transport-specific stderr, but `AbstractCliStrategy` does not classify deprecation warnings. Pins protect supported providers; CI and provider tests must catch protocol drift when pinned releases change.
