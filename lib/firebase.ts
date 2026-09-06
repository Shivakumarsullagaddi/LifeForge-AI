import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  type Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  deleteDoc,
  limit,
  onSnapshot,
  increment,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import type {
  UserProfile,
  GoalItem,
  TaskItem,
  ReflectionEntry,
  ConversationSession,
  ChatMessage,
  ActionConfirmation,
  StudySessionRecord,
  PlacementProfile,
  AgentDomain,
} from './types';

// Read config from firebase-applet-config.json
let firebaseConfig: Record<string, string> = {};
try {
  firebaseConfig = require('../firebase-applet-config.json');
} catch {
  console.warn('firebase-applet-config.json not found, using fallback or env');
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseConfig.apiKey,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || firebaseConfig.appId,
      });
    }
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    const databaseId =
      process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID ||
      firebaseConfig.firestoreDatabaseId ||
      '(default)';
    if (databaseId && databaseId !== '(default)') {
      db = getFirestore(getFirebaseApp(), databaseId);
    } else {
      db = getFirestore(getFirebaseApp());
    }
  }
  return db;
}

let storage: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    const bucket =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      firebaseConfig.storageBucket ||
      'developer-491706-lifeforge-resumes';
    storage = getStorage(getFirebaseApp(), `gs://${bucket}`);
  }
  return storage;
}

// Google Workspace Scopes
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// In-memory access token cache
let cachedAccessToken: string | null = null;

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export interface ClassifiedAuthError {
  code: string;
  category:
    | 'popup-closed-by-user'
    | 'popup-blocked'
    | 'unauthorized-domain'
    | 'auth-domain-config-error'
    | 'operation-not-allowed'
    | 'account-exists-with-different-credential'
    | 'network-request-failed'
    | 'invalid-configuration'
    | 'unknown';
  userFriendlyMessage: string;
}

export function classifyAuthError(err: unknown): ClassifiedAuthError {
  const anyErr = err as { code?: string; message?: string } | null;
  const rawCode = (anyErr?.code || '').toLowerCase();
  const rawMsg = anyErr?.message || String(err || '');

  if (rawCode.includes('popup-closed-by-user')) {
    return {
      code: 'auth/popup-closed-by-user',
      category: 'popup-closed-by-user',
      userFriendlyMessage: 'Sign-in cancelled. The Google sign-in window was closed before completing authentication.',
    };
  }
  if (rawCode.includes('popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      category: 'popup-blocked',
      userFriendlyMessage: 'Popup blocked. Please allow popups for localhost:3000 in your browser to sign in.',
    };
  }
  if (rawCode.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      category: 'unauthorized-domain',
      userFriendlyMessage: 'Domain not authorized in Firebase Console. Please add localhost to Authorized Domains.',
    };
  }
  if (rawCode.includes('auth-domain-config-error')) {
    return {
      code: 'auth/auth-domain-config-error',
      category: 'auth-domain-config-error',
      userFriendlyMessage: 'Auth domain configuration error. Please verify your Firebase project setup.',
    };
  }
  if (rawCode.includes('operation-not-allowed')) {
    return {
      code: 'auth/operation-not-allowed',
      category: 'operation-not-allowed',
      userFriendlyMessage: 'Google sign-in is not enabled in Firebase Authentication. Enable Google provider in console.',
    };
  }
  if (rawCode.includes('account-exists-with-different-credential')) {
    return {
      code: 'auth/account-exists-with-different-credential',
      category: 'account-exists-with-different-credential',
      userFriendlyMessage: 'An account already exists with the same email using a different sign-in method.',
    };
  }
  if (rawCode.includes('network-request-failed') || rawMsg.toLowerCase().includes('network')) {
    return {
      code: 'auth/network-request-failed',
      category: 'network-request-failed',
      userFriendlyMessage: 'Network error communicating with authentication service. Please check your connection.',
    };
  }
  if (
    rawCode.includes('invalid-api-key') ||
    rawCode.includes('app-not-authorized') ||
    rawCode.includes('invalid-app-credential') ||
    rawCode.includes('configuration-not-found')
  ) {
    return {
      code: rawCode || 'auth/invalid-configuration',
      category: 'invalid-configuration',
      userFriendlyMessage: 'Invalid Firebase configuration credentials. Please check your project settings.',
    };
  }

  return {
    code: rawCode || 'auth/unknown',
    category: 'unknown',
    userFriendlyMessage: 'Sign in was interrupted or failed. Please try again.',
  };
}

export async function loginWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
  if (typeof window !== 'undefined' && window.localStorage?.getItem('lifeforge_test_auth')) {
    cachedAccessToken = 'mock_google_calendar_test_token';
    const testAuthRaw = window.localStorage.getItem('lifeforge_test_auth') || '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(testAuthRaw);
    } catch {}
    const mockUser = {
      uid: parsed.uid || 'test_e2e_student',
      email: parsed.email || 'test-student@lifeforge.test',
      displayName: parsed.displayName || 'LifeForge E2E Student',
      photoURL: parsed.photoURL || '',
      getIdToken: async () => 'mock-test-id-token',
    } as unknown as User;
    return { user: mockUser, accessToken: cachedAccessToken };
  }

  const authInstance = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  
  for (const scope of WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(authInstance, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: any) {
    const classified = classifyAuthError(err);
    console.error(`[Firebase Auth] Error [${classified.category}] (${classified.code}):`, classified.userFriendlyMessage);
    throw err;
  }
}

export async function logoutUser(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('lifeforge_test_auth');
      window.localStorage.removeItem('lifeforge_test_calendar_empty');
      window.localStorage.removeItem('lifeforge_test_calendar_fail');
    } catch {}
  }
  const authInstance = getFirebaseAuth();
  await signOut(authInstance);
  cachedAccessToken = null;
}

