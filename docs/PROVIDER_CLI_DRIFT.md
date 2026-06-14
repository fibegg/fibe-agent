# Provider CLI Drift

This document answers common architectural questions regarding how `fibe-agent` handles the underlying provider CLIs (such as `claude-code`, `codex`, `gemini-cli`, `agy`, etc.).

## 1. Do we pin claude/codex/etc version or let agent always download latest?
**Decision: We pin versions when the provider publishes an npm package we consume directly; Codex and Gemini are the current exceptions.**
To prevent unexpected API changes or output format drift from breaking the agent integration, npm-distributed CLI versions should be pinned in `package.json` when possible.
- For Docker builds (`Dockerfile` and `Dockerfile.dev`), Claude Code, OpenAI Codex, and OpenCode installation steps extract the version from `package.json`. This keeps those containerized providers on tested CLI behavior.
- OpenAI Codex is currently declared as the caret range `^0.125.0`. Docker extracts `0.125.0` from that string, but local installs can float within the `0.125.x` range unless the lockfile is used.
- Gemini currently installs with `npm install -g @google/gemini-cli` in both Dockerfiles and `@google/gemini-cli` is not listed in `package.json`; Gemini images therefore pull the latest upstream CLI at build time. Treat Gemini CLI drift as a known higher-risk exception until it is pinned.
- Binary-installer providers such as Cursor and Antigravity (`agy`) are installed from their official install scripts and verified with `--help` during image build. They must be re-audited when those upstream installers change behavior or add a stable version pinning interface.
- For local/standalone setups, run `bun install` inside the agent repository to use the project package manager (`packageManager: bun@1.3.11`) and lockfile. Use npm only when intentionally testing npm compatibility.

## 2. Should this be configured by user in fibe-agent-standalone / rails-managed?
**Decision: Provider versions are tied to agent releases.**
By default, the agent expects the pinned version to guarantee stability. However, advanced users running `fibe-agent-standalone` can manually install a different version globally. If version behavior deviates, they might encounter parsing or connectivity issues.
`cliVersion` is already present in `FibeSettings`, promoted to `FIBE_CLI_VERSION`, and exposed through `ConfigService.getCliVersion()`. Runtime binary selection based on that value is still future work; no strategy currently switches binaries or invokes `npx @provider/cli@<version>` dynamically.

## 3. E2E tests for versions compatibility (matrix)
**Decision: Add compatibility matrix to CI (Planned).**
To formally support multiple CLI versions concurrently, our E2E framework must execute tests across a compatibility matrix. This would involve configuring GitHub Actions (or the CI pipeline) to test the agent with N-1 and N-2 versions of the CLIs. Currently, the test suite targets the single pinned version specified in `package.json`.

## 4. Improved deprecation warnings etc — to have time to adjust
**Decision: Planned, not implemented.**
There is no generic deprecation-warning interception layer today. Provider strategies may parse stderr for transport-specific output, but `AbstractCliStrategy` does not classify deprecation warnings during initialization/runtime.

For pinned providers, version pinning is the actual buffer against sudden upstream breakage. For unpinned providers, especially Gemini, compatibility must be monitored through CI/build verification and provider-specific tests until warning classification exists.
