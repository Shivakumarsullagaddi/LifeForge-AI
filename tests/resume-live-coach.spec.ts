import { test, expect } from '@playwright/test';

test.describe('Resume Live Coach Critical Data Path E2E', () => {
  test.setTimeout(90000);

  test('executes end-to-end Placement resume upload, persists analysis, and verifies Live Coach access and Tool Calls', async ({ page }) => {
    await page.goto('/');

    // 1. Navigate to Placements view
    await page.getByTestId('nav-placements').click();
    await page.getByTestId('tab-resume').click();
    await expect(page.getByText(/Upload Resume & Automated Technical Analysis/i)).toBeVisible({ timeout: 15000 });

    const fileInput = page.getByTestId('resume-file-input');
    await expect(fileInput).toBeAttached();

    const sampleResumeContent = `
=== CANDIDATE RESUME ===
Name: Shivakumar E2E
Target Role: Staff Distributed Systems Engineer
Skills: Go, TypeScript, Next.js, PostgreSQL, Docker, Kafka, Raft Consensus

Projects:
1. Distributed Log Engine
   - Built high-throughput WAL event aggregator processing 50k events/sec.
2. SIMD In-Memory Cache
   - Lock-free ring buffer cache in C++ with sub-millisecond p99 latency.
`;

    // 2. Upload resume in Placement
    const uploadPromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 45000 }
    );

    await fileInput.setInputFiles({
      name: 'canonical_candidate_resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(sampleResumeContent, 'utf-8'),
    });

    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBe(200);
    const uploadData = await uploadRes.json();
    expect(uploadData.success).toBe(true);
    expect(uploadData.analysisStatus).toBe('COMPLETED');

    // 3. Confirm Placement UI shows verified badges
    await expect(page.getByTestId('resume-uploaded-badge')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('resume-analysis-ready-badge')).toBeVisible({ timeout: 20000 });

    // 4. Navigate to Live Coach
    await page.getByTestId('nav-live-coach').click();
    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    // 5. Ask to review/analyze resume
    const reviewPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Please analyze my resume.');
    await sendBtn.click();
    const reviewRes = await reviewPromise;
    const reviewData = await reviewRes.json();

    expect(reviewData.toolResult?.success).toBe(true);
    expect(reviewData.toolResult?.data?.hasResume).toBe(true);
    expect(reviewData.text).not.toMatch(/no resume is uploaded/i);
    expect(reviewData.text).not.toMatch(/please upload your resume before/i);

    // 6. Ask for resume skills
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

    // 7. Ask for resume projects
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

    // 8. Switch to Tool Calls panel and inspect developer logs
    await page.getByTestId('tab-tool-calls').click();
    const toolCallList = page.getByTestId('tool-call-list');
    await expect(toolCallList).toBeVisible();

    const toolItems = page.getByTestId('tool-call-item');
    await expect(toolItems.first()).toBeVisible();

    // Verify get_resume_summary is recorded as COMPLETED in Tool Calls
    await expect(toolCallList.getByText('get_resume_summary').first()).toBeVisible();
    await expect(toolCallList.getByText('COMPLETED').first()).toBeVisible();
    await expect(toolCallList.getByText('Placement Agent').first()).toBeVisible();

    // Verify Tool Calls does NOT show interactive action buttons
    await expect(page.getByTestId('connect-calendar-btn')).not.toBeVisible();
    await expect(page.getByTestId('upload-resume-btn')).not.toBeVisible();
  });
});
