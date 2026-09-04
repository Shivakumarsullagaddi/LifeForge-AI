'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import {
  getGoals,
  getTasks,
  getReflections,
  updateTaskStatus,
  getJournals,
} from '@/lib/firebase';
import type { GoalItem, TaskItem, ReflectionEntry, JournalEntry } from '@/lib/types';
import {
  Target,
  CheckCircle2,
  Clock,
  Sparkles,
  Flame,
  ArrowRight,
  BookMarked,
  Brain,
  GraduationCap,
  Briefcase,
  Plus,
  Calendar,
} from 'lucide-react';
import type { NavSection } from '../NavigationSidebar';

interface DashboardViewProps {
  onNavigate: (section: NavSection) => void;
  onOpenQuickJournal?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenQuickJournal,
}) => {
  const { user, profile } = useAuth();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [recentReflections, setRecentReflections] = useState<ReflectionEntry[]>([]);
  const [recentJournals, setRecentJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const [g, t, r, j] = await Promise.all([
          getGoals(user.uid),
          getTasks(user.uid),
          getReflections(user.uid),
          getJournals(user.uid),
        ]);
        if (isMounted) {
          setGoals(g);
          setTasks(t);
          setRecentReflections(r);
          setRecentJournals(j);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleToggleTask = async (task: TaskItem) => {
    if (!user) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(user.uid, task.id, newStatus);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );
  };

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Today's State */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="amber" size="sm">
                <Flame className="w-3.5 h-3.5" />
                <span>Day {profile?.disciplinedStreakDays ?? 1} of Consistent Practice</span>
              </Badge>
              <Badge variant="slate" size="sm">
                Isolated Firestore
              </Badge>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Welcome back, {user?.displayName || 'Student'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              {profile?.primaryGoal || 'Focus on high-impact learning, deep work routines, and placement readiness.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button size="sm" onClick={() => onNavigate('live-coach')} className="gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Talk to Live Coach</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate('calendar')} className="gap-2">
              <Calendar className="w-4 h-4" />
              <span>Google Calendar</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate('study')} className="gap-2">
              <GraduationCap className="w-4 h-4" />
              <span>Study Session</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Grid: 3 Pillars (Goals & Tasks, Study Engine, Recent Reflections) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Today's Tasks & Deep Work */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-500" />
                  <span>Today&apos;s Focus Tasks</span>
                </CardTitle>
                <CardDescription>
                  {pendingTasks.length} pending · {completedTasks.length} completed
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigate('goals')}
                className="text-xs text-amber-400 p-1"
              >
                Manage <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>

            <div className="space-y-2">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-slate-800/60 rounded-lg animate-pulse" />
                  <div className="h-10 bg-slate-800/60 rounded-lg animate-pulse" />
                </div>
              ) : pendingTasks.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                  <p className="text-xs text-slate-400">All prioritized tasks are complete for today!</p>
                  <Button size="sm" variant="outline" onClick={() => onNavigate('goals')} className="text-xs gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add New Task
                  </Button>
                </div>
              ) : (
                pendingTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleToggleTask(task)}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex items-start gap-3 cursor-pointer transition-colors"
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                        task.status === 'completed'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-slate-600 hover:border-amber-400'
                      }`}
                    >
                      {task.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{task.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          size="sm"
                          variant={
                            task.priority === 'urgent'
                              ? 'rose'
                              : task.priority === 'high'
                              ? 'amber'
                              : 'slate'
                          }
                        >
                          {task.priority}
                        </Badge>
                        {task.isDeepWork && (
                          <span className="text-[10px] text-indigo-400 flex items-center gap-1 font-semibold">
                            <Clock className="w-2.5 h-2.5" /> Deep Work
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Active Goals Snapshot */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-emerald-500" />
                  <span>Intentional Goals</span>
                </CardTitle>
                <CardDescription>Target milestones for this semester</CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigate('goals')}
                className="text-xs text-amber-400 p-1"
              >
                View <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>

            <div className="space-y-3">
              {goals.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  No goals created yet. Define your primary goals in Goals & Tasks.
                </div>
              ) : (
                goals.slice(0, 3).map((goal) => (
                  <div key={goal.id} className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 truncate max-w-[200px]">{goal.title}</span>
                      <span className="text-amber-400 font-bold">{goal.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Column 2: Study & Placement Engine */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-sky-400" />
                <span>Evidence-Based Study Engine</span>
              </CardTitle>
              <CardDescription>
                Active Recall, Pomodoro (25/5), and &ldquo;Teach-Back&rdquo; Technique
              </CardDescription>
            </CardHeader>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 text-center space-y-2">
                <div className="text-3xl font-mono font-bold text-amber-400">25 : 00</div>
                <p className="text-xs text-slate-400">Next Recommended Focus Interval</p>
                <div className="pt-2 flex justify-center gap-2">
                  <Button size="sm" onClick={() => onNavigate('study')}>
                    Launch Focused Timer
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Active Recall Question of the Day</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed italic">
                  &ldquo;Teach back: How does an LRU Cache work using a Hash Map and Doubly Linked List? What are the edge cases?&rdquo;
                </p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate('live-coach')}
                    className="text-xs w-full"
                  >
                    Teach Back to AI Coach
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Placement Preparedness */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-400" />
                  <span>Placement Preparedness</span>
                </CardTitle>
                <CardDescription>Target: {profile?.targetPlacements?.[0] || 'Tier-1 Engineering'}</CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigate('placements')}
                className="text-xs text-amber-400 p-1"
              >
                Track <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                <span className="text-slate-300">DSA & Algorithms</span>
                <Badge variant="emerald" size="sm">Active Practice</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                <span className="text-slate-300">System Design & Core CS</span>
                <Badge variant="amber" size="sm">Revision Required</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                <span className="text-slate-300">Resume & Project Discussions</span>
                <Badge variant="slate" size="sm">Ready for Review</Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Column 3: Private Journals & Daily Reflections */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-rose-400" />
                  <span>Recent Journal Reflections</span>
                </CardTitle>
                <CardDescription>Private reflective history</CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigate('journal')}
                className="text-xs text-amber-400 p-1"
              >
                All Entries <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>

            <div className="space-y-3">
              {recentJournals.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  <p>No journal entries yet.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate('journal')}
                    className="mt-2 text-xs"
                  >
                    Write First Entry
                  </Button>
                </div>
              ) : (
                recentJournals.slice(0, 3).map((journal) => (
                  <div
                    key={journal.id}
                    onClick={() => onNavigate('journal')}
                    className="p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-700 cursor-pointer space-y-1 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">{journal.title}</span>
                      {journal.mood && (
                        <Badge size="sm" variant="slate">
                          {journal.mood}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {journal.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Quick Coach Conversation Launcher */}
          <Card className="bg-gradient-to-b from-slate-900 to-slate-950 border-amber-500/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>LifeForge Coach Quick Prompt</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Need clarity on a difficult problem or feeling distracted? Ask the coach to help structure your next step.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => onNavigate('live-coach')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 transition-colors"
                >
                  &ldquo;I have 2 hours right now. What is the most disciplined study plan?&rdquo;
                </button>
                <button
                  onClick={() => onNavigate('live-coach')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 transition-colors"
                >
                  &ldquo;Test my understanding of Binary Search Tree balancing.&rdquo;
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