// ==============================================================================
// FIRESTORE ERROR CLASSIFICATION & SECURITY ERROR CLASSES
// ==============================================================================

export type FirestoreErrorCategory =
  | 'offline'
  | 'permission_denied'
  | 'unauthenticated'
  | 'invalid_schema'
  | 'quota'
  | 'unknown';

export class FirestorePermissionError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'FirestorePermissionError';
  }
}

export class FirestoreAuthError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'FirestoreAuthError';
  }
}

export class FirestoreOfflineError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'FirestoreOfflineError';
  }
}

export class FirestoreSchemaError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'FirestoreSchemaError';
  }
}

export interface ClassifiedFirestoreError {
  category: FirestoreErrorCategory;
  message: string;
  originalError: unknown;
}

export function classifyFirestoreError(err: unknown): ClassifiedFirestoreError {
  const anyErr = err as { code?: string; message?: string } | null;
  const code = (anyErr?.code || '').toLowerCase();
  const msg = anyErr?.message || String(err || '');

  if (
    code.includes('permission-denied') ||
    msg.includes('permission-denied') ||
    msg.includes('Missing or insufficient permissions')
  ) {
    return {
      category: 'permission_denied',
      message: 'Access denied: You do not have permission to view or modify this private resource.',
      originalError: err,
    };
  }

  if (code.includes('unauthenticated') || msg.includes('unauthenticated')) {
    return {
      category: 'unauthenticated',
      message: 'Authentication session expired or missing. Please sign in again.',
      originalError: err,
    };
  }

  if (
    code.includes('unavailable') ||
    msg.includes('client is offline') ||
    msg.includes('Failed to get document because the client is offline') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('timed out') ||
    msg.includes('not found')
  ) {
    return {
      category: 'offline',
      message: 'Operating in offline/cached mode. Data will synchronize upon network reconnection.',
      originalError: err,
    };
  }

  if (code.includes('resource-exhausted') || msg.includes('quota') || msg.includes('Resource exhausted')) {
    return {
      category: 'quota',
      message: 'Database rate limit reached. Please wait a moment before trying again.',
      originalError: err,
    };
  }

  if (
    code.includes('invalid-argument') ||
    code.includes('failed-precondition')
  ) {
    return {
      category: 'invalid_schema',
      message: `Invalid query or schema specification: ${msg}`,
      originalError: err,
    };
  }

  return {
    category: 'unknown',
    message: msg || 'An unexpected database error occurred.',
    originalError: err,
  };
}

export async function executeFirestoreRead<T>(
  operationName: string,
  userId: string,
  fn: () => Promise<T>,
  offlineFallback: T,
  timeoutMs: number = 7000
): Promise<T> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Firestore read operation '${operationName}' timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
    return result;
  } catch (err) {
    const classified = classifyFirestoreError(err);
    if (classified.category === 'permission_denied') {
      console.warn(`[Security] Permission denied during '${operationName}' for user ${userId}. Returning fallback.`);
      return offlineFallback;
    }
    if (classified.category === 'unauthenticated') {
      throw new FirestoreAuthError(
        `[Auth] Session unauthenticated during '${operationName}' for user ${userId}.`,
        err
      );
    }
    if (classified.category === 'invalid_schema') {
      console.warn(`[Firestore Schema Warning] '${operationName}' for user ${userId}: ${classified.message}`);
      return offlineFallback;
    }
    if (classified.category === 'offline') {
      console.warn(`[Firestore Offline/Cache] '${operationName}' for user ${userId} using cached state.`);
      return offlineFallback;
    }
    console.warn(`[Firestore Diagnostic] '${operationName}' for user ${userId} encountered:`, err);
    return offlineFallback;
  }
}

// User Profile Operations
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return executeFirestoreRead(
    'getUserProfile',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const userRef = doc(firestore, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        return snap.data() as UserProfile;
      }
      return null;
    },
    null
  );
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const userRef = doc(firestore, 'users', profile.uid);
    await Promise.race([
      setDoc(userRef, profile, { merge: true }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('saveUserProfile timed out after 2500ms')), 2500)
      ),
    ]);
  } catch (err) {
    const classified = classifyFirestoreError(err);
    if (classified.category === 'permission_denied') {
      throw new FirestorePermissionError(`[Security] Permission denied saving profile for ${profile.uid}`, err);
    }
    if (classified.category === 'unauthenticated') {
      throw new FirestoreAuthError(`[Auth] Unauthenticated saving profile for ${profile.uid}`, err);
    }
    console.warn(`[Firestore Offline/Sync] saveUserProfile for ${profile.uid}:`, err);
  }
}

async function getTestStore() {
  if (typeof window === 'undefined') {
    const { testStore } = await import('./test-store');
    return testStore;
  }
  return null;
}

async function fetchTestStore(userId: string, collectionName: string) {
  try {
    const res = await fetch(`/api/test-store?userId=${encodeURIComponent(userId)}&collection=${encodeURIComponent(collectionName)}`);
    if (!res.ok) return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch {
    return [];
  }
}

async function postTestStore(action: string, userId: string, payload: any = {}) {
  try {
    const res = await fetch('/api/test-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId, ...payload }),
    });
    if (!res.ok) return { success: false };
    const text = await res.text();
    return text ? JSON.parse(text) : { success: false };
  } catch {
    return { success: false };
  }
}

