import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { watch } from 'node:fs';
import { existsSync } from 'node:fs';
import { Subject } from 'rxjs';
import { ConfigService } from '../config/config.service';

const DEBOUNCE_MS = 500;

@Injectable()
export class PlaygroundWatcherService implements OnModuleInit, OnModuleDestroy {
  private watcher: ReturnType<typeof watch> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly playgroundChanged$ = new Subject<void>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const dir = this.config.getPlaygroundsDir();
    if (!existsSync(dir)) return;
    try {
      this.watcher = watch(dir, { recursive: true }, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          this.playgroundChanged$.next();
        }, DEBOUNCE_MS);
      });
    } catch {
      /* watch may fail on some environments */
    }
  }

  onModuleDestroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
