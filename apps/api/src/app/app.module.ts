import { join } from 'path';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ConfigService } from './config/config.service';
import { AgentAuthGuard } from './auth/agent-auth.guard';
import { AuditService } from './audit/audit.service';
import { AuditInterceptor } from './audit/audit.interceptor';

import { DataPrivacyController } from './data-privacy/data-privacy.controller';
import { DataPrivacyService } from './data-privacy/data-privacy.service';

import { AuthController } from './auth/auth.controller';
import { ActivityController } from './activity/activity.controller';
import { ActivityStoreService } from './activity-store/activity-store.service';
import { MessageStoreService } from './message-store/message-store.service';
import { MessagesController } from './messages/messages.controller';
import { ModelStoreService } from './model-store/model-store.service';
import { ModelOptionsController } from './model-options/model-options.controller';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { ChatPromptContextService } from './orchestrator/chat-prompt-context.service';
import { StrategyRegistryService } from './strategies/strategy-registry.service';
import { UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';
import { PlaygroundsController } from './playgrounds/playgrounds.controller';
import { PlaygroundsService } from './playgrounds/playgrounds.service';
import { InitStatusController } from './init-status/init-status.controller';
import { AgentController } from './agent/agent.controller';
import { PlaygroundWatcherService } from './playgrounds/playground-watcher.service';
import { PlayroomBrowserService } from './playgrounds/playroom-browser.service';
import { FibeSyncService } from './fibe-sync/fibe-sync.service';
import { GithubTokenRefreshService } from './github-token-refresh/github-token-refresh.service';
import { SteeringService } from './steering/steering.service';
import { AgentFilesController } from './agent-files/agent-files.controller';
import { AgentFilesService } from './agent-files/agent-files.service';
import { AgentFilesWatcherService } from './agent-files/agent-files-watcher.service';
import { RuntimeConfigController } from './runtime-config/runtime-config.controller';
import { TerminalService } from './terminal/terminal.service';
import { ProxyService } from './provider-traffic/proxy.service';
import { ProviderTrafficStoreService } from './provider-traffic/provider-traffic-store.service';
import { GemmaRouterService } from './gemma-router/gemma-router.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'chat'),
      exclude: ['/api/(.*)', '/ws'],
      serveStaticOptions: { fallthrough: true, index: false },
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
    AgentFilesController,
    InitStatusController,
    AgentController,
    DataPrivacyController,
    RuntimeConfigController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    AuditService,
    DataPrivacyService,
    ConfigService,
    AgentAuthGuard,
    ActivityStoreService,
    MessageStoreService,
    ModelStoreService,
    StrategyRegistryService,
    OrchestratorService,
    ChatPromptContextService,
    UploadsService,
    PlaygroundsService,
    PlaygroundWatcherService,
    PlayroomBrowserService,
    AgentFilesService,
    AgentFilesWatcherService,
    FibeSyncService,
    GithubTokenRefreshService,
    SteeringService,
    TerminalService,
    ProviderTrafficStoreService,
    ProxyService,
    GemmaRouterService,
  ],
})
export class AppModule {}
