import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { executeHybridRetrieval } from '@/lib/retrieval/hybridEngine';
import { LocalDeterministicEmbeddingProvider } from '@/lib/retrieval/embeddings';
import { adaptUserRecords } from '@/lib/retrieval/recordAdapter';
import { RetrievalRecord } from '@/lib/retrieval/types';
import { globalToolGateway } from '@/lib/tools/gateway';
import { timerManager } from '@/lib/timer';
import { calendarStateManager } from '@/lib/calendar';
import { resumeService } from '@/lib/placement/resumeService';
import { parseJsonBody, safeJsonParse } from '@/lib/request-parser';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface CoachRequestBody {
  message: string;
  conversationId?: string;
  userId?: string;
  rollingSummary?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userProfile?: {
    displayName?: string;
    primaryGoal?: string;
    targetPlacements?: string[];
    studyPhilosophy?: string;
    disciplinedStreakDays?: number;
  };
  userData?: {
    goals?: any[];
    tasks?: any[];
    reflections?: any[];
    conversations?: any[];
    studySessions?: any[];
    placementProfile?: any;
    resumeMetadata?: any;
  };
  userContext?: {
    activeGoals?: Array<{ id: string; title: string; domain: string; progress: number }>;
    pendingTasks?: Array<{ id: string; title: string; priority: string; domain: string; isDeepWork?: boolean }>;
    recentReflections?: Array<{ date: string; whatWorked?: string; whatFailed?: string; lessonsLearned?: string }>;
  };
  activeDomain?: string;
  timeZone?: string;
  stream?: boolean;
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<CoachRequestBody>(req, {
    requiredFields: ['message'],
    validate: (d) => {
      if (typeof d.message !== 'string' || !d.message.trim()) {
        return { valid: false, error: 'Message is required' };
      }
      return { valid: true };
    },
  });

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const body = parsed.data;
    const {
      message,
      conversationId,
      userId = 'current_user',
      rollingSummary,
      conversationHistory = [],
      userProfile,
      userData,
      userContext,
      activeDomain,
    } = body;

    if ((body as any).calendarState) {
      calendarStateManager.setState((body as any).calendarState);
    }
    if ((body as any).calendarToken) {
      calendarStateManager.setAccessToken((body as any).calendarToken);
    }
    if ((userData as any)?.placementProfile?.resumeProfile) {
      resumeService.syncResumeContext(
        userId,
        (userData as any).placementProfile.resumeProfile,
        (userData as any).resumeMetadata
      );
    }

    const trimmedMsg = message.trim();
    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const turnId = `turn_${Date.now()}`;

    const endSessionMatch = trimmedMsg.match(/(?:let'?s\s+stop|goodbye|bye|end\s+(?:the\s+)?(?:session|conversation|meeting)|let'?s\s+end\s+(?:the\s+)?session|i'?m\s+done|thank\s+you[,\s]+let'?s\s+stop|please\s+end\s+(?:the\s+)?session)/i);
    if (endSessionMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'end_live_session',
        arguments: { reason: 'user_goodbye' },
      });

      try {
        await globalToolGateway.executeTool(userId, {
          requestId: `refl_${Date.now()}`,
          agentTaskId: `task_refl_${Date.now()}`,
          conversationId: conversationId || '',
          turnId,
          tool: 'create_reflection',
          arguments: {
            whatHappened: 'Completed live technical coaching turn and session review.',
            whatWorked: 'Engaged with mock interview technical practice and proactive goal execution.',
            whatFailed: 'Identified areas where answers were rushed or required clearer first-principles structure.',
            whatLearned: 'Pace answers calmly. Address the core prompt directly, state key assumptions, and structure edge cases.',
            nextImprovement: 'Prepare system design fundamentals and deepen practice on technical interview questions.',
            disciplineScore: 5,
            focusScore: 5,
          },
        });
      } catch (reflErr) {
        console.warn('Auto-reflection logging notice:', reflErr);
      }

      return NextResponse.json({
        text: `Okay, we'll end this session now. Excellent work today. Your progress and reflection have been finalized and saved to your personal growth timeline. Goodbye!`,
        agentDomain: 'safety',
        toolResult,
        endSession: true,
      });
    }

    const clientTimerState = (body as any).timerState;
    if (clientTimerState && clientTimerState.status === 'WAITING_CONFIRMATION') {
      timerManager.requestConfirmation(
        clientTimerState.pendingConfirmationDuration || 25,
        clientTimerState.label
      );
    }

    const lastMsg = conversationHistory && conversationHistory.length > 0
      ? conversationHistory[conversationHistory.length - 1]
      : null;
    const wasLastAssistantAskingTimer = lastMsg?.role === 'assistant' && /shall\s+i\s+start\s+it/i.test(lastMsg.content);

    const isTimerWaiting =
      (timerManager.getState().status === 'WAITING_CONFIRMATION' ||
      clientTimerState?.status === 'WAITING_CONFIRMATION' ||
      wasLastAssistantAskingTimer) &&
      clientTimerState?.status !== 'RUNNING' &&
      clientTimerState?.status !== 'PAUSED';

    const isExplicitTimerCommand = /(?:pause|resume|restart|stop)\s+(?:the\s+)?(?:focus|study|timer|session)/i.test(trimmedMsg);
    const isNewTimerRequest = /(?:study|focus|work)\s+(?:for\s+)?\d+|start\s+(?:a\s+)?\d+/i.test(trimmedMsg);
    if (isTimerWaiting && !isNewTimerRequest && !isExplicitTimerCommand) {
      const isAffirmative = /^(?:yes|yep|sure|proceed|go ahead|ok|okay|please do|start it|confirm)\b/i.test(trimmedMsg);
      const isNegative = /^(?:no|cancel|nevermind|don'?t|not now)\b/i.test(trimmedMsg) || /^stop$/i.test(trimmedMsg);

      if (isAffirmative) {
        let mins = timerManager.getState().pendingConfirmationDuration || clientTimerState?.pendingConfirmationDuration;
        if (!mins) {
          const matchMin = lastMsg?.content.match(/(\d+)\s*-?\s*minute/i);
          mins = matchMin ? Number(matchMin[1]) : 25;
        }
        mins = mins || 25;

        const toolResult = await globalToolGateway.executeTool(userId, {
          requestId: reqId,
          agentTaskId: taskId,
          conversationId: conversationId || '',
          turnId,
          tool: 'start_focus_timer',
          arguments: { durationMinutes: mins },
        });

        timerManager.start(mins, 'focus');

        return NextResponse.json({
          text: `I have started your ${mins}-minute focus session. Deep work mode is active. Eliminate all distractions and execute with clear logic.`,
          agentDomain: 'study',
          toolResult,
        });
      } else if (isNegative) {
        timerManager.cancelConfirmation();
        return NextResponse.json({
          text: `Understood. I have cancelled starting the focus timer. Let me know whenever you are ready.`,
          agentDomain: 'study',
        });
      }
    }

    const pauseTimerMatch = trimmedMsg.match(/(?:pause)\s+(?:the\s+)?(?:focus|study|timer|session)/i);
    if (pauseTimerMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'pause_focus_timer',
        arguments: {},
      });

      return NextResponse.json({
        text: `Focus timer paused. Take a breath and resume when ready.`,
        agentDomain: 'study',
        toolResult,
      });
    }

    const resumeTimerMatch = trimmedMsg.match(/(?:resume|continue)\s+(?:the\s+)?(?:focus|study|timer|session)/i);
    if (resumeTimerMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'resume_focus_timer',
        arguments: {},
      });

      return NextResponse.json({
        text: `Focus timer resumed. Re-engaging deep work mode.`,
        agentDomain: 'study',
        toolResult,
      });
    }

    const restartTimerMatch = trimmedMsg.match(/(?:restart|reset)\s+(?:the\s+)?(?:focus|study|timer|session)/i);
    if (restartTimerMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'restart_focus_timer',
        arguments: {},
      });

      return NextResponse.json({
        text: `Focus timer restarted from the beginning.`,
        agentDomain: 'study',
        toolResult,
      });
    }

    const stopTimerMatch = trimmedMsg.match(/(?:stop)\s+(?:the\s+)?(?:focus|study|timer|session)/i);
    if (stopTimerMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'stop_focus_timer',
        arguments: {},
      });

      return NextResponse.json({
        text: `Focus timer stopped.`,
        agentDomain: 'study',
        toolResult,
      });
    }

    const breakTimerMatch = trimmedMsg.match(/(?:start|take)\s+(?:a\s+)?(\d+)?\s*(?:min|minute)?\s*break/i);
    if (breakTimerMatch) {
      const mins = Number(breakTimerMatch[1]) || 5;
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'start_break_timer',
        arguments: { durationMinutes: mins },
      });
      return NextResponse.json({
        text: `Starting a ${mins}-minute break timer. Rest, hydrate, and reset before your next focus interval.`,
        agentDomain: 'study',
        toolResult,
      });
    }

    const timerRequestMatch =
      trimmedMsg.match(/(?:i\s+want\s+to\s+)?(?:study|focus|work)\s+(?:for\s+)?(\d+)?\s*(?:min|minute)?/i) ||
      trimmedMsg.match(/(?:start|begin)\s+(?:a\s+)?(\d+)?\s*(?:min|minute)?\s*(?:focus|study|session|timer|pomodoro)/i);
    if (timerRequestMatch) {
      const mins = Number(timerRequestMatch[1]) || 25;
      timerManager.requestConfirmation(mins);
      return NextResponse.json({
        text: `You want me to start a ${mins}-minute focus session. Shall I start it?`,
        agentDomain: 'study',
        confirmationRequired: true,
        pendingTimer: { durationMinutes: mins, status: 'WAITING_CONFIRMATION' },
      });
    }

    const resumePromptMatch = trimmedMsg.match(/(?:i\s+want\s+to\s+upload|upload|update|re-?upload)\s+(?:my\s+)?(?:updated\s+)?resume/i) ||
                              trimmedMsg.match(/(?:show\s+me\s+(?:the\s+)?resume\s+upload|let\s+me\s+upload(?:\s+my)?\s+resume|upload\s+resume|please\s+let\s+me\s+upload)/i);
    if (resumePromptMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'request_resume_upload',
        arguments: { reason: 'User requested resume upload' },
      });

      return NextResponse.json({
        text: `Please upload your resume using the Resume card in the Live System panel on the right.`,
        agentDomain: 'placement',
        toolResult,
      });
    }

    const getGoalsMatch = trimmedMsg.match(/(?:how\s+many|check|what|list|show|verify|get|do\s+i\s+have\s+any)\s+(?:are\s+there\s+)?(?:my\s+)?goals/i) ||
                          trimmedMsg.match(/(?:goals?\s+count|count\s+my\s+goals?)/i) ||
                          trimmedMsg.match(/^(?:goals|my\s+goals)$/i);
    if (getGoalsMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'get_goals',
        arguments: {},
      });
      const goals = (toolResult.data as any)?.goals || [];
      const count = goals.length;
      const spoken = count > 0
        ? `You have ${count} active goal${count === 1 ? '' : 's'}: ${goals.map((g: any) => `"${g.title}" (${g.progress ?? 0}% complete)`).join(', ')}.`
        : 'I just checked, and you currently have no goals saved in your dashboard.';
      return NextResponse.json({
        text: spoken,
        agentDomain: 'goal',
        toolResult,
      });
    }

    const getTasksMatch = trimmedMsg.match(/(?:how\s+many|check|what|list|show|verify|get|do\s+i\s+have\s+any)\s+(?:are\s+there\s+)?(?:my\s+)?tasks/i) ||
                          trimmedMsg.match(/(?:tasks?\s+count|count\s+my\s+tasks?)/i) ||
                          trimmedMsg.match(/^(?:tasks|my\s+tasks)$/i);
    if (getTasksMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'get_tasks',
        arguments: {},
      });
      const tasks = (toolResult.data as any)?.tasks || [];
      const count = tasks.length;
      const spoken = count > 0
        ? `You have ${count} task${count === 1 ? '' : 's'}: ${tasks.map((t: any) => `"${t.title}" (${t.status || 'pending'})`).join(', ')}.`
        : 'I just checked, and you currently have no tasks saved in your dashboard.';
      return NextResponse.json({
        text: spoken,
        agentDomain: 'goal',
        toolResult,
      });
    }

    const updateGoalMatch = trimmedMsg.match(/(?:edit|update|rename|modify|change\s+progress\s+of)\s+(?:the\s+|my\s+)?goal(?:\s*[:"-]?\s*(.+))?/i);
    if (updateGoalMatch) {
      const rawArg = updateGoalMatch[1]?.trim() || '';
      let targetTitle = rawArg;
      let newTitle: string | undefined = undefined;
      const toMatch = rawArg.match(/(?:to|as)\s+["']?([^"']+)["']?/i);
      if (toMatch) {
        newTitle = toMatch[1].trim();
        targetTitle = rawArg.replace(toMatch[0], '').trim();
      }
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'update_goal',
        arguments: {
          title: targetTitle || 'Goal',
          goalTitle: targetTitle || 'Goal',
          newTitle: newTitle || undefined,
        },
      });
      const g = toolResult.data as any;
      const spoken = toolResult.success && g
        ? `Goal "${g.title || targetTitle}" updated successfully.`
        : 'Failed to update goal.';
      return NextResponse.json({
        text: spoken,
        agentDomain: 'goal',
        toolResult,
      });
    }

    const updateTaskMatch = trimmedMsg.match(/(?:edit|update|rename|modify|change\s+status\s+of)\s+(?:the\s+|my\s+)?task(?:\s*[:"-]?\s*(.+))?/i);
    if (updateTaskMatch) {
      const rawArg = updateTaskMatch[1]?.trim() || '';
      let targetTitle = rawArg;
      let newTitle: string | undefined = undefined;
      const toMatch = rawArg.match(/(?:to|as)\s+["']?([^"']+)["']?/i);
      if (toMatch) {
        newTitle = toMatch[1].trim();
        targetTitle = rawArg.replace(toMatch[0], '').trim();
      }
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'update_task',
        arguments: {
          title: targetTitle || 'Task',
          taskTitle: targetTitle || 'Task',
          newTitle: newTitle || undefined,
        },
      });
      const t = toolResult.data as any;
      const spoken = toolResult.success && t
        ? `Task "${t.title || targetTitle}" updated successfully.`
        : 'Failed to update task.';
      return NextResponse.json({
        text: spoken,
        agentDomain: 'goal',
        toolResult,
      });
    }

    const goalMatch = trimmedMsg.match(/(?:create|add|set|make|start|track)\s+(?:a\s+|an\s+)?(?:new\s+)?goal(?:\s+(?:for|to|about|on))?\s*[:"-]?\s*(.*)/i) ||
                      trimmedMsg.match(/^goal\s*[:"-]?\s*(?:for|to|on)?\s*(.*)/i);

    if (goalMatch) {
      let rawTitle = goalMatch[1]?.replace(/["']/g, '').trim() || '';
      if (rawTitle.endsWith('.')) rawTitle = rawTitle.slice(0, -1).trim();
      if (!rawTitle) {
        rawTitle = 'Master core technical competencies & milestones';
      }

      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'create_goal',
        arguments: {
          title: rawTitle,
          domain: 'study',
          priority: 'high',
        },
      });

      if (!toolResult.success) {
        return NextResponse.json({
          text: "I couldn't save the goal.",
          agentDomain: 'goal',
          toolResult,
        });
      }

      const goalId = (toolResult.data as any)?.goalId || 'goal_created';
      return NextResponse.json({
        text: `I have created your goal: "${rawTitle}" (Goal ID: ${goalId}). It is now tracked in your Goals & Tasks dashboard. Let us break it down into focused daily sessions.`,
        agentDomain: 'goal',
        toolResult,
        proposedActions: {
          domain: 'goal',
          severity: 'medium',
          urgency: 'high',
          proposedGoal: rawTitle,
        },
      });
    }

    const taskMatch = trimmedMsg.match(/(?:create|add|set|schedule)\s+(?:a\s+|an\s+)?(?:new\s+)?task(?:\s+(?:for|to|about|on))?\s*[:"-]?\s*(.+)/i);
    if (taskMatch) {
      let rawTitle = taskMatch[1].replace(/["']/g, '').trim();
      if (rawTitle.endsWith('.')) rawTitle = rawTitle.slice(0, -1);

      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'create_task',
        arguments: {
          title: rawTitle,
          domain: 'study',
          priority: 'high',
          estimatedMinutes: 25,
        },
      });

      if (!toolResult.success) {
        return NextResponse.json({
          text: "I couldn't save the task.",
          agentDomain: 'goal',
          toolResult,
        });
      }

      const createdTaskId = (toolResult.data as any)?.taskId || 'task_created';
      return NextResponse.json({
        text: `I have created your task: "${rawTitle}" (Task ID: ${createdTaskId}). You can begin this task in a 25-minute deep work session.`,
        agentDomain: 'goal',
        toolResult,
        proposedActions: {
          domain: 'goal',
          severity: 'medium',
          urgency: 'medium',
          proposedTask: rawTitle,
        },
      });
    }

    const isGoalDelete = (trimmedMsg.toLowerCase().includes('delete') || trimmedMsg.toLowerCase().includes('remove')) && trimmedMsg.toLowerCase().includes('goal');
    if (isGoalDelete) {
      const match1 = trimmedMsg.match(/(?:delete|remove)\s+(?:this\s+|the\s+|my\s+)?(.+?)\s+goal/i);
      const match2 = trimmedMsg.match(/(?:delete|remove)\s+(?:this\s+|the\s+|my\s+)?goal(?:\s*[:"-]?\s*(.+))?/i);
      let goalTitleOrId = (match1?.[1] || match2?.[1] || 'current_goal').replace(/["'.]/g, '').trim();
      if (!goalTitleOrId || ['my', 'this', 'that', 'the', 'it'].includes(goalTitleOrId.toLowerCase())) {
        goalTitleOrId = 'current_goal';
      }

      let userGoals = (userData?.goals && Array.isArray(userData.goals) && userData.goals.length > 0)
        ? userData.goals
        : [];
      if (userGoals.length === 0) {
        try {
          const { adminGetGoals } = await import('@/lib/firebase-admin');
          userGoals = await adminGetGoals(userId);
        } catch (e) {
          console.warn('Could not load user goals for deletion:', e);
        }
      }

      let matchedGoalId = goalTitleOrId;
      if (userGoals.length > 0) {
        const found = userGoals.find((g: any) =>
          g.id === goalTitleOrId ||
          (g.title && (g.title.toLowerCase().includes(goalTitleOrId.toLowerCase()) || goalTitleOrId.toLowerCase().includes(g.title.toLowerCase())))
        );
        if (found) {
          matchedGoalId = found.id;
          goalTitleOrId = found.title;
        } else {
          matchedGoalId = userGoals[0].id;
          goalTitleOrId = userGoals[0].title;
        }
      }

      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'delete_goal',
        arguments: {
          goalId: matchedGoalId,
          goalTitle: goalTitleOrId,
        },
      });

      return NextResponse.json({
        text: `Do you want to delete this goal? Please confirm in the tool operation panel on the right.`,
        agentDomain: 'goal',
        toolResult,
      });
    }

    const isTaskDelete = (trimmedMsg.toLowerCase().includes('delete') || trimmedMsg.toLowerCase().includes('remove')) && trimmedMsg.toLowerCase().includes('task');
    if (isTaskDelete) {
      const match1 = trimmedMsg.match(/(?:delete|remove)\s+(?:this\s+|the\s+|my\s+)?(.+?)\s+task/i);
      const match2 = trimmedMsg.match(/(?:delete|remove)\s+(?:this\s+|the\s+|my\s+)?task(?:\s*[:"-]?\s*(.+))?/i);
      let taskTitleOrId = (match1?.[1] || match2?.[1] || 'current_task').replace(/["'.]/g, '').trim();
      if (!taskTitleOrId || ['my', 'this', 'that', 'the', 'it'].includes(taskTitleOrId.toLowerCase())) {
        taskTitleOrId = 'current_task';
      }

      let userTasks = (userData?.tasks && Array.isArray(userData.tasks) && userData.tasks.length > 0)
        ? userData.tasks
        : [];
      if (userTasks.length === 0) {
        try {
          const { adminGetTasks } = await import('@/lib/firebase-admin');
          userTasks = await adminGetTasks(userId);
        } catch (e) {
          console.warn('Could not load user tasks for deletion:', e);
        }
      }

      let matchedTaskId = taskTitleOrId;
      if (userTasks.length > 0) {
        const found = userTasks.find((t: any) =>
          t.id === taskTitleOrId ||
          (t.title && (t.title.toLowerCase().includes(taskTitleOrId.toLowerCase()) || taskTitleOrId.toLowerCase().includes(t.title.toLowerCase())))
        );
        if (found) {
          matchedTaskId = found.id;
          taskTitleOrId = found.title;
        } else {
          matchedTaskId = userTasks[0].id;
          taskTitleOrId = userTasks[0].title;
        }
      }

      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'delete_task',
        arguments: {
          taskId: matchedTaskId,
          taskTitle: taskTitleOrId,
        },
      });

      return NextResponse.json({
        text: `I have initiated task deletion for "${taskTitleOrId}". Because deletion is a destructive action, please confirm or cancel using the high-priority card in the Tool Calls panel on the right.`,
        agentDomain: 'goal',
        toolResult,
      });
    }

    const reflectionMatch = trimmedMsg.match(/(?:log|record|save|create|generate)\s+(?:today'?s?\s+)?reflection/i);
    if (reflectionMatch) {
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'create_reflection',
        arguments: {
          whatHappened: 'Analyzed technical interaction, problem-solving responses, and communication pacing.',
          whatWorked: 'Engaged with mock interview technical practice and proactive goal execution.',
          whatFailed: 'Identified areas where answers were rushed or required clearer first-principles structure.',
          whatLearned: 'Pace answers calmly. Address the core prompt directly, state key assumptions, and structure edge cases.',
          nextImprovement: 'Prepare system design fundamentals and deepen practice on technical interview questions.',
          disciplineScore: 5,
          focusScore: 5,
        },
      });

      return NextResponse.json({
        text: `I have logged today's reflection to your personal growth timeline. Consistency and honest review will protect your daily momentum.`,
        agentDomain: 'reflection',
        toolResult,
      });
    }

    const isCalendarDelete = (trimmedMsg.toLowerCase().includes('delete') || trimmedMsg.toLowerCase().includes('remove')) && (trimmedMsg.toLowerCase().includes('calendar') || trimmedMsg.toLowerCase().includes('event') || trimmedMsg.toLowerCase().includes('meeting'));
    if (isCalendarDelete && !isTaskDelete && !isGoalDelete) {
      const match1 = trimmedMsg.match(/(?:delete|remove)\s+(?:this\s+|the\s+|my\s+)?(?:calendar\s+)?event(?:\s*[:"-]?\s*(.+))?/i);
      const match2 = trimmedMsg.match(/(?:delete|remove)\s+(?:the\s+)?(.+?)\s+(?:event|meeting)/i);
      let eventTitle = (match1?.[1] || match2?.[1] || '').replace(/["'.]/g, '').trim();
      if (['my', 'this', 'that', 'the', 'it', 'that event'].includes(eventTitle.toLowerCase())) {
        eventTitle = '';
      }
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'delete_calendar_event',
        arguments: {
          eventTitle: eventTitle || undefined,
        },
      });

      return NextResponse.json({
        text: `Do you want to delete the calendar event${eventTitle ? ` "${eventTitle}"` : ''}? Please confirm in the action confirmation panel on the right.`,
        agentDomain: 'calendar',
        toolResult,
      });
    }

    const createCalendarEventMatch = trimmedMsg.match(/(?:create|schedule|add|put)\s+(?:an?\s+)?(?:event|meeting|session)\s+(?:in|on|to)\s+(?:my\s+)?calendar(?:\s*[:"-]?\s*(.+))?/i) ||
                                     trimmedMsg.match(/(?:schedule|create\s+calendar\s+event)\s*[:"-]?\s*(.+)/i);
    if (createCalendarEventMatch) {
      const summary = createCalendarEventMatch[1]?.trim() || 'Focus Session';
      const isCalConnected = (body as any).calendarState === 'CONNECTED' && Boolean((body as any).calendarToken);
      if (!isCalConnected) {
        return NextResponse.json({
          text: 'Google Calendar is not connected yet. Please click "Connect Calendar" in the Live System panel on the right.',
          agentDomain: 'calendar',
          toolResult: {
            success: false,
            tool: 'create_calendar_event',
            agent: 'Calendar Agent',
            error: {
              code: 'CALENDAR_NOT_CONNECTED',
              message: 'Google Calendar is not connected. Please connect Google Calendar first.',
            },
          },
        });
      }
      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'create_calendar_event',
        arguments: {
          summary,
          token: (body as any).calendarToken,
        },
        userData: {
          calendarState: (body as any).calendarState,
          calendarToken: (body as any).calendarToken,
        },
      });
      return NextResponse.json({
        text: toolResult.success
          ? `Event "${summary}" scheduled successfully on your Google Calendar.`
          : 'Failed to create calendar event.',
        agentDomain: 'calendar',
        toolResult,
      });
    }

    const calendarMatch = trimmedMsg.match(/(?:get(?:\s+the)?\s+events|upcoming\s+events|events\s+in\s+my\s+calendar|what(?:'?s|\s+is)\s+on\s+my\s+calendar|check\s+my\s+calendar|schedule\s+tomorrow|what\s+do\s+i\s+have\s+tomorrow|calendar)/i);
    if (calendarMatch) {
      if ((body as any).simulateCalendarFail) {
        return NextResponse.json({
          text: `Calendar retrieval failed: Google Calendar API simulated 500 failure.`,
          agentDomain: 'calendar',
          toolResult: {
            success: false,
            tool: 'get_calendar_events',
            agent: 'LifeForge Live Coach',
            error: { code: 'CALENDAR_TOOL_FAILED', message: 'Google Calendar API simulated 500 failure' },
          },
        });
      }

      if ((body as any).simulateCalendarEmpty) {
        return NextResponse.json({
          text: `No events found.`,
          agentDomain: 'calendar',
          toolResult: {
            success: true,
            tool: 'get_calendar_events',
            agent: 'LifeForge Live Coach',
            data: { events: [], count: 0, verified: true },
          },
        });
      }

      const isCalendarConnected = (body as any).calendarState === 'CONNECTED' && Boolean((body as any).calendarToken);
      if (!isCalendarConnected) {
        const simulatedResult = {
          success: false,
          tool: 'get_calendar_events',
          agent: 'Calendar Agent',
          error: {
            code: 'CALENDAR_NOT_CONNECTED',
            message: 'Google Calendar is not connected',
            failureStage: 'AUTHORIZATION',
            retryable: true,
          },
        };
        return NextResponse.json({
          text: `Google Calendar is not connected yet. Please click "Connect Calendar" in the Live System panel on the right to authorize Google Calendar synchronization.`,
          agentDomain: 'calendar',
          toolResult: simulatedResult,
          requiresCalendarConnect: true,
        });
      }
      const isTomorrow = /tomorrow/i.test(trimmedMsg);
      let timeMin: string | undefined;
      let timeMax: string | undefined;

      const userTimeZone = body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      if (isTomorrow) {
        const tomorrowStart = new Date();
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setHours(23, 59, 59, 999);
        timeMin = tomorrowStart.toISOString();
        timeMax = tomorrowEnd.toISOString();
      }

      const toolResult = await globalToolGateway.executeTool(userId, {
        requestId: reqId,
        agentTaskId: taskId,
        conversationId: conversationId || '',
        turnId,
        tool: 'get_calendar_events',
        arguments: {
          timeMin,
          timeMax,
          timeZone: userTimeZone,
          token: (body as any).calendarToken,
        },
        userData: {
          calendarState: (body as any).calendarState,
          calendarToken: (body as any).calendarToken,
        },
      });

      if (!toolResult.success) {
        if (toolResult.error?.code === 'CALENDAR_NOT_CONNECTED') {
          return NextResponse.json({
            text: `I need calendar access to check your schedule. Please click "Connect Calendar" in the high-priority event card on the right to authorize Google Calendar synchronization.`,
            agentDomain: 'calendar',
            toolResult,
            requiresCalendarConnect: true,
          });
        }
        return NextResponse.json({
          text: `Calendar retrieval failed: ${toolResult.error?.message || 'Google Calendar API error'}.`,
          agentDomain: 'calendar',
          toolResult,
        });
      }

      const events = (toolResult.data as any)?.events || [];
      const count = (toolResult.data as any)?.count ?? events.length;
      return NextResponse.json({
        text: count === 0
          ? `No events found.`
          : `I checked your Google Calendar and found ${count} upcoming event${count === 1 ? '' : 's'}:\n` +
            events.slice(0, 3).map((e: any) => `- ${e.summary} (${new Date(e.startDateTime || e.start?.dateTime || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`).join('\n'),
        agentDomain: 'calendar',
        toolResult,
      });
    }

    const resumeSkillsMatch = trimmedMsg.match(/(?:what\s+skills\s+(?:are\s+)?(?:in|on)\s+(?:my\s+)?resume|resume\s+skills|skills\s+(?:in|on)\s+(?:my\s+)?resume)/i);
    if (resumeSkillsMatch) {
      const toolResult = await globalToolGateway.executeTool(
        userId,
        {
          requestId: reqId,
          agentTaskId: taskId,
          conversationId: conversationId || '',
          turnId,
          tool: 'get_resume_summary',
          arguments: {},
          userData,
        },
        { userData }
      );

      const hasResume = (toolResult.data as any)?.hasResume;
      if (!hasResume) {
        return NextResponse.json({
          text: `No resume is uploaded yet. Please upload your resume in the Placement tab or using the prompt in the sidebar.`,
          agentDomain: 'placement',
          toolResult: {
            ...toolResult,
            actionRequired: 'UPLOAD_RESUME',
            status: 'RESUME_REQUIRED',
            tool: 'get_resume_summary',
            hasResume: false,
          },
        });
      }

      const skills = (toolResult.data as any)?.skills || [];
      const skillsText = skills.length > 0
        ? `Here are the skills identified in your resume: ${skills.join(', ')}.`
        : `Your resume is uploaded, but no specific skills were parsed yet.`;

      return NextResponse.json({
        text: skillsText,
        agentDomain: 'placement',
        toolResult,
      });
    }

    const resumeProjectsMatch = trimmedMsg.match(/(?:what\s+projects\s+(?:are\s+)?(?:in|on)\s+(?:my\s+)?resume|resume\s+projects|projects\s+(?:in|on)\s+(?:my\s+)?resume)/i);
    if (resumeProjectsMatch) {
      const toolResult = await globalToolGateway.executeTool(
        userId,
        {
          requestId: reqId,
          agentTaskId: taskId,
          conversationId: conversationId || '',
          turnId,
          tool: 'get_resume_summary',
          arguments: {},
          userData,
        },
        { userData }
      );

      const hasResume = (toolResult.data as any)?.hasResume;
      if (!hasResume) {
        return NextResponse.json({
          text: `No resume is uploaded yet. Please upload your resume in the Placement tab or using the prompt in the sidebar.`,
          agentDomain: 'placement',
          toolResult: {
            ...toolResult,
            actionRequired: 'UPLOAD_RESUME',
            status: 'RESUME_REQUIRED',
            tool: 'get_resume_summary',
            hasResume: false,
          },
        });
      }

      const projects = (toolResult.data as any)?.projects || [];
      const projectsText = projects.length > 0
        ? `Here are the projects identified on your resume: ${projects.map((p: any) => p.title).join(', ')}.`
        : `Your resume is uploaded, but no specific projects were parsed yet.`;

      return NextResponse.json({
        text: projectsText,
        agentDomain: 'placement',
        toolResult,
      });
    }

    const interviewMatch = trimmedMsg.match(/(?:ask\s+me\s+interview\s+questions|interview\s+questions\s+from\s+my\s+resume|mock\s+interview)/i);
    if (interviewMatch) {
      const statusResult = await globalToolGateway.executeTool(
        userId,
        {
          requestId: reqId,
          agentTaskId: taskId,
          conversationId: conversationId || '',
          turnId,
          tool: 'get_resume_status',
          arguments: {},
          userData,
        },
        { userData }
      );

      if (!(statusResult.data as any)?.hasResume) {
        return NextResponse.json({
          text: `Please upload your resume before I analyze it and generate personalized interview questions.`,
          agentDomain: 'placement',
          toolResult: {
            ...statusResult,
            actionRequired: 'UPLOAD_RESUME',
            status: 'RESUME_REQUIRED',
            tool: 'get_resume_status',
            hasResume: false,
          },
        });
      }

      const toolResult = await globalToolGateway.executeTool(
        userId,
        {
          requestId: `req_${Date.now()}_q`,
          agentTaskId: taskId,
          conversationId: conversationId || '',
          turnId,
          tool: 'generate_interview_questions',
          arguments: {},
          userData,
        },
        { userData }
      );

      const resQuestions = (toolResult.data as any)?.questions || (toolResult.data as any) || [];
      const firstQ = resQuestions[0]?.question || 'Explain the architecture, concurrency model, and data tradeoffs in your primary project. How would you redesign it for 10x traffic?';
      return NextResponse.json({
        text: `Based on your analyzed resume, here is your interview question:\n\n"${firstQ}"\n\nTake a moment to structure your thoughts using the STAR framework.`,
        agentDomain: 'placement',
        toolResult,
      });
    }

    const resumeMatch = trimmedMsg.match(
      /(?:(?:review|check|look\s+(?:at|into)|analyze|go\s+through|evaluate|inspect|read|summarize|help\s+(?:me\s+)?with)\s+(?:my\s+)?resume)|(?:resume\s+(?:review|analysis|check|summary|defense))/i
    );
    if (resumeMatch) {
      const toolResult = await globalToolGateway.executeTool(
        userId,
        {
          requestId: reqId,
          agentTaskId: taskId,
          conversationId: conversationId || '',
          turnId,
          tool: 'get_resume_summary',
          arguments: {},
          userData,
        },
        { userData }
      );

      const hasResume = (toolResult.data as any)?.hasResume;
      if (!hasResume) {
        return NextResponse.json({
          text: `No resume is uploaded yet. Please upload your resume in the Placement tab or using the prompt in the sidebar to generate personalized interview questions and technical analysis.`,
          agentDomain: 'placement',
          toolResult: {
            ...toolResult,
            actionRequired: 'UPLOAD_RESUME',
            status: 'RESUME_REQUIRED',
            tool: 'get_resume_summary',
            hasResume: false,
          },
        });
      }

      const summary = (toolResult.data as any)?.summary || 'Resume analyzed.';
      const skills = (toolResult.data as any)?.skills || [];
      const projects = (toolResult.data as any)?.projects || [];
      const strengths = (toolResult.data as any)?.strengths || [];
      const skillsSnippet = skills.length > 0 ? `Verified skills include: ${skills.slice(0, 6).join(', ')}.` : '';
      const projectsSnippet = projects.length > 0 ? ` Key projects: ${projects.slice(0, 2).map((p: any) => p.title).join(' and ')}.` : '';
      const strengthsSnippet = strengths.length > 0 ? ` Core strengths: ${strengths.slice(0, 2).join('; ')}.` : '';

      return NextResponse.json({
        text: `I have analyzed your uploaded resume from Placement.\n\n${summary}\n\n${skillsSnippet}${projectsSnippet}${strengthsSnippet}\n\nWould you like to practice technical interview defense questions or run a targeted skill-gap analysis?`,
        agentDomain: 'placement',
        toolResult,
      });
    }

    let retrievalRecords: RetrievalRecord[] = [];

    if (userData) {
      retrievalRecords = adaptUserRecords(userId, userData);
    } else if (userContext) {
      const synthesizedGoals = (userContext.activeGoals || []).map((g) => ({
        id: g.id,
        userId,
        title: g.title,
        domain: (g.domain || 'study') as any,
        priority: 'high' as const,
        status: 'in_progress' as const,
        progress: g.progress,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const synthesizedTasks = (userContext.pendingTasks || []).map((t) => ({
        id: t.id,
        userId,
        title: t.title,
        priority: (t.priority || 'medium') as any,
        domain: (t.domain || 'study') as any,
        status: 'pending' as const,
        isDeepWork: t.isDeepWork,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const synthesizedReflections = (userContext.recentReflections || []).map((r, i) => ({
        id: `ref_${i}`,
        userId,
        type: 'daily' as const,
        date: r.date,
        whatWorked: r.whatWorked,
        whatFailed: r.whatFailed,
        lessonsLearned: r.lessonsLearned,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      retrievalRecords = adaptUserRecords(userId, {
        goals: synthesizedGoals,
        tasks: synthesizedTasks,
        reflections: synthesizedReflections,
      });
    }

    const wantStream = (parsed.data as any).stream === true || req.headers.get('accept')?.includes('text/event-stream');
    let retrievedContextBlock = '';
    let searchResult: any = {
      results: [],
      executionStats: { totalRecordsSearched: 0, durationMs: 0 },
    };
    try {
      searchResult = await executeHybridRetrieval(message, retrievalRecords, {
        topK: 5,
        minScore: 0.24,
      });
      retrievedContextBlock = searchResult.formattedContextBlock || '';
    } catch (retrievalErr) {
      console.warn('Retrieval optimization notice:', retrievalErr);
    }

    const userResume = userData?.placementProfile?.resumeProfile;
    let resumeContextBlock = '';
    if (userResume && (userResume.summary || (userResume.skills && userResume.skills.length > 0))) {
      resumeContextBlock = `\nUSER UPLOADED RESUME (SOURCE OF TRUTH FROM PLACEMENT):\n` +
        `- Status: Uploaded and Verified\n` +
        (userResume.fileName ? `- File: ${userResume.fileName}\n` : '') +
        (userResume.summary ? `- Summary: ${userResume.summary}\n` : '') +
        (userResume.skills?.length ? `- Verified Skills: ${userResume.skills.join(', ')}\n` : '') +
        (userResume.strengths?.length ? `- Critical Strengths: ${userResume.strengths.join('; ')}\n` : '') +
        (userResume.gaps?.length ? `- Identified Gaps: ${userResume.gaps.join('; ')}\n` : '') +
        (userResume.projects?.length ? `- Key Projects: ${userResume.projects.map((p: any) => `${p.title} (${(p.techStack || []).join(', ')})`).join('; ')}\n` : '');
    } else {
      resumeContextBlock = `\nUSER RESUME STATUS: No resume uploaded yet in Placement. If the user asks you to analyze or check their resume, inform them directly that no resume is uploaded yet and prompt them to upload it in Placements.\n`;
    }

    const isCalendarConnected = ((body as any).calendarState === 'CONNECTED' || calendarStateManager.getState() === 'CONNECTED') && Boolean((body as any).calendarToken || calendarStateManager.getAccessToken());
    const calendarContextBlock = isCalendarConnected
      ? `\nGOOGLE CALENDAR STATUS: Connected.\n`
      : `\nGOOGLE CALENDAR STATUS: DISCONNECTED. If the user asks about schedule, meetings, agenda, upcoming events, or calendar, DO NOT hallucinate or claim there are no events. You MUST explicitly prompt the user: "Google Calendar is not connected yet. Please click 'Connect Calendar' in the high-priority event card on the right to authorize access."\n`;

    const systemPrompt = `You are LifeForge AI — a personal AI Life, Study & Career Coach for ambitious college students.

CORE COACHING PERSONALITY:
- DISCIPLINED, DIRECT, CALM, INTELLIGENT, SUPPORTIVE, NON-JUDGMENTAL, SOLUTION-ORIENTED, CURIOUS, PERSISTENT, REALISTIC, ACCOUNTABLE.
- You challenge excuses firmly but constructively: "Let's solve the next step", "That did not work. Let's change the approach."
- You never insult, shame, or encourage self-punishment (never withhold food, sleep, or rest as punishment).
- You translate strict discipline into safe accountability: schedule correction, recovery planning, priority reset, time-boxed recovery sprints.

PHILOSOPHY & PRINCIPLES:
1. Do the work you genuinely want to become excellent at.
2. Give sustained time and attention to meaningful goals.
3. Intentionality over blind imitation.
4. Learn through logic rather than rote memorization.
5. Practice repeatedly, ask questions, clear misconceptions, teach-back technique.
6. Something is better than nothing.
7. Focus on solutions: "Let's identify why, recover remaining time, and protect tomorrow."

ACTIVE SPECIALIST AGENTS:
1. Orchestrator: Dynamic routing and holistic life direction.
2. Study Agent: 25/5 Pomodoro focus blocks, teach-back active recall, spaced repetition.
3. Placement Agent: Technical interviews (DSA, System Design, OS, DBMS), resume defense, skill-gap analysis.
4. Wellbeing Agent: Energy protection, sleep consistency, burnout prevention.
5. Research Agent: Fresh industry, hiring, and company trend analysis.
6. Calendar Agent: Schedule optimization and protected study blocks.
7. Goal/Task Agent: Milestone goals and high-impact daily tasks.
8. Reflection Agent: Evidence-grounded weekly and daily progress analysis.
9. Safety Agent: Emotional grounding, stress stabilization, solution orientation.

USER PROFILE:
- Name: ${userProfile?.displayName || 'Student'}
- Primary Goal: ${userProfile?.primaryGoal || 'Master technical problem solving and build consistent daily discipline'}
- Target Placements: ${userProfile?.targetPlacements?.join(', ') || 'Tier-1 Engineering Roles'}
- Study Philosophy: ${userProfile?.studyPhilosophy || 'Learn through logic and consistent practice'}
- Current Active Domain: ${activeDomain || 'orchestrator'}
${rollingSummary ? `\nPRIOR CONVERSATION ROLLING SUMMARY:\n${rollingSummary}\n` : ''}
${resumeContextBlock}
${calendarContextBlock}
${retrievedContextBlock ? `${retrievedContextBlock}\n` : ''}

RESPONSE FORMAT REQUIREMENT:
Provide clear, disciplined, actionable coaching advice in clean, readable text. Avoid excessive symbols, hashtags, or markdown asterisk clutter. If you propose an actionable goal or task, enclose it at the end in:
<PROPOSED_ACTIONS>
{
  "domain": "study | placement | wellbeing | goal | reflection | orchestrator",
  "severity": "low | medium | high",
  "urgency": "low | medium | high",
  "proposedTask": "Optional title for a suggested deep work task",
  "proposedGoal": "Optional title for a suggested milestone goal"
}
</PROPOSED_ACTIONS>`;

    const contents: any[] = [];
    const recentHistory = conversationHistory.slice(-6);
    for (const turn of recentHistory) {
      contents.push({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const isPlacementResearch =
      message.toLowerCase().includes('company') ||
      message.toLowerCase().includes('internship') ||
      message.toLowerCase().includes('hiring') ||
      message.toLowerCase().includes('opening') ||
      message.toLowerCase().includes('trend') ||
      activeDomain === 'research';

    const toolsConfig: any[] = [];
    if (isPlacementResearch) {
      toolsConfig.push({ googleSearch: {} });
    }

    if (wantStream) {
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.8-flash',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
          ...(toolsConfig.length > 0 ? { tools: toolsConfig } : {}),
        },
      });

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let fullText = '';
            let sentLength = 0;
            let groundingMetadata: any = null;

            for await (const chunk of responseStream) {
              const chunkText = chunk.text || '';
              if (chunkText) {
                fullText += chunkText;
                const tagIndex = fullText.search(/<PROPOSED_ACTIONS/i);
                const visibleText = tagIndex !== -1 ? fullText.slice(0, tagIndex) : fullText;
                if (visibleText.length > sentLength) {
                  const delta = visibleText.slice(sentLength);
                  sentLength = visibleText.length;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: delta })}\n\n`)
                  );
                }
              }
              if (chunk.candidates?.[0]?.groundingMetadata) {
                groundingMetadata = chunk.candidates[0].groundingMetadata;
              }
            }

            let cleanedText = fullText;
            let proposedActionData: any = null;

            const actionTagMatch = fullText.match(/<PROPOSED_ACTIONS>([\s\S]*?)<\/PROPOSED_ACTIONS>/);
            if (actionTagMatch) {
              proposedActionData = safeJsonParse(actionTagMatch[1].trim(), null);
              cleanedText = fullText.replace(/<PROPOSED_ACTIONS>[\s\S]*?<\/PROPOSED_ACTIONS>/, '').trim();
            }

            const donePayload = {
              type: 'done',
              text: cleanedText,
              proposedActions: proposedActionData,
              groundingMetadata,
              retrieval: {
                searchedCount: searchResult?.executionStats?.totalRecordsSearched || 0,
                matchedCount: searchResult?.results?.length || 0,
                durationMs: searchResult?.executionStats?.durationMs || 0,
                matchedItems: (searchResult?.results || []).map((r: any) => ({
                  id: r.id,
                  type: r.type,
                  title: r.title,
                  score: r.score,
                  matchTypes: r.matchTypes,
                })),
              },
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(donePayload)}\n\n`));
            controller.close();
          } catch (err: any) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Streaming failed' })}\n\n`)
            );
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        ...(toolsConfig.length > 0 ? { tools: toolsConfig } : {}),
      },
    });

    const fullText = response.text || '';
    let cleanedText = fullText;
    let proposedActionData: any = null;

    const actionTagMatch = fullText.match(/<PROPOSED_ACTIONS>([\s\S]*?)<\/PROPOSED_ACTIONS>/);
    if (actionTagMatch) {
      proposedActionData = safeJsonParse(actionTagMatch[1].trim(), null);
      cleanedText = fullText.replace(/<PROPOSED_ACTIONS>[\s\S]*?<\/PROPOSED_ACTIONS>/, '').trim();
    }

    return NextResponse.json({
      text: cleanedText,
      proposedActions: proposedActionData,
      groundingMetadata: response.candidates?.[0]?.groundingMetadata || null,
      retrieval: {
        searchedCount: searchResult?.executionStats?.totalRecordsSearched || 0,
        matchedCount: searchResult?.results?.length || 0,
        durationMs: searchResult?.executionStats?.durationMs || 0,
        matchedItems: (searchResult?.results || []).map((r: any) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          score: r.score,
          matchTypes: r.matchTypes,
        })),
      },
    });
  } catch (error: any) {
    console.error('Gemini Coach API Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate coaching response',
        fallback: true,
      },
      { status: 500 }
    );
  }
}
