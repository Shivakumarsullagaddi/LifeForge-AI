import { test, expect } from '@playwright/test';

test.describe('Task Creation Verification Flow', () => {
  test.setTimeout(60000);

  test('creates task from Live Coach, verifies Firestore read-back and UI appearance', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const taskTitle = `Complete Raft Consensus Implementation ${Date.now()}`;
    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    await chatInput.fill(`Create a task to ${taskTitle}`);
    await sendBtn.click();

    const coachResponse = await coachResponsePromise;
    const resData = await coachResponse.json();

    expect(resData.agentDomain).toBe('goal');
    expect(resData.toolResult).toBeTruthy();
    expect(resData.toolResult.tool).toBe('create_task');
    expect(resData.toolResult.success).toBe(true);
    expect(resData.toolResult.data?.verified).toBe(true);
    expect(resData.toolResult.data?.taskId).toBeTruthy();

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList.getByText('create_task').first()).toBeVisible();
    await expect(toolCallList.getByText('COMPLETED').first()).toBeVisible();

    await page.getByTestId('nav-goals').click();
    const taskItem = page.getByTestId('task-item').filter({ hasText: taskTitle });
    await expect(taskItem).toBeVisible({ timeout: 15000 });
  });
});
