import { test, expect } from '@playwright/test';

test.describe('Privacy and Security Destructive Deletion Controls', () => {
  test.setTimeout(90000);

  test('successfully opens modal and executes deletion for goals, reflections, conversations, and resume', async ({ page }) => {
    await page.goto('/');

    const privacyNav = page.getByTestId('nav-privacy');
    await expect(privacyNav).toBeVisible({ timeout: 15000 });
    await privacyNav.click();

    await expect(page.getByText('Destructive Controls & Right to be Forgotten')).toBeVisible({ timeout: 10000 });

    const btnDeleteGoals = page.getByTestId('btn-delete-goals-tasks');
    await expect(btnDeleteGoals).toBeVisible();
    await btnDeleteGoals.click();

    const confirmModal = page.getByRole('dialog');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.getByRole('heading', { name: 'Delete Goals & Tasks' })).toBeVisible();

    const cancelBtn = page.getByTestId('modal-cancel-delete');
    await cancelBtn.click();
    await expect(confirmModal).not.toBeVisible();

    const deletePromise = page.waitForResponse(
      (res) => res.url().includes('/api/user/delete-data') && res.request().method() === 'POST',
      { timeout: 20000 }
    );
    await btnDeleteGoals.click();
    await expect(confirmModal).toBeVisible();
    await page.getByTestId('modal-confirm-delete').click();
    const res = await deletePromise;
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    await expect(page.getByText('All goals and tasks were permanently deleted.')).toBeVisible({ timeout: 10000 });

    const btnDeleteReflections = page.getByTestId('btn-delete-reflections');
    await btnDeleteReflections.click();
    await expect(confirmModal).toBeVisible();
    const reflPromise = page.waitForResponse(
      (res) => res.url().includes('/api/user/delete-data') && res.request().method() === 'POST',
      { timeout: 20000 }
    );
    await page.getByTestId('modal-confirm-delete').click();
    const reflRes = await reflPromise;
    expect(reflRes.status()).toBe(200);
    await expect(page.getByText('All daily reflections and weekly reviews were permanently deleted.')).toBeVisible({ timeout: 10000 });

    const btnDeleteResume = page.getByTestId('btn-delete-resume');
    await btnDeleteResume.click();
    await expect(confirmModal).toBeVisible();
    const resumePromise = page.waitForResponse(
      (res) => res.url().includes('/api/user/delete-data') && res.request().method() === 'POST',
      { timeout: 20000 }
    );
    await page.getByTestId('modal-confirm-delete').click();
    const resumeRes = await resumePromise;
    expect(resumeRes.status()).toBe(200);
    await expect(page.getByText('Placement profile and resume records were permanently deleted.')).toBeVisible({ timeout: 10000 });

    const btnDeleteConvs = page.getByTestId('btn-delete-conversations');
    await btnDeleteConvs.click();
    await expect(confirmModal).toBeVisible();
    const convPromise = page.waitForResponse(
      (res) => res.url().includes('/api/user/delete-data') && res.request().method() === 'POST',
      { timeout: 20000 }
    );
    await page.getByTestId('modal-confirm-delete').click();
    const convRes = await convPromise;
    expect(convRes.status()).toBe(200);
    await expect(page.getByText('All conversation sessions were permanently deleted and restarted.')).toBeVisible({ timeout: 10000 });
  });
});
