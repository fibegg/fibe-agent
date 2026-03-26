---
description: How to implement the Playground Selector feature
---

# Playground Selector

A dropdown in the chat header that browses the host `PLAYROOMS_ROOT` directory and symlinks a selected dir as `./playground`.

## Backend

### 1. `apps/api/src/app/config/config.service.ts`
Add method:
```ts
getPlayroomsRoot(): string {
  return process.env.PLAYROOMS_ROOT ?? '/opt/fibe';
}
```

### 2. `apps/api/src/app/playgrounds/playroom-browser.service.ts` [NEW]
NestJS `@Injectable()` service with:
- `browse(relPath = '')` — `readdir(withFileTypes)` under `PLAYROOMS_ROOT/<relPath>`, skip hidden entries, return `{ name, path, type }[]` (dirs first, sorted). Guard path traversal via `relative()`.
- `linkPlayground(relPath)` — resolve target under `PLAYROOMS_ROOT`, `lstat` + `unlink` existing symlink on `PLAYGROUNDS_DIR`, then `symlink(target, playgroundDir, 'dir')`. Return `{ linkedPath }`.
- `getCurrentLink()` — `lstat` + `readlink` on `PLAYGROUNDS_DIR`, return relative path to `PLAYROOMS_ROOT` or null.

### 3. `apps/api/src/app/playgrounds/playgrounds.controller.ts`
Add `PlayroomBrowserService` to constructor, add endpoints:
- `@Get('playrooms/browse')` — `@Query('path')`, calls `browse(path ?? '')`
- `@Post('playrooms/link')` — `@Body() { path }`, calls `linkPlayground(path)`, returns `{ ok, linkedPath }`
- `@Get('playrooms/current')` — calls `getCurrentLink()`, returns `{ current }`

### 4. `apps/api/src/app/app.module.ts`
Import and register `PlayroomBrowserService` in providers.

### 5. `shared/api-paths.ts`
Add:
```ts
PLAYROOMS_BROWSE: '/api/playrooms/browse',
PLAYROOMS_LINK: '/api/playrooms/link',
PLAYROOMS_CURRENT: '/api/playrooms/current',
```

### 6. `.env.example`
Document `PLAYROOMS_ROOT` (default `/opt/fibe`).

## Frontend

### 7. `apps/chat/src/app/chat/use-playground-selector.ts` [NEW]
Hook returning: `{ entries, loading, error, currentLink, linking, canGoBack, breadcrumbs, browseTo, goBack, goToRoot, linkPlayground, open }`.
- `open()` → fetches root entries + current link
- `browseTo(path)` → push current path to history stack, fetch new path
- `goBack()` → pop history, fetch previous
- `goToRoot()` → reset history, fetch ''
- `linkPlayground(path)` → POST to `PLAYROOMS_LINK`
- `breadcrumbs` = `useMemo(() => browsePath.split('/').filter(Boolean))`

### 8. `apps/chat/src/app/chat/playground-selector.tsx` [NEW]
Dropdown component (same portal pattern as `ModelSelector`):
- Trigger button: folder icon + displayLabel (last segment of currentLink or "Select Playground") + chevron
- Panel: toolbar (back btn if `canGoBack`, home btn, breadcrumbs) + entry list (FolderOpen icon + name + ChevronRight for dirs, link icon on hover for dirs) + footer showing current link
- Click dir entry → `onBrowse(entry.path)`
- Click link icon → `onLink(entry.path)`, close panel on success

### 9. `apps/chat/src/app/chat/chat-header.tsx`
Add playground selector props to `ChatHeaderProps`, render `<PlaygroundSelector>` between `<ModelSelector>` and terminal toggle button. Conditionally render when all playground callbacks are provided.

### 10. `apps/chat/src/app/pages/chat-page.tsx`
Import `usePlaygroundSelector`, instantiate hook, pass all props to `<ChatHeader>`. Set `onPlaygroundLinked={refetchPlaygrounds}`.

## Tests

- **API**: `playroom-browser.service.test.ts` — use `bun:test`, temp dirs (`mkdtempSync`), test browse (empty, sorted, hidden, subdirs, traversal, not-found), linkPlayground (create, replace, empty, not-found), getCurrentLink (regular dir, symlink).
- **Chat component**: `playground-selector.spec.tsx` — `vitest` + `@testing-library/react`, test visibility, trigger label, dropdown open, entry rendering, back/root/breadcrumbs, loading/error/empty states, linked indicator.
- **Chat hook**: `use-playground-selector.spec.ts` — `vitest` + `renderHook`, mock `apiRequest`, test open/browse/goBack/goToRoot/linkPlayground/errors.
