import { Controller, Get, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ActivityStoreService } from '../activity-store/activity-store.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class ActivityController {
  constructor(private readonly activityStore: ActivityStoreService) {}

  @Get('activity')
  getAll() {
    return this.activityStore.all();
  }
}
