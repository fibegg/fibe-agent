import { join } from 'path';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigService } from './config/config.service';
import { AgentAuthGuard } from './auth/agent-auth.guard';
import { AuthController } from './auth/auth.controller';
import { ActivityController } from './activity/activity.controller';
import { ActivityStoreService } from './activity-store/activity-store.service';
import { MessageStoreService } from './message-store/message-store.service';
import { MessagesController } from './messages/messages.controller';
import { ModelStoreService } from './model-store/model-store.service';
import { ModelOptionsController } from './model-options/model-options.controller';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StrategyRegistryService } from './strategies/strategy-registry.service';
import { UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';
import { PlaygroundsController } from './playgrounds/playgrounds.controller';
import { PlaygroundsService } from './playgrounds/playgrounds.service';
import { PlaygroundWatcherService } from './playgrounds/playground-watcher.service';
import { PhoenixSyncService } from './phoenix-sync/phoenix-sync.service';
import { GithubTokenRefreshService } from './github-token-refresh/github-token-refresh.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'chat'),
      exclude: ['/api/(.*)', '/ws'],
      serveStaticOptions: { fallthrough: true },
    }),
  ],
  controllers: [
    AppController,
    ActivityController,
    AuthController,
    MessagesController,
    ModelOptionsController,
    UploadsController,
    PlaygroundsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AppService,
    ConfigService,
    AgentAuthGuard,
    ActivityStoreService,
    MessageStoreService,
    ModelStoreService,
    StrategyRegistryService,
    OrchestratorService,
    UploadsService,
    PlaygroundsService,
    PlaygroundWatcherService,
    PhoenixSyncService,
    GithubTokenRefreshService,
  ],
})
export class AppModule {}
