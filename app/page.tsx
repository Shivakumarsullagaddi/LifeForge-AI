'use client';

import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { HeaderBar } from '@/components/HeaderBar';
import { NavigationSidebar, type NavSection } from '@/components/NavigationSidebar';
import { AgentActivityBar } from '@/components/AgentActivityBar';
import { OnboardingModal } from '@/components/OnboardingModal';

// Views
import { DashboardView } from '@/components/views/DashboardView';
import { LiveCoachView } from '@/components/views/LiveCoachView';
import { JournalView } from '@/components/views/JournalView';
import { MemoriesView } from '@/components/views/MemoriesView';
import { GoalsTasksView } from '@/components/views/GoalsTasksView';
import { StudyView } from '@/components/views/StudyView';
import { PlacementsView } from '@/components/views/PlacementsView';
import { ReflectionsView } from '@/components/views/ReflectionsView';
import { ConversationsView } from '@/components/views/ConversationsView';
import { PrivacySecurityView } from '@/components/views/PrivacySecurityView';
import { CalendarView } from '@/components/views/CalendarView';

import { Button } from '@/components/ui/Button';
import { Sparkles, ShieldCheck, Compass, Target, GraduationCap, LogIn } from 'lucide-react';

function AppContent() {
  const { user, profile, loading, signInWithGoogle } = useAuth();
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [manualOnboardingOpen, setManualOnboardingOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const isOnboardingOpen =
    manualOnboardingOpen ||
    Boolean(user && profile && !profile.onboardingCompleted && !onboardingDismissed);

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

          <Button size="sm" onClick={signInWithGoogle} className="gap-2 text-xs">
            <LogIn className="w-4 h-4" /> Sign In with Google
          </Button>
        </header>

        {/* Hero Section */}
        <main className="max-w-4xl mx-auto px-6 py-16 text-center space-y-8 my-auto">
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
            <Button size="lg" onClick={signInWithGoogle} className="gap-2 px-8 shadow-lg shadow-amber-950/50">
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
      {/* Top Header */}
      <HeaderBar
        onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
        onOpenOnboarding={() => setManualOnboardingOpen(true)}
      />

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <NavigationSidebar
          currentSection={currentSection}
          onSelectSection={(sec) => setCurrentSection(sec)}
          isOpenMobile={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-h-[calc(100vh-4rem-2.75rem)]">
          {currentSection === 'dashboard' && (
            <DashboardView
              onNavigate={(sec) => setCurrentSection(sec)}
            />
          )}
          {currentSection === 'live-coach' && <LiveCoachView />}
          {currentSection === 'journal' && <JournalView />}
          {currentSection === 'memories' && <MemoriesView />}
          {currentSection === 'goals' && <GoalsTasksView />}
          {currentSection === 'study' && <StudyView />}
          {currentSection === 'placements' && <PlacementsView />}
          {currentSection === 'calendar' && <CalendarView />}
          {currentSection === 'reflections' && <ReflectionsView />}
          {currentSection === 'conversations' && <ConversationsView />}
          {currentSection === 'privacy' && <PrivacySecurityView />}
        </main>
      </div>

      {/* Observability & Agent Activity Bar */}
      <AgentActivityBar />

      {/* Onboarding / Profile Setup Modal */}
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
      <AppContent />
    </AuthProvider>
  );
}
