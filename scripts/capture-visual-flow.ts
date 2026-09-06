import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function run() {
  const artifactDir = 'C:\\Users\\shiva\\.gemini\\antigravity-ide\\brain\\91d7055e-a575-4331-8266-e8a30c0c5914';
  const imgDir = path.join(artifactDir, 'visual_evidence');
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 300,
    args: ['--disable-gpu', '--disable-software-rasterizer', '--no-sandbox']
  });

  const authFile = 'playwright/.auth/user.json';
  const context = await browser.newContext({
    storageState: fs.existsSync(authFile) ? authFile : undefined,
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForSelector('header', { timeout: 30000 });
  await page.screenshot({ path: path.join(imgDir, '01_homepage_clean.png'), fullPage: true });

  await page.getByTestId('nav-live-coach').click();
  const chatInput = page.getByTestId('chat-input');
  const sendBtn = page.getByTestId('send-message');
  await chatInput.waitFor({ state: 'visible', timeout: 15000 });

  const timerPromptPromise = page.waitForResponse(
    (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
    { timeout: 30000 }
  );
  await chatInput.fill('Study for 25 minutes.');
  await sendBtn.click();
  await timerPromptPromise;

  await page.waitForSelector('text=Shall I start it?', { timeout: 15000 });
  await page.screenshot({ path: path.join(imgDir, '02_timer_confirmation_prompt.png'), fullPage: true });

  const timerConfirmPromise = page.waitForResponse(
    (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
    { timeout: 30000 }
  );
  await chatInput.fill('Yes.');
  await sendBtn.click();
  await timerConfirmPromise;

  const headerTimer = page.getByTestId('header-global-timer');
  await headerTimer.waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: path.join(imgDir, '03_timer_running_header_single.png'), fullPage: true });

  const taskPromise = page.waitForResponse(
    (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
    { timeout: 30000 }
  );
  await chatInput.fill('Create a task to Complete Raft consensus implementation');
  await sendBtn.click();
  await taskPromise;

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(imgDir, '04_task_created_tool_completed.png'), fullPage: true });

  const deleteRequestPromise = page.waitForResponse(
    (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
    { timeout: 30000 }
  );
  await chatInput.fill('Delete task Complete Raft consensus implementation');
  await sendBtn.click();
  await deleteRequestPromise;

  await page.waitForSelector('[data-testid="confirm-action"]', { timeout: 15000 });
  await page.screenshot({ path: path.join(imgDir, '05_deletion_prioritized_guard.png'), fullPage: true });

  await page.getByTestId('cancel-action').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(imgDir, '06_deletion_cancelled_safe.png'), fullPage: true });

  await page.getByTestId('nav-dashboard').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(imgDir, '07_dashboard_header_timer_persists.png'), fullPage: true });

  await page.getByTestId('nav-goals').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(imgDir, '08_goals_view_timer_persists.png'), fullPage: true });

  await page.getByTestId('nav-placements').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(imgDir, '09_placements_view_timer_persists.png'), fullPage: true });

  await context.close();
  await browser.close();
  console.log('ALL_VISUAL_SCREENSHOTS_CAPTURED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
