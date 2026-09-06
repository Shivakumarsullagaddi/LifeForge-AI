import { test, expect } from '@playwright/test';

test.describe('Multi-Turn Extended Conversation Persistence', () => {
  test.setTimeout(180000);

  test('maintains multi-turn conversation and persists across navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const viewport = page.getByTestId('conversation-viewport');
    await expect(viewport).toBeVisible({ timeout: 15000 });

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');

    const turns = [
      'Turn 1: Setting up study plan.',
      'Turn 2: What is dynamic programming?',
      'Turn 3: Give me one practical tip for recursion.',
      'Turn 4: How does memoization differ from tabulation?',
      'Turn 5: Review time complexity of binary search.',
      'Turn 6: What data structure implements priority queues?',
      'Turn 7: Define topological sort for directed acyclic graphs.',
      'Turn 8: What is the invariant of Dijkstra algorithm?',
      'Turn 9: How to balance AVL trees?',
      'Turn 10: Final summary of our algorithmic review.',
    ];

    for (const turnText of turns) {
      await expect(chatInput).toBeEnabled({ timeout: 30000 });
      await chatInput.fill(turnText);
      await sendBtn.click();
      await expect(viewport.getByText(turnText).first()).toBeVisible({ timeout: 20000 });
    }

    for (const turnText of turns) {
      await expect(viewport.getByText(turnText).first()).toBeVisible();
    }

    await page.getByTestId('nav-dashboard').click();
    await expect(page.getByTestId('dashboard-view')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('nav-live-coach').click();
    await expect(viewport).toBeVisible({ timeout: 15000 });

    for (const turnText of turns) {
      await expect(viewport.getByText(turnText).first()).toBeVisible({ timeout: 10000 });
    }
  });
});
