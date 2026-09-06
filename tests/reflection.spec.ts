import { test, expect } from '@playwright/test';

test.describe('Reflection Autonomous Agent & Persistent Timeline Verification', () => {
  test.setTimeout(90000);

  test('triggers create_reflection via coach prompt and verifies persistence in Reflections view', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const coachResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );

    await chatInput.fill("Log today's reflection.");
    await sendBtn.click();

    const coachResponse = await coachResponsePromise;
    expect(coachResponse.status()).toBe(200);

    const resData = await coachResponse.json();
    expect(resData.agentDomain).toBe('reflection');
    expect(resData.toolResult).toBeTruthy();
    expect(resData.toolResult.tool).toBe('create_reflection');
    expect(resData.toolResult.success).toBe(true);

    const reflectionId = resData.toolResult.data?.reflectionId || resData.toolResult.data?.id;
    expect(reflectionId).toBeTruthy();

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList.getByText('create_reflection')).toBeVisible();
    await expect(toolCallList.getByText('Reflection Agent')).toBeVisible();
    await expect(toolCallList.getByText('COMPLETED', { exact: true }).first()).toBeVisible();

    await page.getByTestId('nav-reflections').click();
    await expect(page.getByText('Personal Reflection & Performance Evolution')).toBeVisible();

    await page.getByTestId('tab-reflections-history').click();
    const reflectionItem = page.getByTestId('reflection-item');
    await expect(reflectionItem.first()).toBeVisible({ timeout: 15000 });
  });
});
