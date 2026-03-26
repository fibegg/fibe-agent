---
description: Cleanup, optimize, test and commit current changes
---

# /ship — Cleanup, Optimize, Test & Commit

// turbo-all

## Steps

1. **Review all modified/new files** in the current `git diff --name-only` output. For each file:
   - Remove unused imports and variables
   - Simplify redundant logic (e.g. intermediate variables, unnecessary wrappers)
   - Extract shared helpers if code is duplicated (DRY)
   - Replace verbose patterns with concise equivalents (e.g. `.slice()` > copy + `.pop()`)
   - Use `useMemo`/`useCallback` where appropriate in React hooks
   - Ensure consistent code style with the rest of the codebase

2. **Run typecheck and lint**:
   ```bash
   bunx nx run-many -t typecheck,lint --projects=api,chat
   ```
   Fix any errors (warnings are acceptable if pre-existing).

3. **Ensure unit test coverage** for all new/modified code:
   - API services: use `bun:test`, temp dirs, same patterns as existing `*.test.ts`
   - Chat components: use `vitest` + `@testing-library/react`, same patterns as existing `*.spec.tsx`
   - Chat hooks: use `vitest` + `@testing-library/react` `renderHook`, same patterns as existing `*.spec.ts`

4. **Run all tests**:
   ```bash
   bunx nx test api 2>&1 | tail -5
   bunx nx test chat 2>&1 | tail -5
   ```
   All must pass (0 failures).

5. **Bump version** in `package.json`:
   - Read current version `X.Y.Z`
   - If `Z == 9` → bump to `X.(Y+1).0`
   - Otherwise → bump to `X.Y.(Z+1)`

6. **Commit and push**:
   ```bash
   git add -A
   git commit -m "feat: <concise summary of changes>

   - <bullet points of what changed>
   - Bump version to X.Y.Z"
   git push
   ```
