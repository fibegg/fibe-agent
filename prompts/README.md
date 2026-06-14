# Prompts

This directory is an authoring/reference library for **system prompt** variants used by fibe-agent AI providers.

Runtime prompt content is managed by Fibe/Rails and delivered to fibe-agent through the `systemPrompt` setting in `fibe.yml` or `FIBE_SETTINGS_JSON`. If that setting is absent, fibe-agent loads the bundled fallback at `dist/assets/SYSTEM_PROMPT.md`.

The Markdown files here are not loaded automatically by path. To use one, copy its contents into the runtime-managed `systemPrompt` value.

---

## Directory layout

```
prompts/
├── README.md                   ← this file
├── base/
│   └── code-playground.md      ← canonical prompt for the code-playground use case
└── providers/
    ├── gemini.md               ← Gemini CLI-specific system prompt
    ├── antigravity.md          ← Antigravity CLI-specific system prompt
    ├── claude-code.md          ← Claude Code-specific system prompt
    ├── openai-codex.md         ← OpenAI Codex-specific system prompt
    ├── opencode.md             ← OpenCode-specific system prompt
    └── cursor.md               ← Cursor Agent-specific system prompt
```

### `base/`

Provider-agnostic prompts that work across all supported agents. Start here when creating a new prompt — it should describe the task, constraints, and expected behaviour without relying on any provider-specific syntax or behaviour.

`code-playground.md` is the recommended default for all code-generation playground sessions.

### `providers/`

Provider-specific prompts that extend the base behaviour with tweaks for a particular CLI tool (flag handling, session semantics, known quirks, etc.). Use these as reference material when tuning a runtime-managed prompt for a known provider.

---

## How to wire a prompt

Set the `systemPrompt` Fibe setting in `fibe.yml`:

```yaml
systemPrompt: |
  You are a TypeScript expert.
  Focus only on the src/ directory.
```

For env-only local runs, put the same value in `FIBE_SETTINGS_JSON`:

```sh
FIBE_SETTINGS_JSON='{"systemPrompt":"You are a TypeScript expert. Focus only on the src/ directory."}'
```

> **Note:** The built-in fallback prompt is `apps/api/src/assets/SYSTEM_PROMPT.md`, which is bundled into the Docker image at `dist/assets/SYSTEM_PROMPT.md`. It is used when no `systemPrompt` setting is configured.

---

## Adding a new prompt

1. Create a `.md` file in the appropriate subdirectory (`base/` for generic, `providers/` for provider-specific).
2. Write the prompt in plain Markdown — the agent CLI reads it as raw text.
3. Test it locally by copying the prompt content into `systemPrompt` in `fibe.yml` or `FIBE_SETTINGS_JSON`, then running `bun run dev`.
4. Document any notable behaviour differences in a comment block at the top of the file.

### Naming conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base / use-case prompt | `base/<use-case>.md` | `base/code-review.md` |
| Provider-specific prompt | `providers/<provider>.md` | `providers/gemini.md` |
| Experiment / draft | `base/<use-case>.draft.md` | `base/code-playground.draft.md` |
