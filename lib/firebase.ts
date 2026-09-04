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
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  UserProfile,
  JournalEntry,
  MemoryItem,
  GoalItem,
  TaskItem,
  ReflectionEntry,
  ConversationSession,
  ChatMessage,
  ActionConfirmation,
  StudySessionRecord,
  PlacementProfile,
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
        apiKey: firebaseConfig.apiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: firebaseConfig.authDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: firebaseConfig.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: firebaseConfig.storageBucket || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: firebaseConfig.messagingSenderId || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: firebaseConfig.appId || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    // Initialize Firestore with specific database ID if configured
    if (databaseId && databaseId !== '(default)') {
      db = getFirestore(getFirebaseApp(), databaseId);
    } else {
      db = getFirestore(getFirebaseApp());
    }
  }
  return db;
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

export async function loginWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
  const authInstance = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  
  // Add Workspace scopes for Google Calendar integration
  for (const scope of WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(authInstance, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  
  if (credential?.accessToken) {
    cachedAccessToken = credential.accessToken;
  }
  
  return { user: result.user, accessToken: cachedAccessToken };
}

export async function logoutUser(): Promise<void> {
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
    msg.includes('offline')
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
    code.includes('failed-precondition') ||
    code.includes('not-found')
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

/**
 * Executes a Firestore read with explicit error classification.
 * - Throws on permission_denied, unauthenticated, and schema errors (so permission failures are never silent).
 * - Logs and returns offlineFallback on transient offline/network disconnections.
 */
export async function executeFirestoreRead<T>(
  operationName: string,
  userId: string,
  fn: () => Promise<T>,
  offlineFallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const classified = classifyFirestoreError(err);
    if (classified.category === 'permission_denied') {
      throw new FirestorePermissionError(
        `[Security] Permission denied during '${operationName}' for user ${userId}.`,
        err
      );
    }
    if (classified.category === 'unauthenticated') {
      throw new FirestoreAuthError(
        `[Auth] Session unauthenticated during '${operationName}' for user ${userId}.`,
        err
      );
    }
    if (classified.category === 'invalid_schema') {
      throw new FirestoreSchemaError(
        `[Schema] Invalid schema/query during '${operationName}' for user ${userId}: ${classified.message}`,
        err
      );
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
    await setDoc(userRef, profile, { merge: true });
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

// Journals
export async function getJournals(userId: string): Promise<JournalEntry[]> {
  return executeFirestoreRead(
    'getJournals',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'journals');
      const q = query(collRef, orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as JournalEntry));
    },
    []
  );
}

export function subscribeJournals(
  userId: string,
  callback: (journals: JournalEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'journals');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as JournalEntry));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to journals for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to journals for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Journals listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Journals listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to journals:', err);
    return () => {};
  }
}

export async function addJournal(userId: string, entry: Omit<JournalEntry, 'id' | 'userId'>): Promise<string> {
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'journals');
  const docRef = await addDoc(collRef, {
    ...entry,
    userId,
  });
  return docRef.id;
}

export async function updateJournal(userId: string, journalId: string, updates: Partial<JournalEntry>): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'journals', journalId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteJournal(userId: string, journalId: string): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'journals', journalId);
  await deleteDoc(docRef);
}

// Memories
export async function getMemories(userId: string): Promise<MemoryItem[]> {
  return executeFirestoreRead(
    'getMemories',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'memories');
      const q = query(collRef, orderBy('createdAt', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MemoryItem));
    },
    []
  );
}

export function subscribeMemories(
  userId: string,
  callback: (memories: MemoryItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'memories');
    const q = query(collRef, orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MemoryItem));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to memories for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to memories for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Memories listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Memories listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to memories:', err);
    return () => {};
  }
}

export async function addMemory(userId: string, memory: Omit<MemoryItem, 'id' | 'userId'>): Promise<string> {
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'memories');
  const docRef = await addDoc(collRef, {
    ...memory,
    userId,
  });
  return docRef.id;
}

export async function updateMemory(userId: string, memoryId: string, updates: Partial<MemoryItem>): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'memories', memoryId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateMemoryStatus(userId: string, memoryId: string, status: 'active' | 'candidate'): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'memories', memoryId);
  await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'memories', memoryId);
  await deleteDoc(docRef);
}

// Goals
export async function getGoals(userId: string): Promise<GoalItem[]> {
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

export async function addGoal(userId: string, goal: Omit<GoalItem, 'id' | 'userId'>): Promise<string> {
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'goals');
  const docRef = await addDoc(collRef, {
    ...goal,
    userId,
  });
  return docRef.id;
}

export async function updateGoal(userId: string, goalId: string, updates: Partial<GoalItem>): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'goals', goalId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateGoalProgress(userId: string, goalId: string, progress: number, status: GoalItem['status']): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'goals', goalId);
  await updateDoc(docRef, { progress, status, updatedAt: new Date().toISOString() });
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'goals', goalId);
  await deleteDoc(docRef);
}

// Tasks
export async function getTasks(userId: string): Promise<TaskItem[]> {
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
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'tasks');
  const docRef = await addDoc(collRef, {
    ...task,
    userId,
  });
  return docRef.id;
}

export async function updateTask(userId: string, taskId: string, updates: Partial<TaskItem>): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'tasks', taskId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateTaskStatus(userId: string, taskId: string, status: TaskItem['status']): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'tasks', taskId);
  await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'tasks', taskId);
  await deleteDoc(docRef);
}

