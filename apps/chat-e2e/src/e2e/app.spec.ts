import { test, expect } from '@playwright/test';

test.describe('@playgrounds.dev/chat-e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display app heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Agent Authentication|Welcome/);
  });
});
