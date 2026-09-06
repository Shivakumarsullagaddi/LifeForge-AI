'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { ChatMessage, ConversationSession, AgentDomain, PersistenceStatus } from '@/lib/types';
import { useLiveVoice, AgentTaskEvent, SessionLifecycleState, StructuredTelemetry } from '@/hooks/useLiveVoice';
import {
  getConversations,
  subscribeConversations,
  deleteAllConversations,
  getConversationMessages,
  subscribeConversationMessages,
  addConversationMessage,
  updateConversationSummary,
  updateConversationStatus,
  getGoals,
  getTasks,
  getReflections,
  getStudySessions,
  getPlacementProfile,
  getResumeMetadata,
} from '@/lib/firebase';
import { globalConversationManager } from '@/lib/conversation-manager';
import { globalToolGateway } from '@/lib/tools/gateway';
import { timerManager, type TimerState } from '@/lib/timer';

export interface ActiveStreamingTurn {
  turnId: string;
  userText: string;
  assistantText: string;
}

export type CanonicalTimerState = TimerState;

interface LiveVoiceContextValue {
  liveVoice: ReturnType<typeof useLiveVoice>;
  isLiveSessionActive: boolean;
  backgroundLiveStateText: string;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  conversations: ConversationSession[];
  setConversations: React.Dispatch<React.SetStateAction<ConversationSession[]>>;
  completedMessages: ChatMessage[];
  setCompletedMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activeStreamingTurn: ActiveStreamingTurn | null;
  liveUserTranscript: string;
  setLiveUserTranscript: React.Dispatch<React.SetStateAction<string>>;
  liveModelTranscript: string;
  setLiveModelTranscript: React.Dispatch<React.SetStateAction<string>>;
  liveAgentTasks: AgentTaskEvent[];
  setLiveAgentTasks: React.Dispatch<React.SetStateAction<AgentTaskEvent[]>>;
  activeAgentDomain: AgentDomain;
  activeAgentLabel: string;
  userDataCache: any;
  refreshUserContext: () => Promise<any>;
  addMessage: (message: Omit<ChatMessage, 'id'>) => Promise<string | null>;
  resumeConversation: (conversationId: string) => Promise<void>;
  startNewConversation: (title?: string) => Promise<string | null>;
  resetAllConversations: () => Promise<void>;
  handleSelfTermination: (reason?: string) => Promise<void>;
  triggerSummaryGeneration: (isFinal?: boolean) => Promise<void>;
  sendTextMessage: (text: string) => Promise<{ userMessageId: string; assistantMessageId: string; responseText: string } | null>;
  persistenceStatus: PersistenceStatus;
  rollingSummary: string;
  timer: CanonicalTimerState;
  timerState: CanonicalTimerState;
  startTimer: (minutes?: number, mode?: 'focus' | 'break', label?: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  stopTimer: () => void;
}

const LiveVoiceContext = createContext<LiveVoiceContextValue | null>(null);

export function LiveVoiceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [completedMessages, setCompletedMessages] = useState<ChatMessage[]>([]);
  const [activeStreamingTurn, setActiveStreamingTurn] = useState<ActiveStreamingTurn | null>(null);
  const [liveUserTranscript, setLiveUserTranscript] = useState<string>('');
  const [liveModelTranscript, setLiveModelTranscript] = useState<string>('');
  const [liveAgentTasks, setLiveAgentTasks] = useState<AgentTaskEvent[]>([]);
  const [userDataCache, setUserDataCache] = useState<any>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('SYNCED');
  const [rollingSummary, setRollingSummary] = useState<string>('');
  const [resumeContext, setResumeContext] = useState<{
    conversationSummary?: string;
    recentMessages?: Array<{ role: string; text?: string; content?: string }>;
  } | undefined>(undefined);
  const isCreatingConvRef = useRef<boolean>(false);
  const welcomeCreatedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = globalConversationManager.subscribe(() => {
      setCompletedMessages(globalConversationManager.getOrderedMessages());
      setPersistenceStatus(globalConversationManager.getPersistenceStatus());
      setRollingSummary(globalConversationManager.getRollingSummary());
      setActiveStreamingTurn(globalConversationManager.getActiveStreamingTurn());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const activeAgentDomain: AgentDomain = useMemo(() => {
    if (liveAgentTasks.length > 0) {
      const lastTask = liveAgentTasks[0];
      if (lastTask.domain) {
        const d = lastTask.domain.toLowerCase();
        if (d.includes('study')) return 'study';
        if (d.includes('placement')) return 'placement';
        if (d.includes('reflect')) return 'reflection';
        if (d.includes('wellbeing')) return 'wellbeing';
        if (d.includes('goal') || d.includes('task')) return 'goal';
        if (d.includes('research')) return 'research';
        if (d.includes('calendar')) return 'calendar';
        if (d.includes('safety')) return 'safety';
      }
    }
    return 'orchestrator';
  }, [liveAgentTasks]);

  const activeAgentLabel = useMemo(() => {
    return 'LifeForge Live Coach';
  }, []);

  const refreshUserContext = useCallback(async () => {
    if (!user) return null;
    try {
      const [goals, tasks, reflections, studySessions, placementProfile, resumeMetadata] = await Promise.all([
        getGoals(user.uid),
        getTasks(user.uid),
        getReflections(user.uid),
        getStudySessions(user.uid),
        getPlacementProfile(user.uid),
        getResumeMetadata(user.uid),
      ]);
      const data = { goals, tasks, reflections, studySessions, placementProfile, resumeMetadata };
      setUserDataCache(data);
      return data;
    } catch {
      return null;
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    async function loadUserRecords() {
      if (!user) return;
      try {
        const [goals, tasks, reflections, studySessions, placementProfile, resumeMetadata] = await Promise.all([
          getGoals(user.uid),
          getTasks(user.uid),
          getReflections(user.uid),
          getStudySessions(user.uid),
          getPlacementProfile(user.uid),
          getResumeMetadata(user.uid),
        ]);
        if (isMounted) {
          setUserDataCache({ goals, tasks, reflections, studySessions, placementProfile, resumeMetadata });
        }
      } catch {
      }
    }
    loadUserRecords();
    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeConversations(
      user.uid,
      (list) => {
        setConversations(list);
        if (list.length > 0) {
          setActiveConversationId((prev) => {
            if (prev) {
              return prev;
            }
            return list[0].id;
          });
        } else {
          setActiveConversationId(null);
        }
      },
      () => {
        setActiveConversationId(null);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    const unsub = globalConversationManager.subscribe(() => {
      setCompletedMessages(globalConversationManager.getOrderedMessages());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !activeConversationId) {
      setCompletedMessages([]);
      return;
    }

    if (globalConversationManager.getConversationId() === activeConversationId) {
      const existing = globalConversationManager.getOrderedMessages();
      if (existing.length > 0) {
        setCompletedMessages(existing);
      }
    } else {
      setCompletedMessages([]);
      globalConversationManager.setConversation(user.uid, activeConversationId).catch(() => {});
    }

    let isMounted = true;
    const convId = activeConversationId;

    const unsubscribe = subscribeConversationMessages(user.uid, convId, async (incomingMsgs) => {
      if (!isMounted) return;

      globalConversationManager.syncIncomingMessages(incomingMsgs, convId);
      setCompletedMessages(globalConversationManager.getOrderedMessages());
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user, activeConversationId, profile]);

  const triggerSummaryGeneration = useCallback(
    async (isFinal: boolean = false) => {
      if (!user || !activeConversationId) return;
      await globalConversationManager.triggerRollingSummary(user.uid, activeConversationId, isFinal);
    },
    [user, activeConversationId]
  );

  const handleLiveTurnComplete = useCallback(
    async (userText: string, modelText: string, turnId: string) => {
      if (!user) return;
      if (!userText && !modelText) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setActiveConversationId(convId);
      }

      await globalConversationManager.finalizeVoiceTurn(
        user.uid,
        convId,
        userText,
        modelText,
        turnId,
        activeAgentDomain
      );

      setActiveStreamingTurn(null);
      setLiveUserTranscript('');
      setLiveModelTranscript('');
    },
    [user, activeConversationId, activeAgentDomain]
  );

  const sendTextMessage = useCallback(
    async (text: string) => {
      if (!user || !text.trim()) return null;
      let convId = activeConversationId;
      if (!convId) {
        convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setActiveConversationId(convId);
      }
      return await globalConversationManager.sendTextMessage(
        user.uid,
        convId,
        text.trim(),
        {
          userProfile: profile,
          userData: userDataCache,
          activeDomain: activeAgentDomain,
        }
      );
    },
    [user, activeConversationId, profile, userDataCache, activeAgentDomain]
  );

  const selfTerminationRef = useRef<(reason?: string) => Promise<void>>(() => Promise.resolve());

  const liveVoice = useLiveVoice({
    userId: user?.uid || '',
    conversationId: activeConversationId || '',
    userProfile: profile,
    userData: userDataCache,
    resumeContext,
    refreshUserContext,
    onTurnComplete: handleLiveTurnComplete,
    onUserTranscript: (chunk: string, turnId: string) => {
      setLiveUserTranscript(chunk);
      setActiveStreamingTurn((prev) => ({
        turnId,
        userText: chunk,
        assistantText: prev?.turnId === turnId ? prev.assistantText : '',
      }));
    },
    onModelStartSpeaking: (userText?: string, turnId?: string) => {
      setLiveUserTranscript('');
      const textToCommit = userText || activeStreamingTurn?.userText;
      const turnToCommit = turnId || activeStreamingTurn?.turnId;
      let convId = activeConversationId;
      if (!convId) {
        convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setActiveConversationId(convId);
      }
      if (user && convId && textToCommit && turnToCommit) {
        globalConversationManager.commitUserVoiceMessageLocally(
          user.uid,
          convId,
          textToCommit,
          turnToCommit,
          activeAgentDomain
        );
      }
    },
    onModelTranscript: (chunk: string, turnId: string) => {
      setLiveUserTranscript('');
      setLiveModelTranscript(chunk);
      setActiveStreamingTurn((prev) => ({
        turnId,
        userText: prev?.turnId === turnId ? prev.userText : '',
        assistantText: chunk,
      }));
    },
    onAgentTaskEvent: (task: AgentTaskEvent) => {
      setLiveAgentTasks((prev) => [task, ...prev.slice(0, 19)]);
    },
    onEndSessionRequested: (reason?: string) => {
      selfTerminationRef.current(reason);
    },
  });

  const resumeConversation = useCallback(
    async (conversationId: string) => {
      if (!user || !conversationId) return;
      liveVoice.resetToIdle();
      setActiveConversationId(conversationId);
      setCompletedMessages([]);

      try {
        const payload = await globalConversationManager.resumeConversation(user.uid, conversationId);
        setResumeContext(payload);
        setCompletedMessages(globalConversationManager.getOrderedMessages());
      } catch (err) {
        console.error('Failed to prepare resume context:', err);
      }
    },
    [user, liveVoice]
  );

  const addMessage = useCallback(
    async (message: Omit<ChatMessage, 'id'>): Promise<string | null> => {
      if (!user || !activeConversationId) return null;
      try {
        const id = await globalConversationManager.persistMessageWithRetry(user.uid, activeConversationId, message);
        return id;
      } catch (err) {
        console.error('Failed to add message:', err);
        return null;
      }
    },
    [user, activeConversationId]
  );

  const startNewConversation = useCallback(
    async (title?: string): Promise<string | null> => {
      if (!user) return null;
      liveVoice.resetToIdle();
      globalToolGateway.clearHistory();
      const newId = await globalConversationManager.startNewConversation(user.uid, title);
      setActiveConversationId(newId);
      setCompletedMessages([]);
      setActiveStreamingTurn(null);
      setLiveUserTranscript('');
      setLiveModelTranscript('');
      setLiveAgentTasks([]);
      setRollingSummary('');
      setResumeContext(undefined);
      return newId;
    },
    [user, liveVoice]
  );

  const resetAllConversations = useCallback(async (): Promise<void> => {
    if (!user) return;
    liveVoice.resetToIdle();
    await deleteAllConversations(user.uid);
    globalConversationManager.reset();
    globalToolGateway.clearHistory();
    welcomeCreatedRef.current.clear();
    setConversations([]);
    setActiveConversationId(null);
    setCompletedMessages([]);
    setActiveStreamingTurn(null);
    setLiveUserTranscript('');
    setLiveModelTranscript('');
    setLiveAgentTasks([]);
    setRollingSummary('');
    setResumeContext(undefined);
  }, [user, liveVoice]);

  const handleSelfTermination = useCallback(async (reason = 'user_ended'): Promise<void> => {
    if (!user) return;
    liveVoice.disconnect();
    setActiveStreamingTurn(null);
    setLiveUserTranscript('');
    setLiveModelTranscript('');

    const targetConvId = activeConversationId;
    if (targetConvId) {
      Promise.resolve().then(async () => {
        try {
          await globalConversationManager.persistMessageWithRetry(user.uid, targetConvId, {
            role: 'assistant',
            agentDomain: 'safety',
            content: "Okay, we'll end this session now. Excellent work today. Your progress has been finalized and saved. Goodbye!",
            createdAt: new Date().toISOString(),
            source: 'voice',
          });
          await globalToolGateway.executeTool(user.uid, {
            requestId: `req_end_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            agentTaskId: `task_end_${Date.now()}`,
            conversationId: targetConvId,
            turnId: `turn_${Date.now()}`,
            tool: 'end_live_session',
            arguments: { reason },
          });
        } catch (err) {
          console.warn('Background end_live_session notice:', err);
        }
      });
    }
  }, [user, activeConversationId, liveVoice]);

  useEffect(() => {
    selfTerminationRef.current = handleSelfTermination;
  }, [handleSelfTermination]);

  const [timer, setTimer] = useState<CanonicalTimerState>(() => timerManager.getState());

  useEffect(() => {
    const unsub = timerManager.subscribe(() => {
      setTimer(timerManager.getState());
    });
    return () => unsub();
  }, []);

  const startTimer = useCallback((minutes = 25, mode: 'focus' | 'break' = 'focus', label = 'DSA Deep Work Focus') => {
    timerManager.start(minutes, mode, label);
  }, []);

  const pauseTimer = useCallback(() => {
    timerManager.pause();
  }, []);

  const resumeTimer = useCallback(() => {
    timerManager.resume();
  }, []);

  const resetTimer = useCallback(() => {
    timerManager.restart();
  }, []);

  const stopTimer = useCallback(() => {
    timerManager.stop();
  }, []);

  const isLiveSessionActive = useMemo(() => {
    return (
      liveVoice.state !== 'IDLE' &&
      liveVoice.state !== 'ENDED' &&
      liveVoice.state !== 'ERROR'
    );
  }, [liveVoice.state]);

  const backgroundLiveStateText = useMemo(() => {
    if (liveVoice.state === 'ERROR') return 'LIVE — ERROR';
    if (liveVoice.isMuted) return 'LIVE — MUTED';
    if (liveVoice.state === 'USER_SPEAKING') return 'LIVE — LISTENING';
    if (liveVoice.state === 'ASSISTANT_SPEAKING') return 'LIVE — SPEAKING';
    if (liveVoice.state === 'AGENT_PROCESSING' || liveVoice.state === 'PROCESSING') return 'LIVE — AGENT WORKING';
    if (liveVoice.state === 'CONNECTED' || liveVoice.state === 'LISTENING') return 'LIVE — CONNECTED';
    return 'LIVE — IDLE';
  }, [liveVoice.state, liveVoice.isMuted]);

  const value = useMemo<LiveVoiceContextValue>(
    () => ({
      liveVoice,
      isLiveSessionActive,
      backgroundLiveStateText,
      activeConversationId,
      setActiveConversationId,
      conversations,
      setConversations,
      completedMessages,
      setCompletedMessages,
      messages: completedMessages,
      setMessages: setCompletedMessages,
      activeStreamingTurn,
      liveUserTranscript,
      setLiveUserTranscript,
      liveModelTranscript,
      setLiveModelTranscript,
      liveAgentTasks,
      setLiveAgentTasks,
      activeAgentDomain,
      activeAgentLabel,
      userDataCache,
      refreshUserContext,
      addMessage,
      resumeConversation,
      startNewConversation,
      resetAllConversations,
      handleSelfTermination,
      triggerSummaryGeneration,
      sendTextMessage,
      persistenceStatus,
      rollingSummary,
      timer,
      timerState: timer,
      startTimer,
      pauseTimer,
      resumeTimer,
      resetTimer,
      stopTimer,
    }),
    [
      liveVoice,
      isLiveSessionActive,
      backgroundLiveStateText,
      activeConversationId,
      conversations,
      completedMessages,
      activeStreamingTurn,
      liveUserTranscript,
      liveModelTranscript,
      liveAgentTasks,
      activeAgentDomain,
      activeAgentLabel,
      userDataCache,
      refreshUserContext,
      addMessage,
      resumeConversation,
      startNewConversation,
      resetAllConversations,
      handleSelfTermination,
      triggerSummaryGeneration,
      sendTextMessage,
      persistenceStatus,
      rollingSummary,
      timer,
      startTimer,
      pauseTimer,
      resumeTimer,
      resetTimer,
      stopTimer,
    ]
  );

  return <LiveVoiceContext.Provider value={value}>{children}</LiveVoiceContext.Provider>;
}

export function useLiveVoiceContext(): LiveVoiceContextValue {
  const context = useContext(LiveVoiceContext);
  if (!context) {
    throw new Error('useLiveVoiceContext must be used within a LiveVoiceProvider');
  }
  return context;
}
