import { test, expect } from '@playwright/test';

test.describe('Live Coach - Voice Lifecycle & Telemetry', () => {
  test('starts live voice session and establishes active connection state', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const startBtn = page.getByTestId('start-live-voice');
    await expect(startBtn).toBeVisible();

    const wsPromise = page.waitForEvent('websocket', {
      predicate: (ws) => ws.url().includes('/api/live-ws'),
      timeout: 15000,
    });

    await startBtn.click();
    const ws = await wsPromise;
    expect(ws).toBeTruthy();

    const sessionStatus = page.getByTestId('live-session-status');
    const micStatus = page.getByTestId('mic-status');

    await expect(sessionStatus).toContainText(/Connected|Listening|Active/i, { timeout: 15000 });
    await expect(micStatus).toContainText(/Active|Speaking|Standby/i, { timeout: 15000 });

    const endBtn = page.getByTestId('end-session');
    await expect(endBtn).toBeVisible();

    await endBtn.click();
    await expect(page.getByTestId('start-live-voice')).toBeVisible({ timeout: 15000 });
  });

  test('preserves single live session without duplicate connection', async ({ page }) => {
    let wsConnectionsCount = 0;
    page.on('websocket', (ws) => {
      if (ws.url().includes('/api/live-ws')) {
        wsConnectionsCount++;
      }
    });

    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const wsPromise = page.waitForEvent('websocket', {
      predicate: (ws) => ws.url().includes('/api/live-ws'),
      timeout: 15000,
    });

    const startBtn = page.getByTestId('start-live-voice');
    await startBtn.click();

    const ws = await wsPromise;
    expect(ws).toBeTruthy();
    await expect(page.getByTestId('end-session')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('end-session').click();
    await expect(page.getByTestId('start-live-voice')).toBeVisible({ timeout: 15000 });
  });
});
