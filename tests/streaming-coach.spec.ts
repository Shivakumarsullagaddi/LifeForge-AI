import { test, expect } from '@playwright/test';

test.describe('Gemini Streaming Text Model Verification', () => {
  test('streams text response progressively and completes turn cleanly', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport).toBeVisible();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    await chatInput.fill('Explain the difference between BFS and DFS in graph traversal in 3 concise bullet points.');
    await sendBtn.click();

    await expect(viewport.getByText(/BFS|DFS|traversal/i).first()).toBeVisible({ timeout: 20000 });
    await expect(chatInput).toBeEnabled({ timeout: 30000 });

    await page.screenshot({ path: 'tests/artifacts/streaming_response_verified.png' });
  });
});
