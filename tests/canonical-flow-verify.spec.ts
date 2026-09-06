import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('LifeForge AI - Canonical Flow Verification', () => {
  test.setTimeout(180000);

  test('executes clean resume upload, Live Coach grounded reasoning, goal, task, timer, and single agent', async ({ page }) => {
    const artifactDir = 'C:/Users/shiva/.gemini/antigravity-ide/brain/91d7055e-a575-4331-8266-e8a30c0c5914';
    await page.goto('/');

    const agentBadge = page.getByTestId('agent-orchestration-badge');
    if (await agentBadge.isVisible()) {
      await expect(agentBadge).toContainText('LifeForge Live Coach');
    }

    await page.getByTestId('nav-placements').click();
    await page.getByTestId('tab-resume').click();
    await expect(page.getByText(/Upload Resume & Automated Technical Analysis/i)).toBeVisible({ timeout: 15000 });

    const fileInput = page.getByTestId('resume-file-input');
    await expect(fileInput).toBeAttached();

    const resumePath = path.resolve('test-assets/shivakumar_canonical_resume.txt');
    const resumeContent = fs.readFileSync(resumePath, 'utf-8');

    const uploadPromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 60000 }
    );

    await fileInput.setInputFiles({
      name: 'shivakumar_canonical_resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(resumeContent, 'utf-8'),
    });

    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBe(200);
    const uploadData = await uploadRes.json();
    console.log('[RESUME_UPLOAD] status=200 resumeId=' + uploadData.resumeId);
    console.log('[RESUME_STORAGE] path=' + uploadData.storagePath);
    console.log('[RESUME_ANALYSIS] status=' + uploadData.analysisStatus);
    expect(uploadData.success).toBe(true);
    expect(uploadData.analysisStatus).toBe('COMPLETED');

    await expect(page.getByTestId('resume-uploaded-badge')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('resume-analysis-ready-badge')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: `${artifactDir}/placement_verified_resume.png` });

    await page.getByTestId('nav-live-coach').click();
    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const projectQueryPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 45000 }
    );
    await chatInput.fill('What projects are in my resume?');
    await sendBtn.click();
    const projectRes = await projectQueryPromise;
    const projectData = await projectRes.json();
    console.log('[RESUME_LOOKUP] tool=' + projectData.toolResult?.tool + ' status=' + projectData.toolResult?.status);
    expect(projectData.toolResult?.tool).toBe('get_resume_summary');
    expect(projectData.toolResult?.data?.hasResume).toBe(true);

    await expect(viewport).toContainText(/Distributed Log Engine|SIMD/i, { timeout: 15000 });
    await page.screenshot({ path: `${artifactDir}/live_coach_projects_verified.png` });

    const goalPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 45000 }
    );
    await chatInput.fill('Create a goal to master C++ STL.');
    await sendBtn.click();
    const goalRes = await goalPromise;
    const goalData = await goalRes.json();

    if (goalData.actionRequired === 'CONFIRMATION_REQUIRED') {
      const confirmGoalPromise = page.waitForResponse(
        (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
        { timeout: 45000 }
      );
      await chatInput.fill('Yes, confirm.');
      await sendBtn.click();
      const confirmGoalRes = await confirmGoalPromise;
      const confirmGoalData = await confirmGoalRes.json();
      console.log('[GOAL_CREATE] confirmed goalId=' + confirmGoalData.toolResult?.data?.goalId);
    } else {
      console.log('[GOAL_CREATE] goalId=' + goalData.toolResult?.data?.goalId);
    }

    const taskPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 45000 }
    );
    await chatInput.fill('Create a task to finish my Google Cloud project.');
    await sendBtn.click();
    const taskRes = await taskPromise;
    const taskData = await taskRes.json();

    if (taskData.actionRequired === 'CONFIRMATION_REQUIRED') {
      const confirmTaskPromise = page.waitForResponse(
        (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
        { timeout: 45000 }
      );
      await chatInput.fill('Yes, confirm.');
      await sendBtn.click();
      const confirmTaskRes = await confirmTaskPromise;
      const confirmTaskData = await confirmTaskRes.json();
      console.log('[TASK_CREATE] confirmed taskId=' + confirmTaskData.toolResult?.data?.taskId);
    } else {
      console.log('[TASK_CREATE] taskId=' + taskData.toolResult?.data?.taskId);
    }

    const timerPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 45000 }
    );
    await chatInput.fill('Start a 25 minute focus session.');
    await sendBtn.click();
    const timerRes = await timerPromise;
    const timerData = await timerRes.json();

    if (timerData.confirmationRequired || timerData.pendingTimer || timerData.actionRequired === 'CONFIRMATION_REQUIRED') {
      const confirmTimerPromise = page.waitForResponse(
        (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
        { timeout: 45000 }
      );
      await chatInput.fill('Yes.');
      await sendBtn.click();
      const confirmTimerRes = await confirmTimerPromise;
      const confirmTimerData = await confirmTimerRes.json();
      console.log('[TIMER] confirmed tool=' + confirmTimerData.toolResult?.tool + ' success=' + confirmTimerData.toolResult?.success);
    } else {
      console.log('[TIMER] timerState=' + timerData.toolResult?.data?.state);
    }

    const headerTimer = page.getByTestId('header-global-timer');
    await expect(headerTimer).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${artifactDir}/header_timer_active.png` });

    await page.getByTestId('nav-dashboard').click();
    await expect(headerTimer).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${artifactDir}/dashboard_timer_active.png` });

    await page.getByTestId('nav-live-coach').click();
    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-history-list');
    await expect(toolCallList).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${artifactDir}/tool_calls_verified.png` });
  });
});
