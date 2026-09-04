'use client';

import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useAuth } from '@/lib/auth-context';
import { Compass, Target, BookOpen, ShieldCheck, Sparkles } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [primaryGoal, setPrimaryGoal] = useState(
    profile?.primaryGoal || 'Crack top-tier campus placements and build disciplined daily study routines'
  );
  const [studyPhilosophy, setStudyPhilosophy] = useState(
    profile?.studyPhilosophy || 'Learn through logic, deep work, active recall, and consistent practice'
  );
  const [targetCompanies, setTargetCompanies] = useState(
    profile?.targetPlacements?.join(', ') || 'Google, Microsoft, Amazon, Tier-1 Tech, Core Engineering'
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      const placementsArray = targetCompanies
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await updateProfile({
        primaryGoal,
        studyPhilosophy,
        targetPlacements: placementsArray,
        onboardingCompleted: true,
      });
      onClose();
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Welcome to LifeForge AI"
      description="Personal AI Life, Study & Career Coach"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-3.5">
              <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400 shrink-0">
                <Compass className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-100">
                  The Core Philosophy of LifeForge AI
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  LifeForge AI is a disciplined, private companion built to help you master technical
                  interviews, study with active recall, build healthy routines, and solve real challenges.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-medium">
                  <Target className="w-4 h-4" />
                  <span>Intentional Action</span>
                </div>
                <p className="text-slate-400">
                  Do the work you genuinely want to become excellent at. Sustained focus beats shallow multitasking.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <BookOpen className="w-4 h-4" />
                  <span>Logic Over Rote</span>
                </div>
                <p className="text-slate-400">
                  Clear misconceptions, teach concepts back, and practice repeatedly to build true intuition.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-sky-400 font-medium">
                  <Sparkles className="w-4 h-4" />
                  <span>Solution-Oriented</span>
                </div>
                <p className="text-slate-400">
                  When routines slip: convert excuses into immediate recovery, next-day protection, and steady progress.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-indigo-400 font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  <span>User Data Isolation</span>
                </div>
                <p className="text-slate-400">
                  Strict client-isolated Firestore rules. Your memories, journals, and reflections remain 100% private to you.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)}>Next: Configure Your Goals</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Primary Goal / Focus for this Semester
              </label>
              <textarea
                rows={2}
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80"
                placeholder="e.g. Master Data Structures, crack 2026 campus placements, study 3 hours deep work daily"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Target Companies / Roles (Comma separated)
              </label>
              <input
                type="text"
                value={targetCompanies}
                onChange={(e) => setTargetCompanies(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80"
                placeholder="e.g. Google, Microsoft, Amazon, Software Engineer, Core Systems"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Your Preferred Study Philosophy
              </label>
              <textarea
                rows={2}
                value={studyPhilosophy}
                onChange={(e) => setStudyPhilosophy(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80"
                placeholder="e.g. Learn through first principles, practice active recall, avoid passive video watching"
              />
            </div>

            <div className="flex justify-between pt-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleFinish} isLoading={isSaving}>
                Complete Setup & Enter LifeForge
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
