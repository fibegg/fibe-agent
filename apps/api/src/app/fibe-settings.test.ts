import { loadFibeSettings } from './fibe-settings';
import * as fs from 'node:fs/promises';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';

describe('loadFibeSettings', () => {
  let mockDir: string;
  let settingsDir: string;
  let settingsPath: string;

  beforeEach(() => {
    mockDir = mkdtempSync(join(tmpdir(), 'fibe-settings-test-'));
    settingsDir = join(mockDir, '.fibe');
    settingsPath = join(settingsDir, 'settings.json');
  });

  afterEach(() => {
    rmSync(mockDir, { recursive: true, force: true });
  });

  it('should return defaults if file does not exist', async () => {
    const settings = await loadFibeSettings(mockDir);
    
    expect(settings.ignoredNames.has('node_modules')).toBe(true);
    expect(settings.ignoredNames.has('.git')).toBe(true);
    expect(settings.visibleHidden.has('.claude')).toBe(true);
    expect(settings.visibleHidden.has('.opencode')).toBe(true);
    expect(settings.showHidden).toBe(false);
  });

  it('should return defaults if file contains invalid JSON, but does not throw', async () => {
    mkdirSync(settingsDir);
    await fs.writeFile(settingsPath, 'invalid json');

    const settings = await loadFibeSettings(mockDir);
    expect(settings.ignoredNames.has('node_modules')).toBe(true);
    expect(settings.showHidden).toBe(false);
  });

  it('should merge user excludes and visibleHidden with defaults', async () => {
    const mockJson = {
      fileBrowser: {
        exclude: ['my_secret'],
        visibleHidden: ['.vscode'],
        showHidden: true,
      },
    };
    mkdirSync(settingsDir);
    await fs.writeFile(settingsPath, JSON.stringify(mockJson));

    const settings = await loadFibeSettings(mockDir);
    
    expect(settings.ignoredNames.has('node_modules')).toBe(true);
    expect(settings.ignoredNames.has('.git')).toBe(true);
    expect(settings.ignoredNames.has('my_secret')).toBe(true);

    expect(settings.visibleHidden.has('.claude')).toBe(true);
    expect(settings.visibleHidden.has('.opencode')).toBe(true);
    expect(settings.visibleHidden.has('.vscode')).toBe(true);
    
    expect(settings.showHidden).toBe(true);
  });
});
