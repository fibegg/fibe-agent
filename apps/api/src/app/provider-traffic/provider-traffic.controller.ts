import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ProviderTrafficStoreService } from './provider-traffic-store.service';

@Controller('provider-traffic')
@UseGuards(AgentAuthGuard)
export class ProviderTrafficController {
  constructor(private readonly trafficStore: ProviderTrafficStoreService) {}

  @Get()
  getAll() {
    return this.trafficStore.all();
  }
}
