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
import { EffortStoreService } from './effort-store/effort-store.service';
import { ModelOptionsController } from './model-options/model-options.controller';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { ChatPromptContextService } from './orchestrator/chat-prompt-context.service';
import { SessionRegistryService } from './orchestrator/session-registry.service';
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
import { FibeSyncSettingsController } from './fibe-sync/fibe-sync-settings.controller';
import { FibeSyncSettingsStoreService } from './fibe-sync/fibe-sync-settings-store.service';
import { GithubTokenRefreshService } from './github-token-refresh/github-token-refresh.service';
import { AgentFilesController } from './agent-files/agent-files.controller';
import { AgentFilesService } from './agent-files/agent-files.service';
import { AgentFilesWatcherService } from './agent-files/agent-files-watcher.service';
import { RuntimeConfigController } from './runtime-config/runtime-config.controller';
import { TerminalService } from './terminal/terminal.service';
import { ProxyService } from './provider-traffic/proxy.service';
import { ProviderTrafficController } from './provider-traffic/provider-traffic.controller';
import { ProviderTrafficStoreService } from './provider-traffic/provider-traffic-store.service';
import { GemmaRouterService } from './gemma-router/gemma-router.service';
import { GemmaMcpToolsService } from './gemma-router/gemma-mcp-tools.service';
import { AgentModeController } from './agent-mode/agent-mode.controller';
import { AgentModeStoreService } from './agent-mode/agent-mode.store.service';
import { LocalMcpModule } from './local-mcp/local-mcp.module';
import { ConversationManagerService } from './conversation/conversation-manager.service';
import { ConversationsController } from './conversation/conversations.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'chat'),
      exclude: ['/api/(.*)', '/ws'],
      serveStaticOptions: { fallthrough: true, index: false },
    }),
    LocalMcpModule,
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
    FibeSyncSettingsController,
    ProviderTrafficController,
    AgentModeController,
    ConversationsController,
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
    EffortStoreService,
    StrategyRegistryService,
    OrchestratorService,
    SessionRegistryService,
    ChatPromptContextService,
    UploadsService,
    PlaygroundsService,
    PlaygroundWatcherService,
    PlayroomBrowserService,
    AgentFilesService,
    AgentFilesWatcherService,
    FibeSyncService,
    FibeSyncSettingsStoreService,
    GithubTokenRefreshService,
    TerminalService,
    ProviderTrafficStoreService,
    ProxyService,
    GemmaRouterService,
    GemmaMcpToolsService,
    AgentModeStoreService,
    ConversationManagerService,
  ],
})
export class AppModule {}
