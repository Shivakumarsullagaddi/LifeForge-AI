import { test, expect } from '@playwright/test';

test.describe('Smoke Suite - LifeForge AI', () => {
  test('unauthenticated user sees hero landing page without errors', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByText('Personal AI Life, Study & Career Coach')).toBeVisible();
    await expect(page.getByText('Get Started with Google')).toBeVisible();
    await expect(page.getByText('Dedicated Isolated Cloud Database')).toBeVisible();

    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('webpack-hmr')
    );
    expect(criticalErrors).toHaveLength(0);
    await context.close();
  });

  test('authenticated user can access all main application sections', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();

    await page.getByTestId('nav-dashboard').click();
    await expect(page.getByTestId('dashboard-view')).toBeVisible();

    await page.getByTestId('nav-live-coach').click();
    await expect(page.getByTestId('start-live-voice')).toBeVisible();
    await expect(page.getByTestId('chat-input')).toBeVisible();

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText('Intentional Goals & Actionable Tasks')).toBeVisible();
    await expect(page.getByText(/Milestone Goals/i).first()).toBeVisible();

    await page.getByTestId('nav-placements').click();
    await expect(page.getByText('Placement Intelligence & Technical Interview Matrix')).toBeVisible();

    await page.getByTestId('nav-calendar').click();
    await expect(page.getByText('Schedule & Study Session Synchronization')).toBeVisible();

    await page.getByTestId('nav-reflections').click();
    await expect(page.getByText('Growth Dashboard & Trends')).toBeVisible();

    await page.getByTestId('nav-conversations').click();
    await expect(page.getByText('Coaching Conversation Archive')).toBeVisible();

    await page.getByTestId('nav-privacy').click();
    await expect(page.getByText('Zero Cross-User Leakage')).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });
});
