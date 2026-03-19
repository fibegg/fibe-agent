import { test, expect } from '@playwright/test';

test.describe('@playgrounds.dev/e2e-chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display app (login or chat)', async ({ page }) => {
    const loginVisible = page.getByRole('button', { name: 'Login' });
    const chatHeading = page.getByRole('heading', { name: /AI Assistant/i });
    await expect(loginVisible.or(chatHeading)).toBeVisible({ timeout: 15_000 });
  });
});
