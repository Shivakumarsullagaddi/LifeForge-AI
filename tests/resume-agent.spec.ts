import { test, expect } from '@playwright/test';

test.describe('Resume Canonical Flow & Live Coach Grounding', () => {
  test.setTimeout(90000);

  test('uploads resume in Placement, verifies canonical get_resume_summary and Live Coach grounding', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('nav-placements').click();
    await page.getByTestId('tab-resume').click();
    await expect(page.getByText(/Upload Resume & Automated Technical Analysis/i)).toBeVisible({ timeout: 15000 });

    const fileInput = page.getByTestId('resume-file-input');
    await expect(fileInput).toBeAttached();

    const sampleResumeContent = `
=== CANDIDATE RESUME ===
Name: Shivakumar Canonical
Target Role: Principal Systems Architect
Skills: Go, TypeScript, Next.js, Distributed Systems, Raft, Docker, Kafka

Projects:
1. Distributed Log Engine
   - High-performance WAL log engine with 50k ops/sec.
2. SIMD In-Memory Cache
   - Low-latency ring buffer cache in C++.
`;

    const uploadPromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 45000 }
    );

    await fileInput.setInputFiles({
      name: 'canonical_eval_resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(sampleResumeContent, 'utf-8'),
    });

    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBe(200);
    const uploadData = await uploadRes.json();
    expect(uploadData.success).toBe(true);

    await expect(page.getByTestId('resume-uploaded-badge')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('resume-analysis-ready-badge')).toBeVisible({ timeout: 20000 });

    await page.getByTestId('nav-live-coach').click();
    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const skillsPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What skills are on my resume?');
    await sendBtn.click();
    const skillsRes = await skillsPromise;
    const skillsData = await skillsRes.json();

    expect(skillsData.toolResult?.tool).toBe('get_resume_summary');
    expect(skillsData.toolResult?.success).toBe(true);
    expect(skillsData.text).toMatch(/skills identified in your resume/i);

    const projectsPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('What projects are on my resume?');
    await sendBtn.click();
    const projectsRes = await projectsPromise;
    const projectsData = await projectsRes.json();

    expect(projectsData.toolResult?.tool).toBe('get_resume_summary');
    expect(projectsData.toolResult?.success).toBe(true);
    expect(projectsData.text).toMatch(/Distributed Log Engine/i);

    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();
    await expect(toolCallList.getByText('get_resume_summary').first()).toBeVisible();
    await expect(toolCallList.getByText('COMPLETED').first()).toBeVisible();
  });
});
