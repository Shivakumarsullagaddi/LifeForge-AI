'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  getFirebaseAuth,
  getUserProfile,
  saveUserProfile,
  loginWithGoogle,
  logoutUser,
  getCachedAccessToken,
  setCachedAccessToken,
  classifyAuthError,
  FirestorePermissionError,
} from './firebase';
import type { UserProfile } from './types';
import { calculateLiveStreak } from './streak';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  accessToken: string | null;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  requestGoogleCalendarAuth: () => Promise<string | null>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function createDefaultProfile(firebaseUser: User): UserProfile {
  const now = new Date().toISOString();
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || 'LifeForge Student',
    photoURL: firebaseUser.photoURL || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    primaryGoal: 'Master technical placements and build disciplined study routines',
    studyPhilosophy: 'Learn through logic, deep focus, and active recall',
    disciplinedStreakDays: 1,
    lastActiveDate: todayStr,
    onboardingCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

function getInitialTestAuth(): { user: User; profile: UserProfile } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('lifeforge_test_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.uid) return null;
    const user = {
      uid: parsed.uid,
      email: parsed.email || 'test-student@lifeforge.test',
      displayName: parsed.displayName || 'LifeForge E2E Student',
      photoURL: parsed.photoURL || '',
      getIdToken: async () => 'mock-test-id-token',
    } as unknown as User;
    const initialProfile: UserProfile = {
      uid: parsed.uid,
      email: parsed.email || 'test-student@lifeforge.test',
      displayName: parsed.displayName || 'LifeForge E2E Student',
      photoURL: parsed.photoURL || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      primaryGoal: 'Master technical placements and build disciplined study routines',
      studyPhilosophy: 'Learn through logic, deep focus, and active recall',
      disciplinedStreakDays: parsed.disciplinedStreakDays ?? 2,
      lastActiveDate: parsed.lastActiveDate,
      onboardingCompleted: true,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const streakResult = calculateLiveStreak(initialProfile);
    const profile: UserProfile = {
      ...initialProfile,
      disciplinedStreakDays: streakResult.streak,
      lastActiveDate: streakResult.lastActiveDate,
    };
    return { user, profile };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(getCachedAccessToken());
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const fetchProfile = useCallback(async (firebaseUser: User) => {
    try {
      const userProf = await getUserProfile(firebaseUser.uid);
      if (userProf) {
        const streakResult = calculateLiveStreak(userProf);
        const updatedProf: UserProfile = {
          ...userProf,
          disciplinedStreakDays: streakResult.streak,
          lastActiveDate: streakResult.lastActiveDate,
        };
        setProfile(updatedProf);
        if (streakResult.updated) {
          saveUserProfile(updatedProf).catch(() => {});
        }
        return;
      }
      const initialProf = createDefaultProfile(firebaseUser);
      const streakResult = calculateLiveStreak(initialProf);
      const updatedInitialProf: UserProfile = {
        ...initialProf,
        disciplinedStreakDays: streakResult.streak,
        lastActiveDate: streakResult.lastActiveDate,
      };
      setProfile(updatedInitialProf);
      try {
        await saveUserProfile(updatedInitialProf);
      } catch (saveErr) {
        console.warn('Initial profile could not be saved to Firestore (offline):', saveErr);
      }
    } catch (err) {
      if (err instanceof FirestorePermissionError) {
        setAuthError('Permission denied accessing your profile. Please check Firestore security rules.');
        console.error('Permission denied fetching user profile:', err);
      } else {
        console.warn('Error fetching user profile from Firestore, using offline fallback:', err);
        const fallback = createDefaultProfile(firebaseUser);
        const streakResult = calculateLiveStreak(fallback);
        setProfile({
          ...fallback,
          disciplinedStreakDays: streakResult.streak,
          lastActiveDate: streakResult.lastActiveDate,
        });
      }
    }
  }, []);

  useEffect(() => {
    const testAuth = getInitialTestAuth();
    if (testAuth) {
      setUser(testAuth.user);
      setProfile(testAuth.profile);
      setAccessToken('mock-test-access-token');
      setLoading(false);
      return;
    }

    let unsubscribe: () => void = () => {};
    let resolved = false;

    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setLoading(false);
      }
    }, 2000);

    try {

      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(
        auth,
        (firebaseUser) => {
          resolved = true;
          clearTimeout(safetyTimer);
          setUser(firebaseUser);
          setLoading(false);

          if (firebaseUser) {
            setProfile(createDefaultProfile(firebaseUser));
            setAccessToken(getCachedAccessToken());
            fetchProfile(firebaseUser).catch((err) => {
              console.warn('Background profile fetch error:', err);
            });
          } else {
            setProfile(null);
            setAccessToken(null);
            setCachedAccessToken(null);
          }
        },
        (error) => {
          resolved = true;
          clearTimeout(safetyTimer);
          console.error('onAuthStateChanged error:', error);
          const classified = classifyAuthError(error);
          setAuthError(classified.userFriendlyMessage);
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      );
    } catch (err) {
      resolved = true;
      clearTimeout(safetyTimer);
      console.error('Auth initialization error:', err);
      setTimeout(() => {
        setLoading(false);
      }, 0);
    }

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [fetchProfile]);

  const handleSignInWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const { user: loggedUser, accessToken: token } = await loginWithGoogle();
      setAccessToken(token);
      await fetchProfile(loggedUser);
    } catch (err: any) {
      const classified = classifyAuthError(err);
      setAuthError(classified.userFriendlyMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCalendarAuth = async (): Promise<string | null> => {
    try {
      const { accessToken: token } = await loginWithGoogle();
      setAccessToken(token);
      return token;
    } catch (err: any) {
      const classified = classifyAuthError(err);
      setAuthError(classified.userFriendlyMessage);
      console.error('Failed to authenticate Google Calendar:', err);
      return null;
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await logoutUser();
      setUser(null);
      setProfile(null);
      setAccessToken(null);
    } catch (err: any) {
      const classified = classifyAuthError(err);
      setAuthError(classified.userFriendlyMessage);
      console.error('Sign out error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    const updated: UserProfile = {
      ...profile,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await saveUserProfile(updated);
    setProfile(updated);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!user) return null;
    return await user.getIdToken();
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        accessToken,
        authError,
        clearAuthError,
        signInWithGoogle: handleSignInWithGoogle,
        requestGoogleCalendarAuth: handleRequestCalendarAuth,
        signOut: handleSignOut,
        updateProfile: handleUpdateProfile,
        getIdToken,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
