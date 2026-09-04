'use client';

import React from 'react';
import { Flame, UserCircle, LogIn, LogOut, ShieldCheck, Sparkles, Menu } from 'lucide-react';
import { Button } from './ui/Button';
import { useAuth } from '@/lib/auth-context';

interface HeaderBarProps {
  onToggleMobileNav?: () => void;
  onOpenOnboarding?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onToggleMobileNav,
  onOpenOnboarding,
}) => {
  const { user, profile, loading, signInWithGoogle, signOut } = useAuth();

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileNav}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-950/40">
            <Sparkles className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-slate-100 tracking-tight">
                LifeForge AI
              </span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                Core OS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Personal Life, Study & Career Coach
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Streak Counter */}
        {user && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-amber-400 shadow-inner">
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
            <span>{profile?.disciplinedStreakDays ?? 1} Day Streak</span>
          </div>
        )}

        {/* Security badge */}
        <div className="hidden md:flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-1 rounded-md">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Isolated Database</span>
        </div>

        {/* Auth status button */}
        {loading ? (
          <div className="h-9 w-24 bg-slate-800 animate-pulse rounded-lg" />
        ) : user ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenOnboarding}
              className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left transition-colors"
              title="Edit Goals & Profile"
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-6 h-6 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <UserCircle className="w-6 h-6 text-amber-400" />
              )}
              <span className="text-xs font-medium text-slate-200 hidden sm:inline max-w-[120px] truncate">
                {user.displayName || user.email?.split('@')[0]}
              </span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-slate-400 hover:text-rose-400 text-xs"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={signInWithGoogle} className="gap-2">
            <LogIn className="w-4 h-4" />
            <span>Sign In with Google</span>
          </Button>
        )}
      </div>
    </header>
  );
};
