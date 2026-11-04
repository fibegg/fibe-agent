import { watch, type FSWatcher } from 'chokidar';

export { isGeneratedWorkspacePath } from './generated-workspace-paths';
import { isGeneratedWorkspacePath } from './generated-workspace-paths';

export const WORKSPACE_REFRESH_MS = 2000;

export class WorkspaceWatcher {
  readonly watcher: FSWatcher;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: string, changed: () => void) {
    this.watcher = watch(root, {
      ignoreInitial: true,
      ignored: (path) => isGeneratedWorkspacePath(root, path),
      followSymlinks: true, // Repositories may be linked into the shared directory.
    });
    this.watcher.on('all', () => {
      // A fixed window also refreshes during sustained source edits, without
      // starving the UI or refreshing every 500 ms during a build.
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        changed();
      }, WORKSPACE_REFRESH_MS);
    });
    this.watcher.on('error', () => {
      /* Best-effort file explorer updates. */
    });
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.watcher.close();
  }
}
