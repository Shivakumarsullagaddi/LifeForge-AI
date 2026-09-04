'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import {
  getGoals,
  addGoal,
  updateGoalProgress,
  deleteGoal,
  getTasks,
  addTask,
  updateTaskStatus,
  deleteTask,
} from '@/lib/firebase';
import type { GoalItem, TaskItem, PriorityLevel } from '@/lib/types';
import { Target, CheckSquare, Plus, Trash2, CheckCircle2, Clock, Calendar } from 'lucide-react';

export const GoalsTasksView: React.FC = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Goal Modal
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDomain, setGoalDomain] = useState<GoalItem['domain']>('placement');
  const [goalPriority, setGoalPriority] = useState<PriorityLevel>('high');
  const [goalTargetDate, setGoalTargetDate] = useState('');

  // Task Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDomain, setTaskDomain] = useState<TaskItem['domain']>('study');
  const [taskPriority, setTaskPriority] = useState<PriorityLevel>('medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskIsDeepWork, setTaskIsDeepWork] = useState(true);
  const [taskGoalId, setTaskGoalId] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const [g, t] = await Promise.all([getGoals(user.uid), getTasks(user.uid)]);
        if (isMounted) {
          setGoals(g);
          setTasks(t);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load goals & tasks:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Create Goal
  const handleCreateGoal = async () => {
    if (!user || !goalTitle.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const id = await addGoal(user.uid, {
        title: goalTitle.trim(),
        description: goalDescription.trim(),
        domain: goalDomain,
        priority: goalPriority,
        status: 'in_progress',
        progress: 0,
        targetDate: goalTargetDate || undefined,
        source: 'user_defined',
        createdAt: now,
        updatedAt: now,
      });

      setGoals((prev) => [
        {
          id,
          userId: user.uid,
          title: goalTitle.trim(),
          description: goalDescription.trim(),
          domain: goalDomain,
          priority: goalPriority,
          status: 'in_progress',
          progress: 0,
          targetDate: goalTargetDate || undefined,
          source: 'user_defined',
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);

      setIsGoalModalOpen(false);
      setGoalTitle('');
      setGoalDescription('');
    } catch (err) {
      console.error('Failed to create goal:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Create Task
  const handleCreateTask = async () => {
    if (!user || !taskTitle.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const id = await addTask(user.uid, {
        title: taskTitle.trim(),
        domain: taskDomain,
        priority: taskPriority,
        status: 'pending',
        dueDate: taskDueDate || undefined,
        isDeepWork: taskIsDeepWork,
        goalId: taskGoalId || undefined,
        source: 'user_defined',
        createdAt: now,
        updatedAt: now,
      });

      setTasks((prev) => [
        {
          id,
          userId: user.uid,
          title: taskTitle.trim(),
          domain: taskDomain,
          priority: taskPriority,
          status: 'pending',
          dueDate: taskDueDate || undefined,
          isDeepWork: taskIsDeepWork,
          goalId: taskGoalId || undefined,
          source: 'user_defined',
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);

      setIsTaskModalOpen(false);
      setTaskTitle('');
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateGoalProgress = async (goal: GoalItem, newProgress: number) => {
    if (!user) return;
    const newStatus = newProgress === 100 ? 'completed' : 'in_progress';
    await updateGoalProgress(user.uid, goal.id, newProgress, newStatus);
    setGoals((prev) =>
      prev.map((g) => (g.id === goal.id ? { ...g, progress: newProgress, status: newStatus } : g))
    );
  };

  const handleDeleteGoal = async (id: string) => {
    if (!user) return;
    await deleteGoal(user.uid, id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const handleToggleTask = async (task: TaskItem) => {
    if (!user) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(user.uid, task.id, newStatus);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );
  };

  const handleDeleteTask = async (id: string) => {
    if (!user) return;
    await deleteTask(user.uid, id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            <h1 className="text-lg font-bold text-slate-100">Intentional Goals & Actionable Tasks</h1>
            <Badge variant="amber" size="sm">High Execution</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Convert long-term aspirations into structured semester goals and daily time-boxed deep work sprints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsGoalModalOpen(true)} className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Goal
          </Button>
          <Button size="sm" onClick={() => setIsTaskModalOpen(true)} className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Task
          </Button>
        </div>
      </div>

      {/* Grid: Left Goals, Right Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goals Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              <span>Milestone Goals ({goals.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="h-32 bg-slate-900/50 rounded-xl animate-pulse" />
          ) : goals.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-slate-800 space-y-2">
              <Target className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">No goals set yet. Set your target milestone.</p>
              <Button size="sm" variant="outline" onClick={() => setIsGoalModalOpen(true)}>
                Add Goal
              </Button>
            </div>
          ) : (
            goals.map((goal) => (
              <Card key={goal.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{goal.title}</h3>
                      <Badge
                        size="sm"
                        variant={
                          goal.status === 'completed'
                            ? 'emerald'
                            : goal.priority === 'urgent'
                            ? 'rose'
                            : 'amber'
                        }
                      >
                        {goal.domain}
                      </Badge>
                    </div>
                    {goal.description && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{goal.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Progress bar and slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-amber-400 font-bold">{goal.progress}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={goal.progress}
                    onChange={(e) => handleUpdateGoalProgress(goal, Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {goal.targetDate && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
                    <Calendar className="w-3 h-3" />
                    <span>Target Date: {goal.targetDate}</span>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Tasks Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              <span>Actionable Tasks ({tasks.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="h-32 bg-slate-900/50 rounded-xl animate-pulse" />
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-slate-800 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">No active tasks. Break down your next study block.</p>
              <Button size="sm" variant="outline" onClick={() => setIsTaskModalOpen(true)}>
                Add Task
              </Button>
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={() => handleToggleTask(task)}
                    className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      task.status === 'completed'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'border-slate-600 hover:border-amber-400'
                    }`}
                  >
                    {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                  <div className="space-y-1 min-w-0">
                    <div
                      className={`font-medium ${
                        task.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'
                      }`}
                    >
                      {task.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge size="sm" variant="slate">
                        {task.domain}
                      </Badge>
                      {task.isDeepWork && (
                        <span className="text-[10px] text-indigo-400 font-semibold flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> Deep Work
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" /> {task.dueDate}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Goal Modal */}
      <Modal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        title="Create Milestone Goal"
        description="Define an intentional target for your academics, placement, or personal routines."
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Goal Title</label>
            <input
              type="text"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="e.g. Master Graph Algorithms & Dynamic Programming"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Description</label>
            <textarea
              rows={3}
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              placeholder="Why is this important? What does mastery look like?"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Domain</label>
              <select
                value={goalDomain}
                onChange={(e) => setGoalDomain(e.target.value as GoalItem['domain'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="placement">Placement</option>
                <option value="study">Study / Academics</option>
                <option value="habits">Habits & Discipline</option>
                <option value="wellbeing">Wellbeing</option>
                <option value="career">Career Long-term</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Target Date</label>
              <input
                type="date"
                value={goalTargetDate}
                onChange={(e) => setGoalTargetDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setIsGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGoal} isLoading={isSaving} disabled={!goalTitle.trim()}>
              Save Goal
            </Button>
          </div>
        </div>
      </Modal>

      {/* Task Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Add Actionable Task"
        description="Schedule a concrete action item with priority and deep-work tagging."
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Task Title</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Solve 3 Dijkstra Shortest Path problems without looking at solutions"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Domain</label>
              <select
                value={taskDomain}
                onChange={(e) => setTaskDomain(e.target.value as TaskItem['domain'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="study">Study</option>
                <option value="placement">Placement</option>
                <option value="habits">Habits</option>
                <option value="wellbeing">Wellbeing</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as PriorityLevel)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="deepWorkCheckbox"
              checked={taskIsDeepWork}
              onChange={(e) => setTaskIsDeepWork(e.target.checked)}
              className="w-4 h-4 accent-amber-500 rounded"
            />
            <label htmlFor="deepWorkCheckbox" className="text-slate-300 font-medium cursor-pointer">
              Tag as Deep Work Session (Requires uninterrupted 25-50 min sprint)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} isLoading={isSaving} disabled={!taskTitle.trim()}>
              Save Task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
