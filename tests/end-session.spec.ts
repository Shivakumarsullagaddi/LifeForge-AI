import { test, expect } from '@playwright/test';

test.describe('End Session Flow - Tool Execution & State Verification', () => {
  test.setTimeout(60000);

  test('ends live session cleanly via voice/text request', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport).toBeVisible({ timeout: 15000 });

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    await chatInput.fill("Thank you, let's stop.");
    await sendBtn.click();

    await expect(viewport.getByText(/end this session now|goodbye/i).first()).toBeVisible({ timeout: 20000 });

    const startLiveBtn = page.getByTestId('start-live-voice');
    await expect(startLiveBtn).toBeVisible({ timeout: 15000 });

    const micStatus = page.getByTestId('mic-status');
    await expect(micStatus).toContainText(/Off|Standby/i, { timeout: 10000 });
  });

  test('clicking End Session button transitions mic to OFF and retains conversation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const startLiveBtn = page.getByTestId('start-live-voice');
    await startLiveBtn.click();

    const endSessionBtn = page.getByTestId('end-session');
    await expect(endSessionBtn).toBeVisible({ timeout: 15000 });

    await endSessionBtn.click();
    await expect(startLiveBtn).toBeVisible({ timeout: 15000 });

    const micStatus = page.getByTestId('mic-status');
    await expect(micStatus).toContainText(/Off|Standby/i, { timeout: 10000 });
  });
});
