import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';

@Controller('provider-traffic')
@UseGuards(AgentAuthGuard)
export class ProviderTrafficController {
  constructor(private readonly trafficStore: ProviderTrafficStoreService) {}

  @Get()
  getAll(@Query('conversationId') conversationId?: string) {
    return this.trafficStore.all(conversationId);
  }
}
