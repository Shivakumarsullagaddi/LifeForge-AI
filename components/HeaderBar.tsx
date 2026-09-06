'use client';

import { Flame, UserCircle, LogIn, LogOut, ShieldCheck, Sparkles, Menu, Radio, Clock, Pause, Play, CheckCircle2, RotateCcw, Square } from 'lucide-react';
import { Button } from './ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useLiveVoiceContext } from '@/lib/live-voice-context';
import { uiActionBus } from '@/lib/events/uiEvents';

interface HeaderBarProps {
  onToggleMobileNav?: () => void;
  onOpenOnboarding?: () => void;
  isLiveActive?: boolean;
  onNavigateLive?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onToggleMobileNav,
  onOpenOnboarding,
  isLiveActive,
  onNavigateLive,
}) => {
  const { user, profile, loading, signInWithGoogle, signOut } = useAuth();
  const { timerState, pauseTimer, resumeTimer, resetTimer, stopTimer } = useLiveVoiceContext();

  const isTimerActive =
    timerState.status === 'RUNNING' ||
    timerState.status === 'PAUSED' ||
    timerState.status === 'COMPLETED';

  const mins = Math.floor((timerState.remainingSeconds || timerState.remainingTime || 0) / 60);
  const secs = (timerState.remainingSeconds || timerState.remainingTime || 0) % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

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
        {isLiveActive && (
          <button
            onClick={onNavigateLive}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs font-medium hover:bg-emerald-900/60 transition-colors animate-pulse"
            title="Live voice coach active in background. Click to view."
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Live Coach Active</span>
          </button>
        )}

        {isTimerActive && (
          <div
            data-testid="header-global-timer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-inner transition-all animate-fade-in bg-slate-900 border-slate-800"
          >
            {timerState.status === 'RUNNING' && (
              <>
                <span className="font-bold text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  {timerState.mode === 'break' ? 'BREAK' : 'FOCUS'}
                </span>
                <span className="font-mono text-xs font-bold text-slate-100">{timeFormatted}</span>
                <span className="text-[11px] text-amber-400/90 font-medium hidden sm:inline">Running</span>
                <button
                  data-testid="header-pause-timer"
                  onClick={() => {
                    uiActionBus.emit('PAUSE_TIMER');
                    pauseTimer();
                  }}
                  title="Pause Timer"
                  className="p-1 hover:text-white transition-colors text-slate-400"
                >
                  <Pause className="w-3 h-3" />
                </button>
                <button
                  data-testid="header-restart-timer"
                  onClick={() => {
                    uiActionBus.emit('RESTART_TIMER');
                    resetTimer();
                  }}
                  title="Restart Timer"
                  className="p-1 hover:text-amber-400 transition-colors text-slate-400"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button
                  data-testid="header-stop-timer"
                  onClick={() => {
                    uiActionBus.emit('STOP_TIMER');
                    stopTimer();
                  }}
                  title="Stop Timer"
                  className="p-1 hover:text-rose-400 transition-colors text-slate-400"
                >
                  <Square className="w-3 h-3" />
                </button>
              </>
            )}

            {timerState.status === 'PAUSED' && (
              <>
                <span className="font-bold text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                  FOCUS PAUSED
                </span>
                <span className="font-mono text-xs font-bold text-slate-100">{timeFormatted}</span>
                <button
                  data-testid="header-resume-timer"
                  onClick={() => {
                    uiActionBus.emit('RESUME_TIMER');
                    resumeTimer();
                  }}
                  title="Resume Timer"
                  className="p-1 hover:text-amber-400 transition-colors text-slate-400"
                >
                  <Play className="w-3 h-3 fill-current" />
                </button>
                <button
                  data-testid="header-restart-timer"
                  onClick={() => {
                    uiActionBus.emit('RESTART_TIMER');
                    resetTimer();
                  }}
                  title="Restart Timer"
                  className="p-1 hover:text-amber-400 transition-colors text-slate-400"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button
                  data-testid="header-stop-timer"
                  onClick={() => {
                    uiActionBus.emit('STOP_TIMER');
                    stopTimer();
                  }}
                  title="Stop Timer"
                  className="p-1 hover:text-rose-400 transition-colors text-slate-400"
                >
                  <Square className="w-3 h-3" />
                </button>
              </>
            )}

            {timerState.status === 'COMPLETED' && (
              <>
                <span className="font-bold text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  {timerState.mode === 'break' ? 'BREAK COMPLETE' : 'FOCUS COMPLETE'}
                </span>
                <button
                  data-testid="header-stop-timer"
                  onClick={() => {
                    uiActionBus.emit('STOP_TIMER');
                    stopTimer();
                  }}
                  title="Dismiss Timer"
                  className="p-1 hover:text-white transition-colors text-slate-400"
                >
                  <Square className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}

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
          <Button size="sm" onClick={() => signInWithGoogle().catch(() => {})} className="gap-2">
            <LogIn className="w-4 h-4" />
            <span>Sign In with Google</span>
          </Button>
        )}
      </div>
    </header>
  );
};
