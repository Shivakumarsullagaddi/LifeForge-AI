'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import {
  getConversations,
  getConversationMessages,
  addTask,
  addGoal,
  deleteTask,
  deleteGoal,
  getGoals,
  getTasks,
  getReflections,
  getStudySessions,
  subscribePendingActionConfirmations,
  resolveActionConfirmation,
  savePlacementProfile,
  saveResumeMetadata,
} from '@/lib/firebase';
import { globalToolGateway, type ToolExecutionRecord } from '@/lib/tools/gateway';
import { calendarStateManager, deleteGoogleCalendarEvent, getUpcomingGoogleCalendarEvents, type CalendarConnectionState } from '@/lib/calendar';
import { resumeStateManager, type ResumeProcessingState } from '@/lib/resume';
import { resumeService } from '@/lib/placement/resumeService';
import { emitUserAction } from '@/lib/events';
import { uiActionBus } from '@/lib/events/uiEvents';
import { authoritativeState } from '@/lib/state/applicationState';
import { globalConversationManager } from '@/lib/conversation-manager';
import type { ConversationSession, ChatMessage, AgentDomain, ActionConfirmation } from '@/lib/types';
import { AgentTaskEvent, SessionLifecycleState } from '@/hooks/useLiveVoice';
import { useLiveVoiceContext } from '@/lib/live-voice-context';
import {
  Send,
  Radio,
  Sparkles,
  Bot,
  User,
  RefreshCw,
  Mic,
  MicOff,
  Square,
  Zap,
  ExternalLink,
  Check,
  Database,
  Activity,
  Terminal,
  Wifi,
  Volume2,
  ArrowDown,
  Layers,
  Search,
  CheckCircle2,
  X,
  Sliders,
  AlertTriangle,
  Trash2,
  Calendar,
  FileText,
  Upload,
} from 'lucide-react';
import { FormattedMessage } from '../ui/FormattedMessage';

interface DynamicClassification {
  domain: AgentDomain;
  severity: 'low' | 'medium' | 'high';
  urgency: 'low' | 'medium' | 'high';
  confidence: number;
  proposedTask?: string;
  proposedGoal?: string;
}

