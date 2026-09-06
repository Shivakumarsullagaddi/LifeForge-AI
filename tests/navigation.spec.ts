import { test, expect } from '@playwright/test';

test.describe('Navigation, Background Session & Conversation Lifecycle', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();
    const newBtn = page.getByTestId('new-conversation');
    if (await newBtn.isVisible()) {
      await newBtn.click();
    }
  });

  test('preserves live session and timer state during circular navigation across all 8 views', async ({ page }) => {
    const startBtn = page.getByTestId('start-live-voice');
    await expect(startBtn).toBeVisible({ timeout: 15000 });
    await startBtn.click();

    const sessionStatus = page.getByTestId('live-session-status');
    const micStatus = page.getByTestId('mic-status');
    await expect(sessionStatus).toContainText('Connected', { timeout: 20000 });
    await expect(micStatus).toContainText('Active', { timeout: 10000 });

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachPromptPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Study for 25 minutes.');
    await sendBtn.click();
    await coachPromptPromise;

    await expect(page.getByText(/Shall I start it\?/i).first()).toBeVisible({ timeout: 20000 });
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

    const globalHeaderTimer = page.getByTestId('header-global-timer');
    await expect(globalHeaderTimer).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible();

    await page.getByTestId('nav-dashboard').click();
    await expect(globalHeaderTimer).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText(/Intentional Goals & Actionable Tasks/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-placements').click();
    await expect(page.getByText(/Placement Intelligence & Technical Interview Matrix/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-calendar').click();
    await expect(page.getByText(/Schedule & Study Session Synchronization/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-reflections').click();
    await expect(page.getByText(/Personal Reflection & Performance Evolution/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-conversations').click();
    await expect(page.getByText(/Coaching Conversation Archive/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-live-coach').click();
    await expect(sessionStatus).toContainText('Connected', { timeout: 15000 });
    await expect(micStatus).toContainText('Active', { timeout: 10000 });
    await expect(globalHeaderTimer).toBeVisible({ timeout: 15000 });

    const endBtn = page.getByTestId('end-session');
    await expect(endBtn).toBeVisible();
    await endBtn.click();
    await expect(page.getByTestId('start-live-voice')).toBeVisible({ timeout: 15000 });
    await expect(sessionStatus).toContainText(/Ended|Idle/i, { timeout: 10000 });
  });

  test('ends live session, releases microphone, and updates session status', async ({ page }) => {
    const startBtn = page.getByTestId('start-live-voice');
    await expect(startBtn).toBeVisible({ timeout: 15000 });
    await startBtn.click();

    const sessionStatus = page.getByTestId('live-session-status');
    const micStatus = page.getByTestId('mic-status');
    await expect(sessionStatus).toContainText('Connected', { timeout: 20000 });
    await expect(micStatus).toContainText('Active', { timeout: 10000 });

    const endBtn = page.getByTestId('end-session');
    await expect(endBtn).toBeVisible({ timeout: 10000 });
    await endBtn.click();

    await expect(page.getByTestId('start-live-voice')).toBeVisible({ timeout: 15000 });
    await expect(sessionStatus).toContainText(/Ended|Idle/i, { timeout: 10000 });
    await expect(micStatus).toContainText('Standby', { timeout: 10000 });
  });

  test('resumes conversation from archive into Live Coach with restored timeline and continues dialogue', async ({ page }) => {
    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const uniqueTopic = `E2E Navigation Benchmark ${Date.now()}`;
    const coachMsgPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill(`Let's discuss ${uniqueTopic}.`);
    await sendBtn.click();
    await coachMsgPromise;

    await expect(viewport.getByText(uniqueTopic).first()).toBeVisible({ timeout: 25000 });

    await page.getByTestId('nav-conversations').click();
    await expect(page.getByText(/Coaching Conversation Archive/i)).toBeVisible({ timeout: 15000 });

    const convItem = page.getByTestId('conversation-item').first();
    await expect(convItem).toBeVisible({ timeout: 15000 });
    await convItem.click();

    const resumeBtn = page.getByTestId('resume-in-live-coach');
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();

    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('conversation-viewport').getByText(uniqueTopic).first()).toBeVisible({ timeout: 15000 });

    const followUpPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByTestId('chat-input').fill('Continuing from our previous discussion.');
    await page.getByTestId('send-message').click();
    await followUpPromise;

    await expect(page.getByTestId('conversation-viewport').getByText(/Continuing from our previous discussion/i).first()).toBeVisible({ timeout: 20000 });
  });
});
