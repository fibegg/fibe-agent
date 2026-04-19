# Prompts

This directory is the single source of truth for all **system prompts** used by the fibe-agent AI providers.

Prompts are plain Markdown files. They are loaded at runtime via the `SYSTEM_PROMPT_PATH` environment variable and injected into the agent before each conversation run.

---

## Directory layout

```
prompts/
├── README.md                   ← this file
├── base/
│   └── code-playground.md      ← canonical prompt for the code-playground use case
└── providers/
    ├── gemini.md               ← Gemini CLI-specific system prompt
    ├── claude-code.md          ← Claude Code-specific system prompt
    ├── openai-codex.md         ← OpenAI Codex-specific system prompt
    ├── opencode.md             ← OpenCode-specific system prompt
    └── cursor.md               ← Cursor Agent-specific system prompt
```

### `base/`

Provider-agnostic prompts that work across all supported agents. Start here when creating a new prompt — it should describe the task, constraints, and expected behaviour without relying on any provider-specific syntax or behaviour.

`code-playground.md` is the recommended default for all code-generation playground sessions.

### `providers/`

Provider-specific prompts that extend the base behaviour with tweaks for a particular CLI tool (flag handling, session semantics, known quirks, etc.). Use these as the `SYSTEM_PROMPT_PATH` when you know which provider will run, or as a reference when tuning a base prompt.

---

## How to wire a prompt

Set `SYSTEM_PROMPT_PATH` in your `.env` (or Docker environment) to the path of the desired prompt file **relative to the working directory** of the API process:

```sh
# Use the base code-playground prompt
SYSTEM_PROMPT_PATH=./prompts/base/code-playground.md

# Use the Gemini-specific prompt
SYSTEM_PROMPT_PATH=./prompts/providers/gemini.md
```

Alternatively, inline a short prompt directly via `SYSTEM_PROMPT` (takes precedence over the file):

```sh
SYSTEM_PROMPT="You are a TypeScript expert. Focus only on the src/ directory."
```

> **Note:** The built-in fallback prompt is `apps/api/src/assets/SYSTEM_PROMPT.md`, which is bundled into the Docker image at `dist/assets/SYSTEM_PROMPT.md`. It is used when neither `SYSTEM_PROMPT` nor `SYSTEM_PROMPT_PATH` point to an existing file.

---

## Adding a new prompt

1. Create a `.md` file in the appropriate subdirectory (`base/` for generic, `providers/` for provider-specific).
2. Write the prompt in plain Markdown — the agent CLI reads it as raw text.
3. Test it locally by setting `SYSTEM_PROMPT_PATH` and running `bun run dev`.
4. Document any notable behaviour differences in a comment block at the top of the file.

### Naming conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base / use-case prompt | `base/<use-case>.md` | `base/code-review.md` |
| Provider-specific prompt | `providers/<provider>.md` | `providers/gemini.md` |
| Experiment / draft | `base/<use-case>.draft.md` | `base/code-playground.draft.md` |
