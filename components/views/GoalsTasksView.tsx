'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import {
  subscribeGoals,
  updateGoalProgress,
  deleteGoal,
  subscribeTasks,
  updateTaskStatus,
  deleteTask,
} from '@/lib/firebase';
import type { GoalItem, TaskItem } from '@/lib/types';
import { Target, CheckSquare, Trash2, CheckCircle2, Clock, Calendar } from 'lucide-react';

export const GoalsTasksView: React.FC = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<GoalItem | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    const unsubGoals = subscribeGoals(user.uid, (g) => {
      setGoals(g);
      setLoading(false);
    });
    const unsubTasks = subscribeTasks(user.uid, (t) => {
      setTasks(t);
      setLoading(false);
    });
    return () => {
      unsubGoals();
      unsubTasks();
    };
  }, [user]);

  const handleUpdateGoalProgress = async (goal: GoalItem, newProgress: number) => {
    if (!user) return;
    const newStatus = newProgress === 100 ? 'completed' : 'in_progress';
    await updateGoalProgress(user.uid, goal.id, newProgress, newStatus);
    setGoals((prev) =>
      prev.map((g) => (g.id === goal.id ? { ...g, progress: newProgress, status: newStatus } : g))
    );
  };

  const handleConfirmDeleteGoal = async () => {
    if (!user || !goalToDelete) return;
    await deleteGoal(user.uid, goalToDelete.id);
    setGoals((prev) => prev.filter((g) => g.id !== goalToDelete.id));
    setGoalToDelete(null);
  };

  const handleToggleTask = async (task: TaskItem) => {
    if (!user) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(user.uid, task.id, newStatus);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );
  };

  const handleConfirmDeleteTask = async () => {
    if (!user || !taskToDelete) return;
    await deleteTask(user.uid, taskToDelete.id);
    setTasks((prev) => prev.filter((t) => t.id !== taskToDelete.id));
    setTaskToDelete(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            <h1 className="text-lg font-bold text-slate-100">Intentional Goals & Actionable Tasks</h1>
            <Badge variant="amber" size="sm">Autonomous Agent Verified</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Structured milestone goals and actionable tasks created and tracked via Live Coach tools.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <p className="text-xs text-slate-400">No goals set yet. Ask Live Coach: &ldquo;Create a goal to master C++ STL&rdquo;</p>
            </div>
          ) : (
            goals.map((goal) => (
              <Card key={goal.id} data-testid="goal-item" className="space-y-3">
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
                    data-testid="delete-goal-btn"
                    onClick={() => setGoalToDelete(goal)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

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
              <p className="text-xs text-slate-400">No active tasks. Ask Live Coach: &ldquo;Create a task to finish my project&rdquo;</p>
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                data-testid="task-item"
                className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    data-testid="toggle-task-status"
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
                    {task.description && (
                      <p className="text-[11px] text-slate-400 leading-relaxed">{task.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge size="sm" variant="slate">
                        {task.domain}
                      </Badge>
                      {task.priority && (
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
                      )}
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
                  data-testid="delete-task-btn"
                  onClick={() => setTaskToDelete(task)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {taskToDelete && (
        <Modal isOpen={!!taskToDelete} onClose={() => setTaskToDelete(null)} title="Delete Task Confirmation">
          <div data-testid="task-confirmation-dialog" className="space-y-4">
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete task &quot;{taskToDelete.title}&quot;?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="cancel-delete-task"
                onClick={() => setTaskToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                data-testid="confirm-delete-task"
                onClick={handleConfirmDeleteTask}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {goalToDelete && (
        <Modal isOpen={!!goalToDelete} onClose={() => setGoalToDelete(null)} title="Delete Goal Confirmation">
          <div data-testid="goal-confirmation-dialog" className="space-y-4">
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete goal &quot;{goalToDelete.title}&quot;?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="cancel-delete-goal"
                onClick={() => setGoalToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                data-testid="confirm-delete-goal"
                onClick={handleConfirmDeleteGoal}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
