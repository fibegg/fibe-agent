import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
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

  @Get('activity/by-entry/:entryId')
  getByStoryEntryId(@Param('entryId') entryId: string) {
    const entry = this.activityStore.findByStoryEntryId(entryId);
    if (!entry) throw new NotFoundException('Activity not found');
    return entry;
  }

  @Get('activity/:id')
  getById(@Param('id') id: string) {
    const entry = this.activityStore.getById(id);
    if (!entry) throw new NotFoundException('Activity not found');
    return entry;
  }
}
