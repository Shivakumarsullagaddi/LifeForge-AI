import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const authFile = 'playwright/.auth/user.json';

setup('authenticate dedicated test user', async ({ page }) => {
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  if (fs.existsSync(authFile)) {
    try {
      const content = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      if (content && (content.cookies?.length > 0 || content.origins?.length > 0)) {
        return;
      }
    } catch {
    }
  }

  if (process.env.LIFEFORGE_MANUAL_AUTH === 'true') {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 120000 });
    await page.context().storageState({ path: authFile });
    return;
  }

  const defaultAuthState = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:3000',
        localStorage: [
          {
            name: 'lifeforge_test_auth',
            value: JSON.stringify({
              uid: 'test_e2e_student',
              email: 'test-student@lifeforge.test',
              displayName: 'LifeForge E2E Student',
              photoURL: '',
            }),
          },
        ],
      },
    ],
  };
  fs.writeFileSync(authFile, JSON.stringify(defaultAuthState, null, 2), 'utf8');
});
