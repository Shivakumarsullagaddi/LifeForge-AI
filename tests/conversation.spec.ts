import { test, expect } from '@playwright/test';

test.describe('Conversation Lifecycle - Multi-Turn, Text, & Archive', () => {
  test.setTimeout(90000);

  test('persists multi-turn conversation in chronological order', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport).toBeVisible();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    await chatInput.fill('Turn 1: Hello coach, let us focus on algorithmic problem solving.');
    await sendBtn.click();
    await expect(viewport.getByText('Turn 1: Hello coach, let us focus on algorithmic problem solving.')).toBeVisible({ timeout: 15000 });
    await expect(chatInput).toBeEnabled({ timeout: 30000 });

    await chatInput.fill('Turn 2: What is the optimal time complexity of quicksort in the average case?');
    await sendBtn.click();
    await expect(viewport.getByText('Turn 2: What is the optimal time complexity of quicksort in the average case?')).toBeVisible({ timeout: 15000 });
    await expect(chatInput).toBeEnabled({ timeout: 30000 });

    await chatInput.fill('Turn 3: Explain the partition logic concisely.');
    await sendBtn.click();
    await expect(viewport.getByText('Turn 3: Explain the partition logic concisely.')).toBeVisible({ timeout: 15000 });
    await expect(chatInput).toBeEnabled({ timeout: 30000 });

    await expect(viewport.getByText('Turn 1: Hello coach, let us focus on algorithmic problem solving.')).toBeVisible();
    await expect(viewport.getByText('Turn 2: What is the optimal time complexity of quicksort in the average case?')).toBeVisible();
    await expect(viewport.getByText('Turn 3: Explain the partition logic concisely.')).toBeVisible();
  });

  test('sends text during active live voice and verifies conversationId association', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const startVoiceBtn = page.getByTestId('start-live-voice');
    await startVoiceBtn.click();
    await expect(page.getByTestId('end-session')).toBeVisible({ timeout: 15000 });

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    await chatInput.fill('Create a goal for DSA.');
    const coachRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/coach') && req.method() === 'POST',
      { timeout: 20000 }
    );
    await sendBtn.click();

    const coachRequest = await coachRequestPromise;
    const postData = coachRequest.postDataJSON();
    expect(postData).toBeTruthy();
    expect(postData.conversationId).toBeTruthy();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport.getByText('Create a goal for DSA.')).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('end-session')).toBeVisible();
    await page.getByTestId('end-session').click();
    await expect(page.getByTestId('start-live-voice')).toBeVisible({ timeout: 15000 });
  });

  test('creates new conversation and resets timeline while archiving previous turns', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');

    await chatInput.fill('Conversation Alpha: Initial check-in on semester study goals.');
    await sendBtn.click();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport.getByText('Conversation Alpha: Initial check-in on semester study goals.')).toBeVisible({ timeout: 15000 });

    const newConvBtn = page.getByTestId('new-conversation');
    await newConvBtn.click();

    await expect(viewport.getByText('Conversation Alpha: Initial check-in on semester study goals.')).not.toBeVisible({ timeout: 10000 });

    await page.getByTestId('nav-conversations').click();
    await expect(page.getByText('Coaching Conversation Archive')).toBeVisible();
  });
});
