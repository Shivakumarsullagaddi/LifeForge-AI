import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import type { GoalItem, TaskItem, PlacementProfile } from './types';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'developer-491706';
const DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-lifeforgeai-32c3ad47-a500-4f7b-8197-70562309ac8a';
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'developer-491706-lifeforge-resumes';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

export function getAdminApp(): App {
  if (!adminApp) {
    if (getApps().length > 0) {
      adminApp = getApps()[0];
    } else {
      adminApp = initializeApp({
        projectId: PROJECT_ID,
        storageBucket: STORAGE_BUCKET,
      });
    }
  }
  return adminApp;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    getAdminApp();
    adminDb = getFirestore(DATABASE_ID);
  }
  return adminDb;
}

export function getAdminBucket() {
  getAdminApp();
  return getStorage().bucket(STORAGE_BUCKET);
}

export async function verifyIdToken(idToken: string) {
  getAdminApp();
  return getAuth().verifyIdToken(idToken);
}

export function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeFirestoreData) as unknown as T;
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        clean[k] = sanitizeFirestoreData(v);
      }
    }
    return clean as T;
  }
  return obj;
}

export async function adminAddGoal(userId: string, goal: Omit<GoalItem, 'id' | 'userId'>): Promise<string> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('goals');
  const now = new Date().toISOString();
  const payload = sanitizeFirestoreData({
    title: goal.title,
    ...(goal.description !== undefined && { description: goal.description }),
    ...(goal.domain !== undefined && { domain: goal.domain }),
    ...(goal.priority !== undefined && { priority: goal.priority }),
    ...(goal.status !== undefined && { status: goal.status }),
    ...(goal.progress !== undefined && { progress: goal.progress }),
    ...(goal.targetDate !== undefined && { targetDate: goal.targetDate }),
    ...(goal.source !== undefined && { source: goal.source }),
    userId,
    createdAt: goal.createdAt || now,
    updatedAt: now,
  });
  const docRef = await collRef.add(payload);
  return docRef.id;
}

export async function adminGetGoals(userId: string): Promise<GoalItem[]> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('goals');
  const snap = await collRef.orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoalItem));
}

export async function adminDeleteGoal(userId: string, goalId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection('users').doc(userId).collection('goals').doc(goalId).delete();
}

export async function adminAddTask(userId: string, task: Omit<TaskItem, 'id' | 'userId'>): Promise<string> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('tasks');
  const now = new Date().toISOString();
  const payload = sanitizeFirestoreData({
    title: task.title,
    ...(task.description !== undefined && { description: task.description }),
    ...(task.domain !== undefined && { domain: task.domain }),
    ...(task.priority !== undefined && { priority: task.priority }),
    ...(task.status !== undefined && { status: task.status }),
    ...(task.dueDate !== undefined && { dueDate: task.dueDate }),
    ...(task.goalId !== undefined && { goalId: task.goalId }),
    ...(task.isDeepWork !== undefined && { isDeepWork: task.isDeepWork }),
    ...(task.estimatedMinutes !== undefined && { estimatedMinutes: task.estimatedMinutes }),
    ...(task.source !== undefined && { source: task.source }),
    userId,
    createdAt: task.createdAt || now,
    updatedAt: now,
  });
  const docRef = await collRef.add(payload);
  return docRef.id;
}

export async function adminGetTasks(userId: string): Promise<TaskItem[]> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('tasks');
  const snap = await collRef.orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskItem));
}

export async function adminDeleteTask(userId: string, taskId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection('users').doc(userId).collection('tasks').doc(taskId).delete();
}

export async function adminSavePlacementProfile(userId: string, data: Partial<PlacementProfile>): Promise<void> {
  const db = getAdminDb();
  const docRef = db.collection('users').doc(userId).collection('placement_profile').doc('default');
  const payload = sanitizeFirestoreData({
    ...data,
    userId,
    updatedAt: new Date().toISOString(),
  });
  await docRef.set(payload, { merge: true });
}

export async function adminGetPlacementProfile(userId: string): Promise<PlacementProfile | null> {
  const db = getAdminDb();
  const docRef = db.collection('users').doc(userId).collection('placement_profile').doc('default');
  const snap = await docRef.get();
  if (snap.exists) {
    return { id: snap.id, ...snap.data() } as PlacementProfile;
  }
  return null;
}

export async function adminSaveResumeMetadata(userId: string, metadata: any): Promise<void> {
  const db = getAdminDb();
  const canonicalRef = db.collection('users').doc(userId).collection('resume_metadata').doc('current');
  const legacyRef = db.collection('users').doc(userId).collection('placement_profile').doc('resume');
  const payload = sanitizeFirestoreData(metadata);
  await Promise.all([
    canonicalRef.set(payload, { merge: true }),
    legacyRef.set(payload, { merge: true }),
  ]);
}

