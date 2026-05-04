import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConversationManagerService, DEFAULT_CONVERSATION_ID } from '../conversation/conversation-manager.service';

@Controller('activities')
@UseGuards(AgentAuthGuard)
export class ActivityController {
  constructor(private readonly conversationManager: ConversationManagerService) {}

  private defaultActivityStore() {
    return this.conversationManager.getOrCreate(DEFAULT_CONVERSATION_ID).activityStore;
  }

  @Get()
  getAll() {
    return this.defaultActivityStore().all();
  }

  @Get('by-entry/:entryId')
  getByStoryEntryId(@Param('entryId') entryId: string) {
    const entry = this.defaultActivityStore().findByStoryEntryId(entryId);
    if (!entry) throw new NotFoundException('Activity not found');
    return entry;
  }

  @Get(':activityId/:storyId')
  getByActivityAndStory(
    @Param('activityId') activityId: string,
    @Param('storyId') storyId: string
  ) {
    const activity = this.defaultActivityStore().getById(activityId);
    if (!activity) throw new NotFoundException('Activity not found');
    const hasStory = activity.story?.some((e) => e?.id === storyId);
    if (!hasStory) throw new NotFoundException('Story not found in activity');
    return activity;
  }

  @Get(':activityId')
  getById(@Param('activityId') activityId: string) {
    const entry = this.defaultActivityStore().getById(activityId);
    if (!entry) throw new NotFoundException('Activity not found');
    return entry;
  }
}
