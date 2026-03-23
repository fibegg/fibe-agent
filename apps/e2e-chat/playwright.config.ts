import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] ?? (process.env.CI ? 'http://localhost:4300' : 'http://localhost:3100');

export default defineConfig({
  testDir: 'src/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI
    ? {
        command: 'bunx nx run @fibe.gg/chat:preview',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: 'bunx nx run @fibe.gg/chat:serve',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
