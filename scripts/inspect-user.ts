import { getAdminDb } from '../lib/firebase-admin';

export async function inspectUserData(userId: string) {
  console.log(`\n==================================================`);
  console.log(`[INSPECT_USER_DATA] Starting inspection for: ${userId}`);
  console.log(`==================================================`);

  const db = getAdminDb();
  const userDocRef = db.collection('users').doc(userId);

  // 1. Check user doc
  const userSnap = await userDocRef.get();
  console.log(`users/${userId} exists:`, userSnap.exists);

  // 2. Placement profile
  const placementDoc = await userDocRef.collection('placement_profile').doc('default').get();
  console.log(`placement_profile/default exists:`, placementDoc.exists);

  // 3. Resume metadata
  const metaDoc = await userDocRef.collection('resume_metadata').doc('current').get();
  console.log(`resume_metadata/current exists:`, metaDoc.exists);

  // Resume inspection
  const profileData = placementDoc.exists ? placementDoc.data() : null;
  const resumeProfile = profileData?.resumeProfile || null;
  const metaData = metaDoc.exists ? metaDoc.data() : null;

  const resumeExists = !!(resumeProfile || metaData);
  const resumeDocId = metaData?.resumeId || resumeProfile?.resumeId || (placementDoc.exists ? 'default' : 'none');
  const analysisStatus = metaData?.analysisStatus || resumeProfile?.analysisStatus || 'NOT_FOUND';

  console.log(`\n[RESUME_SOURCE]`);
  console.log(`userId=${userId}`);
  console.log(`storagePath=${metaData?.storagePath || `users/${userId}/placement/resumes/${resumeDocId}`}`);
  console.log(`firestorePath=users/${userId}/placement_profile/default`);
  console.log(`documentId=${resumeDocId}`);
  console.log(`analysisStatus=${analysisStatus}`);

  console.log(`\n--- RESUME DETAILS ---`);
  console.log(`resume exists:`, resumeExists);
  console.log(`resume document id:`, resumeDocId);
  console.log(`analysis status:`, analysisStatus);
  console.log(`summary exists:`, !!resumeProfile?.summary);
  console.log(`skills count:`, Array.isArray(resumeProfile?.skills) ? resumeProfile.skills.length : 0);
  console.log(`projects count:`, Array.isArray(resumeProfile?.projects) ? resumeProfile.projects.length : 0);
  console.log(`achievements count:`, Array.isArray(resumeProfile?.achievements) ? resumeProfile.achievements.length : 0);
  console.log(`education count:`, Array.isArray(resumeProfile?.education) ? resumeProfile.education.length : 0);
  console.log(`experience count:`, Array.isArray(resumeProfile?.experience) ? resumeProfile.experience.length : 0);

  // Goals
  const goalsSnap = await userDocRef.collection('goals').get();
  console.log(`\ngoals count:`, goalsSnap.docs.length);
  goalsSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`  - [${d.id}] "${data.title}" (status: ${data.status}, domain: ${data.domain})`);
  });

  // Tasks
  const tasksSnap = await userDocRef.collection('tasks').get();
  console.log(`\ntasks count:`, tasksSnap.docs.length);
  tasksSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`  - [${d.id}] "${data.title}" (status: ${data.status}, priority: ${data.priority})`);
  });

  // Conversations
  const convsSnap = await userDocRef.collection('conversations').get();
  console.log(`\nconversations count:`, convsSnap.docs.length);

  // Reflections
  const reflectionsSnap = await userDocRef.collection('reflections').get();
  console.log(`reflections count:`, reflectionsSnap.docs.length);

  // Confirmations
  const confsSnap = await userDocRef.collection('action_confirmations').get();
  console.log(`action_confirmations count:`, confsSnap.docs.length);

  console.log(`==================================================\n`);

  return {
    userId,
    resumeExists,
    resumeDocId,
    analysisStatus,
    goalsCount: goalsSnap.docs.length,
    tasksCount: tasksSnap.docs.length,
    conversationsCount: convsSnap.docs.length,
    reflectionsCount: reflectionsSnap.docs.length,
  };
}

async function main() {
  const targetUid = process.argv[2] || 'test_e2e_student';
  await inspectUserData(targetUid);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Inspection failed:', err);
    process.exit(1);
  });
}
