# Prompts

Reference library of **system prompt** variants for fibe-agent providers. Nothing here is loaded by path: the runtime prompt is the `systemPrompt` setting (managed by Fibe, set in `fibe.yml` or `FIBE_SETTINGS_JSON`), and without it the API loads the bundled fallback `dist/assets/SYSTEM_PROMPT.md` (source `apps/api/src/assets/SYSTEM_PROMPT.md`). To use a prompt, copy its contents into `systemPrompt`. Provider strategies run in full-access modes where applicable, so policy comes from runtime configuration plus the injected prompt.

- `base/`: provider-agnostic prompts; start here. `code-playground.md` is the default for code-playground sessions.
- `providers/<provider>.md`: one per provider (`gemini`, `antigravity`, `claude-code`, `openai-codex`, `opencode`, `cursor`), adding flag, session and quirk notes for that CLI.

`apps/api/src/assets/system-prompt.test.ts` checks these files exist, are non-empty and keep required phrases (for example "current directory").

## Adding a prompt

1. Add `base/<use-case>.md` or `providers/<provider>.md` (drafts: `base/<use-case>.draft.md`) in plain Markdown; the CLI reads it as raw text.
2. Try it by copying it into `systemPrompt`, then `bun run dev`.
3. Note behaviour differences in a comment block at the top of the file.
