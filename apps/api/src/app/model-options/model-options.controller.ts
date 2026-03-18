import { Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ConfigService } from '../config/config.service';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';

@Controller()
@UseGuards(AgentAuthGuard)
export class ModelOptionsController {
  private readonly logger = new Logger(ModelOptionsController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly strategyRegistry: StrategyRegistryService,
  ) {}

  @Get('model-options')
  getOptions(): string[] {
    return this.config.getModelOptions();
  }

  @Post('model-options/refresh')
  async refreshOptions(): Promise<string[]> {
    const envModels = this.config.getModelOptions();

    let providerModels: string[] = [];
    try {
      const strategy = this.strategyRegistry.resolveStrategy();
      if (typeof strategy.listModels === 'function') {
        providerModels = await strategy.listModels();
      }
    } catch (err) {
      this.logger.warn('Failed to list models from provider', (err as Error).message);
    }

    // Deduplicated union: ENV models first (preserving admin ordering),
    // then provider models that aren't already in the ENV list.
    const seen = new Set(envModels);
    const merged = [...envModels];
    for (const m of providerModels) {
      if (!seen.has(m)) {
        seen.add(m);
        merged.push(m);
      }
    }
    return merged;
  }
}
