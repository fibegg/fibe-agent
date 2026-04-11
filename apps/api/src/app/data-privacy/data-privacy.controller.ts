import { Controller, Get, Delete, Header, UseGuards } from '@nestjs/common';
import { DataPrivacyService } from './data-privacy.service';
import { AgentAuthGuard } from '../auth/agent-auth.guard';

@Controller('data-privacy')
@UseGuards(AgentAuthGuard)
export class DataPrivacyController {
  constructor(private readonly dataPrivacyService: DataPrivacyService) {}

  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="fibe_agent_data_export.json"')
  exportData() {
    return this.dataPrivacyService.exportData();
  }

  @Delete()
  deleteData() {
    this.dataPrivacyService.deleteData();
    return { success: true, message: 'Data deleted successfully' };
  }
}