// Goals
export async function getGoals(userId: string): Promise<GoalItem[]> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.getGoals(userId) : [];
    }
    const { adminGetGoals } = await import('./firebase-admin');
    return adminGetGoals(userId);
  }

  if (userId.startsWith('test_')) {
    return await fetchTestStore(userId, 'goals');
  }

  return executeFirestoreRead(
    'getGoals',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'goals');
      const q = query(collRef, orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as GoalItem));
    },
    []
  );
}

export function subscribeGoals(
  userId: string,
  callback: (goals: GoalItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      const data = await fetchTestStore(userId, 'goals');
      if (active) callback(data);
    };
    poll();
    const interval = setInterval(poll, 600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'goals');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as GoalItem));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to goals for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to goals for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Goals listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Goals listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to goals:', err);
    return () => {};
  }
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

export async function addGoal(userId: string, goal: Omit<GoalItem, 'id' | 'userId'>): Promise<string> {
  const sanitizedGoal = sanitizeFirestoreData({
    title: goal.title,
    ...(goal.description !== undefined && { description: goal.description }),
    ...(goal.domain !== undefined && { domain: goal.domain }),
    ...(goal.priority !== undefined && { priority: goal.priority }),
    ...(goal.status !== undefined && { status: goal.status }),
    ...(goal.progress !== undefined && { progress: goal.progress }),
    ...(goal.targetDate !== undefined && { targetDate: goal.targetDate }),
    ...(goal.source !== undefined && { source: goal.source }),
    createdAt: goal.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.addGoal(userId, sanitizedGoal) : `goal_test_${Date.now()}`;
    }
    const { adminAddGoal } = await import('./firebase-admin');
    return adminAddGoal(userId, sanitizedGoal as Omit<GoalItem, 'id' | 'userId'>);
  }

  if (userId.startsWith('test_')) {
    const res = await postTestStore('addGoal', userId, { data: sanitizedGoal });
    return res.id;
  }

  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'goals');
  const docRef = await addDoc(collRef, {
    ...sanitizedGoal,
    userId,
  });
  return docRef.id;
}

export async function updateGoal(userId: string, goalId: string, updates: Partial<GoalItem>): Promise<void> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      ts?.updateGoal(userId, goalId, updates);
      return;
    }
    await postTestStore('updateGoal', userId, { id: goalId, updates });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'goals', goalId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateGoalProgress(userId: string, goalId: string, progress: number, status: GoalItem['status']): Promise<void> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      ts?.updateGoal(userId, goalId, { progress, status });
      return;
    }
    await postTestStore('updateGoal', userId, { id: goalId, updates: { progress, status } });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'goals', goalId);
  await updateDoc(docRef, { progress, status, updatedAt: new Date().toISOString() });
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      ts?.deleteGoal(userId, goalId);
      return;
    }
    const { adminDeleteGoal } = await import('./firebase-admin');
    return adminDeleteGoal(userId, goalId);
  }

  if (userId.startsWith('test_')) {
    await postTestStore('deleteGoal', userId, { id: goalId });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'goals', goalId);
  await deleteDoc(docRef);
}

// Tasks
export async function getTasks(userId: string): Promise<TaskItem[]> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.getTasks(userId) : [];
    }
    const { adminGetTasks } = await import('./firebase-admin');
    return adminGetTasks(userId);
  }

  if (userId.startsWith('test_')) {
    return await fetchTestStore(userId, 'tasks');
  }

  return executeFirestoreRead(
    'getTasks',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'tasks');
      const q = query(collRef, orderBy('createdAt', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TaskItem));
    },
    []
  );
}

export function subscribeTasks(
  userId: string,
  callback: (tasks: TaskItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      const data = await fetchTestStore(userId, 'tasks');
      if (active) callback(data);
    };
    poll();
    const interval = setInterval(poll, 600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'tasks');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TaskItem));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to tasks for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to tasks for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Tasks listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Tasks listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to tasks:', err);
    return () => {};
  }
}

export async function addTask(userId: string, task: Omit<TaskItem, 'id' | 'userId'>): Promise<string> {
  const sanitizedTask = sanitizeFirestoreData({
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
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.addTask(userId, sanitizedTask) : `task_test_${Date.now()}`;
    }
    const { adminAddTask } = await import('./firebase-admin');
    return adminAddTask(userId, sanitizedTask as Omit<TaskItem, 'id' | 'userId'>);
  }

  if (userId.startsWith('test_')) {
    const res = await postTestStore('addTask', userId, { data: sanitizedTask });
    return res.id;
  }

  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'tasks');
  const docRef = await addDoc(collRef, {
    ...sanitizedTask,
    userId,
  });
  return docRef.id;
}

export async function updateTask(userId: string, taskId: string, updates: Partial<TaskItem>): Promise<void> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      ts?.updateTask(userId, taskId, updates);
      return;
    }
    await postTestStore('updateTask', userId, { id: taskId, updates });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'tasks', taskId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateTaskStatus(userId: string, taskId: string, status: TaskItem['status']): Promise<void> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      ts?.updateTask(userId, taskId, { status });
      return;
    }
    await postTestStore('updateTask', userId, { id: taskId, updates: { status } });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'tasks', taskId);
  await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      ts?.deleteTask(userId, taskId);
      return;
    }
    const { adminDeleteTask } = await import('./firebase-admin');
    return adminDeleteTask(userId, taskId);
  }

  if (userId.startsWith('test_')) {
    await postTestStore('deleteTask', userId, { id: taskId });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'tasks', taskId);
  await deleteDoc(docRef);
}

