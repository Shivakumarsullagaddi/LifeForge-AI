import { test, expect } from '@playwright/test';

test.describe('LIFEForge AI - Runtime Cleanup & Contract Robustness', () => {
  test.setTimeout(90000);

  test('validates JSON parsing contracts, rejecting empty, malformed, and missing Content-Type requests with 400', async ({ request }) => {
    const validTestStoreRes = await request.post('/api/test-store', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        action: 'addGoal',
        userId: 'test_runtime_user',
        data: { title: 'Test Goal Validation', domain: 'study' },
      },
    });
    expect(validTestStoreRes.status()).toBe(200);
    const validTestStoreData = await validTestStoreRes.json();
    expect(validTestStoreData.success).toBe(true);

    const emptyTestStoreRes = await request.post('/api/test-store', {
      headers: { 'Content-Type': 'application/json' },
      data: '',
    });
    expect(emptyTestStoreRes.status()).toBe(400);
    const emptyTestStoreData = await emptyTestStoreRes.json();
    expect(emptyTestStoreData.success).toBe(false);
    expect(emptyTestStoreData.error?.code).toBe('INVALID_REQUEST');

    const malformedTestStoreRes = await request.post('/api/test-store', {
      headers: { 'Content-Type': 'application/json' },
      data: '{ action: "addGoal", broken json ',
    });
    expect(malformedTestStoreRes.status()).toBe(400);
    const malformedTestStoreData = await malformedTestStoreRes.json();
    expect(malformedTestStoreData.success).toBe(false);
    expect(malformedTestStoreData.error?.code).toBe('INVALID_REQUEST');

    const noContentTypeRes = await request.post('/api/test-store', {
      data: JSON.stringify({ action: 'addGoal', userId: 'test_runtime_user' }),
    });
    expect(noContentTypeRes.status()).toBe(400);
    const noContentTypeData = await noContentTypeRes.json();
    expect(noContentTypeData.success).toBe(false);
    expect(noContentTypeData.error?.code).toBe('INVALID_REQUEST');

    const validSummaryRes = await request.post('/api/conversation/summary', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        conversationId: 'test_conv_summary',
        userId: 'test_runtime_user',
        messages: [{ role: 'user', content: 'Master dynamic programming' }],
      },
    });
    expect(validSummaryRes.status()).toBe(200);
    const validSummaryData = await validSummaryRes.json();
    expect(validSummaryData.success).toBe(true);
    expect(validSummaryData.rollingSummary).toBeTruthy();

    const emptySummaryRes = await request.post('/api/conversation/summary', {
      headers: { 'Content-Type': 'application/json' },
      data: '',
    });
    expect(emptySummaryRes.status()).toBe(400);
    const emptySummaryData = await emptySummaryRes.json();
    expect(emptySummaryData.success).toBe(false);
    expect(emptySummaryData.error?.code).toBe('INVALID_REQUEST');

    const malformedSummaryRes = await request.post('/api/conversation/summary', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"broken": json',
    });
    expect(malformedSummaryRes.status()).toBe(400);
    const malformedSummaryData = await malformedSummaryRes.json();
    expect(malformedSummaryData.success).toBe(false);
    expect(malformedSummaryData.error?.code).toBe('INVALID_REQUEST');
  });

  test('verifies "Create a goal." triggers Goal/Task Agent and writes goalId without unrelated tools', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    await chatInput.fill('Create a goal.');
    await sendBtn.click();

    const coachRes = await coachResponsePromise;
    expect(coachRes.status()).toBe(200);
    const data = await coachRes.json();

    expect(data.agentDomain).toBe('goal');
    expect(data.toolResult?.tool).toBe('create_goal');
    expect(data.toolResult?.success).toBe(true);
    expect(data.toolResult?.data?.goalId).toBeTruthy();

    await expect(viewport.getByText(/created your goal/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList.getByText('create_goal')).toBeVisible();
    await expect(toolCallList.getByText('Goal/Task Agent')).toBeVisible();

    await expect(toolCallList.getByText('Calendar Agent')).not.toBeVisible();
    await expect(toolCallList.getByText('Memory Agent')).not.toBeVisible();
  });

  test('verifies "Let\'s end the session." ends live session, turns mic OFF, and retains conversation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    await chatInput.fill("Let's end the session.");
    await sendBtn.click();

    const coachRes = await coachResponsePromise;
    expect(coachRes.status()).toBe(200);
    const data = await coachRes.json();
    expect(data.toolResult?.tool).toBe('end_live_session');
    expect(data.endSession).toBe(true);

    await expect(viewport.getByText(/end this session now|goodbye/i).first()).toBeVisible({ timeout: 15000 });
    const micStatus = page.getByTestId('mic-status');
    await expect(micStatus).toContainText(/Off|Standby/i, { timeout: 10000 });
  });

  test('verifies zero stale RUNNING entries and duplicate tool request deduplication', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();

    const runningBadges = toolCallList.locator('text="RUNNING"');
    const runningCount = await runningBadges.count();
    expect(runningCount).toBe(0);

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const timerPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Study for 25 minutes.');
    await sendBtn.click();
    await timerPromise;

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const confirmPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Yes.');
    await sendBtn.click();
    await confirmPromise;

    await page.getByTestId('tab-tool-calls').click();
    const runningAfter = await toolCallList.locator('text="RUNNING"').count();
    expect(runningAfter).toBe(0);
  });
});
