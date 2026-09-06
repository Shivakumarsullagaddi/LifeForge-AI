import {
  adminAddGoal,
  adminGetGoals,
  adminDeleteGoal,
  adminAddTask,
  adminGetTasks,
  adminDeleteTask,
  adminSaveResumeMetadata,
  adminGetResumeMetadata,
  adminSavePlacementProfile,
  adminGetPlacementProfile,
  adminUploadResumeBinary,
  getAdminBucket,
} from '../lib/firebase-admin';

async function verifyAllAdmin() {
  const testUid = 'admin_verify_test_user';
  console.log(`Starting backend verification for user: ${testUid}`);

  const now = new Date().toISOString();
  const goalId = await adminAddGoal(testUid, {
    title: 'Master C++ STL Algorithms',
    domain: 'study',
    priority: 'high',
    status: 'in_progress',
    progress: 0,
    source: 'Firebase Admin Verification',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✓ Goal created with ID: ${goalId}`);

  const goals = await adminGetGoals(testUid);
  const foundGoal = goals.find((g) => g.id === goalId);
  if (!foundGoal) throw new Error('Goal readback verification failed');
  console.log(`✓ Goal readback verified: "${foundGoal.title}"`);

  await adminDeleteGoal(testUid, goalId);
  console.log(`✓ Goal deleted cleanly`);

  const taskId = await adminAddTask(testUid, {
    title: 'Finish Google Cloud Project',
    domain: 'study',
    priority: 'high',
    status: 'pending',
    isDeepWork: true,
    estimatedMinutes: 25,
    source: 'Firebase Admin Verification',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✓ Task created with ID: ${taskId}`);

  const tasks = await adminGetTasks(testUid);
  const foundTask = tasks.find((t) => t.id === taskId);
  if (!foundTask) throw new Error('Task readback verification failed');
  console.log(`✓ Task readback verified: "${foundTask.title}"`);

  await adminDeleteTask(testUid, taskId);
  console.log(`✓ Task deleted cleanly`);

  const resumeId = `res_${Date.now()}`;
  const dummyBuffer = Buffer.from('%PDF-1.4 Mock PDF Binary Content for Verification');
  const storagePath = await adminUploadResumeBinary(testUid, resumeId, dummyBuffer, 'application/pdf');
  console.log(`✓ Resume binary uploaded to Storage: ${storagePath}`);

  await adminSaveResumeMetadata(testUid, {
    resumeId,
    fileName: 'resume.pdf',
    contentType: 'application/pdf',
    size: dummyBuffer.length,
    storagePath,
    uploadedAt: now,
    processingStatus: 'COMPLETED',
    analysisStatus: 'COMPLETED',
  });
  console.log(`✓ Resume metadata saved`);

  const meta = await adminGetResumeMetadata(testUid);
  if (!meta || meta.resumeId !== resumeId) throw new Error('Resume metadata readback failed');
  console.log(`✓ Resume metadata readback verified: fileName=${meta.fileName}`);

  await adminSavePlacementProfile(testUid, {
    targetRole: 'Software Engineer',
    skills: [],
    resumeStatus: 'interview_ready',
    preparationProgress: 80,
    resumeProfile: {
      resumeId,
      fileName: 'resume.pdf',
      uploadedAt: now,
      summary: 'Experienced developer in C++, Go, and Distributed Systems',
      skills: ['C++', 'Go', 'Distributed Systems'],
      projects: [{ title: 'LifeForge AI', description: 'Autonomous agent platform', techStack: ['Next.js', 'Firebase'] }],
      experience: [],
      education: [],
      strengths: ['High performance computing'],
      gaps: ['Frontend CSS animations'],
      interviewQuestions: [
        {
          question: 'Explain Raft consensus leader election and log replication',
          category: 'Distributed Systems',
          expectedPoints: ['Leader election terms', 'Heartbeats', 'Log matching invariant'],
        },
      ],
    },
  });
  console.log(`✓ Placement profile saved`);

  const profile = await adminGetPlacementProfile(testUid);
  if (!profile || !profile.resumeProfile) throw new Error('Placement profile readback failed');
  console.log(`✓ Placement profile readback verified: summary="${profile.resumeProfile.summary}"`);

  const bucket = getAdminBucket();
  await bucket.file(storagePath).delete();
  console.log(`✓ Storage file cleaned up cleanly`);

  console.log('\n--- ALL BACKEND VERIFICATION CHECKS PASSED WITH ZERO ERRORS ---');
}

verifyAllAdmin().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
