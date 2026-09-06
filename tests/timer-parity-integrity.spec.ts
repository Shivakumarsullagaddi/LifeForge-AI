import { test, expect } from '@playwright/test';

test.describe('LifeForge AI - Tool Parity, Timer Cleanup & Integrity', () => {
  test.setTimeout(90000);

  test('Timer: Request -> Confirmation -> Start -> Navigation -> Pause/Resume/Restart/Stop', async ({ page }) => {
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
    await chatInput.fill('I want to study for 25 minutes.');
    await sendBtn.click();

    await coachPromptPromise;
    await expect(viewport.getByText(/You want me to start a 25-minute focus session\. Shall I start it\?/i).last()).toBeVisible({ timeout: 15000 });
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

    const headerTimer = page.getByTestId('header-global-timer');
    await expect(headerTimer).toBeVisible({ timeout: 10000 });
    await expect(headerTimer).toContainText(/FOCUS/i);
    await expect(headerTimer).toContainText(/Running/i);
    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible();

    await page.getByTestId('nav-dashboard').click();
    await expect(headerTimer).toBeVisible();
    await expect(page.getByTestId('focus-timer-badge')).not.toBeVisible();

    await page.getByTestId('nav-goals').click();
    await expect(page.getByText('Intentional Goals & Actionable Tasks')).toBeVisible();
    await expect(headerTimer).toBeVisible();

    await page.getByTestId('nav-placements').click();
    await expect(page.getByText('Placement Intelligence & Technical Interview Matrix')).toBeVisible();
    await expect(headerTimer).toBeVisible();

    await page.getByTestId('nav-live-coach').click();
    await expect(headerTimer).toBeVisible();
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const pausePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Pause the focus session.');
    await sendBtn.click();
    const pauseRes = await pausePromise;
    const pauseData = await pauseRes.json();
    expect(pauseData.toolResult?.tool).toBe('pause_focus_timer');
    await expect(headerTimer).toContainText(/FOCUS PAUSED/i);

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const resumePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Continue the focus session.');
    await sendBtn.click();
    const resumeRes = await resumePromise;
    const resumeData = await resumeRes.json();
    expect(resumeData.toolResult?.tool).toBe('resume_focus_timer');
    await expect(headerTimer).toContainText(/FOCUS/i);

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const restartPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Restart the focus session.');
    await sendBtn.click();
    const restartRes = await restartPromise;
    const restartData = await restartRes.json();
    expect(restartData.toolResult?.tool).toBe('restart_focus_timer');
    await expect(headerTimer).toContainText(/FOCUS/i);

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const stopPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Stop the focus session.');
    await sendBtn.click();
    const stopRes = await stopPromise;
    const stopData = await stopRes.json();
    expect(stopData.toolResult?.tool).toBe('stop_focus_timer');

    await expect(headerTimer).not.toBeVisible({ timeout: 10000 });
  });

  test('Goal & Task: Create -> Tool Verification -> Delete with Confirmation -> Yes/No flows', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const createGoalPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Create a goal to master C++ STL.');
    await sendBtn.click();
    const goalRes = await createGoalPromise;
    const goalData = await goalRes.json();
    expect(goalData.toolResult?.tool).toBe('create_goal');
    expect(goalData.toolResult?.success).toBe(true);

    const createdGoalId = goalData.toolResult?.data?.goalId;
    expect(createdGoalId).toBeTruthy();

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList).toContainText('create_goal');
    await expect(toolCallList).toContainText('COMPLETED');

    await page.getByTestId('tab-flow').click();
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const deleteReqPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Delete my C++ goal.');
    await sendBtn.click();
    const delReqRes = await deleteReqPromise;
    const delReqData = await delReqRes.json();
    expect(delReqData.toolResult?.tool).toBe('delete_goal');
    expect(delReqData.toolResult?.requiresConfirmation).toBe(true);

    const confirmDialog = page.getByTestId('confirmation-dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });
    await expect(confirmDialog).toContainText(/DELETE GOAL/i);

    const cancelBtn = page.getByTestId('cancel-action');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });

    await page.getByTestId('tab-tool-calls').click();
    await expect(toolCallList).toContainText('CANCELLED');

    await page.getByTestId('tab-flow').click();
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const deleteReq2Promise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Delete my C++ goal.');
    await sendBtn.click();
    await deleteReq2Promise;

    await expect(confirmDialog).toBeVisible({ timeout: 10000 });
    const confirmBtn = page.getByTestId('confirm-action');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });
    await page.getByTestId('tab-tool-calls').click();
    await expect(toolCallList).toContainText('delete_goal');
    await expect(toolCallList).toContainText('COMPLETED');
  });
});
