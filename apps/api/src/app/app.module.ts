import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigService } from './config/config.service';
import { AgentAuthGuard } from './auth/agent-auth.guard';
import { AuthController } from './auth/auth.controller';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { ModelOptionsController } from './model-options/model-options.controller';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    MessagesController,
    ModelOptionsController,
  ],
  providers: [AppService, ConfigService, AgentAuthGuard, MessagesService],
})
export class AppModule {}
