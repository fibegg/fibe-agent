import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigService } from './config/config.service';
import { AgentAuthGuard } from './auth/agent-auth.guard';
import { AuthController } from './auth/auth.controller';
import { MessageStoreService } from './message-store/message-store.service';
import { MessagesController } from './messages/messages.controller';
import { ModelStoreService } from './model-store/model-store.service';
import { ModelOptionsController } from './model-options/model-options.controller';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StrategyRegistryService } from './strategies/strategy-registry.service';
import { UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    MessagesController,
    ModelOptionsController,
    UploadsController,
  ],
  providers: [
    AppService,
    ConfigService,
    AgentAuthGuard,
    MessageStoreService,
    ModelStoreService,
    StrategyRegistryService,
    OrchestratorService,
    UploadsService,
  ],
})
export class AppModule {}
