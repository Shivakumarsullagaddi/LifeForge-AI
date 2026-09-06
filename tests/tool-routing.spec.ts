import { test, expect } from '@playwright/test';

test.describe('Agent Tool Routing Verification', () => {
  test.setTimeout(60000);

  test('routes timer request to study/timer and never to Calendar Agent', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachTimerPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Start a 25 minute focus session.');
    await sendBtn.click();

    const timerResponse = await coachTimerPromise;
    const timerData = await timerResponse.json();

    expect(timerData.agentDomain).toBe('study');
    expect(timerData.text).toMatch(/Shall I start it\?/i);
    expect(timerData.agentDomain).not.toBe('calendar');

    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const calendarPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Check my calendar tomorrow.');
    await sendBtn.click();

    const calendarResponse = await calendarPromise;
    const calData = await calendarResponse.json();

    expect(calData.agentDomain).toBe('calendar');
    expect(calData.toolResult?.tool).toBe('get_calendar_events');
  });
});
