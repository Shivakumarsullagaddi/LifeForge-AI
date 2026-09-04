'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import {
  getReflections,
  addReflection,
  updateReflection,
  deleteReflection,
  getStudySessions,
  getTasks,
  getGoals,
  getJournals,
  getMemories,
  getPlacementProfile,
  addTask,
  addGoal,
} from '@/lib/firebase';
import type { ReflectionEntry, WeeklyReflectionReport, GrowthTrendMetrics } from '@/lib/types';
import {
  Sparkles,
  Plus,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Award,
  AlertCircle,
  BrainCircuit,
  Target,
  GraduationCap,
  Briefcase,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Trash2,
  Edit3,
  Quote,
  Clock,
  Compass,
  Check,
} from 'lucide-react';

export const ReflectionsView: React.FC = () => {
  const { user } = useAuth();
  const [reflections, setReflections] = useState<ReflectionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Growth Analysis & Report State
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReflectionReport | null>(null);
  const [trendMetrics, setTrendMetrics] = useState<GrowthTrendMetrics | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'history' | 'report'>('dashboard');

  // Daily Reflection Form State
  const [isDailyModalOpen, setIsDailyModalOpen] = useState(false);
  const [editingReflection, setEditingReflection] = useState<ReflectionEntry | null>(null);
  const [whatAccomplished, setWhatAccomplished] = useState('');
  const [whatAvoided, setWhatAvoided] = useState('');
  const [whatWorked, setWhatWorked] = useState('');
  const [whatFailed, setWhatFailed] = useState('');
  const [whatLearned, setWhatLearned] = useState('');
  const [nextImprovement, setNextImprovement] = useState('');
  const [disciplineScore, setDisciplineScore] = useState(4);
  const [focusScore, setFocusScore] = useState(4);
  const [isSaving, setIsSaving] = useState(false);

  // Adoption Feedback state for proposed goals & tasks
  const [adoptedItems, setAdoptedItems] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [refs, sessions, tasks, goals, placement] = await Promise.all([
        getReflections(user.uid),
        getStudySessions(user.uid),
        getTasks(user.uid),
        getGoals(user.uid),
        getPlacementProfile(user.uid),
      ]);
      setReflections(refs);

      // Compute local baseline trend metrics
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const curWeekStudy = sessions
        .filter((s) => new Date(s.createdAt) >= sevenDaysAgo)
        .reduce((acc, s) => acc + (s.durationMinutes || 0), 0);

      const prevWeekStudy = sessions
        .filter((s) => {
          const d = new Date(s.createdAt);
          return d >= fourteenDaysAgo && d < sevenDaysAgo;
        })
        .reduce((acc, s) => acc + (s.durationMinutes || 0), 0);

      const curCompletedTasks = tasks.filter((t) => t.status === 'completed' && new Date(t.updatedAt || t.createdAt) >= sevenDaysAgo).length;
      const prevCompletedTasks = tasks.filter((t) => {
        if (t.status !== 'completed') return false;
        const d = new Date(t.updatedAt || t.createdAt);
        return d >= fourteenDaysAgo && d < sevenDaysAgo;
      }).length;

      const studyTimeDiff = prevWeekStudy === 0
        ? curWeekStudy > 0 ? 100 : 0
        : Math.round(((curWeekStudy - prevWeekStudy) / prevWeekStudy) * 100);

      const taskDiff = prevCompletedTasks === 0
        ? curCompletedTasks > 0 ? 100 : 0
        : Math.round(((curCompletedTasks - prevCompletedTasks) / prevCompletedTasks) * 100);

      const avgDisc = refs.length > 0
        ? Number((refs.reduce((acc, r) => acc + (r.disciplineScore || 4), 0) / refs.length).toFixed(1))
        : 4.2;

      setTrendMetrics({
        currentWeekStudyMinutes: curWeekStudy,
        previousWeekStudyMinutes: prevWeekStudy,
        studyTimeChangePercent: studyTimeDiff,
        currentWeekCompletedTasks: curCompletedTasks,
        previousWeekCompletedTasks: prevCompletedTasks,
        taskCompletionChangePercent: taskDiff,
        activeGoalsCount: goals.filter((g) => g.status === 'in_progress').length,
        avgDisciplineScore: avgDisc,
        reflectionsLoggedCount: refs.length,
        topStrugglingTopics: placement?.weakAreas || ['Graphs', 'Dynamic Programming', 'OS Virtual Memory'],
        topMasteredSkills: (placement?.skills || []).filter((s) => s.completed || s.level === 'Mastery').map((s) => s.name),
      });
    } catch (err) {
      console.error('Failed to load reflections & growth data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (isMounted) {
        await loadData();
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  // Generate Weekly Evidence-Grounded Reflection Report with Gemini 3.8 Flash
  const handleGenerateWeeklyReport = async () => {
    if (!user) return;
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const [journals, memories, goals, tasks, refs, studySessions, placementProfile] = await Promise.all([
        getJournals(user.uid),
        getMemories(user.uid),
        getGoals(user.uid),
        getTasks(user.uid),
        getReflections(user.uid),
        getStudySessions(user.uid),
        getPlacementProfile(user.uid),
      ]);

      const res = await fetch('/api/reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          timeframe: 'weekly',
          userData: {
            journals,
            memories,
            goals,
            tasks,
            reflections: refs,
            studySessions,
            placementProfile,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate weekly review');
      }

      const data = await res.json();
      setWeeklyReport(data.report);
      if (data.trendMetrics) {
        setTrendMetrics(data.trendMetrics);
      }
      setActiveSubTab('report');
    } catch (err: any) {
      console.error('Failed to generate weekly reflection report:', err);
      setReportError(err.message || 'Unable to generate report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Save / Update Daily Reflection
  const handleSaveDailyReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const winsList = whatAccomplished.split('\n').map((s) => s.trim()).filter(Boolean);
      const challengesList = whatAvoided.split('\n').map((s) => s.trim()).filter(Boolean);

      if (editingReflection) {
        // Update existing reflection
        await updateReflection(user.uid, editingReflection.id, {
          whatHappened: whatAccomplished.trim(),
          whatWasAvoided: whatAvoided.trim(),
          whatWorked: whatWorked.trim(),
          whatFailed: whatFailed.trim(),
          whatLearned: whatLearned.trim(),
          nextImprovement: nextImprovement.trim(),
          keyWins: winsList,
          challengesFaced: challengesList,
          lessonsLearned: whatLearned.trim(),
          disciplineScore,
          focusScore,
        });
      } else {
        // Create new daily reflection
        await addReflection(user.uid, {
          type: 'daily',
          date: now.split('T')[0],
          whatHappened: whatAccomplished.trim(),
          whatWasAvoided: whatAvoided.trim(),
          whatWorked: whatWorked.trim(),
          whatFailed: whatFailed.trim(),
          whatLearned: whatLearned.trim(),
          nextImprovement: nextImprovement.trim(),
          keyWins: winsList,
          challengesFaced: challengesList,
          lessonsLearned: whatLearned.trim(),
          disciplineScore,
          focusScore,
          createdAt: now,
          updatedAt: now,
        });
      }

      setIsDailyModalOpen(false);
      setEditingReflection(null);
      resetDailyForm();
      await loadData();
    } catch (err) {
      console.error('Failed to save reflection:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const resetDailyForm = () => {
    setWhatAccomplished('');
    setWhatAvoided('');
    setWhatWorked('');
    setWhatFailed('');
    setWhatLearned('');
    setNextImprovement('');
    setDisciplineScore(4);
    setFocusScore(4);
  };

  const handleOpenEdit = (ref: ReflectionEntry) => {
    setEditingReflection(ref);
    setWhatAccomplished(ref.whatHappened || (ref.keyWins || []).join('\n'));
    setWhatAvoided(ref.whatWasAvoided || (ref.challengesFaced || []).join('\n'));
    setWhatWorked(ref.whatWorked || '');
    setWhatFailed(ref.whatFailed || '');
    setWhatLearned(ref.whatLearned || ref.lessonsLearned || '');
    setNextImprovement(ref.nextImprovement || (ref.nextCommitments || []).join('\n'));
    setDisciplineScore(ref.disciplineScore || 4);
    setFocusScore(ref.focusScore || 4);
    setIsDailyModalOpen(true);
  };

  const handleDeleteReflection = async (refId: string) => {
    if (!user) return;
    try {
      await deleteReflection(user.uid, refId);
      setReflections((prev) => prev.filter((r) => r.id !== refId));
    } catch (err) {
      console.error('Failed to delete reflection:', err);
    }
  };

  // Feedback loop: Adopt suggested goal from report
  const handleAdoptGoal = async (goalTitle: string) => {
    if (!user || adoptedItems[`goal_${goalTitle}`]) return;
    try {
      await addGoal(user.uid, {
        title: goalTitle,
        description: 'Auto-proposed from weekly reflection analysis to address observed study friction.',
        domain: 'study',
        priority: 'high',
        status: 'in_progress',
        progress: 0,
        source: 'weekly_reflection_report',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setAdoptedItems((prev) => ({ ...prev, [`goal_${goalTitle}`]: true }));
    } catch (err) {
      console.error('Failed to adopt goal:', err);
    }
  };

  // Feedback loop: Adopt suggested task from report
  const handleAdoptTask = async (taskTitle: string) => {
    if (!user || adoptedItems[`task_${taskTitle}`]) return;
    try {
      await addTask(user.uid, {
        title: taskTitle,
        description: 'Targeted recovery task suggested by Reflection Agent.',
        domain: 'study',
        priority: 'high',
        status: 'pending',
        isDeepWork: true,
        estimatedMinutes: 45,
        source: 'weekly_reflection_report',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setAdoptedItems((prev) => ({ ...prev, [`task_${taskTitle}`]: true }));
    } catch (err) {
      console.error('Failed to adopt task:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <Badge variant="amber" size="sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Growth Intelligence & Reflection</span>
            </Badge>
            <Badge variant="slate" size="sm">
              <BrainCircuit className="w-3.5 h-3.5 text-sky-400" />
              <span>Evidence-Grounded</span>
            </Badge>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Personal Reflection & Performance Evolution
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            &ldquo;If you fall, stand up and continue. Avoid unnecessary excuses. Focus on solutions.&rdquo; Transform real study data into structured growth.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditingReflection(null);
              resetDailyForm();
              setIsDailyModalOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Log Daily Reflection</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateWeeklyReport}
            isLoading={isGeneratingReport}
            className="gap-2 border-amber-800/60 text-amber-300 hover:bg-amber-950/30"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Generate Weekly Review</span>
          </Button>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('dashboard')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'dashboard'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Growth Dashboard & Trends
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'history'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Daily Reflections Log ({reflections.length})
        </button>
        {weeklyReport && (
          <button
            onClick={() => setActiveSubTab('report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'report'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Weekly Report ({weeklyReport.periodLabel})</span>
          </button>
        )}
      </div>

      {/* Error Banner */}
      {reportError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-200">Review Generation Notice</div>
            <p className="mt-0.5">{reportError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleGenerateWeeklyReport} className="text-xs text-rose-300 border-rose-800">
            Retry
          </Button>
        </div>
      )}

      {/* TAB 1: GROWTH DASHBOARD & TRENDS */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Trend Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="space-y-2 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Focus Study (7d)
                </span>
                {trendMetrics && (
                  <span
                    className={`flex items-center text-[11px] font-bold ${
                      trendMetrics.studyTimeChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {trendMetrics.studyTimeChangePercent >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(trendMetrics.studyTimeChangePercent)}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-slate-100">
                {trendMetrics ? `${(trendMetrics.currentWeekStudyMinutes / 60).toFixed(1)} hrs` : '0.0 hrs'}
              </div>
              <p className="text-[11px] text-slate-500">
                vs {(trendMetrics ? trendMetrics.previousWeekStudyMinutes / 60 : 0).toFixed(1)} hrs in previous 7-day period
              </p>
            </Card>

            <Card className="space-y-2 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Completed Tasks
                </span>
                {trendMetrics && (
                  <span
                    className={`flex items-center text-[11px] font-bold ${
                      trendMetrics.taskCompletionChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {trendMetrics.taskCompletionChangePercent >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(trendMetrics.taskCompletionChangePercent)}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-slate-100">
                {trendMetrics?.currentWeekCompletedTasks ?? 0} tasks
              </div>
              <p className="text-[11px] text-slate-500">
                Targeted deep work completions recorded in Firestore
              </p>
            </Card>

            <Card className="space-y-2 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-sky-400" /> Discipline Index
                </span>
                <Badge variant="sky" size="sm">Self-Scored</Badge>
              </div>
              <div className="text-2xl font-bold text-slate-100">
                {trendMetrics?.avgDisciplineScore ?? '4.2'}/5
              </div>
              <p className="text-[11px] text-slate-500">
                Based on {trendMetrics?.reflectionsLoggedCount ?? 0} recorded daily evaluations
              </p>
            </Card>

            <Card className="space-y-2 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-purple-400" /> Active Goals
                </span>
                <Badge variant="slate" size="sm">In Progress</Badge>
              </div>
              <div className="text-2xl font-bold text-slate-100">
                {trendMetrics?.activeGoalsCount ?? 0}
              </div>
              <p className="text-[11px] text-slate-500">
                Milestones currently being pursued with intentionality
              </p>
            </Card>
          </div>

          {/* Patterns & Growth Insights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Struggle & Avoidance Detection</span>
                </CardTitle>
                <CardDescription>
                  Topics and patterns where friction or procrastination was observed in your logs
                </CardDescription>
              </CardHeader>

              <div className="space-y-3">
                {trendMetrics?.topStrugglingTopics && trendMetrics.topStrugglingTopics.length > 0 ? (
                  trendMetrics.topStrugglingTopics.map((topic, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-rose-300">{topic}</div>
                        <div className="text-[11px] text-slate-500">
                          Identified as friction area in study logs or placement profile
                        </div>
                      </div>
                      <Badge variant="rose" size="sm">Friction Area</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No recurring struggle topics logged yet.</p>
                )}
              </div>
            </Card>

            <Card className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-500" />
                  <span>Verified Competencies & Progress</span>
                </CardTitle>
                <CardDescription>
                  Skills and achievements backed by practice logs and active recall sessions
                </CardDescription>
              </CardHeader>

              <div className="space-y-3">
                {trendMetrics?.topMasteredSkills && trendMetrics.topMasteredSkills.length > 0 ? (
                  trendMetrics.topMasteredSkills.map((skill, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-emerald-300">{skill}</div>
                        <div className="text-[11px] text-slate-500">
                          Completed and reinforced through practice
                        </div>
                      </div>
                      <Badge variant="emerald" size="sm">Mastered</Badge>
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-200">Building Baseline Skills</p>
                    <p className="text-[11px] text-slate-500">
                      Complete study sessions in the Study Lab or Placement hub to record verified competencies.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Quick Principle Reminder */}
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 flex items-start gap-3">
            <Quote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-200/90">
              <span className="font-bold text-amber-300">Core Guidance Principle:</span>
              <p className="italic leading-relaxed">
                &ldquo;Something is better than nothing. Learn through logic rather than rote memorization. Do not waste energy comparing yourself unnecessarily with others; give sustained attention to meaningful goals.&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DAILY REFLECTIONS LOG & CRUD */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">Logged Daily & Session Reflections</h2>
            <Button
              size="sm"
              onClick={() => {
                setEditingReflection(null);
                resetDailyForm();
                setIsDailyModalOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> New Daily Reflection
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-44 bg-slate-900/50 rounded-xl animate-pulse" />
              <div className="h-44 bg-slate-900/50 rounded-xl animate-pulse" />
            </div>
          ) : reflections.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 space-y-3">
              <Sparkles className="w-10 h-10 text-amber-500 mx-auto opacity-60" />
              <p className="text-sm font-semibold text-slate-300">No reflections logged yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                End each day answering: What did I accomplish? What did I avoid? What worked? What will I change tomorrow?
              </p>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setEditingReflection(null);
                  resetDailyForm();
                  setIsDailyModalOpen(true);
                }}
              >
                Log Today&apos;s Reflection
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reflections.map((ref) => (
                <Card key={ref.id} className="space-y-3 relative group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-slate-100">{ref.date}</span>
                      <Badge size="sm" variant="slate">
                        {ref.type}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        {ref.disciplineScore ?? 4}/5 Score
                      </span>
                      <button
                        onClick={() => handleOpenEdit(ref)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Edit reflection"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteReflection(ref.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Delete reflection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 6 Core Reflection Questions */}
                  <div className="space-y-2 text-xs divide-y divide-slate-800/60 pt-1">
                    {(ref.whatHappened || (ref.keyWins && ref.keyWins.length > 0)) && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase">What was accomplished:</span>
                        <p className="text-slate-300 text-[11px] mt-0.5 whitespace-pre-line">
                          {ref.whatHappened || (ref.keyWins || []).join('\n')}
                        </p>
                      </div>
                    )}

                    {(ref.whatWasAvoided || (ref.challengesFaced && ref.challengesFaced.length > 0)) && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-bold text-rose-400 uppercase">What was avoided / Distractions:</span>
                        <p className="text-slate-400 text-[11px] mt-0.5 whitespace-pre-line">
                          {ref.whatWasAvoided || (ref.challengesFaced || []).join('\n')}
                        </p>
                      </div>
                    )}

                    {ref.whatWorked && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-bold text-sky-400 uppercase">What worked well:</span>
                        <p className="text-slate-300 text-[11px] mt-0.5">{ref.whatWorked}</p>
                      </div>
                    )}

                    {ref.whatFailed && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-bold text-amber-400 uppercase">What failed / fell short:</span>
                        <p className="text-slate-400 text-[11px] mt-0.5">{ref.whatFailed}</p>
                      </div>
                    )}

                    {(ref.whatLearned || ref.lessonsLearned) && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-bold text-purple-400 uppercase">What I learned:</span>
                        <p className="text-slate-300 text-[11px] mt-0.5 italic">
                          &ldquo;{ref.whatLearned || ref.lessonsLearned}&rdquo;
                        </p>
                      </div>
                    )}

                    {ref.nextImprovement && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase">Tomorrow&apos;s change:</span>
                        <p className="text-slate-200 text-[11px] mt-0.5 font-medium">{ref.nextImprovement}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STRUCTURED WEEKLY REFLECTION REPORT */}
      {activeSubTab === 'report' && weeklyReport && (
        <div className="space-y-6">
          <Card className="border-emerald-800/40 bg-gradient-to-b from-slate-900 to-slate-950 space-y-6">
            <CardHeader className="border-b border-slate-800 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="emerald" size="sm">Evidence-Grounded Review</Badge>
                    <span className="text-xs text-slate-400">{weeklyReport.periodLabel}</span>
                  </div>
                  <CardTitle className="text-lg mt-1 text-slate-100">
                    Weekly Growth & Performance Synthesis
                  </CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateWeeklyReport}
                  isLoading={isGeneratingReport}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-analyze
                </Button>
              </div>
            </CardHeader>

            {/* Section 1: Accomplishments vs Missed/Avoided */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Key Achievements & Progress</span>
                </div>
                <div className="space-y-2 text-xs">
                  {weeklyReport.achievements.map((ach, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="font-semibold text-slate-200">{ach.title}</div>
                      <div className="text-[11px] text-slate-400">{ach.evidence}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>Missed Priorities & Avoided Topics</span>
                </div>
                <div className="space-y-2 text-xs">
                  {weeklyReport.missedOrAvoided.map((miss, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="font-semibold text-slate-200">{miss.title}</div>
                      <div className="text-[11px] text-slate-400">{miss.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 2: Recurring Patterns */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Identified Behavioral & Study Patterns
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {weeklyReport.recurringPatterns.map((pat, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={
                          pat.type === 'productive'
                            ? 'emerald'
                            : pat.type === 'avoidance'
                            ? 'rose'
                            : 'amber'
                        }
                        size="sm"
                      >
                        {pat.type}
                      </Badge>
                    </div>
                    <div className="font-semibold text-slate-200">{pat.pattern}</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{pat.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Study & Placement Domain Summaries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4" /> Study Practice Analysis
                  </span>
                  <Badge variant="amber" size="sm">
                    {weeklyReport.studyAnalysis.totalStudyHours} hrs ({weeklyReport.studyAnalysis.completedCycles} cycles)
                  </Badge>
                </div>
                <div className="space-y-1 text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-300 font-medium">Difficult Topics: </span>
                    {weeklyReport.studyAnalysis.difficultTopics.join(', ')}
                  </div>
                  <div>
                    <span className="text-slate-300 font-medium">Strongest Improvements: </span>
                    {weeklyReport.studyAnalysis.strongestImprovements.join(', ')}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-400 flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4" /> Placement & Interview Readiness
                  </span>
                  <Badge variant="sky" size="sm">{weeklyReport.careerPlacementAnalysis.prepProgress}</Badge>
                </div>
                <div className="space-y-1 text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-300 font-medium">Identified Gaps: </span>
                    {weeklyReport.careerPlacementAnalysis.skillGapsIdentified.join(', ')}
                  </div>
                  <div>
                    <span className="text-slate-300 font-medium">Upcoming Sprints: </span>
                    {weeklyReport.careerPlacementAnalysis.upcomingPriorities.join(', ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Next Week Priorities + 1-Click Feedback Loop */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Actionable Next Week Priorities (Feedback Loop)
                </h3>
                <span className="text-[11px] text-slate-500">Click to adopt proposed goals/tasks</span>
              </div>

              <div className="space-y-3">
                {weeklyReport.nextWeekPriorities.map((item, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-100 flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.priority}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{item.actionPlan}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.suggestedGoal && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdoptGoal(item.suggestedGoal!)}
                          disabled={adoptedItems[`goal_${item.suggestedGoal}`]}
                          className="text-[11px] gap-1"
                        >
                          {adoptedItems[`goal_${item.suggestedGoal}`] ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Adopted Goal
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 text-amber-400" /> + Add Goal
                            </>
                          )}
                        </Button>
                      )}

                      {item.suggestedTasks && item.suggestedTasks.map((t, tid) => (
                        <Button
                          key={tid}
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdoptTask(t)}
                          disabled={adoptedItems[`task_${t}`]}
                          className="text-[11px] gap-1"
                        >
                          {adoptedItems[`task_${t}`] ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Task Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 text-sky-400" /> + Add Task
                            </>
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Grounded Principle Quote */}
            {weeklyReport.groundedQuote && (
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 italic flex items-center gap-2">
                <Quote className="w-4 h-4 text-amber-400 shrink-0" />
                <span>&ldquo;{weeklyReport.groundedQuote}&rdquo;</span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Daily Reflection Form Modal (6 Core Questions) */}
      <Modal
        isOpen={isDailyModalOpen}
        onClose={() => setIsDailyModalOpen(false)}
        title={editingReflection ? 'Edit Daily Reflection' : 'Daily End-of-Day Reflection'}
        description="Consolidate what was learned, identify friction honestly, and protect tomorrow."
      >
        <form onSubmit={handleSaveDailyReflection} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold">1. What did I accomplish today?</label>
            <textarea
              rows={2}
              required
              value={whatAccomplished}
              onChange={(e) => setWhatAccomplished(e.target.value)}
              placeholder="e.g. Solved 3 Graph problems; Read 1 chapter of Operating Systems; 2 hours deep focus"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-semibold">2. What did I avoid or postpone?</label>
            <textarea
              rows={2}
              value={whatAvoided}
              onChange={(e) => setWhatAvoided(e.target.value)}
              placeholder="e.g. Avoided starting Dynamic Programming hard problems; Spent 30 min on social media"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">3. What worked well?</label>
              <input
                type="text"
                value={whatWorked}
                onChange={(e) => setWhatWorked(e.target.value)}
                placeholder="e.g. Putting phone in another room during 25/5 Pomodoro"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">4. What failed or fell short?</label>
              <input
                type="text"
                value={whatFailed}
                onChange={(e) => setWhatFailed(e.target.value)}
                placeholder="e.g. Jumped to code before dry-running algorithm on paper"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-semibold">5. What did I learn? (Key Concept or Mindset)</label>
            <input
              type="text"
              required
              value={whatLearned}
              onChange={(e) => setWhatLearned(e.target.value)}
              placeholder="e.g. Dijkstra requires non-negative weights; starting with 5 min warm up breaks resistance"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-semibold">6. What should I change tomorrow?</label>
            <input
              type="text"
              required
              value={nextImprovement}
              onChange={(e) => setNextImprovement(e.target.value)}
              placeholder="e.g. Start with DP immediately at 8:00 AM before checking messages"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Discipline Rating: <span className="text-amber-400 font-bold">{disciplineScore}/5</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={disciplineScore}
                onChange={(e) => setDisciplineScore(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Focus Depth: <span className="text-amber-400 font-bold">{focusScore}/5</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={focusScore}
                onChange={(e) => setFocusScore(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsDailyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              {editingReflection ? 'Update Reflection' : 'Save Reflection'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
