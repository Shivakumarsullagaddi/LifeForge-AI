import { getAdminDb, getAdminBucket } from '../lib/firebase-admin';

export async function inspectDevUser(userId: string) {
  const db = getAdminDb();
  const userDocRef = db.collection('users').doc(userId);

  const [metaDoc, placementDoc, goalsSnap, tasksSnap, reflectionsSnap, convsSnap, confsSnap] = await Promise.all([
    userDocRef.collection('resume_metadata').doc('current').get(),
    userDocRef.collection('placement_profile').doc('default').get(),
    userDocRef.collection('goals').get(),
    userDocRef.collection('tasks').get(),
    userDocRef.collection('reflections').get(),
    userDocRef.collection('conversations').get(),
    userDocRef.collection('action_confirmations').get(),
  ]);

  const profileData = placementDoc.exists ? placementDoc.data() : null;
  const resumeProfile = profileData?.resumeProfile || null;
  const metaData = metaDoc.exists ? metaDoc.data() : null;

  const resumeExists = !!(resumeProfile || metaData);
  const resumeId = metaData?.resumeId || resumeProfile?.resumeId || null;
  const analysisStatus = metaData?.analysisStatus || resumeProfile?.analysisStatus || 'NOT_FOUND';

  const report = {
    userId,
    path: `users/${userId}`,
    resume_metadata: metaDoc.exists,
    placement_profile: placementDoc.exists,
    resume_records: resumeExists ? 1 : 0,
    resumeId,
    analysisStatus,
    goals_count: goalsSnap.size,
    tasks_count: tasksSnap.size,
    reflections_count: reflectionsSnap.size,
    conversations_count: convsSnap.size,
    confirmations_count: confsSnap.size,
    summary_exists: !!resumeProfile?.summary,
    skills_count: Array.isArray(resumeProfile?.skills) ? resumeProfile.skills.length : 0,
    projects_count: Array.isArray(resumeProfile?.projects) ? resumeProfile.projects.length : 0,
  };

  console.log(`\n[INSPECT_DEV_USER]`, JSON.stringify(report, null, 2));
  return report;
}

export async function resetDevUser(userId: string) {
  if (!userId || (!userId.startsWith('test_') && !userId.includes('test') && !userId.includes('dev'))) {
    throw new Error(`Safety Guard: resetDevUser only permitted on dev/test accounts, received: ${userId}`);
  }

  const db = getAdminDb();
  const bucket = getAdminBucket();
  const userDocRef = db.collection('users').doc(userId);

  console.log(`\n==================================================`);
  console.log(`[RESET_DEV_USER] Cleaning development data for: ${userId}`);
  console.log(`==================================================`);

  const collectionsToClear = [
    'goals',
    'tasks',
    'reflections',
    'conversations',
    'action_confirmations',
    'study_sessions',
    'resume_metadata',
    'placement_profile',
  ];

  for (const col of collectionsToClear) {
    const snap = await userDocRef.collection(col).get();
    if (!snap.empty) {
      console.log(`Deleting ${snap.size} documents from users/${userId}/${col}`);
      for (const d of snap.docs) {
        // Check subcollections like conversations/{id}/messages
        if (col === 'conversations') {
          const msgSnap = await d.ref.collection('messages').get();
          for (const m of msgSnap.docs) {
            await m.ref.delete();
          }
        }
        await d.ref.delete();
      }
    }
  }

  // Also clean test resume files from Cloud Storage under users/{userId}/placement/resumes/
  try {
    const [files] = await bucket.getFiles({ prefix: `users/${userId}/` });
    if (files.length > 0) {
      console.log(`Cleaning ${files.length} storage files under users/${userId}/`);
      for (const f of files) {
        await f.delete().catch(() => {});
      }
    }
  } catch (storeErr) {
    console.warn('Storage cleanup notice:', storeErr);
  }

  console.log(`✓ Dev user ${userId} reset complete.`);
  await inspectDevUser(userId);
}

async function main() {
  const action = process.argv[2] || 'inspect';
  const targetUid = process.argv[3] || 'test_e2e_student';

  if (action === 'reset') {
    await resetDevUser(targetUid);
  } else {
    await inspectDevUser(targetUid);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Operation failed:', err);
    process.exit(1);
  });
}
