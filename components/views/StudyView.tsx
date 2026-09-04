'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import { getStudySessions, addStudySession } from '@/lib/firebase';
import type { StudySessionRecord } from '@/lib/types';
import {
  GraduationCap,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export const StudyView: React.FC = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Timer State
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);

  // Active Recall & Teach-Back Form
  const [topic, setTopic] = useState('Dynamic Programming State Formulation');
  const [teachBackNotes, setTeachBackNotes] = useState('');
  const [misconceptions, setMisconceptions] = useState('');
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const data = await getStudySessions(user.uid);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load study sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const data = await getStudySessions(user.uid);
        if (isMounted) {
          setSessions(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load study sessions:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Timer interval effect
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (mode === 'focus') {
            setCyclesCompleted((c) => c + 1);
            setMode('break');
            return 5 * 60;
          } else {
            setMode('focus');
            return 25 * 60;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, mode]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setMode('focus');
    setTimeLeft(25 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveSession = async () => {
    if (!user || !topic.trim()) return;
    setIsSavingRecord(true);
    try {
      const now = new Date().toISOString();
      const misArray = misconceptions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const id = await addStudySession(user.uid, {
        topic: topic.trim(),
        technique: 'pomodoro',
        durationMinutes: 25 * Math.max(1, cyclesCompleted),
        completedCycles: Math.max(1, cyclesCompleted),
        notes: teachBackNotes.trim(),
        misconceptionsCleared: misArray,
        createdAt: now,
      });

      setSessions((prev) => [
        {
          id,
          userId: user.uid,
          topic: topic.trim(),
          technique: 'pomodoro',
          durationMinutes: 25 * Math.max(1, cyclesCompleted),
          completedCycles: Math.max(1, cyclesCompleted),
          notes: teachBackNotes.trim(),
          misconceptionsCleared: misArray,
          createdAt: now,
        },
        ...prev,
      ]);

      setTeachBackNotes('');
      setMisconceptions('');
    } catch (err) {
      console.error('Failed to log study session:', err);
    } finally {
      setIsSavingRecord(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-sky-400" />
            <h1 className="text-lg font-bold text-slate-100">Study Coach & Active Recall Engine</h1>
            <Badge variant="blue" size="sm">Evidence-Based</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Learn through first-principles logic. Reject rote memorization: test recall, teach back, and log cleared misconceptions.
          </p>
        </div>
      </div>

      {/* Grid: Timer + Teach-Back Module */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timer Card */}
        <Card className="flex flex-col items-center justify-center p-8 space-y-5 text-center">
          <Badge variant={mode === 'focus' ? 'amber' : 'emerald'} size="md">
            {mode === 'focus' ? 'Deep Work Sprint (25m)' : 'Recovery Break (5m)'}
          </Badge>

          <div className="text-6xl font-mono font-black text-slate-100 tracking-wider">
            {formatTime(timeLeft)}
          </div>

          <p className="text-xs text-slate-400">
            Completed Cycles: <span className="text-amber-400 font-bold">{cyclesCompleted}</span>
          </p>

          <div className="flex items-center gap-3">
            <Button size="lg" onClick={toggleTimer} className="gap-2 px-6">
              {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>{isRunning ? 'Pause Focus' : 'Start Focus'}</span>
            </Button>
            <Button size="lg" variant="outline" onClick={resetTimer} className="p-2.5">
              <RotateCcw className="w-5 h-5" />
            </Button>
          </div>

          <div className="w-full pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300">Active Topic</div>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 text-center focus:outline-none focus:border-amber-500"
              placeholder="e.g. Graph Algorithms, DBMS Indexing"
            />
          </div>
        </Card>

        {/* Teach-Back & Active Recall Studio */}
        <Card className="lg:col-span-2 space-y-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Teach-Back & Active Recall Method</span>
            </CardTitle>
            <CardDescription>
              Explain the concept as if teaching a freshman student. If you cannot explain it simply, you don&apos;t understand it.
            </CardDescription>
          </CardHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
                1. Your Explanation (From Memory — No Looking at Docs)
              </label>
              <textarea
                rows={4}
                value={teachBackNotes}
                onChange={(e) => setTeachBackNotes(e.target.value)}
                placeholder="Explain the logic, edge cases, space-time complexities, and WHY this data structure / approach is chosen..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Misconceptions Identified & Cleared (One per line)</span>
              </label>
              <textarea
                rows={2}
                value={misconceptions}
                onChange={(e) => setMisconceptions(e.target.value)}
                placeholder="e.g. Realized QuickSelect average is O(N) but worst-case is O(N^2) if pivot choices are unbalanced."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={handleSaveSession} isLoading={isSavingRecord} disabled={!topic.trim()}>
                <CheckCircle2 className="w-4 h-4" /> Save Study Log to Firestore
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Historical Study Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            <span>Past Deep Work Sessions & Cleared Misconceptions</span>
          </CardTitle>
        </CardHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="h-20 bg-slate-900/50 rounded-lg animate-pulse" />
          ) : sessions.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              No logged study sessions yet. Start a focus timer and log your first teach-back summary!
            </div>
          ) : (
            sessions.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{s.topic}</span>
                  <div className="flex items-center gap-2">
                    <Badge size="sm" variant="amber">
                      {s.durationMinutes} mins ({s.completedCycles} cycles)
                    </Badge>
                    <span className="text-slate-500 text-[11px]">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {s.notes && (
                  <p className="text-slate-300 text-[11px] leading-relaxed italic bg-slate-900/60 p-2 rounded border border-slate-800/80">
                    &ldquo;{s.notes}&rdquo;
                  </p>
                )}

                {s.misconceptionsCleared && s.misconceptionsCleared.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">
                      Cleared Misconceptions:
                    </span>
                    <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-0.5">
                      {s.misconceptionsCleared.map((mis, idx) => (
                        <li key={idx}>{mis}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
