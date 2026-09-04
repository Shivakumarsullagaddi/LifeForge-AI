'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import {
  createConversation,
  getConversations,
  getConversationMessages,
  addConversationMessage,
  addMemory,
  addTask,
  addGoal,
  getJournals,
  getMemories,
  getGoals,
  getTasks,
  getReflections,
  getStudySessions,
} from '@/lib/firebase';
import type { ConversationSession, ChatMessage, AgentDomain } from '@/lib/types';
import { useLiveVoice, AgentTaskEvent } from '@/hooks/useLiveVoice';
import {
  Send,
  Radio,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  Compass,
  Cpu,
  RefreshCw,
  Mic,
  MicOff,
  Square,
  Flame,
  Activity,
  Zap,
  Volume2,
  VolumeX,
  PlusCircle,
  ExternalLink,
  Check,
  Database,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface DynamicClassification {
  domain: AgentDomain;
  severity: 'low' | 'medium' | 'high';
  urgency: 'low' | 'medium' | 'high';
  confidence: number;
  candidateMemory?: string;
  proposedTask?: string;
  proposedGoal?: string;
}

export const LiveCoachView: React.FC = () => {
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeDomain, setActiveDomain] = useState<AgentDomain>('orchestrator');
  const [lastClassification, setLastClassification] = useState<DynamicClassification | null>(null);
  const [searchGrounding, setSearchGrounding] = useState<any | null>(null);
  const [retrievalGrounding, setRetrievalGrounding] = useState<{
    searchedCount: number;
    matchedCount: number;
    durationMs: number;
    matchedItems: Array<{ id: string; type: string; title: string; score: number; matchTypes: string[] }>;
  } | null>(null);
  const [actionAddedStatus, setActionAddedStatus] = useState<Record<string, boolean>>({});
  
  // Realtime Live Transcripts
  const [liveUserTranscript, setLiveUserTranscript] = useState<string>('');
  const [liveModelTranscript, setLiveModelTranscript] = useState<string>('');
  const [liveAgentTasks, setLiveAgentTasks] = useState<AgentTaskEvent[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userDataCache, setUserDataCache] = useState<any>(null);

  // Fetch full user context for retrieval
  const refreshUserContext = useCallback(async () => {
    if (!user) return null;
    try {
      const [journals, memories, goals, tasks, reflections, studySessions] = await Promise.all([
        getJournals(user.uid),
        getMemories(user.uid),
        getGoals(user.uid),
        getTasks(user.uid),
        getReflections(user.uid),
        getStudySessions(user.uid),
      ]);
      const data = { journals, memories, goals, tasks, reflections, studySessions };
      setUserDataCache(data);
      return data;
    } catch (e) {
      console.error('Failed to load user context:', e);
      return null;
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    async function loadCtx() {
      if (!user) return;
      try {
        const [journals, memories, goals, tasks, reflections, studySessions] = await Promise.all([
          getJournals(user.uid),
          getMemories(user.uid),
          getGoals(user.uid),
          getTasks(user.uid),
          getReflections(user.uid),
          getStudySessions(user.uid),
        ]);
        if (isMounted) {
          setUserDataCache({ journals, memories, goals, tasks, reflections, studySessions });
        }
      } catch (e) {
        console.error('Failed to load user context:', e);
      }
    }
    loadCtx();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Load existing conversations
  useEffect(() => {
    let isMounted = true;
    async function loadSessions() {
      if (!user) return;
      try {
        const list = await getConversations(user.uid);
        if (!isMounted) return;
        setConversations(list);
        if (list.length > 0) {
          setActiveConversationId(list[0].id);
        } else {
          // Create initial session
          const newId = await createConversation(user.uid, {
            title: 'Daily Mentorship & Live Coaching',
            agentDomain: 'orchestrator',
            summary: 'Initial coaching conversation',
            isPinned: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          if (isMounted) setActiveConversationId(newId);
        }
      } catch (err) {
        console.error('Failed to load sessions:', err);
      }
    }
    loadSessions();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Load messages for active conversation
  useEffect(() => {
    let isMounted = true;
    async function loadMsg() {
      if (!user || !activeConversationId) return;
      try {
        const msgs = await getConversationMessages(user.uid, activeConversationId);
        if (!isMounted) return;
        if (msgs.length === 0) {
          const welcome: Omit<ChatMessage, 'id'> = {
            role: 'assistant',
            agentDomain: 'orchestrator',
            content: `Welcome, ${profile?.displayName || 'Student'}. I am your LifeForge AI Coach.

I operate on two synchronized intelligence engines:
1. **Gemini 3.1 Flash Live** for continuous, low-latency spoken voice dialogue.
2. **Gemini 3.8 Flash** for deep reasoning, private history retrieval, and placement research.

Click **Start Live Voice** above to begin speaking, or type your question below.`,
            createdAt: new Date().toISOString(),
          };
          const id = await addConversationMessage(user.uid, activeConversationId, welcome);
          if (isMounted) setMessages([{ id, ...welcome }]);
        } else {
          if (isMounted) setMessages(msgs);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }
    loadMsg();
    return () => {
      isMounted = false;
    };
  }, [user, activeConversationId, profile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveUserTranscript, liveModelTranscript]);

  // Handle Turn Completion in Live Voice
  const handleLiveTurnComplete = useCallback(
    async (userText: string, modelText: string) => {
      if (!user || !activeConversationId) return;
      if (!userText && !modelText) return;

      setLiveUserTranscript('');
      setLiveModelTranscript('');

      if (userText) {
        const userMsg: Omit<ChatMessage, 'id'> = {
          role: 'user',
          content: userText,
          createdAt: new Date().toISOString(),
        };
        const uId = await addConversationMessage(user.uid, activeConversationId, userMsg);
        setMessages((prev) => [...prev, { id: uId, ...userMsg }]);
      }

      if (modelText) {
        const assistantMsg: Omit<ChatMessage, 'id'> = {
          role: 'assistant',
          agentDomain: activeDomain,
          content: modelText,
          createdAt: new Date().toISOString(),
        };
        const aId = await addConversationMessage(user.uid, activeConversationId, assistantMsg);
        setMessages((prev) => [...prev, { id: aId, ...assistantMsg }]);
      }
    },
    [user, activeConversationId, activeDomain]
  );

  // Initialize useLiveVoice Hook
  const liveVoice = useLiveVoice({
    userId: user?.uid || 'anonymous',
    userProfile: {
      displayName: profile?.displayName,
      primaryGoal: profile?.primaryGoal,
      targetPlacements: profile?.targetPlacements,
      studyPhilosophy: profile?.studyPhilosophy,
      disciplinedStreakDays: profile?.disciplinedStreakDays,
    },
    activeDomain: activeDomain,
    userData: userDataCache,
    onUserTranscript: (text) => setLiveUserTranscript(text),
    onModelTranscript: (text) => setLiveModelTranscript(text),
    onTurnComplete: handleLiveTurnComplete,
    onAgentTaskEvent: (taskEvent) => {
      setLiveAgentTasks((prev) => [taskEvent, ...prev.slice(0, 9)]);
    },
  });

  // Handle Text Send Message (Gemini 3.8 Flash Orchestrator)
  const handleSendMessage = async () => {
    if (!inputText.trim() || !user || !activeConversationId || isProcessing) return;

    const userQuery = inputText.trim();
    setInputText('');
    setIsProcessing(true);

    const userMsg: Omit<ChatMessage, 'id'> = {
      role: 'user',
      content: userQuery,
      createdAt: new Date().toISOString(),
    };

    const userMsgId = await addConversationMessage(user.uid, activeConversationId, userMsg);
    setMessages((prev) => [...prev, { id: userMsgId, ...userMsg }]);

    let responseText = '';
    let agentDomain: AgentDomain = activeDomain;

    try {
      const currentData = userDataCache || (await refreshUserContext());

      const apiRes = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userQuery,
          userId: user.uid,
          activeDomain: activeDomain,
          conversationHistory: messages.slice(-4).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userProfile: {
            displayName: profile?.displayName,
            primaryGoal: profile?.primaryGoal,
            targetPlacements: profile?.targetPlacements,
            studyPhilosophy: profile?.studyPhilosophy,
            disciplinedStreakDays: profile?.disciplinedStreakDays,
          },
          userData: currentData,
        }),
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        responseText = data.text;
        if (data.groundingMetadata) setSearchGrounding(data.groundingMetadata);
        if (data.retrieval) setRetrievalGrounding(data.retrieval);

        if (data.proposedActions) {
          const acts = data.proposedActions;
          setLastClassification({
            domain: (acts.domain as AgentDomain) || activeDomain,
            severity: acts.severity || 'low',
            urgency: acts.urgency || 'medium',
            confidence: 0.96,
            candidateMemory: acts.candidateMemory,
            proposedTask: acts.proposedTask,
            proposedGoal: acts.proposedGoal,
          });
          if (acts.domain) agentDomain = acts.domain as AgentDomain;
        } else {
          setLastClassification({
            domain: activeDomain,
            severity: 'low',
            urgency: 'medium',
            confidence: 0.94,
          });
        }
      } else {
        throw new Error('API route response non-ok');
      }
    } catch (err) {
      console.warn('Falling back to local orchestrator logic:', err);
      responseText = `**Orchestrator Guidance:**
Let's analyze this step-by-step:
1. **Identify the Core Obstacle:** What is the primary friction point preventing progress right now?
2. **First Action:** Pick one 15-minute chunk and execute without distractions.
3. **Continuous Reflection:** Learn from what worked and protect the rest of your daily schedule.`;
      setLastClassification({
        domain: activeDomain,
        severity: 'low',
        urgency: 'medium',
        confidence: 0.88,
      });
    }

    const assistantMsg: Omit<ChatMessage, 'id'> = {
      role: 'assistant',
      agentDomain: agentDomain,
      content: responseText,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = await addConversationMessage(user.uid, activeConversationId, assistantMsg);
    setMessages((prev) => [...prev, { id: assistantMsgId, ...assistantMsg }]);
    setIsProcessing(false);
  };

  const handleStartNewSession = async () => {
    if (!user) return;
    liveVoice.disconnect();
    const title = `Session ${conversations.length + 1} · ${new Date().toLocaleDateString()}`;
    const newId = await createConversation(user.uid, {
      title,
      agentDomain: activeDomain,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setConversations((prev) => [
      {
        id: newId,
        userId: user.uid,
        title,
        agentDomain: activeDomain,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setActiveConversationId(newId);
    setMessages([]);
  };

  // One-click action approval
  const handleApproveMemory = async (content: string) => {
    if (!user) return;
    try {
      await addMemory(user.uid, {
        type: 'habit',
        content,
        category: activeDomain,
        source: 'AI Coach Conversation Proposal',
        confidence: 0.95,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setActionAddedStatus((prev) => ({ ...prev, [content]: true }));
      refreshUserContext();
    } catch (e) {
      console.error('Failed to add memory:', e);
    }
  };

  const handleApproveTask = async (title: string) => {
    if (!user) return;
    try {
      const taskDomain: 'study' | 'placement' | 'wellbeing' | 'habits' | 'career' =
        activeDomain === 'study' || activeDomain === 'placement' || activeDomain === 'wellbeing'
          ? activeDomain
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
    } catch (e) {
      console.error('Failed to add task:', e);
    }
  };

  const handleApproveGoal = async (title: string) => {
    if (!user) return;
    try {
      const goalDomain: 'study' | 'placement' | 'wellbeing' | 'habits' | 'career' =
        activeDomain === 'study' || activeDomain === 'placement' || activeDomain === 'wellbeing'
          ? activeDomain
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
    } catch (e) {
      console.error('Failed to add goal:', e);
    }
  };

  const domainPills: Array<{ id: AgentDomain; label: string }> = [
    { id: 'orchestrator', label: 'Orchestrator' },
    { id: 'study', label: 'Study Coach' },
    { id: 'placement', label: 'Placements' },
    { id: 'reflection', label: 'Reflection & Growth' },
    { id: 'wellbeing', label: 'Wellbeing' },
    { id: 'goal', label: 'Goals & Tasks' },
    { id: 'research', label: 'Research' },
  ];

  const isLiveVoiceActive =
    liveVoice.state === 'CONNECTING' ||
    liveVoice.state === 'LISTENING' ||
    liveVoice.state === 'SPEAKING' ||
    liveVoice.state === 'INTERRUPTED';

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Top Realtime Live Voice Control Hub */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                isLiveVoiceActive
                  ? liveVoice.state === 'SPEAKING'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20 animate-pulse'
                    : 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isLiveVoiceActive ? <Radio className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>Gemini Live Voice Coach</span>
                </h1>

                {/* State Machine Pill */}
                {liveVoice.state === 'IDLE' && <Badge variant="slate" size="sm">Standby</Badge>}
                {liveVoice.state === 'CONNECTING' && <Badge variant="indigo" size="sm">Connecting...</Badge>}
                {liveVoice.state === 'LISTENING' && (
                  <Badge variant="emerald" size="sm" className="animate-pulse">
                    Listening (16kHz PCM)
                  </Badge>
                )}
                {liveVoice.state === 'SPEAKING' && (
                  <Badge variant="amber" size="sm" className="animate-pulse">
                    Speaking (24kHz Gapless)
                  </Badge>
                )}
                {liveVoice.state === 'INTERRUPTED' && (
                  <Badge variant="sky" size="sm">
                    Barge-in Triggered
                  </Badge>
                )}
                {liveVoice.state === 'ERROR' && <Badge variant="rose" size="sm">Error</Badge>}
                {liveVoice.state === 'DISCONNECTED' && <Badge variant="slate" size="sm">Disconnected</Badge>}
              </div>

              <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>Gemini 3.1 Flash Live (Voice) + Gemini 3.8 Flash (Deep Reasoning)</span>
                {liveVoice.latencyMs && (
                  <span className="font-mono text-[11px] text-amber-400 font-semibold">
                    · {liveVoice.latencyMs}ms response
                  </span>
                )}
                {liveVoice.turnCount > 0 && (
                  <span className="font-mono text-[11px] text-slate-400">
                    · Turn #{liveVoice.turnCount}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Voice Controls & Visualizer */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Realtime Mic Energy Bar */}
            {isLiveVoiceActive && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 rounded-xl border border-slate-800">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex items-end gap-0.5 h-4 w-16">
                  {[0.1, 0.25, 0.45, 0.65, 0.85].map((threshold, idx) => (
                    <div
                      key={idx}
                      className={`w-2.5 rounded-full transition-all duration-75 ${
                        liveVoice.micLevel >= threshold
                          ? liveVoice.state === 'SPEAKING'
                            ? 'bg-amber-400 h-full'
                            : 'bg-emerald-400 h-full'
                          : 'bg-slate-800 h-1'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Mute Button */}
            {isLiveVoiceActive && (
              <button
                onClick={liveVoice.toggleMute}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  liveVoice.isMuted
                    ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title={liveVoice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {liveVoice.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            {/* Barge-In / Interrupt Button */}
            {isLiveVoiceActive && liveVoice.state === 'SPEAKING' && (
              <Button
                size="sm"
                variant="outline"
                onClick={liveVoice.interruptNow}
                className="text-xs bg-amber-950/50 border-amber-600 text-amber-300 hover:bg-amber-900/60"
              >
                <Zap className="w-3.5 h-3.5 mr-1" /> Barge-in
              </Button>
            )}

            {/* Main Connect / Disconnect Toggle */}
            {!isLiveVoiceActive ? (
              <Button
                size="md"
                onClick={liveVoice.connect}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs sm:text-sm px-4 shadow-lg shadow-amber-600/20"
              >
                <Radio className="w-4 h-4 mr-1.5" /> Start Live Voice
              </Button>
            ) : (
              <Button
                size="md"
                variant="danger"
                onClick={liveVoice.disconnect}
                className="text-xs sm:text-sm px-4"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" /> End Voice Session
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={handleStartNewSession}
              className="text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> New Session
            </Button>
          </div>
        </div>

        {/* Live Voice Active Notification Banner */}
        {isLiveVoiceActive && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>
                <strong>Continuous Audio Loop Active:</strong> Speak naturally. Gemini will answer immediately. Interrupt anytime to ask something else.
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Sample: 16kHz In / 24kHz Out
            </div>
          </div>
        )}
      </div>

      {/* Domain Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Specialist Routing:</span>
        {domainPills.map((pill) => (
          <button
            key={pill.id}
            onClick={() => setActiveDomain(pill.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeDomain === pill.id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Main Grid: Chat + Dynamic Intent / Agent Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Chat Window */}
        <div className="lg:col-span-3 flex flex-col h-[650px] bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          {/* Message Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold ${
                      isUser
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-800 border border-slate-700 text-amber-400'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div
                    className={`p-4 rounded-xl text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-amber-950/40 border border-amber-800/60 text-slate-100 rounded-tr-none'
                        : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-none space-y-2'
                    }`}
                  >
                    {!isUser && msg.agentDomain && (
                      <div className="flex items-center gap-2 pb-1.5 mb-1.5 border-b border-slate-800/80 text-[11px] font-semibold text-amber-400">
                        <Sparkles className="w-3 h-3" />
                        <span className="uppercase tracking-wider">
                          {msg.agentDomain} Agent
                        </span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              );
            })}

            {/* Live Streaming User Transcript */}
            {liveUserTranscript && (
              <div className="flex gap-3 max-w-3xl ml-auto flex-row-reverse">
                <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold bg-emerald-600 text-white animate-pulse">
                  <User className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-xl text-xs sm:text-sm leading-relaxed bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 rounded-tr-none">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block mb-1">
                    Live Speaking...
                  </span>
                  <div>{liveUserTranscript}</div>
                </div>
              </div>
            )}

            {/* Live Streaming Model Transcript */}
            {liveModelTranscript && (
              <div className="flex gap-3 max-w-3xl">
                <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold bg-slate-800 border border-amber-500 text-amber-400 animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-xl text-xs sm:text-sm leading-relaxed bg-slate-950/90 border border-amber-800/60 text-slate-100 rounded-tl-none space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
                    <Radio className="w-3 h-3 animate-spin" /> Live Voice Coach Speaking...
                  </span>
                  <div>{liveModelTranscript}</div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/70 flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Type a question or speak into microphone above...`}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isProcessing}
              isLoading={isProcessing}
              size="md"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Sidebar: Dynamic Intent, Agent Telemetry, and Guardrails */}
        <div className="space-y-4">
          {/* Live Agent Handoff Activity Card */}
          {liveVoice.currentAgentTask && (
            <Card className="border-amber-500/50 bg-amber-950/20">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Gemini 3.8 Specialist Handoff</span>
                  </div>
                  <Badge variant={liveVoice.currentAgentTask.status === 'running' ? 'indigo' : 'emerald'} size="sm">
                    {liveVoice.currentAgentTask.status}
                  </Badge>
                </div>

                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Agent Domain:</span>
                    <span className="font-semibold text-amber-300 uppercase">
                      {liveVoice.currentAgentTask.domain}
                    </span>
                  </div>
                  {liveVoice.currentAgentTask.query && (
                    <p className="text-[11px] text-slate-300 italic bg-slate-900 p-2 rounded">
                      &quot;{liveVoice.currentAgentTask.query}&quot;
                    </p>
                  )}
                  {liveVoice.currentAgentTask.spokenSummary && (
                    <p className="text-[11px] text-emerald-300 font-medium pt-1">
                      {liveVoice.currentAgentTask.spokenSummary}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Dynamic Intent Classification Engine */}
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-amber-500" />
                  <span>Dynamic Intent Engine</span>
                </div>
                <Badge variant="emerald" size="sm">Active</Badge>
              </div>

              {lastClassification ? (
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Domain:</span>
                    <span className="font-semibold text-amber-300 uppercase">{lastClassification.domain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Confidence:</span>
                    <span className="font-semibold text-emerald-400">{Math.round(lastClassification.confidence * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Urgency:</span>
                    <span className="text-slate-200 capitalize">{lastClassification.urgency}</span>
                  </div>

                  {/* Proposed Candidate Memory */}
                  {lastClassification.candidateMemory && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider block">
                        Candidate Memory Proposed:
                      </span>
                      <p className="text-[11px] text-slate-300 italic bg-slate-900 p-2 rounded border border-slate-800">
                        &quot;{lastClassification.candidateMemory}&quot;
                      </p>
                      <button
                        onClick={() => handleApproveMemory(lastClassification.candidateMemory!)}
                        disabled={actionAddedStatus[lastClassification.candidateMemory]}
                        className="w-full py-1 px-2 rounded bg-amber-950/80 hover:bg-amber-900/80 border border-amber-700 text-amber-300 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                      >
                        {actionAddedStatus[lastClassification.candidateMemory] ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" /> Saved to Memories
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3" /> Save to Memories Vault
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Proposed Deep Work Task */}
                  {lastClassification.proposedTask && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider block">
                        Deep Work Task Proposed:
                      </span>
                      <p className="text-[11px] text-slate-300 italic bg-slate-900 p-2 rounded border border-slate-800">
                        &quot;{lastClassification.proposedTask}&quot;
                      </p>
                      <button
                        onClick={() => handleApproveTask(lastClassification.proposedTask!)}
                        disabled={actionAddedStatus[lastClassification.proposedTask]}
                        className="w-full py-1 px-2 rounded bg-sky-950/80 hover:bg-sky-900/80 border border-sky-700 text-sky-300 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                      >
                        {actionAddedStatus[lastClassification.proposedTask] ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" /> Added to Task List
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3" /> Add to Today&apos;s Tasks
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Proposed Milestone Goal */}
                  {lastClassification.proposedGoal && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider block">
                        Milestone Goal Proposed:
                      </span>
                      <p className="text-[11px] text-slate-300 italic bg-slate-900 p-2 rounded border border-slate-800">
                        &quot;{lastClassification.proposedGoal}&quot;
                      </p>
                      <button
                        onClick={() => handleApproveGoal(lastClassification.proposedGoal!)}
                        disabled={actionAddedStatus[lastClassification.proposedGoal]}
                        className="w-full py-1 px-2 rounded bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                      >
                        {actionAddedStatus[lastClassification.proposedGoal] ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" /> Added to Goals
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3" /> Add to Active Goals
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Issue classification dynamically evaluates domain, severity, and agent routing on each user turn.
                </p>
              )}
            </div>
          </Card>

          {/* Private Retrieval Grounding Card */}
          {retrievalGrounding && (
            <Card className="bg-slate-950 border-amber-900/40">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <Database className="w-3.5 h-3.5" />
                    <span>Private Context Retrieved</span>
                  </div>
                  <Badge variant="amber" size="sm">
                    {retrievalGrounding.matchedCount} Found ({retrievalGrounding.durationMs}ms)
                  </Badge>
                </div>
                {retrievalGrounding.matchedItems && retrievalGrounding.matchedItems.length > 0 ? (
                  <div className="text-[11px] text-slate-300 space-y-1.5 pt-1">
                    {retrievalGrounding.matchedItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-slate-200 truncate max-w-[150px]">{item.title}</span>
                          <span className="text-amber-400 font-mono">{(item.score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono uppercase">
                          <span>{item.type}</span>
                          <span>·</span>
                          <span>{item.matchTypes.join('+')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    No relevant private notes matched this specific prompt.
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Search Grounding Information */}
          {searchGrounding && searchGrounding.webSearchQueries && (
            <Card className="bg-slate-950 border-sky-900/40">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Google Search Grounding</span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1">
                  {searchGrounding.webSearchQueries.map((q: string, idx: number) => (
                    <div key={idx} className="bg-slate-900 px-2 py-1 rounded text-slate-300 font-mono text-[10px]">
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Mentorship Principles */}
          <Card>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Compass className="w-4 h-4 text-sky-400" />
                <span>Mentorship Guardrails</span>
              </div>
              <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                <li>Non-judgmental, direct accountability</li>
                <li>No revenge or self-harm accountability</li>
                <li>Grounded in logic & intentional action</li>
                <li>Teach-back active recall framework</li>
              </ul>
            </div>
          </Card>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Zero raw audio persistence. Secure server-side isolation.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
