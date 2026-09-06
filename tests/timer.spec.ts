import { test, expect } from '@playwright/test';

test.describe('Focus Timer Confirmation, Persistence & State Transitions', () => {
  test.setTimeout(90000);

  test('confirms and starts focus timer, preserves state across navigation, and transitions states', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachPromptPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Study for 25 minutes.');
    await sendBtn.click();

    await coachPromptPromise;
    await expect(viewport.getByText(/Shall I start it\?/i).last()).toBeVisible({ timeout: 15000 });
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachConfirmPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Yes.');
    await sendBtn.click();

    const confirmRes = await coachConfirmPromise;
    const confirmData = await confirmRes.json();
    expect(confirmData.toolResult?.tool).toBe('start_focus_timer');
    expect(confirmData.toolResult?.success).toBe(true);

    await expect(page.getByTestId('header-global-timer')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible();

    await page.getByTestId('nav-dashboard').click();
    await expect(page.getByTestId('header-global-timer')).toBeVisible();
    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible();

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText('Intentional Goals & Actionable Tasks')).toBeVisible();
    await expect(page.getByTestId('header-global-timer')).toBeVisible();

    await page.getByTestId('nav-placements').click();
    await expect(page.getByText('Placement Intelligence & Technical Interview Matrix')).toBeVisible();
    await expect(page.getByTestId('header-global-timer')).toBeVisible();

    await page.getByTestId('nav-live-coach').click();
    await expect(page.getByTestId('header-global-timer')).toBeVisible();
    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible();

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const pausePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Pause the timer.');
    await sendBtn.click();
    const pauseRes = await pausePromise;
    const pauseData = await pauseRes.json();
    expect(pauseData.toolResult?.tool).toBe('pause_focus_timer');
    expect(pauseData.toolResult?.data?.status).toBe('PAUSED');

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const resumePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Resume the timer.');
    await sendBtn.click();
    const resumeRes = await resumePromise;
    const resumeData = await resumeRes.json();
    expect(resumeData.toolResult?.tool).toBe('resume_focus_timer');
    expect(resumeData.toolResult?.data?.status).toBe('RUNNING');

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const restartPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Restart the timer.');
    await sendBtn.click();
    const restartRes = await restartPromise;
    const restartData = await restartRes.json();
    expect(restartData.toolResult?.tool).toBe('restart_focus_timer');
    expect(restartData.toolResult?.data?.status).toBe('RUNNING');

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const stopPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Stop the timer.');
    await sendBtn.click();
    const stopRes = await stopPromise;
    const stopData = await stopRes.json();
    expect(stopData.toolResult?.tool).toBe('stop_focus_timer');
    expect(stopData.toolResult?.data?.status).toBe('STOPPED');

    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible({ timeout: 10000 });
  });
});
