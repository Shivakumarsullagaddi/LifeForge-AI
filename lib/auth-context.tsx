'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  getFirebaseAuth,
  getUserProfile,
  saveUserProfile,
  loginWithGoogle,
  logoutUser,
  getCachedAccessToken,
  setCachedAccessToken,
} from './firebase';
import type { UserProfile } from './types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  accessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  requestGoogleCalendarAuth: () => Promise<string | null>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(getCachedAccessToken());
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (firebaseUser: User) => {
    try {
      let userProf = await getUserProfile(firebaseUser.uid);
      if (!userProf) {
        // Create initial profile for first-time login
        const now = new Date().toISOString();
        userProf = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'LifeForge Student',
          photoURL: firebaseUser.photoURL || '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          primaryGoal: 'Master technical placements and build disciplined study routines',
          studyPhilosophy: 'Learn through logic, deep focus, and active recall',
          disciplinedStreakDays: 1,
          onboardingCompleted: false,
          createdAt: now,
          updatedAt: now,
        };
        try {
          await saveUserProfile(userProf);
        } catch (saveErr) {
          console.warn('Initial profile could not be saved to Firestore (offline):', saveErr);
        }
      }
      setProfile(userProf);
    } catch (err) {
      console.warn('Error fetching user profile from Firestore, using offline fallback:', err);
      const now = new Date().toISOString();
      const fallbackProf: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'LifeForge Student',
        photoURL: firebaseUser.photoURL || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        primaryGoal: 'Master technical placements and build disciplined study routines',
        studyPhilosophy: 'Learn through logic, deep focus, and active recall',
        disciplinedStreakDays: 1,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
      };
      setProfile(fallbackProf);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser);
        if (firebaseUser) {
          await fetchProfile(firebaseUser);
          setAccessToken(getCachedAccessToken());
        } else {
          setProfile(null);
          setAccessToken(null);
          setCachedAccessToken(null);
        }
        setLoading(false);
      });
    } catch (err) {
      console.error('Auth initialization error:', err);
      setTimeout(() => setLoading(false), 0);
    }

    return () => unsubscribe();
  }, [fetchProfile]);

  const handleSignInWithGoogle = async () => {
    setLoading(true);
    try {
      const { user: loggedUser, accessToken: token } = await loginWithGoogle();
      setAccessToken(token);
      await fetchProfile(loggedUser);
    } catch (err) {
      console.error('Sign in error:', err);
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
    } catch (err) {
      console.error('Failed to authenticate Google Calendar:', err);
      return null;
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await logoutUser();
      setUser(null);
      setProfile(null);
      setAccessToken(null);
    } catch (err) {
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
