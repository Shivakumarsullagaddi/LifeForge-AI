import { test, expect } from '@playwright/test';

test.describe('Placement & Live Coach Resume Pipeline, Analysis & Technical Interview', () => {
  test.setTimeout(90000);

  test('detects absent resume, executes resume upload on Placements view, and verifies analysis readiness', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-placements').click();

    await page.getByTestId('tab-resume').click();
    await expect(page.getByText(/Upload Resume & Automated Technical Analysis/i)).toBeVisible({ timeout: 15000 });

    const fileInput = page.getByTestId('resume-file-input');
    await expect(fileInput).toBeAttached();

    const sampleResumeContent = `
=== RESUME ===
Name: LifeForge E2E Student
Target Role: Distributed Systems & Backend Engineer
Education: B.Tech Computer Science, 2026, GPA: 9.2

Skills:
- Languages: TypeScript, Go, Python, C++, SQL
- Systems: Docker, Kubernetes, PostgreSQL, Redis, Kafka, gRPC

Projects:
1. Distributed Log & Event Processing Engine
   - Implemented high-throughput WAL and sliding-window event aggregator in Go.
   - Processed 50k events/sec with under 5ms p99 latency across 3 replica nodes using Raft consensus.
2. High-Performance In-Memory Cache
   - Built an LRU cache in C++ with lock-free ring buffers and SIMD-accelerated key hashing.
`;

    const uploadPromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 45000 }
    );

    await fileInput.setInputFiles({
      name: 'lifeforge_sample_resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(sampleResumeContent, 'utf-8'),
    });

    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBe(200);
    const uploadData = await uploadRes.json();
    expect(uploadData.success).toBe(true);
    expect(uploadData.processingStatus).toBe('COMPLETED');
    expect(uploadData.analysisStatus).toBe('COMPLETED');

    await expect(page.getByTestId('resume-uploaded-badge')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('resume-analysis-ready-badge')).toBeVisible({ timeout: 20000 });
  });

  test('negative test: rejects invalid format and empty files with verified errors', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-placements').click();
    await page.getByTestId('tab-resume').click();
    const fileInput = page.getByTestId('resume-file-input');

    const invalidTypePromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await fileInput.setInputFiles({
      name: 'malicious_executable.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZbinarydata', 'utf-8'),
    });
    const invalidRes = await invalidTypePromise;
    expect(invalidRes.status()).toBe(400);
    const invalidData = await invalidRes.json();
    expect(invalidData.error).toMatch(/Invalid file format/i);
    await expect(page.getByText(/Invalid file format/i)).toBeVisible({ timeout: 10000 });

    const emptyPromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await fileInput.setInputFiles({
      name: 'empty_resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('', 'utf-8'),
    });
    const emptyRes = await emptyPromise;
    expect(emptyRes.status()).toBe(400);
    const emptyData = await emptyRes.json();
    expect(emptyData.error).toMatch(/empty/i);
    await expect(page.getByText(/Uploaded file is empty/i)).toBeVisible({ timeout: 10000 });
  });

  test('triggers resume required in Live Coach, uploads via shared pipeline, and generates interview questions', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-live-coach').click();

    const chatInput = page.getByTestId('chat-input');
    const sendBtn = page.getByTestId('send-message');
    const viewport = page.getByTestId('conversation-viewport');
    await expect(chatInput).toBeEnabled({ timeout: 15000 });

    const promptPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Please review my resume.');
    await sendBtn.click();
    await promptPromise;

    const liveFileInput = page.getByTestId('live-resume-file-input');
    const uploadLivePromise = page.waitForResponse(
      (res) => res.url().includes('/api/placement/resume') && res.request().method() === 'POST',
      { timeout: 45000 }
    );

    await liveFileInput.setInputFiles({
      name: 'live_coach_candidate_resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Candidate: LifeForge Student\nRole: Systems Engineer\nSkills: Go, C++, Linux, Raft\nProject: Raft Consensus Engine', 'utf-8'),
    });

    const liveUploadRes = await uploadLivePromise;
    expect(liveUploadRes.status()).toBe(200);
    const liveUploadData = await liveUploadRes.json();
    expect(liveUploadData.success).toBe(true);

    await expect(chatInput).toBeEnabled({ timeout: 15000 });
    const interviewPromise = page.waitForResponse(
      (res) => res.url().includes('/api/coach') && res.request().method() === 'POST',
      { timeout: 30000 }
    );
    await chatInput.fill('Ask me interview questions from my resume.');
    await sendBtn.click();

    const interviewRes = await interviewPromise;
    const interviewData = await interviewRes.json();
    expect(interviewData.agentDomain).toBe('placement');
    expect(interviewData.toolResult?.tool).toBe('generate_interview_questions');
    expect(interviewData.text).toMatch(/interview question/i);

    await expect(viewport.getByText(/Based on your analyzed resume/i).first()).toBeVisible({ timeout: 15000 });
  });
});