// Reflections
export async function getReflections(userId: string): Promise<ReflectionEntry[]> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      return ts ? ts.getReflections(userId) : [];
    }
    return await fetchTestStore(userId, 'reflections');
  }

  if (typeof window === 'undefined') {
    const { adminGetReflections } = await import('./firebase-admin');
    return adminGetReflections(userId) as Promise<ReflectionEntry[]>;
  }

  return executeFirestoreRead(
    'getReflections',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'reflections');
      const q = query(collRef, orderBy('createdAt', 'desc'), limit(30));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ReflectionEntry));
    },
    []
  );
}

export function subscribeReflections(
  userId: string,
  callback: (reflections: ReflectionEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      const data = await fetchTestStore(userId, 'reflections');
      if (active) callback(data);
    };
    poll();
    const interval = setInterval(poll, 600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'reflections');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ReflectionEntry));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to reflections for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to reflections for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Reflections listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Reflections listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to reflections:', err);
    return () => {};
  }
}

export async function addReflection(userId: string, reflection: Omit<ReflectionEntry, 'id' | 'userId'>): Promise<string> {
  const sanitizedReflection = sanitizeFirestoreData(reflection);
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.addReflection(userId, sanitizedReflection) : `refl_test_${Date.now()}`;
    }
    const { adminAddReflection } = await import('./firebase-admin');
    return adminAddReflection(userId, sanitizedReflection);
  }

  if (userId.startsWith('test_')) {
    const res = await postTestStore('addReflection', userId, { data: sanitizedReflection });
    return res.id;
  }

  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'reflections');
  const docRef = await addDoc(collRef, {
    ...sanitizedReflection,
    userId,
  });
  return docRef.id;
}

export async function updateReflection(userId: string, reflectionId: string, updates: Partial<ReflectionEntry>): Promise<void> {
  if (userId.startsWith('test_')) {
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'reflections', reflectionId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteReflection(userId: string, reflectionId: string): Promise<void> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) return;
    const { adminDeleteReflection } = await import('./firebase-admin');
    return adminDeleteReflection(userId, reflectionId);
  }

  if (userId.startsWith('test_')) {
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'reflections', reflectionId);
  await deleteDoc(docRef);
}

// Conversations & Messages
export async function getConversations(userId: string): Promise<ConversationSession[]> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      return ts ? ts.getConversations(userId) : [];
    }
    const convs = await fetchTestStore(userId, 'conversations');
    return convs || [];
  }
  return executeFirestoreRead(
    'getConversations',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'conversations');
      try {
        const q = query(collRef, orderBy('updatedAt', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationSession));
        if (docs.length > 0) return docs;
      } catch (err) {
        console.warn('getConversations with orderBy failed, using fallback:', err);
      }
      const fallbackSnapshot = await getDocs(collRef);
      const list = fallbackSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationSession));
      return list.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    },
    [],
    6000
  );
}

export function subscribeConversations(
  userId: string,
  callback: (convs: ConversationSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      const convs = await fetchTestStore(userId, 'conversations');
      if (active) callback(convs || []);
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'conversations');
    const q = query(collRef, orderBy('updatedAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationSession));
        callback(data);
      },
      (err) => {
        console.warn('[Firestore Realtime Warning] subscribeConversations fallback to unordered listener:', err);
        try {
          return onSnapshot(
            collRef,
            (snap) => {
              const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationSession));
              data.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
              callback(data);
            },
            onError
          );
        } catch {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to conversations:', err);
    return () => {};
  }
}

export async function createConversation(
  userId: string,
  session: Omit<ConversationSession, 'id' | 'userId'>,
  customId?: string
): Promise<string> {
  const now = new Date().toISOString();
  const id = customId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const data: ConversationSession = {
    id,
    conversationId: id,
    userId,
    title: session.title || 'Primary LifeForge Session',
    agentDomain: session.agentDomain || session.activeAgent || 'orchestrator',
    activeAgent: session.activeAgent || session.agentDomain || 'orchestrator',
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
    messageCount: session.messageCount ?? 0,
    lastMessageAt: session.lastMessageAt || now,
    lastMessagePreview: session.lastMessagePreview || '',
    rollingSummary: session.rollingSummary || session.summary || '',
    summary: session.summary || session.rollingSummary || '',
    currentSessionId: session.currentSessionId || '',
    status: session.status || 'active',
    ...(session.memorySummaryId ? { memorySummaryId: session.memorySummaryId } : {}),
    ...(session.isPinned ? { isPinned: session.isPinned } : {}),
  };
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      return ts ? ts.createConversation(userId, data) : id;
    }
    const res = await postTestStore('createConversation', userId, { data });
    return res.id || id;
  }
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'conversations');
  const docRef = doc(collRef, id);
  await setDoc(docRef, data, { merge: true });
  return id;
}

export async function getConversationMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      return ts ? ts.getConversationMessages(userId, conversationId) : [];
    }
    try {
      const res = await fetch(`/api/test-store?userId=${encodeURIComponent(userId)}&collection=messages&conversationId=${encodeURIComponent(conversationId)}`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }
  return executeFirestoreRead(
    'getConversationMessages',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
      try {
        const q = query(collRef, orderBy('createdAt', 'asc'), limit(150));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
        if (docs.length > 0) return docs;
      } catch (err) {
        console.warn('getConversationMessages with orderBy failed, fallback to unordered:', err);
      }
      const snapshot = await getDocs(collRef);
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
      return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    },
    [],
    6000
  );
}