export async function adminGetResumeMetadata(userId: string): Promise<any | null> {
  const db = getAdminDb();
  const canonicalRef = db.collection('users').doc(userId).collection('resume_metadata').doc('current');
  const snap = await canonicalRef.get();
  if (snap.exists) {
    return snap.data();
  }
  const legacyRef = db.collection('users').doc(userId).collection('placement_profile').doc('resume');
  const legacySnap = await legacyRef.get();
  return legacySnap.exists ? legacySnap.data() : null;
}

export async function adminUploadResumeBinary(
  userId: string,
  resumeId: string,
  buffer: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const bucket = getAdminBucket();
  const storagePath = `users/${userId}/placement/resumes/${resumeId}`;
  const file = bucket.file(storagePath);
  await file.save(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), {
    contentType,
    resumable: false,
    metadata: {
      userId,
      resumeId,
      uploadedAt: new Date().toISOString(),
    },
  });
  return storagePath;
}

export async function adminAddActionConfirmation(
  userId: string,
  action: any
): Promise<string> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('action_confirmations');
  const now = new Date().toISOString();
  const payload = sanitizeFirestoreData({
    ...action,
    userId,
    createdAt: action.requestedAt || now,
    updatedAt: now,
  });
  const docRef = await collRef.add(payload);
  return docRef.id;
}

export async function adminGetActionConfirmations(userId: string): Promise<any[]> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('action_confirmations');
  const snap = await collRef.where('status', '==', 'pending').limit(20).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function adminResolveActionConfirmation(
  userId: string,
  actionId: string,
  status: 'approved' | 'rejected' | 'expired'
): Promise<void> {
  const db = getAdminDb();
  const docRef = db.collection('users').doc(userId).collection('action_confirmations').doc(actionId);
  await docRef.set(
    {
      status,
      resolvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function adminAddReflection(userId: string, reflection: any): Promise<string> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('reflections');
  const now = new Date().toISOString();
  const payload = sanitizeFirestoreData({
    ...reflection,
    userId,
    createdAt: reflection.createdAt || now,
    updatedAt: now,
  });
  const docRef = await collRef.add(payload);
  return docRef.id;
}

export async function adminGetReflections(userId: string): Promise<any[]> {
  const db = getAdminDb();
  const collRef = db.collection('users').doc(userId).collection('reflections');
  const snap = await collRef.orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function adminDeleteReflection(userId: string, reflectionId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection('users').doc(userId).collection('reflections').doc(reflectionId).delete();
}

export async function adminDeletePlacementProfile(userId: string): Promise<void> {
  const db = getAdminDb();
  await Promise.all([
    db.collection('users').doc(userId).collection('placement_profile').doc('default').delete().catch(() => {}),
    db.collection('users').doc(userId).collection('placement_profile').doc('resume').delete().catch(() => {}),
    db.collection('users').doc(userId).collection('resume_metadata').doc('current').delete().catch(() => {}),
  ]);
}

export async function adminDeleteAllGoalsAndTasks(userId: string): Promise<void> {
  const db = getAdminDb();
  const goalsColl = db.collection('users').doc(userId).collection('goals');
  const tasksColl = db.collection('users').doc(userId).collection('tasks');
  const [goalsSnap, tasksSnap] = await Promise.all([goalsColl.get(), tasksColl.get()]);
  const batch = db.batch();
  goalsSnap.docs.forEach((d) => batch.delete(d.ref));
  tasksSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function adminDeleteAllReflections(userId: string): Promise<void> {
  const db = getAdminDb();
  const coll = db.collection('users').doc(userId).collection('reflections');
  const snap = await coll.get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function adminDeleteAllConversations(userId: string): Promise<void> {
  const db = getAdminDb();
  const convColl = db.collection('users').doc(userId).collection('conversations');
  const snap = await convColl.get();
  for (const convDoc of snap.docs) {
    const msgsSnap = await convDoc.ref.collection('messages').get();
    const batch = db.batch();
    msgsSnap.docs.forEach((m) => batch.delete(m.ref));
    batch.delete(convDoc.ref);
    await batch.commit();
  }
}

export async function adminDeleteAllStudySessions(userId: string): Promise<void> {
  const db = getAdminDb();
  const coll = db.collection('users').doc(userId).collection('study_sessions');
  const snap = await coll.get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function adminPurgeAllUserData(userId: string): Promise<void> {
  await Promise.all([
    adminDeleteAllGoalsAndTasks(userId),
    adminDeleteAllConversations(userId),
    adminDeleteAllReflections(userId),
    adminDeletePlacementProfile(userId),
    adminDeleteAllStudySessions(userId),
  ]);
}


