import { Injectable, Logger } from '@nestjs/common';

export interface GemmaMcpToolDescription {
  name: string;
  description: string;
}

interface McpServerConfigEntry {
  serverUrl?: string;
}

@Injectable()
export class GemmaMcpToolsService {
  private readonly logger = new Logger(GemmaMcpToolsService.name);
  private toolsCache: GemmaMcpToolDescription[] | null = null;

  getTools(): GemmaMcpToolDescription[] {
    return this.toolsCache ?? [];
  }

  async refresh(): Promise<void> {
    const urls = this.getMcpServerUrls();
    if (!urls.length) return;

    const allTools: GemmaMcpToolDescription[] = [];
    for (const serverUrl of urls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;

        const data = await res.json() as {
          result?: { tools?: Array<{ name: string; description?: string }> }
        };
        const tools = data?.result?.tools ?? [];
        for (const tool of tools) {
          if (tool.name) {
            allTools.push({ name: tool.name, description: tool.description ?? tool.name });
          }
        }
        this.logger.log(`Fetched ${tools.length} MCP tool descriptions from ${serverUrl}`);
      } catch {
        this.logger.debug(`Could not fetch MCP tool list from ${serverUrl}`);
      }
    }

    if (allTools.length > 0) {
      this.toolsCache = this.dedupeTools(allTools);
    }
  }

  private dedupeTools(tools: GemmaMcpToolDescription[]): GemmaMcpToolDescription[] {
    const seen = new Set<string>();
    const unique: GemmaMcpToolDescription[] = [];
    for (const tool of tools) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      unique.push(tool);
    }
    return unique;
  }

  private getMcpServerEntriesFromEnv(): McpServerConfigEntry[] {
    const raw = process.env.MCP_CONFIG_JSON;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as {
        mcpServers?: Record<string, McpServerConfigEntry>;
        serverUrl?: string;
      };
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        return Object.values(parsed.mcpServers);
      }
      if (parsed.serverUrl) {
        return [parsed];
      }
    } catch {
      // Ignore parse errors. Gemma routing is experimental and should degrade silently.
    }
    return [];
  }

  private getMcpServerUrls(): string[] {
    return this.getMcpServerEntriesFromEnv()
      .map((entry) => entry.serverUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
  }
}
