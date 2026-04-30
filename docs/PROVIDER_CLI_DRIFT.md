# Provider CLI Drift

This document answers common architectural questions regarding how `fibe-agent` handles the underlying provider CLIs (such as `claude-code`, `codex`, `gemini-cli`, etc.).

## 1. Do we pin claude/codex/etc version or let agent always download latest?
**Decision: We pin versions.**
To prevent unexpected API changes or output format drift from breaking the agent integration, we strictly pin the CLI versions in `package.json`. 
- For Docker builds (`Dockerfile` and `Dockerfile.dev`), the CLI installation steps extract the exact version from `package.json` rather than pulling `latest`. This guarantees that the containerized agent operates with tested provider behavior.
- For local/standalone setups, it is recommended to run `npm install` inside the agent repository to ensure the correct pinned version of the CLI is used.

## 2. Should this be configured by user in fibe-agent-standalone / rails-managed?
**Decision: Provider versions are tied to agent releases.**
By default, the agent expects the pinned version to guarantee stability. However, advanced users running `fibe-agent-standalone` can manually install a different version globally. If version behavior deviates, they might encounter parsing or connectivity issues.
In future iterations, we may surface `cliVersion` via `FibeSettings` (`FIBE_CLI_VERSION` in Rails) to conditionally switch binaries or use `npx @anthropic-ai/claude-code@<version>` for dynamic on-the-fly resolution, though this incurs download overhead.

## 3. E2E tests for versions compatibility (matrix)
**Decision: Add compatibility matrix to CI (Planned).**
To formally support multiple CLI versions concurrently, our E2E framework must execute tests across a compatibility matrix. This would involve configuring GitHub Actions (or the CI pipeline) to test the agent with N-1 and N-2 versions of the CLIs. Currently, the test suite targets the single pinned version specified in `package.json`.

## 4. Improved deprecation warnings etc — to have time to adjust
**Decision: Implemented at initialization/runtime.**
As CLI tools introduce deprecations, warnings can be intercepted via stderr parsing during initialization.
If a provider releases a breaking change (e.g., Anthropic changing authentication flows), the pinned version strategy buffers the agent from immediate failure, allowing developers time to implement and release compatibility patches along with corresponding deprecation notices in the agent logs.
