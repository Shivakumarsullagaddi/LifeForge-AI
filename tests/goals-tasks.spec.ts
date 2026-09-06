import { test, expect } from '@playwright/test';

test.describe('Goals & Tasks Management and Deletion Safeguards', () => {
  test.setTimeout(90000);

  test('creates goal via autonomous agent without collateral tool execution and verifies persistence', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const goalTitle = `Master C++ STL Vectors and Maps ${Date.now()}`;
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

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();

    await expect(toolCallList.getByText('create_goal')).toBeVisible();
    await expect(toolCallList.getByText('memory')).not.toBeVisible();
    await expect(toolCallList.getByText('calendar')).not.toBeVisible();
    await expect(toolCallList.getByText('reflection')).not.toBeVisible();

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 15000 });
  });

  test('executes task lifecycle: agent tool creation, toggle completion, and confirmation-guarded deletion', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const taskTitle = `Finish Google Cloud project deployment ${Date.now()}`;
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

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList.getByText('create_task')).toBeVisible();

    await page.getByTestId('nav-goals').click();
    const taskCard = page.getByTestId('task-item').filter({ hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 15000 });

    const toggleBtn = taskCard.getByTestId('toggle-task-status');
    await toggleBtn.click();
    await expect(taskCard.getByText(taskTitle)).toHaveClass(/line-through/);

    const deleteBtn = taskCard.getByTestId('delete-task-btn');
    await deleteBtn.click();

    const confirmDialog = page.getByTestId('task-confirmation-dialog');
    await expect(confirmDialog).toBeVisible();

    await page.getByTestId('cancel-delete-task').click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(taskCard).toBeVisible();

    await deleteBtn.click();
    await expect(confirmDialog).toBeVisible();
    await page.getByTestId('confirm-delete-task').click();

    await expect(confirmDialog).not.toBeVisible();
    await expect(page.getByText(taskTitle)).not.toBeVisible({ timeout: 10000 });
  });
});
