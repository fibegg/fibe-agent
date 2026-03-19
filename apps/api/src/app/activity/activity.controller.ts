import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ActivityStoreService } from '../activity-store/activity-store.service';

@Controller('activities')
@UseGuards(AgentAuthGuard)
export class ActivityController {
  constructor(private readonly activityStore: ActivityStoreService) {}

  @Get()
  getAll() {
    return this.activityStore.all();
  }

  @Get('by-entry/:entryId')
  getByStoryEntryId(@Param('entryId') entryId: string) {
    const entry = this.activityStore.findByStoryEntryId(entryId);
    if (!entry) throw new NotFoundException('Activity not found');
    return entry;
  }

  @Get(':activityId/:storyId')
  getByActivityAndStory(
    @Param('activityId') activityId: string,
    @Param('storyId') storyId: string
  ) {
    const activity = this.activityStore.getById(activityId);
    if (!activity) throw new NotFoundException('Activity not found');
    const hasStory = activity.story?.some((e) => e?.id === storyId);
    if (!hasStory) throw new NotFoundException('Story not found in activity');
    return activity;
  }

  @Get(':activityId')
  getById(@Param('activityId') activityId: string) {
    const entry = this.activityStore.getById(activityId);
    if (!entry) throw new NotFoundException('Activity not found');
    return entry;
  }
}
