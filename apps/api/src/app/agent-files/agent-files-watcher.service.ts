import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { Subject } from 'rxjs';
import { WorkspaceWatcher } from '../workspace-watcher';
import { AgentFilesService } from './agent-files.service';

@Injectable()
export class AgentFilesWatcherService implements OnModuleInit, OnModuleDestroy {
  private watcher: WorkspaceWatcher | null = null;
  readonly agentFilesChanged$ = new Subject<void>();

  constructor(private readonly agentFiles: AgentFilesService) {}

  onModuleInit(): void {
    const dir = this.agentFiles.getAgentWorkingDir();
    if (!dir || !existsSync(dir)) return;
    this.watcher = new WorkspaceWatcher(dir, () =>
      this.agentFilesChanged$.next(),
    );
  }

  onModuleDestroy(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}