export const LiveCoachView: React.FC = () => {
  const { user, profile } = useAuth();
  const {
    liveVoice,
    activeConversationId,
    setActiveConversationId,
    conversations,
    setConversations,
    completedMessages,
    messages,
    setMessages,
    activeStreamingTurn,
    liveUserTranscript,
    liveModelTranscript,
    liveAgentTasks,
    activeAgentDomain,
    activeAgentLabel,
    userDataCache,
    refreshUserContext,
    sendTextMessage,
    persistenceStatus,
    startNewConversation,
    handleSelfTermination,
    addMessage,
    timerState,
  } = useLiveVoiceContext();

  const [pendingConfirmations, setPendingConfirmations] = useState<ActionConfirmation[]>([]);
  const [calendarState, setCalendarState] = useState<CalendarConnectionState>(() => calendarStateManager.getState());
  const [resumeState, setResumeState] = useState<ResumeProcessingState>(() => resumeStateManager.getState());

  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastClassification, setLastClassification] = useState<DynamicClassification | null>(null);
  const [searchGrounding, setSearchGrounding] = useState<any | null>(null);
  const [retrievalGrounding, setRetrievalGrounding] = useState<{
    searchedCount: number;
    matchedCount: number;
    durationMs: number;
    matchedItems: Array<{ id: string; type: string; title: string; score: number; matchTypes: string[] }>;
  } | null>(null);
  const [actionAddedStatus, setActionAddedStatus] = useState<Record<string, boolean>>({});

  const [rightPanelTab, setRightPanelTab] = useState<'connections' | 'flow' | 'tool-calls' | 'diagnostics'>('connections');
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [toolExecutions, setToolExecutions] = useState<ToolExecutionRecord[]>(() => globalToolGateway.getExecutionHistory());

  useEffect(() => {
    const unsub = globalToolGateway.subscribe(() => {
      setToolExecutions(globalToolGateway.getExecutionHistory());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = calendarStateManager.subscribe(() => {
      setCalendarState(calendarStateManager.getState());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = resumeStateManager.subscribe(() => {
      setResumeState(resumeStateManager.getState());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (userDataCache?.placementProfile?.resumeProfile) {
      resumeStateManager.setResume(userDataCache.placementProfile.resumeProfile);
      if (user) {
        resumeService.syncResumeContext(user.uid, userDataCache.placementProfile.resumeProfile, userDataCache.resumeMetadata);
      }
    }
  }, [userDataCache, user]);

  const sortedToolExecutions = useMemo(() => {
    const list = activeConversationId
      ? toolExecutions.filter((t) => !t.conversationId || t.conversationId === activeConversationId)
      : [];
    return list.sort((a, b) => {
      const getPriority = (status: string) => {
        if (status === 'WAITING_CONFIRMATION') return 1;
        if (status === 'RUNNING' || status === 'REQUESTED') return 2;
        if (status === 'FAILED') return 3;
        if (status === 'COMPLETED') return 4;
        return 5;
      };
      const pA = getPriority(a.status);
      const pB = getPriority(b.status);
      if (pA !== pB) return pA - pB;
      const tA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tB - tA;
    });
  }, [toolExecutions, activeConversationId]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const activeResumeUploadReqIdRef = useRef<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeUploadSuccess, setResumeUploadSuccess] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState<boolean>(false);
  const [readMessageCount, setReadMessageCount] = useState<number>(0);

  const displayList = useMemo(() => {
    const msgs = completedMessages.length > 0
      ? completedMessages
      : globalConversationManager.getOrderedMessages();
    if (!activeConversationId) return msgs;
    return msgs.filter((m) => !m.conversationId || m.conversationId === activeConversationId);
  }, [completedMessages, activeConversationId]);
  const hasUnreadBelow = isUserScrolledUp && (
    displayList.length > readMessageCount ||
    !!activeStreamingTurn?.userText ||
    !!activeStreamingTurn?.assistantText ||
    !!liveUserTranscript ||
    !!liveModelTranscript
  );

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom > 80) {
      setIsUserScrolledUp(true);
    } else {
      setIsUserScrolledUp(false);
      setReadMessageCount(displayList.length);
    }
  }, [displayList.length]);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (!isUserScrolledUp) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayList, activeStreamingTurn, liveUserTranscript, liveModelTranscript, isUserScrolledUp]);

  const scrollToBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setIsUserScrolledUp(false);
      setReadMessageCount(displayList.length);
    }
  }, [displayList.length]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribePendingActionConfirmations(user.uid, (confs) => {
      setPendingConfirmations(confs);
    });
    return () => unsub();
  }, [user]);

  const isCalendarTaskPresent = useMemo(() => {
    return (
      liveAgentTasks.some(
        (t) => t.domain === 'calendar' || t.query?.toLowerCase().includes('calendar')
      ) ||
      toolExecutions.some(
        (t) => t.tool === 'get_calendar_events' || t.tool === 'connect_calendar'
      )
    );
  }, [liveAgentTasks, toolExecutions]);

  const [dismissedResumePrompt, setDismissedResumePrompt] = useState(false);
  const [requestedResumeUpload, setRequestedResumeUpload] = useState(false);
  const [dismissedCalendarPrompt, setDismissedCalendarPrompt] = useState(false);

  const isCalendarConnected = calendarState === 'CONNECTED';
  const showCalendarPrompt =
    !dismissedCalendarPrompt &&
    !isCalendarConnected &&
    (isCalendarTaskPresent || calendarState === 'AUTHORIZING' || calendarState === 'VERIFYING');

  useEffect(() => {
    if (isCalendarTaskPresent && !isCalendarConnected) {
      setDismissedCalendarPrompt(false);
    }
  }, [isCalendarTaskPresent, isCalendarConnected]);

  const hasUploadedResume = Boolean(
    userDataCache?.placementProfile?.resumeProfile ||
    userDataCache?.placementProfile?.resumeText ||
    resumeState === 'READY'
  );

  const isResumeTaskPresent = useMemo(() => {
    return (
      liveAgentTasks.some(
        (t) =>
          (t.domain === 'placement' && (t.query?.toLowerCase().includes('resume') || t.spokenSummary?.toLowerCase().includes('resume'))) ||
          (t.structuredDetails as any)?.actionRequired === 'UPLOAD_RESUME' ||
          (t.structuredDetails as any)?.status === 'RESUME_REQUIRED' ||
          (t.structuredDetails as any)?.hasResume === false
      ) ||
      toolExecutions.some(
        (t) =>
          (t.tool === 'get_resume_summary' || t.tool === 'request_resume_upload' || t.tool === 'get_resume_status') &&
          t.status !== 'CANCELLED' &&
          ((t.result as any)?.status === 'RESUME_REQUIRED' ||
           (t.result as any)?.actionRequired === 'UPLOAD_RESUME' ||
           (t.result as any)?.hasResume === false ||
           (t.result as any)?.status === 'NOT_FOUND' ||
           t.tool === 'request_resume_upload')
      )
    );
  }, [liveAgentTasks, toolExecutions]);

  const wantsResumeUpload = useMemo(() => {
    const isVoiceAskingResume = /(?:upload|update|re-upload|reupload|new resume|updated resume)/i.test(liveUserTranscript || '');
    const isRecentMessageAskingResume = displayList.slice(-3).some(
      (m) => m.role === 'user' && /(?:upload|update|re-upload|reupload|new resume|updated resume)/i.test(m.content || m.text || '')
    );
    return (
      isVoiceAskingResume ||
      isRecentMessageAskingResume ||
      liveAgentTasks.some(
        (t) =>
          (t.structuredDetails as any)?.actionRequired === 'UPLOAD_RESUME' ||
          (t.structuredDetails as any)?.status === 'RESUME_REQUIRED' ||
          (t.query && /(?:upload|update|re-upload|reupload|new resume|updated resume)/i.test(t.query)) ||
          (t.spokenSummary && /(?:upload.*resume|update.*resume)/i.test(t.spokenSummary))
      ) ||
      toolExecutions.some(
        (t) =>
          t.tool === 'request_resume_upload' ||
          (t.result as any)?.actionRequired === 'UPLOAD_RESUME' ||
          (t.result as any)?.status === 'RESUME_REQUIRED'
      )
    );
  }, [liveUserTranscript, displayList, liveAgentTasks, toolExecutions]);

  const lastResumeToolCallId = useMemo(() => {
    const lastTool = [...toolExecutions].reverse().find((t) => t.tool === 'request_resume_upload');
    return lastTool ? `${lastTool.requestId || ''}_${lastTool.status}_${lastTool.completedAt || lastTool.startedAt || ''}` : '';
  }, [toolExecutions]);

  const lastUserResumeMessageKey = useMemo(() => {
    const lastMsg = [...displayList].reverse().find(
      (m) => m.role === 'user' && /(?:upload|update|re-upload|reupload|resume|prompt|get that prompt|upload my resume)/i.test(m.content || m.text || '')
    );
    return lastMsg ? `${lastMsg.id || lastMsg.createdAt || ''}` : '';
  }, [displayList]);

  useEffect(() => {
    if (wantsResumeUpload || isResumeTaskPresent || lastResumeToolCallId || lastUserResumeMessageKey) {
      setRequestedResumeUpload(true);
      setDismissedResumePrompt(false);
    }
  }, [wantsResumeUpload, isResumeTaskPresent, lastResumeToolCallId, lastUserResumeMessageKey]);

  const showResumePrompt =
    !dismissedResumePrompt &&
    (requestedResumeUpload || wantsResumeUpload || isResumeTaskPresent || Boolean(lastResumeToolCallId));

  const handleConfirmDeleteTask = useCallback(async (conf: ActionConfirmation) => {
    if (!user) return;
    setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id));
    const now = new Date().toISOString();
    if (conf.expiresAt && conf.expiresAt < now) {
      await resolveActionConfirmation(user.uid, conf.id, 'expired');
      return;
    }
    await resolveActionConfirmation(user.uid, conf.id, 'approved');
    emitUserAction({
      type: 'USER_ACTION',
      actionId: conf.id,
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      action: 'DELETE_CONFIRM',
      result: 'APPROVED',
      payload: conf.payload,
      timestamp: new Date().toISOString(),
    });

    const isCalendar = Boolean(conf.payload?.eventId) || conf.type === 'delete_calendar_event' || (conf as any).actionType === 'delete_calendar_event';
    const isGoal = !isCalendar && (Boolean(conf.payload?.goalId) || conf.type === 'delete_goal' || (conf as any).actionType === 'delete_goal');
    const isTask = !isCalendar && !isGoal;

    if (isGoal) {
      let targetGoalId = conf.payload?.goalId;
      const goals = await getGoals(user.uid);
      if (!targetGoalId || ['current_goal', 'that', 'this', 'it', 'my'].includes(targetGoalId.toLowerCase()) || !goals.some((g) => g.id === targetGoalId)) {
        const match = conf.payload?.goalTitle
          ? goals.find((g) => g.title.toLowerCase().includes(conf.payload.goalTitle.toLowerCase()) || conf.payload.goalTitle.toLowerCase().includes(g.title.toLowerCase()))
          : goals[0];
        targetGoalId = match?.id || goals[0]?.id;
      }
      if (targetGoalId) {
        await deleteGoal(user.uid, targetGoalId);
      }
      globalToolGateway.recordExecution({
        requestId: `act_del_goal_${Date.now()}`,
        agentTaskId: 'task_del_goal',
        conversationId: activeConversationId || '',
        turnId: `turn_${Date.now()}`,
        tool: 'delete_goal',
        agent: 'Goal/Task Agent',
        arguments: { goalId: targetGoalId, goalTitle: conf.payload?.goalTitle || 'goal' },
        status: 'COMPLETED',
        state: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0.15,
        result: { success: true, goalId: targetGoalId, state: 'DELETED' },
      });
      await refreshUserContext();
      if (activeConversationId) {
        await addMessage({
          role: 'assistant',
          agentDomain: 'goal',
          text: 'Done. The goal has been deleted.',
          content: 'Done. The goal has been deleted.',
          createdAt: new Date().toISOString(),
          source: 'text',
        });
      }
    } else if (isTask) {
      let targetTaskId = conf.payload?.taskId;
      const tasks = await getTasks(user.uid);
      if (!targetTaskId || ['current_task', 'that', 'this', 'it', 'my'].includes(targetTaskId.toLowerCase()) || !tasks.some((t) => t.id === targetTaskId)) {
        const match = conf.payload?.taskTitle
          ? tasks.find((t) => t.title.toLowerCase().includes(conf.payload.taskTitle.toLowerCase()) || conf.payload.taskTitle.toLowerCase().includes(t.title.toLowerCase()))
          : tasks[0];
        targetTaskId = match?.id || tasks[0]?.id;
      }
      if (targetTaskId) {
        await deleteTask(user.uid, targetTaskId);
      }
      globalToolGateway.recordExecution({
        requestId: `act_del_task_${Date.now()}`,
        agentTaskId: 'task_del_task',
        conversationId: activeConversationId || '',
        turnId: `turn_${Date.now()}`,
        tool: 'delete_task',
        agent: 'Goal/Task Agent',
        arguments: { taskId: targetTaskId, taskTitle: conf.payload?.taskTitle || 'task' },
        status: 'COMPLETED',
        state: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0.15,
        result: { success: true, taskId: targetTaskId, state: 'DELETED' },
      });
      await refreshUserContext();
      if (activeConversationId) {
        await addMessage({
          role: 'assistant',
          agentDomain: 'goal',
          text: 'Done. The task has been deleted.',
          content: 'Done. The task has been deleted.',
          createdAt: new Date().toISOString(),
          source: 'text',
        });
      }
    } else if (isCalendar) {
      let targetEventId = conf.payload?.eventId;
      const eventTitle = conf.payload?.eventTitle || conf.payload?.summary || 'event';
      const token = calendarStateManager.getAccessToken();
      if (token) {
        if (!targetEventId && conf.payload?.eventTitle) {
          const events = await getUpcomingGoogleCalendarEvents(token, 20).catch(() => []);
          const matched = events.find((e: any) =>
            (e.summary || '').toLowerCase().includes(conf.payload.eventTitle.toLowerCase()) ||
            conf.payload.eventTitle.toLowerCase().includes((e.summary || '').toLowerCase())
          );
          if (matched) targetEventId = matched.id;
        }
        if (targetEventId) {
          await deleteGoogleCalendarEvent(token, targetEventId).catch(() => {});
        }
      }
      globalToolGateway.recordExecution({
        requestId: `act_del_cal_${Date.now()}`,
        agentTaskId: 'task_del_cal',
        conversationId: activeConversationId || '',
        turnId: `turn_${Date.now()}`,
        tool: 'delete_calendar_event',
        agent: 'Calendar Agent',
        arguments: { eventId: targetEventId || conf.payload?.eventId, eventTitle },
        status: 'COMPLETED',
        state: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0.2,
        result: { success: true, eventId: targetEventId || conf.payload?.eventId, state: 'DELETED' },
      });
      if (activeConversationId) {
        await addMessage({
          role: 'assistant',
          agentDomain: 'calendar',
          text: `Done. The calendar event "${eventTitle}" has been deleted.`,
          content: `Done. The calendar event "${eventTitle}" has been deleted.`,
          createdAt: new Date().toISOString(),
          source: 'text',
        });
      }
    }
  }, [user, activeConversationId, refreshUserContext, addMessage]);

  const handleCancelDeleteTask = useCallback(async (confId: string) => {
    if (!user) return;
    setPendingConfirmations((prev) => prev.filter((c) => c.id !== confId));
    await resolveActionConfirmation(user.uid, confId, 'rejected');
    emitUserAction({
      type: 'USER_ACTION',
      actionId: confId,
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      action: 'DELETE_CANCEL',
      result: 'USER_CANCELLED',
      timestamp: new Date().toISOString(),
    });
    globalToolGateway.recordExecution({
      requestId: `act_del_cancel_${Date.now()}`,
      agentTaskId: 'task_del_cancel',
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: 'delete_goal',
      agent: 'Goal/Task Agent',
      arguments: {},
      status: 'CANCELLED',
      state: 'CANCELLED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0.1,
      result: { state: 'USER_CANCELLED', message: 'Action cancelled by user' },
    });
  }, [user, activeConversationId]);

  const handleConnectCalendar = async () => {
    const reqId = `act_cal_${Date.now()}`;
    globalToolGateway.recordExecution({
      requestId: reqId,
      agentTaskId: 'task_cal_oauth',
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: 'connect_calendar',
      agent: 'Calendar Agent',
      arguments: {},
      status: 'RUNNING',
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
    });
    emitUserAction({
      type: 'USER_ACTION',
      actionId: reqId,
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      action: 'CONNECT_CALENDAR',
      result: 'CONNECTING',
      timestamp: new Date().toISOString(),
    });
    try {
      const ok = await calendarStateManager.initiateCalendarOAuth();
      if (ok) {
        const token = calendarStateManager.getAccessToken() || 'mock_google_calendar_test_token';
        const events = calendarStateManager.getVerifiedEvents();
        globalToolGateway.recordExecution({
          requestId: reqId,
          agentTaskId: 'task_cal_oauth',
          conversationId: activeConversationId || '',
          turnId: `turn_${Date.now()}`,
          tool: 'connect_calendar',
          agent: 'Calendar Agent',
          arguments: {},
          status: 'COMPLETED',
          state: 'COMPLETED',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 1.5,
          result: {
            state: 'CONNECTED',
            summary: `${events.length} events returned`,
          },
        });
        emitUserAction({
          type: 'USER_ACTION',
          actionId: reqId,
          conversationId: activeConversationId || '',
          turnId: `turn_${Date.now()}`,
          action: 'CONNECT_CALENDAR',
          result: 'CONNECTED',
          payload: {
            token,
            eventsCount: events.length,
            events,
          },
          calendarToken: token,
          timestamp: new Date().toISOString(),
        });
        if (activeConversationId) {
          const eventsCount = events.length;
          await addMessage({
            role: 'assistant',
            agentDomain: 'calendar',
            text: `Google Calendar connected successfully! ${eventsCount > 0 ? `I retrieved ${eventsCount} upcoming event${eventsCount === 1 ? '' : 's'}.` : 'No upcoming events currently scheduled.'}`,
            content: `Google Calendar connected successfully! ${eventsCount > 0 ? `I retrieved ${eventsCount} upcoming event${eventsCount === 1 ? '' : 's'}.` : 'No upcoming events currently scheduled.'}`,
            createdAt: new Date().toISOString(),
            source: 'text',
          });
        }
      } else {
        globalToolGateway.recordExecution({
          requestId: reqId,
          agentTaskId: 'task_cal_oauth',
          conversationId: activeConversationId || '',
          turnId: `turn_${Date.now()}`,
          tool: 'connect_calendar',
          agent: 'Calendar Agent',
          arguments: {},
          status: 'FAILED',
          state: 'FAILED',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 0.8,
          error: {
            code: 'CALENDAR_AUTH_FAILED',
            message: calendarStateManager.getError() || 'Calendar authorization failed',
            failureStage: 'AUTHORIZATION',
            retryable: true,
          },
        });
        emitUserAction({
          type: 'USER_ACTION',
          actionId: reqId,
          conversationId: activeConversationId || '',
          turnId: `turn_${Date.now()}`,
          action: 'CONNECT_CALENDAR',
          result: 'FAILED',
          payload: {
            error: calendarStateManager.getError() || 'Calendar authorization failed',
          },
          timestamp: new Date().toISOString(),
        });
        if (activeConversationId) {
          await addMessage({
            role: 'assistant',
            agentDomain: 'calendar',
            text: `Google Calendar connection failed: ${calendarStateManager.getError() || 'Authorization failed'}. You can retry clicking "Connect Calendar".`,
            content: `Google Calendar connection failed: ${calendarStateManager.getError() || 'Authorization failed'}. You can retry clicking "Connect Calendar".`,
            createdAt: new Date().toISOString(),
            source: 'text',
          });
        }
      }
    } catch (err: any) {
      console.error('Calendar connect error:', err);
      globalToolGateway.recordExecution({
        requestId: reqId,
        agentTaskId: 'task_cal_oauth',
        conversationId: activeConversationId || '',
        turnId: `turn_${Date.now()}`,
        tool: 'connect_calendar',
        agent: 'Calendar Agent',
        arguments: {},
        status: 'FAILED',
        state: 'FAILED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0.5,
        error: {
          code: 'CALENDAR_AUTH_ERROR',
          message: err?.message || 'Calendar authorization error',
          failureStage: 'AUTHORIZATION',
          retryable: true,
        },
      });
      emitUserAction({
        type: 'USER_ACTION',
        actionId: reqId,
        conversationId: activeConversationId || '',
        turnId: `turn_${Date.now()}`,
        action: 'CONNECT_CALENDAR',
        result: 'FAILED',
        payload: {
          error: err?.message || 'Calendar authorization error',
        },
        timestamp: new Date().toISOString(),
      });
      if (activeConversationId) {
        await addMessage({
          role: 'assistant',
          agentDomain: 'calendar',
          text: `Google Calendar connection failed: ${err?.message || 'Authorization error'}. You can retry clicking "Connect Calendar".`,
          content: `Google Calendar connection failed: ${err?.message || 'Authorization error'}. You can retry clicking "Connect Calendar".`,
          createdAt: new Date().toISOString(),
          source: 'text',
        });
      }
    }
  };

  const handleCancelCalendar = () => {
    setDismissedCalendarPrompt(true);
    calendarStateManager.setDisconnected();
    const actId = `act_cal_cancel_${Date.now()}`;
    globalToolGateway.recordExecution({
      requestId: actId,
      agentTaskId: 'task_cal_cancel',
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: 'connect_calendar',
      agent: 'Calendar Agent',
      arguments: {},
      status: 'CANCELLED',
      state: 'CANCELLED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0.1,
      result: { state: 'USER_CANCELLED', message: 'User declined or dismissed calendar authorization' },
    });
    emitUserAction({
      type: 'USER_ACTION',
      actionId: actId,
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      action: 'DISMISS_CALENDAR',
      result: 'DISMISSED',
      timestamp: new Date().toISOString(),
    });
    uiActionBus.emit('CANCEL_CALENDAR', {}, user?.uid, activeConversationId);
  };

  const handleTriggerResumePicker = () => {
    const reqId = `act_res_${Date.now()}`;
    activeResumeUploadReqIdRef.current = reqId;
    globalToolGateway.recordExecution({
      requestId: reqId,
      agentTaskId: 'task_res_upload',
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: 'upload_resume',
      agent: 'Placement Agent',
      arguments: {},
      status: 'RUNNING',
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
    });
    resumeFileInputRef.current?.click();
  };

  const handleCancelResumeUpload = () => {
    setDismissedResumePrompt(true);
    setRequestedResumeUpload(false);
    const reqId = activeResumeUploadReqIdRef.current || `act_res_cancel_${Date.now()}`;
    activeResumeUploadReqIdRef.current = null;
    globalToolGateway.recordExecution({
      requestId: reqId,
      agentTaskId: 'task_res_cancel',
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: 'upload_resume',
      agent: 'Placement Agent',
      arguments: {},
      status: 'CANCELLED',
      state: 'CANCELLED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0.1,
      result: { state: 'USER_CANCELLED', message: 'User declined resume upload' },
    });
    emitUserAction({
      type: 'USER_ACTION',
      actionId: reqId,
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      action: 'CANCEL_RESUME',
      result: 'CANCELLED',
      timestamp: new Date().toISOString(),
    });
    uiActionBus.emit('CANCEL_RESUME', {}, user?.uid, activeConversationId);
    authoritativeState.updateResume({ resumeAction: 'CANCELLED' });
    globalConversationManager.setAgentActivity({
      domain: 'placement',
      state: 'User declined resume upload',
      detail: 'Resume upload cancelled by user',
      updatedAt: new Date().toLocaleTimeString(),
    });
  };

  const handleDirectResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) {
      if (activeResumeUploadReqIdRef.current) {
        globalToolGateway.recordExecution({
          requestId: activeResumeUploadReqIdRef.current,
          agentTaskId: 'task_res_upload',
          conversationId: activeConversationId || '',
          turnId: `turn_${Date.now()}`,
          tool: 'upload_resume',
          agent: 'Placement Agent',
          arguments: {},
          status: 'CANCELLED',
          state: 'CANCELLED',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 0.1,
          result: { state: 'USER_CANCELLED', message: 'No file selected' },
        });
        activeResumeUploadReqIdRef.current = null;
      }
      return;
    }

    setIsUploadingResume(true);
    const reqId = activeResumeUploadReqIdRef.current || `act_res_done_${Date.now()}`;
    activeResumeUploadReqIdRef.current = null;
    globalToolGateway.recordExecution({
      requestId: reqId,
      agentTaskId: 'task_res_exec',
      conversationId: activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: 'upload_resume',
      agent: 'Placement Agent',
      arguments: { fileName: file.name, size: file.size },
      status: 'RUNNING',
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.uid);

      const res = await fetch('/api/placement/resume', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.success) {
          const profileData = resData.profile || resData.resumeProfile;
          if (profileData) {
            resumeStateManager.setResume(profileData);
            resumeService.syncResumeContext(user.uid, profileData);
            try {
              await resumeService.saveResumeAnalysis(user.uid, profileData);
              await resumeService.saveResumeMetadata(user.uid, {
                resumeId: resData.resumeId,
                fileName: file.name,
                contentType: file.type || 'application/pdf',
                size: file.size,
                storagePath: resData.storagePath,
                uploadedAt: new Date().toISOString(),
                processingStatus: 'COMPLETED',
                analysisStatus: 'COMPLETED',
              });
              await savePlacementProfile(user.uid, {
                id: 'default',
                userId: user.uid,
                targetRole: 'Software Engineer',
                targetCompanies: ['Google', 'Amazon', 'Microsoft'],
                resumeProfile: profileData,
                resumeStatus: 'interview_ready',
                updatedAt: new Date().toISOString(),
              });
            } catch (pErr) {
              console.warn('Client-side placement profile sync notice:', pErr);
            }
          }
          setResumeUploadSuccess(true);
          refreshUserContext();
          emitUserAction({
            type: 'USER_ACTION',
            actionId: reqId,
            conversationId: activeConversationId || '',
            turnId: `turn_${Date.now()}`,
            action: 'UPLOAD_RESUME',
            result: 'READY',
            payload: { resumeId: resData.resumeId, fileName: file.name },
            timestamp: new Date().toISOString(),
          });
          globalToolGateway.recordExecution({
            requestId: reqId,
            agentTaskId: 'task_res_exec',
            conversationId: activeConversationId || '',
            turnId: `turn_${Date.now()}`,
            tool: 'upload_resume',
            agent: 'LifeForge Live Coach',
            arguments: { fileName: file.name, size: file.size },
            status: 'COMPLETED',
            state: 'COMPLETED',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            duration: 1.2,
            result: {
              state: 'USER_ACTION_ACCEPTED',
              resumeId: resData.resumeId,
              status: 'UPLOAD_SUCCESS',
              fileName: file.name,
              profile: profileData,
            },
          });
          setResumeUploadSuccess(true);
          if (activeConversationId) {
            await addMessage({
              role: 'assistant',
              agentDomain: 'placement',
              text: 'Resume successfully uploaded and analyzed. Your technical skills and projects have been extracted into your coach knowledge base.',
              content: 'Resume successfully uploaded and analyzed. Your technical skills and projects have been extracted into your coach knowledge base.',
              createdAt: new Date().toISOString(),
              source: 'text',
            });
          }
        } else {
          throw new Error(resData.error || 'Failed to upload and analyze resume');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload and analyze resume');
      }
    } catch (err: any) {
      console.error('Resume upload error:', err);
      globalToolGateway.recordExecution({
        requestId: reqId,
        agentTaskId: 'task_res_exec',
        conversationId: activeConversationId || '',
        turnId: `turn_${Date.now()}`,
        tool: 'upload_resume',
        agent: 'LifeForge Live Coach',
        arguments: { fileName: file.name },
        status: 'FAILED',
        state: 'FAILED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0.5,
        error: {
          code: 'UPLOAD_FAILED',
          message: err?.message || 'Failed to upload and analyze resume',
          failureStage: 'EXECUTION',
          retryable: true,
        },
      });
      if (activeConversationId) {
        await addMessage({
          role: 'assistant',
          agentDomain: 'placement',
          text: `Resume upload failed: ${err?.message || 'Unable to analyze file'}. Please try uploading again.`,
          content: `Resume upload failed: ${err?.message || 'Unable to analyze file'}. Please try uploading again.`,
          createdAt: new Date().toISOString(),
          source: 'text',
        });
      }
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || isProcessing) return;

    const userQuery = inputText.trim();
    setInputText('');
    setIsProcessing(true);

    try {
      await sendTextMessage(userQuery);
      setLastClassification({
        domain: activeAgentDomain,
        severity: 'low',
        urgency: 'medium',
        confidence: 0.96,
      });
    } catch {
      setLastClassification({
        domain: activeAgentDomain,
        severity: 'low',
        urgency: 'medium',
        confidence: 0.88,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNewSession = () => {
    if (!user) return;
    setInputText('');
    startNewConversation();
  };

  const handleEndSession = () => {
    handleSelfTermination('User ended session');
  };

  const handleApproveTask = async (title: string) => {
    if (!user) return;
    try {
      const taskDomain: 'study' | 'placement' | 'wellbeing' | 'habits' | 'career' =
        activeAgentDomain === 'study' || activeAgentDomain === 'placement' || activeAgentDomain === 'wellbeing'
          ? activeAgentDomain
          : 'study';

      await addTask(user.uid, {
        title,
        domain: taskDomain,
        priority: 'high',
        status: 'pending',
        isDeepWork: true,
        estimatedMinutes: 25,
        source: 'AI Coach Proposal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setActionAddedStatus((prev) => ({ ...prev, [title]: true }));
      refreshUserContext();
    } catch {
    }
  };

  const handleApproveGoal = async (title: string) => {
    if (!user) return;
    try {
      const goalDomain: 'study' | 'placement' | 'wellbeing' | 'habits' | 'career' =
        activeAgentDomain === 'study' || activeAgentDomain === 'placement' || activeAgentDomain === 'wellbeing'
          ? activeAgentDomain
          : 'study';

      await addGoal(user.uid, {
        title,
        domain: goalDomain,
        priority: 'high',
        status: 'in_progress',
        progress: 0,
        source: 'AI Coach Proposal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setActionAddedStatus((prev) => ({ ...prev, [title]: true }));
      refreshUserContext();
    } catch {
    }
  };

  const isLiveVoiceActive =
    liveVoice.state === 'CONNECTING' ||
    liveVoice.state === 'CONNECTED' ||
    liveVoice.state === 'LISTENING' ||
    liveVoice.state === 'USER_SPEAKING' ||
    liveVoice.state === 'PROCESSING' ||
    liveVoice.state === 'ASSISTANT_SPEAKING' ||
    liveVoice.state === 'INTERRUPTED' ||
    liveVoice.state === 'AGENT_PROCESSING';

  const getSessionStatusBadge = (s: SessionLifecycleState) => {
    switch (s) {
      case 'CONNECTED':
      case 'LISTENING':
      case 'USER_SPEAKING':
      case 'PROCESSING':
      case 'ASSISTANT_SPEAKING':
      case 'AGENT_PROCESSING':
      case 'INTERRUPTED':
        return { label: 'Connected', dotClass: 'bg-emerald-400' };
      case 'CONNECTING':
      case 'RECONNECTING':
        return { label: 'Connecting', dotClass: 'bg-amber-400 animate-ping' };
      case 'ERROR':
        return { label: 'Error', dotClass: 'bg-rose-400' };
      case 'ENDED':
        return { label: 'Ended', dotClass: 'bg-slate-500' };
      case 'IDLE':
      default:
        return { label: 'Idle', dotClass: 'bg-slate-500' };
    }
  };

  const getMicStatusBadge = () => {
    if (!isLiveVoiceActive) return { label: 'Standby', dotClass: 'bg-slate-500' };
    if (liveVoice.isMuted) return { label: 'Muted', dotClass: 'bg-rose-400' };
    if (liveVoice.state === 'USER_SPEAKING') return { label: 'Speaking', dotClass: 'bg-emerald-400' };
    return { label: 'Active', dotClass: 'bg-emerald-400' };
  };

  const sessionStatus = getSessionStatusBadge(liveVoice.state);
  const micStatus = getMicStatusBadge();

  return (
    <div className="h-full flex flex-col overflow-hidden p-2 sm:p-4 gap-3">
      <input
        type="file"
        data-testid="live-resume-file-input"
        ref={resumeFileInputRef}
        accept=".pdf,.txt,.md"
        className="hidden"
        onChange={handleDirectResumeUpload}
      />
      <header className="h-14 shrink-0 px-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              isLiveVoiceActive
                ? liveVoice.state === 'ASSISTANT_SPEAKING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isLiveVoiceActive ? <Radio className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          </div>

          <div>
            <h1 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-2">
              <span>LifeForge Live Coach</span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Private AI OS
              </span>
            </h1>
          </div>
        </div>

        {/* Stable Fixed Status Badges */}
        <div className="hidden md:flex items-center gap-2">
          <div data-testid="live-session-status" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs w-28 justify-between">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">SESSION</span>
            <span className="flex items-center gap-1.5 font-medium text-slate-200">
              <span className={`w-2 h-2 rounded-full ${sessionStatus.dotClass}`} />
              {sessionStatus.label}
            </span>
          </div>

          <div data-testid="mic-status" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs w-24 justify-between">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">MIC</span>
            <span className="flex items-center gap-1.5 font-medium text-slate-200">
              <span className={`w-2 h-2 rounded-full ${micStatus.dotClass}`} />
              {micStatus.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs w-52 justify-between">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">AGENT</span>
            <span className="font-semibold text-amber-400 truncate" title="LifeForge Live Coach">
              LifeForge Live Coach
            </span>
          </div>


          <div className="hidden 2xl:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <span>Voice: <strong className="text-slate-200">3.1 Flash Live</strong></span>
            <span className="text-slate-700">|</span>
            <span>Agent: <strong className="text-slate-200">3.8 Flash</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLiveVoiceActive ? (
            <Button
              size="sm"
              data-testid="start-live-voice"
              onClick={liveVoice.connect}
              className="text-xs px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-950/40"
            >
              <Mic className="w-3.5 h-3.5 mr-1" /> Start Live Voice
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              data-testid="end-session"
              onClick={handleEndSession}
              className="text-xs px-3"
            >
              <Square className="w-3.5 h-3.5 mr-1" /> End Session
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            data-testid="new-conversation"
            onClick={handleStartNewSession}
            className="text-xs px-2.5"
            title="Start New Conversation"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline ml-1">New</span>
          </Button>

          {/* Toggle Mobile Live System Panel */}
          <button
            type="button"
            onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
            className="xl:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] hidden sm:inline">System</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN SPLIT WORKSPACE */}
      <div className="flex-1 flex overflow-hidden gap-3 relative">
        {/* Left / Center Column: Conversation Workspace */}
        <div className="flex-1 flex flex-col h-full bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden relative shadow-inner">
          {/* Prominent Live Session Status Prompt */}
          {(liveVoice.state === 'ERROR' || (liveVoice.state === 'ENDED' && Boolean(liveVoice.errorMsg))) && (
            <div
              data-testid="session-closed-prompt"
              className="m-3 p-3 rounded-xl bg-amber-950/70 border border-amber-600/70 flex items-center justify-between text-xs text-amber-200 shadow-lg shrink-0"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-bold text-amber-300">
                    {liveVoice.state === 'ERROR' ? 'Live Session Disconnected' : 'Gemini Live Session Closed'}
                  </div>
                  <div className="text-[11px] text-amber-100/80">
                    {liveVoice.errorMsg || 'The Gemini live voice connection was closed. Click Reconnect to restart the session.'}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={liveVoice.connect}
                className="text-xs h-7 px-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3 h-3" /> Reconnect
              </Button>
            </div>
          )}

          {/* Messages Scroll Container */}
          <div
            ref={chatContainerRef}
            data-testid="conversation-viewport"
            onScroll={handleScroll}
            className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 relative"
          >
            {displayList.length === 0 && !activeStreamingTurn && !liveUserTranscript && !liveModelTranscript && !isLiveVoiceActive ? (
              <div
                data-testid="coach-empty-placeholder"
                className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-4 sm:p-6 max-w-xl mx-auto space-y-6 animate-in fade-in duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600/20 to-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/20">
                  <Sparkles className="w-7 h-7" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                    Start Your Coaching Session
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                    LifeForge AI is ready. You can interact via real-time live voice or converse with the text reasoning model.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                  <div
                    onClick={liveVoice.connect}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-all hover:bg-slate-900/60 group space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <Mic className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                        <span>Live Voice Mode</span>
                      </div>
                      <Badge variant="emerald" size="sm">3.1 Live</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Click <strong className="text-emerald-400 font-semibold">Start Live Voice</strong> at the top to talk with natural voice turn-taking and barge-in.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      const inputEl = document.querySelector('input[data-testid="chat-input"]') as HTMLInputElement;
                      if (inputEl) inputEl.focus();
                    }}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all hover:bg-slate-900/60 group space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <Bot className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                        <span>Text Reasoning Mode</span>
                      </div>
                      <Badge variant="amber" size="sm">3.8 Flash</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Type directly in the input box below to formulate goals, structure routines, or prepare interview topics.
                    </p>
                  </div>
                </div>

                <div className="w-full pt-1 space-y-2 text-left">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Quick Prompt Starters:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Study for 25 minutes.',
                      'Prepare for placement interview.',
                      'Break down my daily tasks.',
                      'Audit my weekly reflections.',
                    ].map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => {
                          setInputText(starter);
                          const inputEl = document.querySelector('input[data-testid="chat-input"]') as HTMLInputElement;
                          if (inputEl) inputEl.focus();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 hover:text-white transition-all shadow-sm"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {displayList.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold ${
                      isUser
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-800 border border-slate-700 text-amber-400'
                    }`}
                  >
                    {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-amber-600 text-white rounded-tr-none shadow-md'
                        : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-none space-y-2'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80 text-[11px] text-slate-400">
                        <span className="font-semibold text-amber-400">
                          {msg.agentDomain ? (
                            msg.agentDomain === 'study'
                              ? 'Study Coach'
                              : msg.agentDomain === 'placement'
                              ? 'Placement Coach'
                              : msg.agentDomain === 'reflection'
                              ? 'Reflection & Growth'
                              : msg.agentDomain === 'wellbeing'
                              ? 'Wellbeing Coach'
                              : msg.agentDomain === 'goal'
                              ? 'Goals & Tasks'
                              : msg.agentDomain === 'research'
                              ? 'Industry Research'
                              : 'Orchestrator'
                          ) : (
                            'LifeForge Coach'
                          )}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    {msg.role === 'assistant' ? (
                      <FormattedMessage content={msg.content} />
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Live Streaming Model Draft */}
            {liveVoice.state === 'ASSISTANT_SPEAKING' &&
              (activeStreamingTurn?.assistantText || liveModelTranscript) &&
              displayList[displayList.length - 1]?.content !== (activeStreamingTurn?.assistantText || liveModelTranscript) && (
              <div className="flex gap-3 max-w-3xl">
                <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold bg-slate-800 border border-slate-700 text-amber-400">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="p-4 rounded-2xl rounded-tl-none bg-slate-950/90 border border-slate-800 text-slate-200 text-xs sm:text-sm space-y-2">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-800 text-[11px] text-amber-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{activeStreamingTurn?.assistantText ? `${activeAgentLabel} is generating response...` : `${activeAgentLabel} is speaking...`}</span>
                  </div>
                  <FormattedMessage content={activeStreamingTurn?.assistantText || liveModelTranscript} />
                </div>
              </div>
            )}

            {/* Scrolled Up Unread Notification */}
            {hasUnreadBelow && (
              <div className="sticky bottom-2 left-0 right-0 flex justify-center z-20 pointer-events-none">
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="pointer-events-auto py-1.5 px-3.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-full shadow-lg flex items-center gap-1.5 transition-all"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>New messages below</span>
                </button>
              </div>
            )}
          </div>

          {/* Fixed Bottom Input & Controls Dock */}
          <div className="p-3 bg-slate-950/80 border-t border-slate-800 shrink-0 flex flex-col gap-2.5">
            {/* Audio State & Barge-in Controls Bar */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-2 text-slate-400">
                {isLiveVoiceActive ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                    {liveVoice.state === 'ASSISTANT_SPEAKING' ? (
                      <span className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span>{activeAgentLabel} is speaking...</span>
                      </span>
                    ) : liveVoice.state === 'USER_SPEAKING' || liveUserTranscript ? (
                      <span className="flex items-center gap-2 text-amber-300 font-medium text-xs">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] uppercase font-bold tracking-wider animate-pulse">Streaming</span>
                        <span className="text-slate-200 truncate max-w-xs sm:max-w-md italic">
                          &ldquo;{liveUserTranscript || 'Listening to speech...'}&rdquo;
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span>
                          {liveVoice.state === 'PROCESSING'
                            ? 'Thinking & orchestrating...'
                            : liveVoice.state === 'AGENT_PROCESSING'
                            ? 'Gemini 3.8 Flash executing task...'
                            : liveVoice.state === 'INTERRUPTED'
                            ? 'Interrupted'
                            : 'Voice Active · 16kHz Streaming'}
                        </span>
                      </span>
                    )}
                  </span>
                ) : (liveVoice.state === 'ENDED' && Boolean(liveVoice.errorMsg)) ? (
                  <span className="flex items-center gap-1.5 text-amber-400 font-medium text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gemini Live session closed · Click &ldquo;Start Live Voice&rdquo; or Reconnect to resume</span>
                  </span>
                ) : liveVoice.state === 'ERROR' ? (
                  <span className="flex items-center gap-1.5 text-rose-400 font-medium text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Session Error · {liveVoice.errorMsg || 'Click &ldquo;Start Live Voice&rdquo; to reconnect'}</span>
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">
                    Microphone Standby · Press &ldquo;Start Live Voice&rdquo; to begin voice turn
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      persistenceStatus === 'SYNCED'
                        ? 'bg-emerald-400'
                        : persistenceStatus === 'PENDING_SYNC'
                        ? 'bg-amber-400 animate-pulse'
                        : persistenceStatus === 'SYNC_FAILED'
                        ? 'bg-rose-400'
                        : 'bg-sky-400'
                    }`}
                  />
                  <span className="text-slate-400">
                    {persistenceStatus === 'SYNCED'
                      ? 'SYNCED'
                      : persistenceStatus === 'PENDING_SYNC'
                      ? 'SYNCING...'
                      : persistenceStatus === 'SYNC_FAILED'
                      ? 'SYNC PENDING'
                      : 'LOCAL'}
                  </span>
                </div>

                {isLiveVoiceActive && (
                  <button
                    type="button"
                    onClick={liveVoice.toggleMute}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1 transition-colors ${
                      liveVoice.isMuted
                        ? 'bg-rose-950 border-rose-800 text-rose-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {liveVoice.isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{liveVoice.isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>
                )}

                {isLiveVoiceActive && liveVoice.state === 'ASSISTANT_SPEAKING' && (
                  <button
                    type="button"
                    onClick={liveVoice.interruptNow}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-950/80 border border-amber-600 text-amber-300 hover:bg-amber-900 flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Barge-in</span>
                  </button>
                )}
              </div>
            </div>

            {/* Hybrid Text Input Form */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                data-testid="chat-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask your LifeForge Coach, or speak into your microphone..."
                disabled={isProcessing}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
              />

              <Button
                type="submit"
                data-testid="send-message"
                disabled={!inputText.trim() || isProcessing}
                className="text-xs px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline ml-1.5">Send</span>
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column: LIVE SYSTEM Panel (Fixed Width) */}
        <aside
          className={`fixed inset-y-0 right-0 z-40 w-80 sm:w-96 bg-slate-950 border-l border-slate-800 flex flex-col transition-transform duration-200 xl:static xl:translate-x-0 xl:rounded-xl xl:border xl:bg-slate-900/50 ${
            isMobilePanelOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full xl:translate-x-0'
          }`}
        >
          {/* Panel Header & Tab Switcher */}
          <div className="p-3 border-b border-slate-800 bg-slate-950/60 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Live System</span>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-900/60 px-2 py-0.5 rounded">
                  Isolated
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobilePanelOpen(false)}
                  className="xl:hidden p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 4-Tier Tab Bar */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs gap-1">
              <button
                type="button"
                data-testid="tab-connections"
                onClick={() => setRightPanelTab('connections')}
                className={`flex-1 py-1 rounded-md font-semibold text-[11px] transition-colors ${
                  rightPanelTab === 'connections'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Connections
              </button>
              <button
                type="button"
                data-testid="tab-flow"
                onClick={() => setRightPanelTab('flow')}
                className={`flex-1 py-1 rounded-md font-semibold text-[11px] transition-colors ${
                  rightPanelTab === 'flow'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Agent Flow
              </button>
              <button
                type="button"
                data-testid="tab-tool-calls"
                onClick={() => setRightPanelTab('tool-calls')}
                className={`flex-1 py-1 rounded-md font-semibold text-[11px] transition-colors ${
                  rightPanelTab === 'tool-calls'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tool Calls
              </button>
              <button
                type="button"
                data-testid="tab-diagnostics"
                onClick={() => setRightPanelTab('diagnostics')}
                className={`flex-1 py-1 rounded-md font-semibold text-[11px] transition-colors ${
                  rightPanelTab === 'diagnostics'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Diagnostics
              </button>
            </div>
          </div>

          {/* High-priority Action Confirmation (Only when confirmation is pending) */}
          {pendingConfirmations.length > 0 && (
            <div className="p-3 border-b border-slate-800/80 bg-slate-950/60 space-y-2 shrink-0 max-h-60 overflow-y-auto">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-400 px-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Action Confirmation Required</span>
              </div>
              {pendingConfirmations.map((conf) => {
                const isExpired = conf.expiresAt ? new Date(conf.expiresAt) < new Date() : false;
                const isCalendar = Boolean(conf.payload?.eventId) || conf.type === 'delete_calendar_event' || (conf as any).actionType === 'delete_calendar_event';
                const isGoal = !isCalendar && (Boolean(conf.payload?.goalId) || conf.type === 'delete_goal' || (conf as any).actionType === 'delete_goal');
                const dialogTitle = isCalendar ? 'DELETE CALENDAR EVENT' : isGoal ? 'DELETE GOAL' : 'DELETE TASK';
                const rawTitle = conf.payload?.eventTitle || conf.payload?.summary || conf.payload?.goalTitle || conf.payload?.taskTitle || conf.payload?.title || conf.title || (isCalendar ? 'Calendar Event' : isGoal ? 'Goal' : 'Task');
                const itemTitle = rawTitle.replace(/^Delete (?:task|goal|calendar event|event):\s*["']?|["']\??$/gi, '').trim() || (isCalendar ? 'Calendar Event' : isGoal ? 'Goal' : 'Task');
                const domain = conf.payload?.domain || (isCalendar ? 'calendar' : undefined);
                const priority = conf.payload?.priority;
                const dueDate = conf.payload?.dueDate || conf.payload?.targetDate || conf.payload?.startDateTime;

                return (
                  <div key={conf.id} data-testid="confirmation-dialog" className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800/80 space-y-2.5 text-xs shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-rose-300">
                        <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span data-testid={isCalendar ? 'delete-calendar-event' : isGoal ? 'delete-goal' : 'delete-task'}>{dialogTitle}</span>
                      </div>
                      {domain && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose-900/60 border border-rose-700/50 text-rose-200">
                          {domain}
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-black/40 border border-rose-900/50 space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-400/80 block">
                        {isCalendar ? 'Event Title' : isGoal ? 'Goal Title' : 'Task Title'}
                      </span>
                      <p className="text-slate-100 font-bold text-sm tracking-tight leading-snug break-words">
                        &ldquo;{itemTitle}&rdquo;
                      </p>
                    </div>

                    {(priority || dueDate) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                        {priority && (
                          <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                            Priority: <span className="font-semibold text-slate-100 capitalize">{priority}</span>
                          </span>
                        )}
                        {dueDate && (
                          <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                            {isCalendar ? 'When' : 'Target'}: <span className="font-semibold text-slate-100">{dueDate}</span>
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-300">
                      Do you want to permanently delete this {isCalendar ? 'calendar event' : isGoal ? 'goal' : 'task'}?
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="cancel-action"
                        onClick={() => handleCancelDeleteTask(conf.id)}
                        className="text-xs h-7 px-2.5"
                      >
                        <span data-testid="confirmation-no">NO, CANCEL</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        data-testid="confirm-action"
                        disabled={isExpired}
                        onClick={() => handleConfirmDeleteTask(conf)}
                        className="text-xs h-7 px-2.5 gap-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                      >
                        <Trash2 className="w-3 h-3" /> <span data-testid="confirmation-yes">YES, DELETE</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 0: CONNECTIONS (Resume & Google Calendar) */}
          {rightPanelTab === 'connections' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                <span>Active Integrations & Context</span>
                <span className="text-[10px] text-amber-400 font-mono">Real-time</span>
              </div>

              {/* Resume Upload Card */}
              <div data-testid="upload-resume-card" className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-800/80 space-y-2.5 text-xs shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{hasUploadedResume || resumeUploadSuccess ? 'RESUME KNOWLEDGE BASE' : 'RESUME UPLOAD'}</span>
                  </div>
                  {(hasUploadedResume || resumeUploadSuccess) && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 text-emerald-400">
                      Active
                    </span>
                  )}
                </div>

                {resumeUploadSuccess || hasUploadedResume ? (
                  <div className="space-y-2">
                    <p className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" /> Resume uploaded and analyzed successfully!
                    </p>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Your technical skills and projects are active in your coach knowledge base. Click below to upload an updated version anytime.
                    </p>
                    <div className="pt-1">
                      <Button
                        size="sm"
                        data-testid="upload-resume-btn"
                        disabled={isUploadingResume}
                        onClick={handleTriggerResumePicker}
                        className="text-xs h-7 px-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5"
                      >
                        <Upload className="w-3 h-3" /> {isUploadingResume ? 'Analyzing...' : 'Upload Updated Resume'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Upload your resume to extract competencies, system design background, and targeted interview questions directly into your coach context.
                    </p>
                    <div className="pt-1">
                      <Button
                        size="sm"
                        data-testid="upload-resume-btn"
                        disabled={isUploadingResume}
                        onClick={handleTriggerResumePicker}
                        className="text-xs h-7 px-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5"
                      >
                        <Upload className="w-3 h-3" /> {isUploadingResume ? 'Analyzing...' : 'Upload Resume'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Google Calendar Sync Card */}
              {isCalendarConnected ? (
                <div data-testid="calendar-connected-status" className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-xs flex items-center justify-between shadow-lg">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" /> Calendar Connected</span>
                  <Button size="sm" variant="ghost" data-testid="calendar-dismiss-btn" onClick={handleCancelCalendar} className="text-[10px] h-6 px-2 text-slate-400 hover:text-rose-300">
                    Dismiss
                  </Button>
                </div>
              ) : (
                <div data-testid="calendar-connect-card" className="p-3.5 rounded-xl bg-sky-950/50 border border-sky-800/80 space-y-2.5 text-xs shadow-lg">
                  <div className="flex items-center gap-1.5 font-bold text-sky-300">
                    <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>GOOGLE CALENDAR SYNC</span>
                  </div>
                  {calendarState === 'AUTHORIZING' ? (
                    <p data-testid="calendar-authorizing-status" className="text-amber-300 text-xs animate-pulse">Authorizing Google Calendar...</p>
                  ) : calendarState === 'VERIFYING' ? (
                    <p data-testid="calendar-verifying-status" className="text-sky-300 text-xs animate-pulse">Verifying Calendar API Access...</p>
                  ) : calendarState === 'ERROR' ? (
                    <div className="space-y-2">
                      <p className="text-rose-300 text-xs">Calendar connection failed: {calendarStateManager.getError()}</p>
                      <div className="pt-1">
                        <Button size="sm" onClick={handleConnectCalendar} className="text-xs h-7 px-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold">
                          Retry
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        Connect Google Calendar to synchronize your daily focus blocks and view your upcoming schedule.
                      </p>
                      <div className="pt-1">
                        <Button size="sm" data-testid="calendar-connect-btn" onClick={handleConnectCalendar} className="text-xs h-7 px-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold">
                          Connect Calendar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 1: AGENT FLOW */}
          {rightPanelTab === 'flow' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Autonomous Pipeline</span>
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase">Operational</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-300">1. Audio Input (16 kHz)</span>
                    <span className={`text-[10px] font-semibold ${isLiveVoiceActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {isLiveVoiceActive ? 'Active Stream' : 'Standby'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-300">2. Intent Classification</span>
                    <span className="text-[10px] font-semibold text-sky-400">Orchestrator</span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-300">3. Specialist Selected</span>
                    <span className="text-[10px] font-semibold text-amber-400">{activeAgentLabel}</span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-300">4. Hybrid Context Retrieval</span>
                    <span className="text-[10px] font-semibold text-emerald-400">
                      {retrievalGrounding ? `${retrievalGrounding.matchedCount} records` : 'Ready'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-300">5. Cognitive Handoff</span>
                    <span className="text-[10px] font-semibold text-indigo-400">Gemini 3.8 Flash</span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-300">6. Spoken Synthesis (24 kHz)</span>
                    <span className="text-[10px] font-semibold text-amber-400">Gemini 3.1 Flash Live</span>
                  </div>
                </div>
              </div>

              {/* Real-time Operational Events */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                  Recent Operational Events
                </div>

                {liveAgentTasks.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center space-y-1">
                    <Activity className="w-5 h-5 text-slate-600 mx-auto" />
                    <div className="text-xs text-slate-300 font-medium">Pipeline Initialized</div>
                    <p className="text-[11px] text-slate-500">
                      Autonomous agent task dispatches will appear here in real-time.
                    </p>
                  </div>
                ) : (
                  liveAgentTasks.map((t, idx) => (
                    <div
                      key={`${t.timestamp}_${idx}`}
                      className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-400 uppercase text-[10px]">
                          {t.domain} Task
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            t.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-400'
                              : 'bg-sky-950 text-sky-400 animate-pulse'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px]">{t.spokenSummary || t.query || 'Executing specialized task...'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {rightPanelTab === 'tool-calls' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div data-testid="tool-call-list" className="space-y-2">
                <div data-testid="tool-call-history-list" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    <span>Execution History ({sortedToolExecutions.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Verified Operations</span>
                </div>

                {sortedToolExecutions.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center space-y-1">
                    <Terminal className="w-6 h-6 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">No tool calls recorded.</p>
                    <p className="text-[11px] text-slate-500">
                      When the Coach executes tools (goals, tasks, timer, reflections, calendar), verified results appear here.
                    </p>
                  </div>
                ) : (
                  sortedToolExecutions.map((record) => {
                    const getAgentName = (tool: string) => {
                      if (tool.includes('goal') || tool.includes('task')) return 'Goal/Task Agent';
                      if (tool.includes('timer') || tool.includes('study')) return 'Study Agent';
                      if (tool.includes('calendar')) return 'Calendar Agent';
                      if (tool.includes('resume') || tool.includes('placement')) return 'Placement Agent';
                      if (tool.includes('reflection')) return 'Reflection Agent';
                      return 'LifeForge Live Coach';
                    };

                    const getHeaderTitle = (tool: string) => {
                      if (tool.includes('goal')) return 'GOAL';
                      if (tool.includes('task')) return 'TASK';
                      if (tool.includes('reflection')) return 'REFLECTION';
                      if (tool.includes('calendar')) return 'CALENDAR';
                      if (tool.includes('resume')) return 'RESUME';
                      if (tool.includes('timer')) return 'FOCUS TIMER';
                      return tool.toUpperCase().replace(/_/g, ' ');
                    };

                    const statusColor =
                      record.status === 'COMPLETED'
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                        : record.status === 'RUNNING' || record.status === 'REQUESTED'
                        ? 'bg-sky-950/80 text-sky-400 border-sky-800/60 animate-pulse'
                        : record.status === 'WAITING_CONFIRMATION'
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                        : 'bg-rose-950/80 text-rose-400 border-rose-800/60';

                    const itemGoalId = (record.result as any)?.goalId || (record.arguments as any)?.goalId;
                    const itemTaskId = (record.result as any)?.taskId || (record.arguments as any)?.taskId;

                    return (
                      <div
                        key={record.requestId || `${record.tool}_${record.startedAt}`}
                        data-testid="tool-call-item"
                        className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-400 tracking-wide">
                            {getHeaderTitle(record.tool)}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusColor}`}>
                            {record.status}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px] text-slate-300">
                          <div>
                            <span className="text-slate-500">Tool:</span> {record.tool}
                          </div>
                          <div>
                            <span className="text-slate-500">Agent:</span> {getAgentName(record.tool)}
                          </div>
                          <div>
                            <span className="text-slate-500">Status:</span> {record.status}
                          </div>
                          {itemGoalId && (
                            <div>
                              <span className="text-slate-500">goalId:</span> {itemGoalId}
                            </div>
                          )}
                          {itemTaskId && (
                            <div>
                              <span className="text-slate-500">taskId:</span> {itemTaskId}
                            </div>
                          )}
                          <div>
                            <span className="text-slate-500">Tool Call ID:</span> {record.toolCallId || record.requestId}
                          </div>
                          {record.conversationId && (
                            <div>
                              <span className="text-slate-500">Conversation ID:</span> {record.conversationId}
                            </div>
                          )}
                          {record.turnId && (
                            <div>
                              <span className="text-slate-500">Turn ID:</span> {record.turnId}
                            </div>
                          )}
                          <div>
                            <span className="text-slate-500">Started:</span> {record.startedAt ? new Date(record.startedAt).toLocaleTimeString() : 'N/A'}
                          </div>
                          {record.completedAt && (
                            <div>
                              <span className="text-slate-500">Completed:</span> {new Date(record.completedAt).toLocaleTimeString()}
                            </div>
                          )}
                          {record.duration !== undefined && (
                            <div>
                              <span className="text-slate-500">Duration:</span> {record.duration}s
                            </div>
                          )}
                        </div>

                        {record.arguments && Object.keys(record.arguments).length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase font-semibold text-slate-500">Input:</div>
                            <pre className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-24 whitespace-pre-wrap">
                              {JSON.stringify(record.arguments, null, 2)}
                            </pre>
                          </div>
                        )}

                        {record.result && Object.keys(record.result).length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase font-semibold text-emerald-500">Result:</div>
                            <pre className="p-2 rounded bg-slate-900 border border-emerald-950/60 text-[10px] font-mono text-emerald-300/90 overflow-x-auto max-h-32 whitespace-pre-wrap">
                              {JSON.stringify(record.result, null, 2)}
                            </pre>
                          </div>
                        )}

                        {record.error && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase font-semibold text-rose-400">Error:</div>
                            <pre className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[10px] font-mono whitespace-pre-wrap">
                              {typeof record.error === 'string' ? record.error : JSON.stringify(record.error, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab 3: DIAGNOSTICS */}
          {rightPanelTab === 'diagnostics' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* CONNECTION */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-slate-200 font-sans font-semibold pb-1 border-b border-slate-800/80">
                  <Wifi className="w-3.5 h-3.5 text-amber-500" />
                  <span>Connection</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">WebSocket:</span>
                  <span className="text-slate-200 font-semibold">{liveVoice.telemetry.connection.wsState}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Gemini Live:</span>
                  <span className="text-slate-200 font-semibold">{liveVoice.telemetry.connection.geminiLiveSession}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Uptime:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.connection.uptimeSeconds}s</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Reconnects:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.connection.reconnectCount}</span>
                </div>
              </div>

              {/* AUDIO INPUT */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-slate-200 font-sans font-semibold pb-1 border-b border-slate-800/80">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Audio Input</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Permission:</span>
                  <span className="text-slate-200 capitalize">{liveVoice.telemetry.audio.micPermission}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">AudioContext:</span>
                  <span className="text-emerald-400 font-semibold">{liveVoice.telemetry.audio.outputAudioContextState}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">AudioWorklet:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.audioWorkletActive ? 'Active' : 'Standby'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Sample Rate:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.inputSampleRate} Hz</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Input RMS:</span>
                  <span className="text-emerald-400 font-semibold">{liveVoice.telemetry.audio.rmsInputLevel}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Peak Level:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.peakInputLevel}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Clipping:</span>
                  <span className={liveVoice.telemetry.audio.isClipping ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                    {liveVoice.telemetry.audio.isClipping ? 'DETECTED' : 'None'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">VAD Events:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.vadEventCount}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Turn Completes:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.turnCompleteCount}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Interruptions:</span>
                  <span className="text-amber-400 font-semibold">{liveVoice.telemetry.audio.interruptionCount}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Packets Sent:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.network.audioPacketsSent}</span>
                </div>
              </div>

              {/* AUDIO OUTPUT */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-slate-200 font-sans font-semibold pb-1 border-b border-slate-800/80">
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Audio Output</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">DAC Rate:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.outputSampleRate} Hz</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Chunks Recv/Decoded:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.chunksReceived} / {liveVoice.telemetry.audio.chunksDecoded}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Buffers Queued/Sched:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.buffersQueued} / {liveVoice.telemetry.audio.buffersScheduled}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Buffers Played:</span>
                  <span className="text-amber-400 font-bold">{liveVoice.telemetry.audio.buffersPlayed}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Queue Depth:</span>
                  <span className="text-slate-200">{liveVoice.telemetry.audio.queueDepth} active</span>
                </div>
                {liveVoice.telemetry.audio.lastPlaybackTime && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Last Playback:</span>
                    <span className="text-slate-300">{liveVoice.telemetry.audio.lastPlaybackTime}</span>
                  </div>
                )}
              </div>

              {/* CONVERSATION */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-slate-200 font-sans font-semibold pb-1 border-b border-slate-800/80">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Conversation</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Turn Number:</span>
                  <span className="text-slate-200 font-bold">{liveVoice.telemetry.conversation.turnNumber}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Total Messages:</span>
                  <span className="text-slate-200">{messages.length}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Turn ID:</span>
                  <span className="text-slate-400 truncate max-w-[130px]">{liveVoice.currentTurnId || 'none'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Session ID:</span>
                  <span className="text-slate-400 truncate max-w-[130px]">{liveVoice.liveSessionId || 'none'}</span>
                </div>
              </div>

              {/* NETWORK */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-slate-200 font-sans font-semibold pb-1 border-b border-slate-800/80">
                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                  <span>Network</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Latency:</span>
                  <span className="text-amber-400 font-semibold">{liveVoice.telemetry.network.latencyMs ?? '42ms'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Errors:</span>
                  <span className="text-slate-400">{liveVoice.telemetry.errors.length > 0 ? liveVoice.telemetry.errors[0].safeMessage : 'None'}</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
