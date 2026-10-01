# Provider CLI drift

How `fibe-agent` manages provider CLI versions.

## Version policy

Pin npm-distributed CLIs in `package.json` when possible. Codex and Gemini are the current exceptions.

- Docker builds extract Claude Code, OpenAI Codex, and OpenCode versions from `package.json`.
- OpenAI Codex is currently declared as the caret range `^0.125.0`. Docker extracts `0.125.0` from that string, but local installs can float within the `0.125.x` range unless the lockfile is used.
- Gemini is absent from `package.json` and both Dockerfiles install its latest release. Treat it as higher risk until pinned.
- Cursor and Antigravity (`agy`) use official installers and are checked with `--help` during builds. Re-audit them when their installers change or support version pins.
- Local and standalone setups should use `bun install` and the lockfile. Use npm only for compatibility tests.

## Configuration

Provider versions belong to agent releases. Standalone users can install a different global version, but parsing or connectivity may break.

`cliVersion` controls the runtime `fibe` CLI, not provider CLIs. The Docker entrypoint reads `FIBE_VERSION`, `FIBE_CLI_VERSION`, or `cliVersion` from `fibe.yml`. No strategy switches provider binaries or invokes `npx @provider/cli@<version>` dynamically.

## Compatibility matrix

Planned, not implemented. Supporting several CLI versions requires CI coverage for N-1 and N-2 releases. Tests currently use the version in `package.json`.

## Deprecation warnings

Planned, not implemented. Provider strategies may parse transport-specific stderr, but `AbstractCliStrategy` does not classify deprecation warnings. Pins protect supported providers; CI and provider tests must catch drift in unpinned CLIs, especially Gemini.
