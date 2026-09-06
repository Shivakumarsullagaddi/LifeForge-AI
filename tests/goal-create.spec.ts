import { test, expect } from '@playwright/test';

test.describe('Goal Creation Verification Flow', () => {
  test.setTimeout(60000);

  test('creates goal from Live Coach, verifies Firestore read-back and UI appearance', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const goalTitle = `Master Distributed Systems Patterns ${Date.now()}`;
    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    await chatInput.fill(`Create a goal to ${goalTitle}`);
    await sendBtn.click();

    const coachResponse = await coachResponsePromise;
    const resData = await coachResponse.json();

    expect(resData.agentDomain).toBe('goal');
    expect(resData.toolResult).toBeTruthy();
    expect(resData.toolResult.tool).toBe('create_goal');
    expect(resData.toolResult.success).toBe(true);
    expect(resData.toolResult.data?.verified).toBe(true);
    expect(resData.toolResult.data?.goalId).toBeTruthy();

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList.getByText('create_goal').first()).toBeVisible();
    await expect(toolCallList.getByText('COMPLETED').first()).toBeVisible();

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 15000 });
  });
});
