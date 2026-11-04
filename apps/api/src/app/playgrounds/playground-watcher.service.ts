import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { Subject } from 'rxjs';
import { WorkspaceWatcher } from '../workspace-watcher';
import { ConfigService } from '../config/config.service';

@Injectable()
export class PlaygroundWatcherService implements OnModuleInit, OnModuleDestroy {
  private watcher: WorkspaceWatcher | null = null;
  readonly playgroundChanged$ = new Subject<void>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const dir = this.config.getPlaygroundsDir();
    if (!dir || !existsSync(dir)) return;
    this.watcher = new WorkspaceWatcher(dir, () =>
      this.playgroundChanged$.next(),
    );
  }

  onModuleDestroy(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}
