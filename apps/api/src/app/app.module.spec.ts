import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('AppModule', () => {
  test('keeps LocalMcpController registered only through LocalMcpModule', () => {
    const appModule = readSource('./app.module.ts');
    const localMcpModule = readSource('./local-mcp/local-mcp.module.ts');

    expect(appModule).not.toContain('LocalMcpController');
    expect(localMcpModule).toContain('controllers: [LocalMcpController]');
  });

  test('does not duplicate the global API prefix on the local tool route', () => {
    const controller = readSource('./local-mcp/local-mcp.controller.ts');

    expect(controller).toContain("@Controller('local-tool-call')");
    expect(controller).not.toContain("@Controller('api/local-tool-call')");
  });
});