export function subscribeConversationMessages(
  userId: string,
  conversationId: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/test-store?userId=${encodeURIComponent(userId)}&collection=messages&conversationId=${encodeURIComponent(conversationId)}`);
        if (!res.ok) return;
        const msgs = await res.json();
        if (active) callback(msgs || []);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
    const q = query(collRef, orderBy('createdAt', 'asc'), limit(150));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
        callback(data);
      },
      (err) => {
        console.warn('[Firestore Realtime Warning] Messages listener fallback:', err);
        try {
          return onSnapshot(
            collRef,
            (snapshot) => {
              const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
              data.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
              callback(data);
            },
            onError
          );
        } catch {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to conversation messages:', err);
    return () => {};
  }
}

export async function addConversationMessage(
  userId: string,
  conversationId: string,
  message: Omit<ChatMessage, 'id'>,
  customMessageId?: string
): Promise<string> {
  const now = new Date().toISOString();
  const msgId = customMessageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const textContent = message.text || message.content || '';
  const timestamp = message.timestamp || message.createdAt || now;
  const msgData: ChatMessage = {
    id: msgId,
    messageId: msgId,
    conversationId,
    role: message.role,
    content: textContent,
    text: textContent,
    createdAt: timestamp,
    timestamp,
    model: message.model || (message.source === 'voice' ? 'gemini-3.1-flash-live-preview' : 'gemini-3.8-flash'),
    agent: ((message.agent || message.agentDomain || 'orchestrator') as AgentDomain),
    agentDomain: ((message.agentDomain || message.agent || 'orchestrator') as AgentDomain),
    source: message.source || 'voice',
    ...(message.turnId ? { turnId: message.turnId } : {}),
    ...(message.liveSessionId ? { liveSessionId: message.liveSessionId } : {}),
    ...(message.toolCallSummary ? { toolCallSummary: message.toolCallSummary } : {}),
    ...(message.citations ? { citations: message.citations } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
  };
  if (userId.startsWith('test_')) {
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      return ts ? ts.addConversationMessage(userId, conversationId, msgData) : msgId;
    }
    const res = await postTestStore('addMessage', userId, { conversationId, data: msgData });
    return res.id || msgId;
  }
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
  const msgDocRef = doc(collRef, msgId);
  let isNew = true;
  try {
    const existingSnap = await getDoc(msgDocRef);
    if (existingSnap.exists()) {
      isNew = false;
    }
  } catch {
  }

  await setDoc(msgDocRef, msgData, { merge: true });

  try {
    const convRef = doc(firestore, 'users', userId, 'conversations', conversationId);
    const updatePayload: Record<string, any> = {
      id: conversationId,
      conversationId,
      userId,
      title: 'Coaching Session',
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: textContent.slice(0, 120),
      activeAgent: ((message.agent || message.agentDomain || 'orchestrator') as AgentDomain),
    };
    if (isNew) {
      updatePayload.messageCount = increment(1);
    }
    await setDoc(convRef, updatePayload, { merge: true });
  } catch (err) {
    console.warn('Failed to update conversation metadata:', err);
  }
  return msgId;
}

export async function updateConversationSummary(
  userId: string,
  conversationId: string,
  summary: string,
  activeAgent?: string
): Promise<void> {
  if (userId.startsWith('test_')) {
    const updates = {
      updatedAt: new Date().toISOString(),
      rollingSummary: summary,
      summary: summary,
      ...(activeAgent ? { activeAgent: (activeAgent as AgentDomain), agentDomain: (activeAgent as AgentDomain) } : {}),
    };
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      if (ts) ts.updateConversation(userId, conversationId, updates);
      return;
    }
    await postTestStore('updateConversation', userId, { id: conversationId, updates });
    return;
  }
  const firestore = getFirebaseDb();
  const convRef = doc(firestore, 'users', userId, 'conversations', conversationId);
  const now = new Date().toISOString();
  await setDoc(
    convRef,
    {
      updatedAt: now,
      rollingSummary: summary,
      summary: summary,
      ...(activeAgent ? { activeAgent: (activeAgent as AgentDomain), agentDomain: (activeAgent as AgentDomain) } : {}),
    },
    { merge: true }
  );
}

export async function updateConversationStatus(
  userId: string,
  conversationId: string,
  status: 'active' | 'archived' | 'completed',
  currentSessionId?: string
): Promise<void> {
  if (userId.startsWith('test_')) {
    const updates = {
      status,
      updatedAt: new Date().toISOString(),
      ...(currentSessionId ? { currentSessionId } : {}),
    };
    if (typeof window === 'undefined') {
      const ts = await getTestStore();
      if (ts) ts.updateConversation(userId, conversationId, updates);
      return;
    }
    await postTestStore('updateConversation', userId, { id: conversationId, updates });
    return;
  }
  const firestore = getFirebaseDb();
  const convRef = doc(firestore, 'users', userId, 'conversations', conversationId);
  await setDoc(
    convRef,
    {
      status,
      updatedAt: new Date().toISOString(),
      ...(currentSessionId ? { currentSessionId } : {}),
    },
    { merge: true }
  );
}

// Action Confirmations
export async function getPendingActionConfirmations(userId: string): Promise<ActionConfirmation[]> {
  return executeFirestoreRead(
    'getPendingActionConfirmations',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'action_confirmations');
      const q = query(collRef, where('status', '==', 'pending'), orderBy('requestedAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ActionConfirmation));
    },
    []
  );
}

export function subscribePendingActionConfirmations(
  userId: string,
  callback: (confirmations: ActionConfirmation[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      const data = await fetchTestStore(userId, 'confirmations');
      if (active) callback(data.filter((c: any) => c.status === 'pending'));
    };
    poll();
    const interval = setInterval(poll, 600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'action_confirmations');
    const q = query(collRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as ActionConfirmation))
          .filter((c) => c.status === 'pending');
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to actions for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to actions for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Actions listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Actions listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to action confirmations:', err);
    return () => {};
  }
}

export async function addActionConfirmation(
  userId: string,
  action: Omit<ActionConfirmation, 'id' | 'userId'>
): Promise<string> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.addActionConfirmation(userId, action) : `conf_test_${Date.now()}`;
    }
    const { adminAddActionConfirmation } = await import('./firebase-admin');
    return adminAddActionConfirmation(userId, action);
  }

  if (userId.startsWith('test_')) {
    const res = await postTestStore('addActionConfirmation', userId, { data: action });
    return res.id;
  }

  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'action_confirmations');
  const docRef = await addDoc(collRef, {
    ...action,
    userId,
  });
  return docRef.id;
}

export async function resolveActionConfirmation(
  userId: string,
  actionId: string,
  status: 'approved' | 'rejected' | 'expired'
): Promise<void> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      ts?.resolveActionConfirmation(userId, actionId, status);
      return;
    }
    const { adminResolveActionConfirmation } = await import('./firebase-admin');
    return adminResolveActionConfirmation(userId, actionId, status);
  }

  if (userId.startsWith('test_')) {
    await postTestStore('resolveActionConfirmation', userId, { id: actionId, status });
    return;
  }

  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'action_confirmations', actionId);
  await updateDoc(docRef, { status, resolvedAt: new Date().toISOString() });
}

// Study Session Records
export async function getStudySessions(userId: string): Promise<StudySessionRecord[]> {
  return executeFirestoreRead(
    'getStudySessions',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'study_sessions');
      const q = query(collRef, orderBy('createdAt', 'desc'), limit(30));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as StudySessionRecord));
    },
    []
  );
}

export function subscribeStudySessions(
  userId: string,
  callback: (sessions: StudySessionRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'study_sessions');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as StudySessionRecord));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to study sessions for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to study sessions for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Study sessions listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Study sessions listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to study sessions:', err);
    return () => {};
  }
}

export async function addStudySession(userId: string, session: Omit<StudySessionRecord, 'id' | 'userId'>): Promise<string> {
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'study_sessions');
  const docRef = await addDoc(collRef, {
    ...session,
    userId,
  });
  return docRef.id;
}

// Selective Context Retriever for AI Coach
export interface UserCoachContext {
  activeGoals: Array<{ id: string; title: string; domain: string; progress: number }>;
  pendingTasks: Array<{ id: string; title: string; priority: string; domain: string; isDeepWork?: boolean }>;
  recentReflections: Array<{ date: string; whatWorked?: string; whatFailed?: string; lessonsLearned?: string }>;
}

export async function getUserCoachingContext(userId: string): Promise<UserCoachContext> {
  return executeFirestoreRead(
    'getUserCoachingContext',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const [goalsSnap, tasksSnap, reflectionsSnap] = await Promise.all([
        getDocs(query(collection(firestore, 'users', userId, 'goals'), where('status', '==', 'in_progress'), limit(5))),
        getDocs(query(collection(firestore, 'users', userId, 'tasks'), where('status', '==', 'pending'), limit(6))),
        getDocs(query(collection(firestore, 'users', userId, 'reflections'), orderBy('createdAt', 'desc'), limit(3))),
      ]);

      return {
        activeGoals: goalsSnap.docs.map((d) => {
          const data = d.data() as GoalItem;
          return { id: d.id, title: data.title, domain: data.domain, progress: data.progress };
        }),
        pendingTasks: tasksSnap.docs.map((d) => {
          const data = d.data() as TaskItem;
          return { id: d.id, title: data.title, priority: data.priority, domain: data.domain, isDeepWork: data.isDeepWork };
        }),
        recentReflections: reflectionsSnap.docs.map((d) => {
          const data = d.data() as ReflectionEntry;
          return {
            date: data.date,
            whatWorked: data.whatWorked || (data.keyWins ? data.keyWins.join(', ') : undefined),
            whatFailed: data.whatFailed || (data.challengesFaced ? data.challengesFaced.join(', ') : undefined),
            lessonsLearned: data.whatLearned || data.lessonsLearned,
          };
        }),
      };
    },
    {
      activeGoals: [],
      pendingTasks: [],
      recentReflections: [],
    }
  );
}

// Placement Profile CRUD Operations
export const DEFAULT_PLACEMENT_SKILLS = [
  { id: '1', category: 'DSA' as const, name: 'Arrays, Two Pointers & Sliding Window', level: 'Mastery' as const, completed: true, verifiedByPractice: true },
  { id: '2', category: 'DSA' as const, name: 'Trees, BST & Lowest Common Ancestor', level: 'Mastery' as const, completed: true, verifiedByPractice: true },
  { id: '3', category: 'DSA' as const, name: 'Graphs (BFS, DFS, Dijkstra, Topological Sort)', level: 'Intermediate' as const, completed: false, verifiedByPractice: false, notes: 'Struggled with recursion stack overflow in deep DFS cycles' },
  { id: '4', category: 'DSA' as const, name: 'Dynamic Programming (1D, 2D, Knapsack, LIS)', level: 'Fundamentals' as const, completed: false, verifiedByPractice: false },
  { id: '5', category: 'Core CS' as const, name: 'DBMS (ACID, B-Tree Indexing, Normalization)', level: 'Mastery' as const, completed: true, verifiedByPractice: true },
  { id: '6', category: 'Core CS' as const, name: 'Operating Systems (Virtual Memory, Threads, Mutexes)', level: 'Intermediate' as const, completed: false, verifiedByPractice: false },
  { id: '7', category: 'Core CS' as const, name: 'Computer Networks (TCP 3-way Handshake, HTTP/3, DNS)', level: 'Fundamentals' as const, completed: false, verifiedByPractice: false },
  { id: '8', category: 'System Design' as const, name: 'Scalable Systems (Load Balancer, Redis Cache, Sharding)', level: 'Intermediate' as const, completed: false, verifiedByPractice: false },
  { id: '9', category: 'Backend' as const, name: 'API Design, Rate Limiting & Async Processing', level: 'Intermediate' as const, completed: true, verifiedByPractice: true },
  { id: '10', category: 'Behavioral' as const, name: 'STAR Storytelling (Challenges, Teamwork, Leadership)', level: 'Intermediate' as const, completed: false, verifiedByPractice: false },
];

export async function getPlacementProfile(userId: string): Promise<PlacementProfile | null> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.getPlacementProfile(userId) : null;
    }
    const { adminGetPlacementProfile } = await import('./firebase-admin');
    return adminGetPlacementProfile(userId);
  }

  if (userId.startsWith('test_')) {
    return await fetchTestStore(userId, 'placement_profile');
  }

  return executeFirestoreRead(
    'getPlacementProfile',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const profileRef = doc(firestore, 'users', userId, 'placement_profile', 'default');
      const snap = await getDoc(profileRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as PlacementProfile;
      }
      return null;
    },
    null
  );
}

export async function savePlacementProfile(userId: string, data: Partial<PlacementProfile>): Promise<void> {
  if (typeof window === 'undefined') {
    const { adminSavePlacementProfile } = await import('./firebase-admin');
    await adminSavePlacementProfile(userId, data).catch(() => {});
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts) ts.savePlacementProfile(userId, data);
    }
    return;
  }

  if (userId.startsWith('test_')) {
    await postTestStore('savePlacementProfile', userId, { data });
    return;
  }

  try {
    const firestore = getFirebaseDb();
    const profileRef = doc(firestore, 'users', userId, 'placement_profile', 'default');
    const sanitizedPayload = sanitizeFirestoreData({
      ...data,
      userId,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(profileRef, sanitizedPayload, { merge: true });
  } catch (err) {
    const classified = classifyFirestoreError(err);
    if (classified.category === 'permission_denied') {
      throw new FirestorePermissionError(`Permission denied saving placement profile for ${userId}`, err);
    }
    console.warn(`[Firestore Offline/Sync] savePlacementProfile for ${userId}:`, err);
  }
}

export function subscribePlacementProfile(
  userId: string,
  callback: (profile: PlacementProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (userId.startsWith('test_')) {
    let active = true;
    const poll = async () => {
      if (!active) return;
      const profile = await fetchTestStore(userId, 'placement_profile');
      if (active) callback(profile || null);
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }
  try {
    const firestore = getFirebaseDb();
    const profileRef = doc(firestore, 'users', userId, 'placement_profile', 'default');
    return onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          callback({ id: snap.id, ...snap.data() } as PlacementProfile);
        } else {
          callback(null);
        }
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to placement profile for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to placement profile for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Placement profile listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Placement profile listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to placement profile:', err);
    return () => {};
  }
}

export async function uploadResumeBinary(
  userId: string,
  resumeId: string,
  fileBytes: Uint8Array | ArrayBuffer | Buffer,
  contentType: string
): Promise<string> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      return `users/${userId}/placement/resumes/${resumeId}`;
    }
    const { adminUploadResumeBinary } = await import('./firebase-admin');
    return adminUploadResumeBinary(userId, resumeId, Buffer.from(fileBytes as any), contentType);
  }

  if (userId.startsWith('test_')) {
    return `users/${userId}/placement/resumes/${resumeId}`;
  }
  const storageInstance = getFirebaseStorage();
  const storagePath = `users/${userId}/placement/resumes/${resumeId}`;
  const fileRef = ref(storageInstance, storagePath);
  await uploadBytes(fileRef, new Uint8Array(fileBytes), { contentType });
  return storagePath;
}

export async function saveResumeMetadata(
  userId: string,
  metadata: {
    resumeId: string;
    fileName: string;
    contentType: string;
    size: number;
    storagePath: string;
    uploadedAt: string;
    processingStatus: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    analysisStatus: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  }
): Promise<void> {
  if (typeof window === 'undefined') {
    const { adminSaveResumeMetadata } = await import('./firebase-admin');
    await adminSaveResumeMetadata(userId, metadata).catch(() => {});
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts) ts.saveResumeMetadata(userId, metadata);
    }
    return;
  }

  if (userId.startsWith('test_')) {
    await postTestStore('saveResumeMetadata', userId, { data: metadata });
    return;
  }
  const firestore = getFirebaseDb();
  const canonicalRef = doc(firestore, 'users', userId, 'resume_metadata', 'current');
  const legacyRef = doc(firestore, 'users', userId, 'placement_profile', 'resume');
  await Promise.all([
    setDoc(canonicalRef, metadata, { merge: true }),
    setDoc(legacyRef, metadata, { merge: true }),
  ]);
}

export async function getResumeMetadata(userId: string): Promise<any | null> {
  if (typeof window === 'undefined') {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      return ts ? ts.getResumeMetadata(userId) : null;
    }
    const { adminGetResumeMetadata } = await import('./firebase-admin');
    return adminGetResumeMetadata(userId);
  }

  if (userId.startsWith('test_')) {
    return await fetchTestStore(userId, 'resume_metadata');
  }
  const firestore = getFirebaseDb();
  const canonicalRef = doc(firestore, 'users', userId, 'resume_metadata', 'current');
  const canonicalSnap = await getDoc(canonicalRef);
  if (canonicalSnap.exists()) {
    return canonicalSnap.data();
  }
  const legacyRef = doc(firestore, 'users', userId, 'placement_profile', 'resume');
  const legacySnap = await getDoc(legacyRef);
  return legacySnap.exists() ? legacySnap.data() : null;
}

export async function deleteAllGoalsAndTasks(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'goals-tasks' }),
      });
    } catch (e) {
      console.warn('API delete-data goals-tasks warning:', e);
    }
  } else {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts) {
        delete (ts as any).goals[userId];
        delete (ts as any).tasks[userId];
      }
      return;
    }
    const { adminDeleteAllGoalsAndTasks } = await import('./firebase-admin');
    await adminDeleteAllGoalsAndTasks(userId);
    return;
  }

  try {
    const firestore = getFirebaseDb();
    const goalsColl = collection(firestore, 'users', userId, 'goals');
    const tasksColl = collection(firestore, 'users', userId, 'tasks');
    const [goalSnap, taskSnap] = await Promise.all([
      getDocs(goalsColl).catch(() => ({ docs: [] })),
      getDocs(tasksColl).catch(() => ({ docs: [] })),
    ]);
    const deletePromises: Promise<any>[] = [];
    for (const d of goalSnap.docs) {
      deletePromises.push(deleteDoc(d.ref).catch(() => {}));
    }
    for (const d of taskSnap.docs) {
      deletePromises.push(deleteDoc(d.ref).catch(() => {}));
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Client firestore goals deletion error:', err);
  }
}

export async function deleteAllConversations(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'conversations' }),
      });
    } catch (e) {
      console.warn('API delete-data conversations warning:', e);
    }
  } else {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts && ts.clearConversations) {
        ts.clearConversations(userId);
      }
      return;
    }
    const { adminDeleteAllConversations } = await import('./firebase-admin');
    await adminDeleteAllConversations(userId);
    return;
  }

  try {
    const firestore = getFirebaseDb();
    const convColl = collection(firestore, 'users', userId, 'conversations');
    const snap = await getDocs(convColl).catch(() => ({ docs: [] }));
    const deletePromises: Promise<any>[] = [];
    for (const convDoc of snap.docs) {
      const msgsColl = collection(firestore, 'users', userId, 'conversations', convDoc.id, 'messages');
      const msgSnap = await getDocs(msgsColl).catch(() => ({ docs: [] }));
      for (const msgDoc of msgSnap.docs) {
        deletePromises.push(deleteDoc(msgDoc.ref).catch(() => {}));
      }
      deletePromises.push(deleteDoc(convDoc.ref).catch(() => {}));
    }
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Client firestore conversations deletion error:', err);
  }
}

export async function deleteResumeData(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'resume' }),
      });
    } catch (e) {
      console.warn('API delete-data resume warning:', e);
    }
  } else {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts) {
        if ((ts as any).placementProfiles) delete (ts as any).placementProfiles[userId];
        if ((ts as any).resumes) delete (ts as any).resumes[userId];
      }
      return;
    }
    const { adminDeletePlacementProfile } = await import('./firebase-admin');
    await adminDeletePlacementProfile(userId);
    return;
  }

  try {
    const firestore = getFirebaseDb();
    const profileRef = doc(firestore, 'users', userId, 'placement_profile', 'default');
    const metaRef = doc(firestore, 'users', userId, 'resume_metadata', 'current');
    const legacyResumeRef = doc(firestore, 'users', userId, 'placement_profile', 'resume');
    await Promise.all([
      deleteDoc(profileRef).catch(() => {}),
      deleteDoc(metaRef).catch(() => {}),
      deleteDoc(legacyResumeRef).catch(() => {}),
    ]);
  } catch (err) {
    console.warn('Client firestore resume deletion error:', err);
  }
}

export async function deleteAllReflections(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'reflections' }),
      });
    } catch (e) {
      console.warn('API delete-data reflections warning:', e);
    }
  } else {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts) {
        delete (ts as any).reflections[userId];
      }
      return;
    }
    const { adminDeleteAllReflections } = await import('./firebase-admin');
    await adminDeleteAllReflections(userId);
    return;
  }

  try {
    const firestore = getFirebaseDb();
    const coll = collection(firestore, 'users', userId, 'reflections');
    const snap = await getDocs(coll).catch(() => ({ docs: [] }));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch (err) {
    console.warn('Client firestore reflections deletion error:', err);
  }
}

export async function deleteAllStudySessions(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'sessions' }),
      });
    } catch (e) {
      console.warn('API delete-data sessions warning:', e);
    }
  } else {
    if (userId.startsWith('test_')) {
      return;
    }
    const { adminDeleteAllStudySessions } = await import('./firebase-admin');
    await adminDeleteAllStudySessions(userId);
    return;
  }

  try {
    const firestore = getFirebaseDb();
    const coll = collection(firestore, 'users', userId, 'study_sessions');
    const snap = await getDocs(coll).catch(() => ({ docs: [] }));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch (err) {
    console.warn('Client firestore sessions deletion error:', err);
  }
}

export async function purgeAllUserData(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'purge' }),
      });
    } catch (e) {
      console.warn('API delete-data purge warning:', e);
    }
  } else {
    if (userId.startsWith('test_')) {
      const ts = await getTestStore();
      if (ts) ts.clearTestUser(userId);
      return;
    }
    const { adminPurgeAllUserData } = await import('./firebase-admin');
    await adminPurgeAllUserData(userId);
    return;
  }

  await Promise.all([
    deleteAllGoalsAndTasks(userId),
    deleteAllConversations(userId),
    deleteResumeData(userId),
    deleteAllReflections(userId),
    deleteAllStudySessions(userId),
  ]);
}


