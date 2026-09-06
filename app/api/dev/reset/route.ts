import { NextRequest, NextResponse } from 'next/server';
import { testStore } from '@/lib/test-store';
import { getFirebaseDb } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || 'test_e2e_student';

    if (!targetUserId.startsWith('test_')) {
      return NextResponse.json(
        { success: false, error: 'Reset is strictly restricted to test_* accounts.' },
        { status: 403 }
      );
    }

    testStore.clearUser(targetUserId);

    const devCollections = [
      'conversations',
      'goals',
      'tasks',
      'reflections',
      'action_confirmations',
      'study_sessions',
      'placement_profile',
      'resume_metadata',
    ];

    const firestoreCounts: Record<string, number> = {};

    try {
      const db = getFirebaseDb();
      for (const colName of devCollections) {
        const colRef = collection(db, 'users', targetUserId, colName);
        const snapshot = await getDocs(colRef).catch(() => null);
        if (snapshot && !snapshot.empty) {
          firestoreCounts[colName] = snapshot.size;
          for (const d of snapshot.docs) {
            await deleteDoc(doc(db, 'users', targetUserId, colName, d.id)).catch(() => {});
          }
        } else {
          firestoreCounts[colName] = 0;
        }
      }
    } catch (fsErr) {
      console.warn('[DevReset] Firestore direct cleanup notice:', fsErr);
    }

    const verifyStore = {
      goals: testStore.getGoals(targetUserId).length,
      tasks: testStore.getTasks(targetUserId).length,
      reflections: testStore.getReflections(targetUserId).length,
      conversations: testStore.getConversations(targetUserId).length,
      confirmations: testStore.getActionConfirmations(targetUserId).length,
    };

    const isStoreEmpty = Object.values(verifyStore).every((count) => count === 0);

    return NextResponse.json({
      success: true,
      targetUserId,
      clearedAt: new Date().toISOString(),
      storeVerifiedEmpty: isStoreEmpty,
      verifyStore,
      firestoreCounts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Dev reset failed' },
      { status: 500 }
    );
  }
}
