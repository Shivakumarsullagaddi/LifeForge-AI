'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import { getJournals, addJournal, deleteJournal } from '@/lib/firebase';
import type { JournalEntry } from '@/lib/types';
import { BookMarked, Plus, Trash2, Calendar, Search } from 'lucide-react';

export const JournalView: React.FC = () => {
  const { user } = useAuth();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<JournalEntry['mood']>('focused');
  const [clarityLevel, setClarityLevel] = useState(4);
  const [energyLevel, setEnergyLevel] = useState(4);
  const [actionTakeaway, setActionTakeaway] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadJournals = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const data = await getJournals(user.uid);
      setJournals(data);
    } catch (err) {
      console.error('Failed to load journals:', err);
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
        const data = await getJournals(user.uid);
        if (isMounted) {
          setJournals(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load journals:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleCreate = async () => {
    if (!user || !title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const id = await addJournal(user.uid, {
        title: title.trim(),
        content: content.trim(),
        mood,
        clarityLevel,
        energyLevel,
        actionTakeaway: actionTakeaway.trim(),
        category: 'reflection',
        createdAt: now,
        updatedAt: now,
      });

      setJournals((prev) => [
        {
          id,
          userId: user.uid,
          title: title.trim(),
          content: content.trim(),
          mood,
          clarityLevel,
          energyLevel,
          actionTakeaway: actionTakeaway.trim(),
          category: 'reflection',
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);

      setIsNewModalOpen(false);
      setTitle('');
      setContent('');
      setActionTakeaway('');
    } catch (err) {
      console.error('Failed to create journal:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (journalId: string) => {
    if (!user) return;
    await deleteJournal(user.uid, journalId);
    setJournals((prev) => prev.filter((j) => j.id !== journalId));
  };

  const filteredJournals = journals.filter(
    (j) =>
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-rose-400" />
            <h1 className="text-lg font-bold text-slate-100">My Journal & Daily Reflections</h1>
            <Badge variant="emerald" size="sm">Private & Encrypted</Badge>
          </div>
          <p className="text-xs text-slate-400">
            A safe space to understand problems, record breakthroughs, and extract actionable takeaways.
          </p>
        </div>

        <Button onClick={() => setIsNewModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Entry
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past reflections and notes..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-36 bg-slate-900/50 rounded-xl animate-pulse" />
          <div className="h-36 bg-slate-900/50 rounded-xl animate-pulse" />
        </div>
      ) : filteredJournals.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 space-y-3">
          <BookMarked className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No journal records found</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Journaling helps convert chaotic thoughts into structured, controllable action steps.
          </p>
          <Button size="sm" onClick={() => setIsNewModalOpen(true)}>
            Write Your First Entry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredJournals.map((journal) => (
            <Card key={journal.id} className="flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{journal.title}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{new Date(journal.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {journal.mood && (
                      <Badge
                        size="sm"
                        variant={
                          journal.mood === 'focused' || journal.mood === 'energized'
                            ? 'emerald'
                            : journal.mood === 'stressed'
                            ? 'rose'
                            : 'amber'
                        }
                      >
                        {journal.mood}
                      </Badge>
                    )}
                    <button
                      onClick={() => handleDelete(journal.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {journal.content}
                </p>

                {journal.actionTakeaway && (
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs text-amber-300 space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Action Takeaway:</span>
                    <p className="leading-snug">{journal.actionTakeaway}</p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>Clarity: {journal.clarityLevel ?? 3}/5</span>
                <span>Energy: {journal.energyLevel ?? 3}/5</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Journal Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Write Private Journal Entry"
        description="Reflect on today's study sessions, obstacles, or personal milestones."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cleared Binary Search misconceptions; 3 hours deep work"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Reflective Content
            </label>
            <textarea
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What happened today? What went well? Where did you lose focus and how can you protect tomorrow?"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Mood State
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value as JournalEntry['mood'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="focused">Focused</option>
                <option value="determined">Determined</option>
                <option value="energized">Energized</option>
                <option value="calm">Calm</option>
                <option value="stressed">Stressed</option>
                <option value="fatigued">Fatigued</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Clarity Level ({clarityLevel}/5)
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={clarityLevel}
                onChange={(e) => setClarityLevel(Number(e.target.value))}
                className="w-full accent-amber-500 mt-2"
              />
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Energy Level ({energyLevel}/5)
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={energyLevel}
                onChange={(e) => setEnergyLevel(Number(e.target.value))}
                className="w-full accent-amber-500 mt-2"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
              One Concrete Action Takeaway
            </label>
            <input
              type="text"
              value={actionTakeaway}
              onChange={(e) => setActionTakeaway(e.target.value)}
              placeholder="e.g. Review tree balancing edge cases tomorrow morning at 9 AM"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setIsNewModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} isLoading={isSaving} disabled={!title.trim() || !content.trim()}>
              Save Journal Entry
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