// Reflections
export async function getReflections(userId: string): Promise<ReflectionEntry[]> {
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
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'reflections');
  const docRef = await addDoc(collRef, {
    ...reflection,
    userId,
  });
  return docRef.id;
}

export async function updateReflection(userId: string, reflectionId: string, updates: Partial<ReflectionEntry>): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'reflections', reflectionId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteReflection(userId: string, reflectionId: string): Promise<void> {
  const firestore = getFirebaseDb();
  const docRef = doc(firestore, 'users', userId, 'reflections', reflectionId);
  await deleteDoc(docRef);
}

// Conversations & Messages
export async function getConversations(userId: string): Promise<ConversationSession[]> {
  return executeFirestoreRead(
    'getConversations',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'conversations');
      const q = query(collRef, orderBy('updatedAt', 'desc'), limit(30));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationSession));
    },
    []
  );
}

export function subscribeConversations(
  userId: string,
  callback: (convs: ConversationSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'conversations');
    const q = query(collRef, orderBy('updatedAt', 'desc'), limit(30));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationSession));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to conversations for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to conversations for ${userId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Conversations listener reconnecting for ${userId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Conversations listener for ${userId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to conversations:', err);
    return () => {};
  }
}

export async function createConversation(userId: string, session: Omit<ConversationSession, 'id' | 'userId'>): Promise<string> {
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'conversations');
  const docRef = await addDoc(collRef, {
    ...session,
    userId,
  });
  return docRef.id;
}

export async function getConversationMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
  return executeFirestoreRead(
    'getConversationMessages',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const collRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
      const q = query(collRef, orderBy('createdAt', 'asc'), limit(100));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
    },
    []
  );
}

export function subscribeConversationMessages(
  userId: string,
  conversationId: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
    const q = query(collRef, orderBy('createdAt', 'asc'), limit(100));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
        callback(data);
      },
      (err) => {
        const classified = classifyFirestoreError(err);
        if (classified.category === 'permission_denied') {
          const e = new FirestorePermissionError(`Permission denied subscribing to messages for conv ${conversationId}`, err);
          onError?.(e);
        } else if (classified.category === 'unauthenticated') {
          const e = new FirestoreAuthError(`Unauthenticated subscribing to messages for conv ${conversationId}`, err);
          onError?.(e);
        } else if (classified.category === 'offline') {
          console.warn(`[Firestore Realtime Offline] Messages listener reconnecting for conv ${conversationId}...`);
        } else {
          console.warn(`[Firestore Realtime Warning] Messages listener for conv ${conversationId}:`, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to conversation messages:', err);
    return () => {};
  }
}

export async function addConversationMessage(userId: string, conversationId: string, message: Omit<ChatMessage, 'id'>): Promise<string> {
  const firestore = getFirebaseDb();
  const collRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
  const docRef = await addDoc(collRef, message);
  try {
    const convRef = doc(firestore, 'users', userId, 'conversations', conversationId);
    await updateDoc(convRef, { updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Failed to update conversation timestamp:', err);
  }
  return docRef.id;
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
  try {
    const firestore = getFirebaseDb();
    const collRef = collection(firestore, 'users', userId, 'action_confirmations');
    const q = query(collRef, where('status', '==', 'pending'), orderBy('requestedAt', 'desc'), limit(20));
    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ActionConfirmation));
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
  activeMemories: Array<{ id: string; type: string; content: string }>;
  recentReflections: Array<{ date: string; whatWorked?: string; whatFailed?: string; lessonsLearned?: string }>;
  recentJournals: Array<{ title: string; category?: string; actionTakeaway?: string }>;
}

export async function getUserCoachingContext(userId: string): Promise<UserCoachContext> {
  return executeFirestoreRead(
    'getUserCoachingContext',
    userId,
    async () => {
      const firestore = getFirebaseDb();
      const [goalsSnap, tasksSnap, memoriesSnap, reflectionsSnap, journalsSnap] = await Promise.all([
        getDocs(query(collection(firestore, 'users', userId, 'goals'), where('status', '==', 'in_progress'), limit(5))),
        getDocs(query(collection(firestore, 'users', userId, 'tasks'), where('status', '==', 'pending'), limit(6))),
        getDocs(query(collection(firestore, 'users', userId, 'memories'), where('status', '==', 'active'), limit(8))),
        getDocs(query(collection(firestore, 'users', userId, 'reflections'), orderBy('createdAt', 'desc'), limit(3))),
        getDocs(query(collection(firestore, 'users', userId, 'journals'), orderBy('createdAt', 'desc'), limit(3))),
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
        activeMemories: memoriesSnap.docs.map((d) => {
          const data = d.data() as MemoryItem;
          return { id: d.id, type: data.type, content: data.content };
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
        recentJournals: journalsSnap.docs.map((d) => {
          const data = d.data() as JournalEntry;
          return { title: data.title, category: data.category, actionTakeaway: data.actionTakeaway };
        }),
      };
    },
    {
      activeGoals: [],
      pendingTasks: [],
      activeMemories: [],
      recentReflections: [],
      recentJournals: [],
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
  try {
    const firestore = getFirebaseDb();
    const profileRef = doc(firestore, 'users', userId, 'placement_profile', 'default');
    await setDoc(
      profileRef,
      {
        ...data,
        userId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
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

