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
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const authFile = 'playwright/.auth/user.json';
  const context = await browser.newContext({
    storageState: fs.existsSync(authFile) ? authFile : undefined,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  const streakElement = await page.locator('header').textContent();
  console.log('Header text:', streakElement);

  const privNav = page.locator('text=Privacy & Security').first();
  await privNav.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: path.join(imgDir, 'privacy_destructive_controls.png'), fullPage: true });
  console.log('Captured privacy_destructive_controls.png');

  const secTab = page.locator('text=Authentication & Security Rules').first();
  await secTab.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: path.join(imgDir, 'privacy_security_rules.png'), fullPage: true });
  console.log('Captured privacy_security_rules.png');

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
