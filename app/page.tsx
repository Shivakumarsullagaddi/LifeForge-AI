'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LiveVoiceProvider, useLiveVoiceContext } from '@/lib/live-voice-context';
import { HeaderBar } from '@/components/HeaderBar';
import { NavigationSidebar, type NavSection } from '@/components/NavigationSidebar';
import { AgentActivityBar } from '@/components/AgentActivityBar';
import { OnboardingModal } from '@/components/OnboardingModal';

// Views
import { DashboardView } from '@/components/views/DashboardView';
import { LiveCoachView } from '@/components/views/LiveCoachView';
import { GoalsTasksView } from '@/components/views/GoalsTasksView';
import { PlacementsView } from '@/components/views/PlacementsView';
import { ReflectionsView } from '@/components/views/ReflectionsView';
import { ConversationsView } from '@/components/views/ConversationsView';
import { PrivacySecurityView } from '@/components/views/PrivacySecurityView';
import { CalendarView } from '@/components/views/CalendarView';
import { TabErrorBoundary } from '@/components/TabErrorBoundary';

import { Button } from '@/components/ui/Button';
import { Sparkles, ShieldCheck, Compass, Target, GraduationCap, LogIn, AlertCircle, X, Radio } from 'lucide-react';

function AppContent() {
  const { user, profile, loading, signInWithGoogle, authError, clearAuthError } = useAuth();
  const {
    isLiveSessionActive,
    activeAgentLabel,
    liveVoice,
    setActiveConversationId,
    resumeConversation,
    backgroundLiveStateText,
  } = useLiveVoiceContext();
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [manualOnboardingOpen, setManualOnboardingOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const isOnboardingOpen =
    manualOnboardingOpen ||
    Boolean(user && profile && !profile.onboardingCompleted && !onboardingDismissed);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncHash = () => {
      const h = window.location.hash.replace('#', '');
      if (h && ['dashboard', 'live-coach', 'goals', 'study', 'placements', 'calendar', 'reflections', 'conversations'].includes(h)) {
        setCurrentSection(h as NavSection);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="w-12 h-12 rounded-2xl bg-amber-600 flex items-center justify-center mb-4 animate-bounce">
          <Sparkles className="w-6 h-6 text-slate-950 fill-slate-950" />
        </div>
        <h2 className="text-base font-semibold text-slate-100">Initializing LifeForge AI</h2>
        <p className="text-xs text-slate-500 mt-1">Connecting to isolated Firestore & verifying credentials...</p>
      </div>
    );
  }

  // Unauthenticated Welcome State
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
        {/* Header */}
        <header className="h-16 border-b border-slate-800/80 px-6 max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-600 flex items-center justify-center font-bold text-slate-950">
              <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
            </div>
            <span className="font-bold text-base tracking-tight text-slate-100">LifeForge AI</span>
          </div>

          <Button size="sm" onClick={() => signInWithGoogle().catch(() => {})} className="gap-2 text-xs">
            <LogIn className="w-4 h-4" /> Sign In with Google
          </Button>
        </header>

        {/* Hero Section */}
        <main className="max-w-4xl mx-auto px-6 py-16 text-center space-y-8 my-auto">
          {authError && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-center justify-between gap-3 text-xs text-rose-300 max-w-lg mx-auto text-left animate-fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-200">Authentication Notice</div>
                  <p className="mt-0.5 text-rose-300/90">{authError}</p>
                </div>
              </div>
              <button
                onClick={clearAuthError}
                className="p-1 rounded-md text-rose-400 hover:text-rose-200 hover:bg-rose-900/30 transition-colors"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Dedicated Isolated Cloud Database</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl sm:text-5xl font-black text-slate-100 tracking-tight leading-tight">
              Personal AI Life, Study & Career Coach
            </h1>
            <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Understand current challenges, build disciplined habits, practice active recall, prepare for campus placements, and organize goals under strict user data isolation.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={() => signInWithGoogle().catch(() => {})} className="gap-2 px-8 shadow-lg shadow-amber-950/50">
              <LogIn className="w-5 h-5" />
              <span>Get Started with Google</span>
            </Button>
          </div>

          {/* 3 Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-10 text-left">
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400 flex items-center justify-center">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">Discipline & Routines</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Transform wasted hours into next-day protection. Solution-focused accountability without guilt or punishment.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">Logic & Active Recall</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Teach back concepts, clear misconceptions, and master 25/5 Pomodoro focus blocks with zero distractions.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">Placement Preparation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Skill-gap matrix, technical interview defenses, and company research grounded in current industry data.
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="h-14 border-t border-slate-900 text-center text-xs text-slate-600 flex items-center justify-center">
          LifeForge AI · Personal Life, Study & Career Coach · Zero Trust User Isolation
        </footer>
      </div>
    );
  }

  // Authenticated Application Shell
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <HeaderBar
        onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
        onOpenOnboarding={() => setManualOnboardingOpen(true)}
        isLiveActive={isLiveSessionActive}
        onNavigateLive={() => setCurrentSection('live-coach')}
      />

      <div className="flex-1 flex overflow-hidden">
        <NavigationSidebar
          currentSection={currentSection}
          onSelectSection={(sec) => setCurrentSection(sec)}
          isOpenMobile={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        <main
          className={
            currentSection === 'live-coach'
              ? 'flex-1 overflow-hidden h-[calc(100vh-4rem-2.75rem)] flex flex-col'
              : 'flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-h-[calc(100vh-4rem-2.75rem)]'
          }
        >
          <TabErrorBoundary tabName={currentSection}>
            {currentSection === 'dashboard' && (
              <DashboardView
                onNavigate={(sec) => setCurrentSection(sec)}
              />
            )}
            {currentSection === 'live-coach' && <LiveCoachView />}
            {currentSection === 'goals' && <GoalsTasksView />}
            {currentSection === 'study' && (
              <DashboardView
                onNavigate={(sec) => setCurrentSection(sec)}
              />
            )}
            {currentSection === 'placements' && <PlacementsView />}
            {currentSection === 'calendar' && <CalendarView />}
            {currentSection === 'reflections' && <ReflectionsView />}
            {currentSection === 'conversations' && (
              <ConversationsView
                onSelectConversation={async (id) => {
                  await resumeConversation(id);
                  setCurrentSection('live-coach');
                }}
              />
            )}
            {currentSection === 'privacy' && <PrivacySecurityView />}
          </TabErrorBoundary>
        </main>
      </div>

      {isLiveSessionActive && currentSection !== 'live-coach' && (
        <button
          onClick={() => setCurrentSection('live-coach')}
          className="fixed bottom-14 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900/95 border border-emerald-500/70 shadow-2xl backdrop-blur-md text-slate-100 hover:bg-slate-800 transition-all hover:scale-105"
          title="Live Coach active in background. Click to return."
        >
          <div className="relative flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
          </div>
          <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold tracking-wide text-emerald-300">
            {backgroundLiveStateText || 'LIVE — CONNECTED'}
          </span>
        </button>
      )}

      <AgentActivityBar
        activeAgent={activeAgentLabel}
        isLiveActive={isLiveSessionActive}
        statusText={
          isLiveSessionActive
            ? `Live Voice Active · ${liveVoice.state}`
            : 'System Ready · Isolated Firestore Active'
        }
      />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          setManualOnboardingOpen(false);
          setOnboardingDismissed(true);
        }}
      />
    </div>
  );
}

export default function RootPage() {
  return (
    <AuthProvider>
      <LiveVoiceProvider>
        <AppContent />
      </LiveVoiceProvider>
    </AuthProvider>
  );
}
