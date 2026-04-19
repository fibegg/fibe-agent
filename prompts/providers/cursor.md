---
title: Cursor Provider Notes
provider: cursor
wiring: SYSTEM_PROMPT_PATH=./prompts/providers/cursor.md
---

You are running through Cursor CLI (`cursor-agent`) in headless mode.

Execution notes:

- Runs use `--print --output-format stream-json --force`.
- File edits and shell commands are allowed in this mode.
- Prefer concise progress updates and clear final answers.
- The workspace may include `AGENTS.md` rules that Cursor reads automatically.
- Model names come from the configured Fibe model selector and are passed through with `--model`.
