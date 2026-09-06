import { test, expect } from '@playwright/test';

test.describe('Tool Gateway & Agent Execution Verification', () => {
  test.setTimeout(90000);

  test('verifies create_goal execution flow from user request to verified UI state', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    const goalTitle = `Master C++ STL Algorithms ${Date.now()}`;
    await chatInput.fill(`Create a goal to ${goalTitle}`);
    await sendBtn.click();

    const coachResponse = await coachResponsePromise;
    expect(coachResponse.status()).toBe(200);

    const responseJson = await coachResponse.json();
    expect(responseJson.agentDomain).toBe('goal');
    expect(responseJson.toolResult).toBeTruthy();
    expect(responseJson.toolResult.tool).toBe('create_goal');
    expect(responseJson.toolResult.success).toBe(true);

    const goalId = responseJson.toolResult.data?.goalId;
    expect(goalId).toBeTruthy();

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();

    const toolItems = page.getByTestId('tool-call-item');
    await expect(toolItems.first()).toBeVisible({ timeout: 10000 });
    await expect(toolCallList.getByText('create_goal')).toBeVisible();
    await expect(toolCallList.getByText('Goal/Task Agent')).toBeVisible();
    await expect(toolCallList.getByText('COMPLETED', { exact: true }).first()).toBeVisible();

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 15000 });
  });

  test('verifies minimum agent execution invokes only the required agent', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    await chatInput.fill('Create a goal to master Graph Theory.');
    await sendBtn.click();

    const coachResponse = await coachResponsePromise;
    const responseJson = await coachResponse.json();

    expect(responseJson.agentDomain).toBe('goal');
    expect(responseJson.toolResult.tool).toBe('create_goal');

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();

    await expect(toolCallList.getByText('get_calendar_events')).not.toBeVisible();
    await expect(toolCallList.getByText('create_reflection')).not.toBeVisible();
    await expect(toolCallList.getByText('get_resume_status')).not.toBeVisible();
  });

  test('verifies tool failure displays FAILED and rejects fake success', async ({ page }) => {
    await page.route('**/api/coach', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: 'Attempted operation encountered an internal database execution failure.',
          agentDomain: 'goal',
          toolResult: {
            requestId: `req_fail_${Date.now()}`,
            agentTaskId: 'task_simulated_failure',
            conversationId: 'conv_test',
            turnId: 'turn_fail',
            tool: 'create_goal',
            status: 'FAILED',
            success: false,
            error: {
              code: 'DATABASE_TIMEOUT',
              message: 'Simulated database failure during verification test',
            },
          },
        }),
      });
    });

    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    await chatInput.fill('Create a goal to simulate database error handling.');
    await sendBtn.click();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport.getByText('Attempted operation encountered an internal database execution failure.')).toBeVisible({ timeout: 15000 });

    await expect(viewport.getByText('Goal created successfully')).not.toBeVisible();
  });
});
