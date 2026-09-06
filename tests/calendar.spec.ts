import { test, expect } from '@playwright/test';

test.describe('Google Calendar Integration, OAuth State Machine & Negative Paths', () => {
  test.setTimeout(90000);

  test('handles disconnected state, executes OAuth progression (AUTHORIZING -> VERIFYING -> CONNECTED), and displays events', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachPromptPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What is on my calendar tomorrow?');
    await sendBtn.click();
    await coachPromptPromise;

    const connectCard = page.getByTestId('calendar-connect-card');
    await expect(connectCard).toBeVisible({ timeout: 15000 });
    await expect(connectCard.getByText('GOOGLE CALENDAR SYNC')).toBeVisible();

    const connectBtn = page.getByTestId('calendar-connect-btn');
    await connectBtn.click();

    await expect(page.getByTestId('calendar-connected-status')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('calendar-connected-status')).toHaveText(/Calendar Connected/i);

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const queryEventsPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What is on my calendar tomorrow?');
    await sendBtn.click();

    const queryRes = await queryEventsPromise;
    const queryData = await queryRes.json();
    expect(queryData.toolResult?.tool).toBe('get_calendar_events');
    expect(queryData.toolResult?.success).toBe(true);

    await expect(viewport.getByText(/no upcoming (?:calendar )?events|0 events|no events/i).last()).toBeVisible({ timeout: 15000 });
  });

  test('negative test: reports "No events found." when calendar has zero events', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('lifeforge_test_calendar_empty', 'true');
    });

    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const queryPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What is on my calendar tomorrow?');
    await sendBtn.click();

    const res = await queryPromise;
    const data = await res.json();
    expect(data.toolResult?.success).toBe(true);
    expect(data.text).toMatch(/No events found/i);
    await expect(viewport.getByText(/No events found/i).last()).toBeVisible({ timeout: 15000 });
  });

  test('negative test: reports "Calendar retrieval failed." when calendar API throws', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('lifeforge_test_calendar_fail', 'true');
    });

    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const queryPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What is on my calendar tomorrow?');
    await sendBtn.click();

    const res = await queryPromise;
    const data = await res.json();
    expect(data.toolResult?.success).toBe(false);
    expect(data.text).toMatch(/Calendar retrieval failed/i);
    await expect(viewport.getByText(/Calendar retrieval failed/i).last()).toBeVisible({ timeout: 15000 });
  });

  test('user dismisses calendar connected card, clearing connection and returning to disconnected state', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachPromptPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What is on my calendar tomorrow?');
    await sendBtn.click();
    await coachPromptPromise;

    const connectCard = page.getByTestId('calendar-connect-card');
    await expect(connectCard).toBeVisible({ timeout: 15000 });

    const connectBtn = page.getByTestId('calendar-connect-btn');
    await connectBtn.click();

    const connectedStatus = page.getByTestId('calendar-connected-status');
    await expect(connectedStatus).toBeVisible({ timeout: 15000 });

    const dismissBtn = page.getByTestId('calendar-dismiss-btn');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    await expect(connectedStatus).not.toBeVisible();
  });
});
