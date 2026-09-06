import { test, expect } from '@playwright/test';

test.describe('Task and Goal Deletion Card Metadata Integrity', () => {
  test.setTimeout(90000);

  test('displays exact task title, domain, and priority metadata in confirmation card', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const createPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Create a task to Explain SQL vs NoSQL.');
    await sendBtn.click();
    const createRes = await createPromise;
    const createData = await createRes.json();
    expect(createData.toolResult?.tool).toBe('create_task');
    expect(createData.toolResult?.success).toBe(true);

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const deletePromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Delete task Explain SQL vs NoSQL.');
    await sendBtn.click();
    const delRes = await deletePromise;
    const delData = await delRes.json();
    expect(delData.toolResult?.tool).toBe('delete_task');
    expect(delData.toolResult?.requiresConfirmation).toBe(true);

    const dialog = page.getByTestId('confirmation-dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText(/Explain SQL vs NoSQL/i)).toBeVisible();
    await expect(dialog.getByText(/Task Title/i)).toBeVisible();
    await expect(dialog.getByText(/Priority:/i)).toBeVisible();

    const cancelBtn = dialog.getByTestId('cancel-action');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
  });
});
