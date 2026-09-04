'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import { getMemories, addMemory, updateMemoryStatus, deleteMemory } from '@/lib/firebase';
import type { MemoryItem, MemoryType } from '@/lib/types';
import { Brain, Plus, Trash2, CheckCircle2, ShieldAlert, Sparkles, Filter } from 'lucide-react';

export const MemoriesView: React.FC = () => {
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // New Memory Form
  const [content, setContent] = useState('');
  const [memoryType, setMemoryType] = useState<MemoryType>('study_preference');
  const [category, setCategory] = useState('DSA & Placement');
  const [isSaving, setIsSaving] = useState(false);

  const loadMemories = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const data = await getMemories(user.uid);
      setMemories(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
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
        const data = await getMemories(user.uid);
        if (isMounted) {
          setMemories(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load memories:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleCreate = async () => {
    if (!user || !content.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const id = await addMemory(user.uid, {
        type: memoryType,
        content: content.trim(),
        category,
        source: 'user_explicit',
        confidence: 1.0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      setMemories((prev) => [
        {
          id,
          userId: user.uid,
          type: memoryType,
          content: content.trim(),
          category,
          source: 'user_explicit',
          confidence: 1.0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);

      setIsNewModalOpen(false);
      setContent('');
    } catch (err) {
      console.error('Failed to create memory:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveCandidate = async (id: string) => {
    if (!user) return;
    await updateMemoryStatus(user.uid, id, 'active');
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: 'active' } : m))
    );
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteMemory(user.uid, id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const activeMemories = memories.filter((m) => m.status === 'active');
  const candidateMemories = memories.filter((m) => m.status === 'candidate');

  const filteredMemories = (filterType === 'all'
    ? activeMemories
    : activeMemories.filter((m) => m.type === filterType)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-slate-100">User-Controlled Memory Vault</h1>
            <Badge variant="emerald" size="sm">User-Governed</Badge>
          </div>
          <p className="text-xs text-slate-400">
            LifeForge remembers your preferences, values, habits, and career goals with your explicit consent.
          </p>
        </div>

        <Button onClick={() => setIsNewModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Memory Fact
        </Button>
      </div>

      {/* Candidate Memories (Pending user approval) */}
      {candidateMemories.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-950/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-amber-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Candidate Memories Proposed by AI Coach</span>
              </CardTitle>
              <Badge variant="amber" size="sm">{candidateMemories.length} Pending</Badge>
            </div>
            <CardDescription>
              Review facts the AI proposed from coaching sessions. Approve to make them persistent.
            </CardDescription>
          </CardHeader>

          <div className="space-y-2.5">
            {candidateMemories.map((cand) => (
              <div
                key={cand.id}
                className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="slate" size="sm">{cand.type}</Badge>
                    <span className="text-slate-400 text-[11px]">Confidence: {Math.round(cand.confidence * 100)}%</span>
                  </div>
                  <p className="text-slate-200">{cand.content}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleApproveCandidate(cand.id)}
                    className="h-7 text-xs px-2.5 gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(cand.id)}
                    className="h-7 text-xs px-2.5 text-rose-400"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <Filter className="w-3.5 h-3.5 text-slate-500 mr-1 shrink-0" />
        {['all', 'study_preference', 'career_goal', 'habit', 'value', 'routine', 'preference'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filterType === type
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {type.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {/* Active Memories Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-28 bg-slate-900/50 rounded-xl animate-pulse" />
          <div className="h-28 bg-slate-900/50 rounded-xl animate-pulse" />
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 space-y-3">
          <Brain className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No active memories under this category</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Adding verified study preferences or values helps the coach tailor advice precisely to your style.
          </p>
          <Button size="sm" onClick={() => setIsNewModalOpen(true)}>
            Add First Memory
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((mem) => (
            <Card key={mem.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="amber" size="sm">
                  {mem.type.replace('_', ' ')}
                </Badge>
                <button
                  onClick={() => handleDelete(mem.id)}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                  title="Delete memory"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                {mem.content}
              </p>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
                <span>Source: {mem.source}</span>
                <span>Added: {new Date(mem.createdAt).toLocaleDateString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Memory Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Add Verified Memory Fact"
        description="Explicitly add a principle, study habit, career goal, or personal preference."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Memory Type
            </label>
            <select
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value as MemoryType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="study_preference">Study Preference (e.g. 25/5 Pomodoro, Active Recall)</option>
              <option value="career_goal">Career Goal (e.g. SWE at Tier-1 tech)</option>
              <option value="habit">Habit & Routine (e.g. 7 AM workout, 2h DSA morning)</option>
              <option value="value">Guiding Value / Principle</option>
              <option value="preference">General Preference</option>
              <option value="milestone">Milestone Achieved</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Memory Content
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Prefers learning system design by sketching distributed components first rather than memorizing definitions."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Category Tag
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Placement, Algorithms, Discipline"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setIsNewModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} isLoading={isSaving} disabled={!content.trim()}>
              Save Memory Fact
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
