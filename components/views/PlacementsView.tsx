'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import {
  getPlacementProfile,
  savePlacementProfile,
  subscribePlacementProfile,
  DEFAULT_PLACEMENT_SKILLS,
  getJournals,
  getMemories,
  getGoals,
  getTasks,
  getReflections,
  getStudySessions,
  addGoal,
  addTask,
} from '@/lib/firebase';
import type {
  PlacementProfile,
  PlacementSkill,
  PlacementProject,
  UpcomingInterview,
  SkillGapAnalysisResult,
} from '@/lib/types';
import {
  Briefcase,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Code2,
  Database,
  Cpu,
  Search,
  Building2,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Plus,
  Trash2,
  FileText,
  ShieldCheck,
  Flame,
  Check,
} from 'lucide-react';

export const PlacementsView: React.FC = () => {
  const { user, profile } = useAuth();
  const [placementProfile, setPlacementProfile] = useState<PlacementProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'skillgap' | 'research' | 'edit_profile'>('matrix');

  // Skill-Gap State
  const [skillGapResult, setSkillGapResult] = useState<SkillGapAnalysisResult | null>(null);
  const [isAnalyzingGap, setIsAnalyzingGap] = useState(false);
  const [adoptedItems, setAdoptedItems] = useState<Record<string, boolean>>({});

  // Research Agent State
  const [researchCompany, setResearchCompany] = useState('Google');
  const [researchRole, setResearchRole] = useState('Software Engineer (L3 / Early Career)');
  const [researchCustomQuery, setResearchCustomQuery] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<{
    text: string;
    citations: Array<{ title: string; url: string }>;
    webSearchQueries?: string[];
    privateContextUsed: boolean;
    privateMatchedItems?: any[];
  } | null>(null);

  // Edit Profile Form State
  const [editRole, setEditRole] = useState('');
  const [editCompanies, setEditCompanies] = useState('');
  const [editExperience, setEditExperience] = useState('');
  const [editResumeStatus, setEditResumeStatus] = useState<'needs_review' | 'in_progress' | 'interview_ready'>('in_progress');
  const [editWeakAreas, setEditWeakAreas] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // New Item Modals / Forms
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<'DSA' | 'Core CS' | 'System Design' | 'Backend' | 'Behavioral'>('DSA');
  const [newSkillLevel, setNewSkillLevel] = useState<'Fundamentals' | 'Intermediate' | 'Mastery'>('Intermediate');

  const [showAddInterview, setShowAddInterview] = useState(false);
  const [newInterviewCompany, setNewInterviewCompany] = useState('');
  const [newInterviewRole, setNewInterviewRole] = useState('Software Engineer');
  const [newInterviewDate, setNewInterviewDate] = useState('2026-09-25');
  const [newInterviewStage, setNewInterviewStage] = useState<'Online Assessment' | 'Technical Round 1' | 'Technical Round 2 (System Design)' | 'Hiring Manager / Behavioral' | 'HR / Offer'>('Technical Round 1');
  const [newInterviewFocus, setNewInterviewFocus] = useState('Graphs, Sliding Window, OS Concurrency');

  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjTitle, setNewProjTitle] = useState('');
  const [newProjStack, setNewProjStack] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjDefense, setNewProjDefense] = useState('');

  // 1. Subscribe to placement profile in Firestore
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const unsub = subscribePlacementProfile(user.uid, (data) => {
      if (!isMounted) return;
      if (data) {
        setPlacementProfile(data);
        setEditRole(data.targetRole);
        setEditCompanies(data.targetCompanies.join(', '));
        setEditExperience(data.experience);
        setEditResumeStatus(data.resumeStatus);
        setEditWeakAreas(data.weakAreas.join(', '));
      } else {
        // Initialize default profile
        const initialProfile: PlacementProfile = {
          id: 'default',
          userId: user.uid,
          targetRole: profile?.targetPlacements?.[0] || 'Software Engineer (Backend & Systems)',
          targetCompanies: profile?.targetPlacements || ['Google', 'Amazon', 'Microsoft', 'Stripe'],
          skills: DEFAULT_PLACEMENT_SKILLS,
          weakAreas: ['Dynamic Programming on Trees', 'System Design Caching Trade-offs', 'OS Virtual Memory'],
          experience: 'Undergraduate Senior in Computer Science · Strong foundational logic & active recall',
          projects: [
            {
              id: 'proj_1',
              title: 'Distributed In-Memory Cache & Key-Value Store',
              techStack: ['C++', 'gRPC', 'Redis Protocol', 'Consistent Hashing'],
              description: 'Built a multi-node partitioned key-value cache supporting LRU eviction and virtual node consistent hashing.',
              keyTradeoffs: 'Prioritized write throughput and eventual consistency over strict multi-master ACID locks.',
              interviewDefensePoints: [
                'Can derive virtual node hash ring math from memory',
                'Explains LRU O(1) doubly linked list + hash map trade-off',
                'Demonstrates thread safety using read-write locks vs mutex',
              ],
            },
          ],
          resumeStatus: 'in_progress',
          preparationProgress: 65,
          upcomingInterviews: [
            {
              id: 'int_1',
              company: 'Google',
              role: 'Early Career Software Engineer',
              date: '2026-09-28',
              stage: 'Technical Round 1',
              focusAreas: ['Graph Traversal', 'Tree DP', 'Space Complexity Analysis'],
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        savePlacementProfile(user.uid, initialProfile);
        setPlacementProfile(initialProfile);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [user, profile]);

  // Handle Toggle Skill
  const handleToggleSkill = async (skillId: string) => {
    if (!user || !placementProfile) return;
    const updatedSkills = placementProfile.skills.map((s) =>
      s.id === skillId ? { ...s, completed: !s.completed, verifiedByPractice: !s.completed } : s
    );
    const completedCount = updatedSkills.filter((s) => s.completed).length;
    const progress = Math.round((completedCount / updatedSkills.length) * 100);

    const updated = {
      ...placementProfile,
      skills: updatedSkills,
      preparationProgress: progress,
    };
    setPlacementProfile(updated);
    await savePlacementProfile(user.uid, updated);
  };

  // Handle Add Skill
  const handleAddSkill = async () => {
    if (!user || !placementProfile || !newSkillName.trim()) return;
    const newSkill: PlacementSkill = {
      id: `skill_${Date.now()}`,
      name: newSkillName.trim(),
      category: newSkillCategory,
      level: newSkillLevel,
      completed: false,
      verifiedByPractice: false,
    };
    const updatedSkills = [...placementProfile.skills, newSkill];
    const updated = { ...placementProfile, skills: updatedSkills };
    setPlacementProfile(updated);
    await savePlacementProfile(user.uid, updated);
    setNewSkillName('');
    setShowAddSkill(false);
  };

  // Handle Add Interview
  const handleAddInterview = async () => {
    if (!user || !placementProfile || !newInterviewCompany.trim()) return;
    const newInterview: UpcomingInterview = {
      id: `int_${Date.now()}`,
      company: newInterviewCompany.trim(),
      role: newInterviewRole.trim(),
      date: newInterviewDate,
      stage: newInterviewStage,
      focusAreas: newInterviewFocus.split(',').map((f) => f.trim()).filter(Boolean),
    };
    const updated = {
      ...placementProfile,
      upcomingInterviews: [...placementProfile.upcomingInterviews, newInterview],
    };
    setPlacementProfile(updated);
    await savePlacementProfile(user.uid, updated);
    setNewInterviewCompany('');
    setShowAddInterview(false);
  };

  // Handle Add Project
  const handleAddProject = async () => {
    if (!user || !placementProfile || !newProjTitle.trim()) return;
    const newProj: PlacementProject = {
      id: `proj_${Date.now()}`,
      title: newProjTitle.trim(),
      techStack: newProjStack.split(',').map((s) => s.trim()).filter(Boolean),
      description: newProjDesc.trim(),
      interviewDefensePoints: newProjDefense.split(';').map((d) => d.trim()).filter(Boolean),
    };
    const updated = {
      ...placementProfile,
      projects: [...placementProfile.projects, newProj],
    };
    setPlacementProfile(updated);
    await savePlacementProfile(user.uid, updated);
    setNewProjTitle('');
    setNewProjStack('');
    setNewProjDesc('');
    setNewProjDefense('');
    setShowAddProject(false);
  };

  // Save Full Profile Edit
  const handleSaveProfileEdit = async () => {
    if (!user || !placementProfile) return;
    setIsSavingProfile(true);
    try {
      const targetCompaniesArray = editCompanies
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const weakAreasArray = editWeakAreas
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);

      const updated = {
        ...placementProfile,
        targetRole: editRole.trim(),
        targetCompanies: targetCompaniesArray,
        experience: editExperience.trim(),
        resumeStatus: editResumeStatus,
        weakAreas: weakAreasArray,
      };

      await savePlacementProfile(user.uid, updated);
      setPlacementProfile(updated);
      setActiveTab('matrix');
    } catch (err) {
      console.error('Failed to save profile edit:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Run Evidence-Based Skill Gap Analysis via Gemini 3.8 Flash
  const handleRunSkillGap = async () => {
    if (!user || !placementProfile) return;
    setIsAnalyzingGap(true);
    try {
      const [journals, memories, goals, tasks, reflections, studySessions] = await Promise.all([
        getJournals(user.uid),
        getMemories(user.uid),
        getGoals(user.uid),
        getTasks(user.uid),
        getReflections(user.uid),
        getStudySessions(user.uid),
      ]);

      const res = await fetch('/api/placement/skill-gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          placementProfile,
          userData: {
            journals,
            memories,
            goals,
            tasks,
            reflections,
            studySessions,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSkillGapResult(data.analysis);
      }
    } catch (err) {
      console.error('Skill gap analysis error:', err);
    } finally {
      setIsAnalyzingGap(false);
    }
  };

  // Run Company Research via Gemini 3.8 Flash + Google Search Grounding
  const handleRunResearch = async (targetCompany?: string) => {
    if (!user) return;
    const comp = targetCompany || researchCompany;
    setIsResearching(true);
    try {
      const [journals, memories, goals, tasks, reflections] = await Promise.all([
        getJournals(user.uid),
        getMemories(user.uid),
        getGoals(user.uid),
        getTasks(user.uid),
        getReflections(user.uid),
      ]);

      const res = await fetch('/api/placement/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: comp,
          role: researchRole,
          specificQuestion: researchCustomQuery.trim() || undefined,
          userId: user.uid,
          userData: {
            journals,
            memories,
            goals,
            tasks,
            reflections,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResearchResult({
          text: data.text,
          citations: data.citations || [],
          webSearchQueries: data.webSearchQueries || [],
          privateContextUsed: data.privateContextUsed || false,
          privateMatchedItems: data.privateMatchedItems || [],
        });
      }
    } catch (err) {
      console.error('Research error:', err);
    } finally {
      setIsResearching(false);
    }
  };

  // Adopt proposed task into user's real Firestore board
  const handleAdoptTask = async (task: { title: string; domain: string; priority: string; estimatedMinutes: number; isDeepWork: boolean }) => {
    if (!user) return;
    try {
      await addTask(user.uid, {
        title: task.title,
        domain: (task.domain as any) || 'placement',
        priority: (task.priority as any) || 'high',
        status: 'pending',
        estimatedMinutes: task.estimatedMinutes || 30,
        isDeepWork: task.isDeepWork !== false,
        source: 'Skill-Gap Analysis Engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setAdoptedItems((prev) => ({ ...prev, [task.title]: true }));
    } catch (e) {
      console.error('Failed to adopt task:', e);
    }
  };

  // Adopt proposed goal into user's real Firestore board
  const handleAdoptGoal = async (goal: { title: string; domain: string; priority: string }) => {
    if (!user) return;
    try {
      await addGoal(user.uid, {
        title: goal.title,
        domain: (goal.domain as any) || 'placement',
        priority: (goal.priority as any) || 'high',
        status: 'in_progress',
        progress: 0,
        source: 'Skill-Gap Analysis Engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setAdoptedItems((prev) => ({ ...prev, [goal.title]: true }));
    } catch (e) {
      console.error('Failed to adopt goal:', e);
    }
  };

  const completedSkillsCount = (placementProfile?.skills || []).filter((s) => s.completed).length;
  const totalSkillsCount = placementProfile?.skills?.length || 1;
  const readinessPercent = Math.round((completedSkillsCount / totalSkillsCount) * 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-bold text-slate-100">
              Placement Intelligence & Technical Interview Matrix
            </h1>
            <Badge variant="indigo" size="sm">Gemini 3.8 Flash</Badge>
            <Badge variant="emerald" size="sm">
              Resume: {placementProfile?.resumeStatus === 'interview_ready' ? 'Interview Ready' : placementProfile?.resumeStatus === 'in_progress' ? 'In Progress' : 'Needs Review'}
            </Badge>
          </div>
          <p className="text-xs text-slate-300">
            Target Role:{' '}
            <span className="text-amber-400 font-semibold">
              {placementProfile?.targetRole || 'Software Engineer (Backend & Systems)'}
            </span>{' '}
            · Companies:{' '}
            <span className="text-slate-300 font-medium">
              {(placementProfile?.targetCompanies || []).join(', ') || 'Google, Amazon, Microsoft'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800">
          <div className="text-right">
            <div className="text-[11px] text-slate-400 font-medium">Verified Mastery</div>
            <div className="text-base font-bold text-amber-400">{readinessPercent}%</div>
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-amber-500 flex items-center justify-center font-bold text-xs text-slate-200">
            {completedSkillsCount}/{totalSkillsCount}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'matrix'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" /> Technical Skills Matrix & Projects
        </button>

        <button
          onClick={() => {
            setActiveTab('skillgap');
            if (!skillGapResult) handleRunSkillGap();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'skillgap'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Evidence-Based Skill Gap Analysis
        </button>

        <button
          onClick={() => {
            setActiveTab('research');
            if (!researchResult) handleRunResearch();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'research'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-sky-400" /> Company & Interview Research
        </button>

        <button
          onClick={() => setActiveTab('edit_profile')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'edit_profile'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Edit Placement Profile
        </button>
      </div>

      {/* TAB 1: TECHNICAL SKILLS MATRIX & PROJECTS */}
      {activeTab === 'matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Skills Matrix */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-amber-400" />
                      <span>Technical Competency Matrix</span>
                    </CardTitle>
                    <CardDescription>
                      Check off topics where you can write clean code on whiteboard/doc and defend time-space complexity without looking.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddSkill(!showAddSkill)}
                    className="text-xs gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Skill
                  </Button>
                </div>
              </CardHeader>

              {/* Add Skill Mini-Form */}
              {showAddSkill && (
                <div className="p-3.5 mb-4 rounded-xl bg-slate-950 border border-amber-900/60 space-y-3 text-xs">
                  <div className="font-semibold text-amber-400">Add Technical Topic / Skill</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Topic Name (e.g., Trie, Disjoint Set Union)..."
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <select
                      value={newSkillCategory}
                      onChange={(e) => setNewSkillCategory(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="DSA">DSA</option>
                      <option value="Core CS">Core CS</option>
                      <option value="System Design">System Design</option>
                      <option value="Backend">Backend</option>
                      <option value="Behavioral">Behavioral</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Mastery Level:</span>
                      <select
                        value={newSkillLevel}
                        onChange={(e) => setNewSkillLevel(e.target.value as any)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="Fundamentals">Fundamentals</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Mastery">Mastery</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowAddSkill(false)} className="text-xs">
                        Cancel
                      </Button>
                      <Button size="sm" variant="primary" onClick={handleAddSkill} className="text-xs">
                        Save Skill
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Skills List by Category */}
              <div className="space-y-2.5">
                {(placementProfile?.skills || []).map((skill) => (
                  <div
                    key={skill.id}
                    onClick={() => handleToggleSkill(skill.id)}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                          skill.completed
                            ? 'bg-emerald-600 text-white'
                            : 'border border-slate-600 text-transparent'
                        }`}
                      >
                        {skill.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <div
                          className={`font-medium ${
                            skill.completed ? 'text-slate-400 line-through' : 'text-slate-200'
                          }`}
                        >
                          {skill.name}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="uppercase font-semibold tracking-wider text-indigo-400">{skill.category}</span>
                          {skill.notes && (
                            <>
                              <span>·</span>
                              <span className="text-amber-400/90 italic truncate max-w-[280px]">Note: {skill.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        size="sm"
                        variant={
                          skill.level === 'Mastery'
                            ? 'emerald'
                            : skill.level === 'Intermediate'
                            ? 'amber'
                            : 'slate'
                        }
                      >
                        {skill.level}
                      </Badge>
                      {skill.verifiedByPractice && (
                        <Badge size="sm" variant="indigo">
                          Practice Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Projects & Interview Defense Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-sky-400" />
                      <span>Project Portfolio & Trade-off Defense</span>
                    </CardTitle>
                    <CardDescription>
                      Tier-1 interviewers test engineering depth by challenging project architectural trade-offs.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddProject(!showAddProject)}
                    className="text-xs gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Project
                  </Button>
                </div>
              </CardHeader>

              {/* Add Project Form */}
              {showAddProject && (
                <div className="p-3.5 mb-4 rounded-xl bg-slate-950 border border-sky-900/60 space-y-3 text-xs">
                  <div className="font-semibold text-sky-400">Add Portfolio Project</div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Project Title (e.g. Distributed Key-Value Store)..."
                      value={newProjTitle}
                      onChange={(e) => setNewProjTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <input
                      type="text"
                      placeholder="Tech Stack comma-separated (e.g. Go, gRPC, Redis, Docker)..."
                      value={newProjStack}
                      onChange={(e) => setNewProjStack(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <textarea
                      placeholder="Description & architectural highlights..."
                      rows={2}
                      value={newProjDesc}
                      onChange={(e) => setNewProjDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <input
                      type="text"
                      placeholder="Interview defense points separated by ';'..."
                      value={newProjDefense}
                      onChange={(e) => setNewProjDefense(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShowAddProject(false)} className="text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={handleAddProject} className="text-xs">
                      Save Project
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {(placementProfile?.projects || []).map((proj) => (
                  <div
                    key={proj.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-slate-100 text-sm">{proj.title}</h4>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {proj.techStack.map((tech) => (
                            <span
                              key={tech}
                              className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-indigo-300 font-mono"
                            >
                              {tech}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-slate-300 text-xs leading-relaxed">{proj.description}</p>

                    {proj.keyTradeoffs && (
                      <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-[11px] text-amber-200">
                        <span className="font-semibold text-amber-300">Key Trade-off:</span> {proj.keyTradeoffs}
                      </div>
                    )}

                    {proj.interviewDefensePoints && proj.interviewDefensePoints.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-slate-900">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Ready Defense Points:
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
                          {proj.interviewDefensePoints.map((dp, i) => (
                            <li key={i}>{dp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Column: Upcoming Interviews & Guidelines */}
          <div className="space-y-4">
            {/* Upcoming Interviews Card */}
            <Card className="border-indigo-900/40 bg-slate-900/90">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-300">
                    <Calendar className="w-4 h-4" />
                    <span>Upcoming Interviews</span>
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddInterview(!showAddInterview)}
                    className="text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
              </CardHeader>

              {/* Add Interview Mini Form */}
              {showAddInterview && (
                <div className="p-3 mb-3 rounded-xl bg-slate-950 border border-indigo-800 space-y-2 text-xs">
                  <input
                    type="text"
                    placeholder="Company (e.g. Amazon)..."
                    value={newInterviewCompany}
                    onChange={(e) => setNewInterviewCompany(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={newInterviewDate}
                      onChange={(e) => setNewInterviewDate(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200"
                    />
                    <select
                      value={newInterviewStage}
                      onChange={(e) => setNewInterviewStage(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="Online Assessment">Online Assessment</option>
                      <option value="Technical Round 1">Technical Round 1</option>
                      <option value="Technical Round 2 (System Design)">Round 2 (System Design)</option>
                      <option value="Hiring Manager / Behavioral">Behavioral</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Focus Areas comma-separated (e.g. DP, Caching)..."
                    value={newInterviewFocus}
                    onChange={(e) => setNewInterviewFocus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShowAddInterview(false)} className="text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={handleAddInterview} className="text-xs">
                      Save
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {(placementProfile?.upcomingInterviews || []).length > 0 ? (
                  (placementProfile?.upcomingInterviews || []).map((int) => (
                    <div
                      key={int.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{int.company}</span>
                        </div>
                        <Badge variant="indigo" size="sm">
                          {int.stage}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Date: {int.date}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {int.focusAreas.map((fa) => (
                          <span
                            key={fa}
                            className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                          >
                            {fa}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No upcoming interviews scheduled yet.</p>
                )}
              </div>
            </Card>

            {/* Strict Engineering Principles Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Technical Defense Principles</span>
                </CardTitle>
              </CardHeader>
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>
                  1. <strong>Do Not Rush to Code:</strong> Clarify inputs, edge cases (empty, duplicates, overflow), and write space-time targets first.
                </p>
                <p>
                  2. <strong>State the Baseline First:</strong> State the brute force O(N²) solution, explain why it degrades, and optimize via two pointers, hash map, or DP.
                </p>
                <p>
                  3. <strong>Teach-Back:</strong> When practicing, explain every line of code as if teaching a junior developer.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: EVIDENCE-BASED SKILL-GAP ANALYZER */}
      {activeTab === 'skillgap' && (
        <div className="space-y-6">
          <Card className="border-amber-900/40 bg-slate-900/90">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-400">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span>Personalized Skill-Gap Intelligence Engine</span>
                  </CardTitle>
                  <CardDescription>
                    Gemini 3.8 Flash synthesizes your self-reported skills, verified study sessions, completed deep-work tasks, and private struggle logs to pinpoint concrete interview vulnerabilities.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleRunSkillGap}
                  isLoading={isAnalyzingGap}
                  className="gap-2 shrink-0 px-4"
                >
                  <Cpu className="w-4 h-4" /> Re-Run Analysis
                </Button>
              </div>
            </CardHeader>

            {isAnalyzingGap && (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
                <Cpu className="w-8 h-8 text-amber-400 animate-spin" />
                <div className="text-sm font-semibold text-slate-200">
                  Synthesizing Private Logs, Practice Sessions & Placement Targets...
                </div>
                <p className="text-xs text-slate-400 max-w-md">
                  Gemini 3.8 Flash is comparing your practice evidence with Tier-1 placement standards.
                </p>
              </div>
            )}

            {!isAnalyzingGap && skillGapResult && (
              <div className="space-y-6 text-xs pt-2">
                {/* Top Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Target Alignment</div>
                    <div className="text-sm font-bold text-slate-100">{skillGapResult.targetRole}</div>
                    <Badge
                      variant={
                        skillGapResult.urgency === 'high'
                          ? 'rose'
                          : skillGapResult.urgency === 'medium'
                          ? 'amber'
                          : 'emerald'
                      }
                      size="sm"
                      className="mt-1"
                    >
                      Urgency: {skillGapResult.urgency.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/40 space-y-1">
                    <div className="text-[11px] text-emerald-400 uppercase font-semibold">Verified Strengths</div>
                    <div className="text-xl font-bold text-emerald-300">
                      {skillGapResult.strengths?.length || 0} Topics Solid
                    </div>
                    <p className="text-[11px] text-slate-400">Backed by practice sessions & completed tasks.</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-rose-900/40 space-y-1">
                    <div className="text-[11px] text-rose-400 uppercase font-semibold">Critical Interview Gaps</div>
                    <div className="text-xl font-bold text-rose-300">
                      {skillGapResult.criticalGaps?.length || 0} Vulnerabilities
                    </div>
                    <p className="text-[11px] text-slate-400">Must be addressed before technical rounds.</p>
                  </div>
                </div>

                {/* Strengths vs Critical Gaps */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Verified Strengths */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-sm text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verified Technical Strengths</span>
                    </div>
                    <div className="space-y-2.5">
                      {skillGapResult.strengths?.map((s, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                          <div className="font-semibold text-slate-200">{s.title}</div>
                          <div className="text-[11px] text-slate-400 leading-relaxed">{s.evidence}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Critical Gaps & Missing Skills */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-sm text-rose-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Critical Vulnerabilities & Missing Skills</span>
                    </div>
                    <div className="space-y-2.5">
                      {skillGapResult.criticalGaps?.map((gap, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-rose-950/60 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-rose-200">{gap.title}</span>
                            <Badge variant="rose" size="sm">
                              {gap.category}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-relaxed">{gap.impact}</div>
                        </div>
                      ))}

                      {skillGapResult.missingRequiredSkills?.map((ms, idx) => (
                        <div key={`ms_${idx}`} className="p-3 rounded-xl bg-slate-900/80 border border-amber-950/60 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-300">Missing: {ms.name}</span>
                            <Badge variant="amber" size="sm">Required for Tier-1</Badge>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-relaxed">{ms.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recommended Sprint Plan */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-amber-400">
                    <Flame className="w-4 h-4" />
                    <span>Recommended Recovery Sprint Roadmap</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {skillGapResult.sprintPlan?.map((plan, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100">{plan.phase}</span>
                          <span className="text-[10px] font-mono text-amber-400">{plan.recommendedHours} hrs</span>
                        </div>
                        <div className="text-xs text-slate-300 font-medium">{plan.focus}</div>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                          {plan.actionableTasks.map((t, i) => (
                            <li key={i} className="line-clamp-2">{t}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actionable Proposals (1-Click Add to Board) */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-indigo-950/30 border border-indigo-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-sm text-indigo-300">
                      <ShieldCheck className="w-4 h-4" />
                      <span>AI Proposed Placement Goals & Deep-Work Tasks (User Approved)</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {skillGapResult.proposedTasks?.map((task, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-200">{task.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {task.estimatedMinutes}m · {task.isDeepWork ? 'Deep Work' : 'General'} · {task.priority.toUpperCase()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={adoptedItems[task.title] ? 'outline' : 'primary'}
                          disabled={adoptedItems[task.title]}
                          onClick={() => handleAdoptTask(task)}
                          className="shrink-0 text-xs gap-1"
                        >
                          {adoptedItems[task.title] ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" /> Add Task
                            </>
                          )}
                        </Button>
                      </div>
                    ))}

                    {skillGapResult.proposedGoals?.map((goal, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900 border border-amber-900/40 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-amber-200">Goal: {goal.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Domain: {goal.domain} · Priority: {goal.priority}</div>
                        </div>
                        <Button
                          size="sm"
                          variant={adoptedItems[goal.title] ? 'outline' : 'outline'}
                          disabled={adoptedItems[goal.title]}
                          onClick={() => handleAdoptGoal(goal)}
                          className="shrink-0 text-xs gap-1"
                        >
                          {adoptedItems[goal.title] ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" /> Add Goal
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: COMPANY & INTERVIEW RESEARCH (GOOGLE SEARCH GROUNDED) */}
      {activeTab === 'research' && (
        <div className="space-y-6">
          <Card className="border-sky-900/40 bg-slate-900/90">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-sky-400">
                    <Search className="w-5 h-5 text-sky-400" />
                    <span>Company & Placement Research Specialist</span>
                  </CardTitle>
                  <CardDescription>
                    Grounds current 2026 hiring trends, technical interview patterns, and company rounds using Gemini 3.8 Flash + Google Search Grounding.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="space-y-4 text-xs">
              {/* Target Company Quick-Select Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-medium">Quick Companies:</span>
                {['Google', 'Amazon', 'Microsoft', 'Stripe', 'Uber', 'Atlassian', 'Apple'].map((comp) => (
                  <button
                    key={comp}
                    onClick={() => {
                      setResearchCompany(comp);
                      handleRunResearch(comp);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      researchCompany === comp
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>

              {/* Research Query Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Target Company (e.g. Google, Databricks)..."
                  value={researchCompany}
                  onChange={(e) => setResearchCompany(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <input
                  type="text"
                  placeholder="Target Role (e.g. Software Engineer Early Career)..."
                  value={researchRole}
                  onChange={(e) => setResearchRole(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleRunResearch()}
                  isLoading={isResearching}
                  className="gap-2 px-4"
                >
                  <Search className="w-4 h-4" /> Conduct Grounded Research
                </Button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="text-slate-500">Optional custom question:</span>
                <input
                  type="text"
                  placeholder="e.g. 'What are the main system design topics asked for SDE 2 in 2026?'"
                  value={researchCustomQuery}
                  onChange={(e) => setResearchCustomQuery(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Research Display */}
              {isResearching && (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
                  <Search className="w-8 h-8 text-sky-400 animate-spin" />
                  <div className="text-sm font-semibold text-slate-200">
                    Querying Google Search Grounding for {researchCompany} {researchRole}...
                  </div>
                  <p className="text-xs text-slate-400 max-w-md">
                    Retrieving official hiring blogs, recent interview patterns, and engineering round requirements.
                  </p>
                </div>
              )}

              {!isResearching && researchResult && (
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  {/* Metadata Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px]">
                    <div className="flex items-center gap-2">
                      <Badge variant="sky" size="sm">Google Search Grounded</Badge>
                      {researchResult.privateContextUsed && (
                        <Badge variant="amber" size="sm">Private Student History Merged</Badge>
                      )}
                    </div>
                    <div className="text-slate-400 font-mono">
                      Target: <span className="text-sky-300 font-semibold">{researchCompany}</span> · {researchRole}
                    </div>
                  </div>

                  {/* Research Report Content */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 prose prose-invert max-w-none text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                    {researchResult.text}
                  </div>

                  {/* Grounding Citations */}
                  {researchResult.citations && researchResult.citations.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-900/40 space-y-2">
                      <div className="text-[11px] font-semibold text-sky-400 flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Verified Web Citations & Sources</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {researchResult.citations.map((c, i) => (
                          <a
                            key={i}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between gap-2 text-[11px] text-sky-300 transition-colors"
                          >
                            <span className="truncate">{c.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: EDIT PLACEMENT PROFILE */}
      {activeTab === 'edit_profile' && (
        <Card className="max-w-2xl mx-auto border-slate-800 bg-slate-900/90">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Customize Placement Profile</span>
            </CardTitle>
            <CardDescription>
              Update your target technical role, dream companies, experience level, and known weak areas.
            </CardDescription>
          </CardHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Role</label>
              <input
                type="text"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                placeholder="e.g. Software Engineer (Backend & Systems)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Companies (comma-separated)</label>
              <input
                type="text"
                value={editCompanies}
                onChange={(e) => setEditCompanies(e.target.value)}
                placeholder="e.g. Google, Amazon, Microsoft, Stripe, Uber"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Experience Summary</label>
              <textarea
                rows={3}
                value={editExperience}
                onChange={(e) => setEditExperience(e.target.value)}
                placeholder="e.g. College Senior in Computer Science · Strong foundational logic & active recall"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Resume Readiness Status</label>
                <select
                  value={editResumeStatus}
                  onChange={(e) => setEditResumeStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="needs_review">Needs Review</option>
                  <option value="in_progress">In Progress</option>
                  <option value="interview_ready">Interview Ready</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Declared Weak Areas (comma-separated)</label>
                <input
                  type="text"
                  value={editWeakAreas}
                  onChange={(e) => setEditWeakAreas(e.target.value)}
                  placeholder="e.g. DP on Trees, Redis eviction, OS virtual memory"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <Button size="sm" variant="outline" onClick={() => setActiveTab('matrix')} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleSaveProfileEdit}
                isLoading={isSavingProfile}
                className="text-xs gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Save Profile
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
