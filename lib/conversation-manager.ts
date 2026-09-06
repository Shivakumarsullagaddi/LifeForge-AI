import type { ChatMessage, ConversationSession, AgentDomain, PersistenceStatus } from './types';
import { globalToolGateway } from './tools/gateway';
import { timerManager } from './timer';
import { calendarStateManager } from './calendar';
import { deduplicateTranscript } from './utils';
import {
  getConversations,
  createConversation,
  getConversationMessages,
  addConversationMessage,
  updateConversationSummary,
  updateConversationStatus,
} from './firebase';

export interface ActiveStreamingTurn {
  turnId: string;
  userText: string;
  assistantText: string;
}

export interface AgentActivityInfo {
  domain: AgentDomain;
  state: string;
  query?: string;
  detail?: string;
  updatedAt: string;
  elapsedMs?: number;
}

export interface ResumeContextPayload {
  conversationSummary: string;
  recentMessages: Array<{ role: string; text?: string; content?: string }>;
}

export type ConversationListener = () => void;

export class ConversationManager {
  private conversationId: string | null = null;
  private liveSessionId: string = '';
  private turnCounter: number = 0;
  private completedMessages: ChatMessage[] = [];
  private activeStreamingTurn: ActiveStreamingTurn | null = null;
  private persistenceStatus: PersistenceStatus = 'SYNCED';
  private rollingSummary: string = '';
  private currentAgentActivity: AgentActivityInfo = {
    domain: 'orchestrator',
    state: 'Listening',
    updatedAt: new Date().toLocaleTimeString(),
  };
  private resumeContext: ResumeContextPayload | null = null;
  private listeners: Set<ConversationListener> = new Set();
  private turnsSinceSummary: number = 0;
  private isGeneratingSummary: boolean = false;

  constructor() {
    this.liveSessionId = `live_sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  subscribe(listener: ConversationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.conversationId = null;
    this.liveSessionId = `live_sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.turnCounter = 0;
    this.completedMessages = [];
    this.activeStreamingTurn = null;
    this.persistenceStatus = 'SYNCED';
    this.rollingSummary = '';
    this.currentAgentActivity = {
      domain: 'orchestrator',
      state: 'Listening',
      updatedAt: new Date().toLocaleTimeString(),
    };
    this.resumeContext = null;
    this.turnsSinceSummary = 0;
    this.isGeneratingSummary = false;
    this.notify();
  }


  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('ConversationManager listener error:', err);
      }
    });
  }

  getConversationId(): string | null {
    return this.conversationId;
  }

  getLiveSessionId(): string {
    return this.liveSessionId;
  }

  getCompletedMessages(): ChatMessage[] {
    return [...this.completedMessages];
  }

  getOrderedMessages(): ChatMessage[] {
    return [...this.completedMessages];
  }

  getActiveStreamingTurn(): ActiveStreamingTurn | null {
    return this.activeStreamingTurn ? { ...this.activeStreamingTurn } : null;
  }

  getPersistenceStatus(): PersistenceStatus {
    return this.persistenceStatus;
  }

  getRollingSummary(): string {
    return this.rollingSummary;
  }



  getCurrentAgentActivity(): AgentActivityInfo {
    return { ...this.currentAgentActivity };
  }

  getResumeContext(): ResumeContextPayload | null {
    return this.resumeContext ? { ...this.resumeContext } : null;
  }

  getTurnCount(): number {
    return this.turnCounter;
  }

  setLiveSessionId(id: string): void {
    this.liveSessionId = id;
    this.notify();
  }

  getNextTurnId(prefix = 'turn'): string {
    this.turnCounter += 1;
    return `${prefix}_${this.liveSessionId}_${String(this.turnCounter).padStart(3, '0')}`;
  }

  setAgentActivity(activity: Partial<AgentActivityInfo>): void {
    this.currentAgentActivity = {
      ...this.currentAgentActivity,
      ...activity,
      updatedAt: new Date().toLocaleTimeString(),
    };
    this.notify();
  }

  async startNewConversation(userId: string, title?: string): Promise<string> {
    const hasUserInteraction = this.completedMessages.some(
      (m) => m.role === 'user'
    );

    const prevConvId = this.conversationId;
    const prevSessionId = this.liveSessionId;
    const newTitle = title || `Coaching Session · ${new Date().toLocaleDateString()}`;
    const newId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.conversationId = newId;
    this.liveSessionId = `live_sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.turnCounter = 0;
    this.completedMessages = [];
    this.activeStreamingTurn = null;
    this.rollingSummary = '';
    this.resumeContext = null;
    this.persistenceStatus = 'SYNCED';

    this.notify();

    Promise.resolve().then(async () => {
      try {
        if (prevConvId && hasUserInteraction) {
          await this.triggerRollingSummary(userId, prevConvId, true);
          await updateConversationStatus(userId, prevConvId, 'completed', prevSessionId);
        }
        await createConversation(userId, {
          title: newTitle,
          agentDomain: 'orchestrator',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: '',
          status: 'active',
        }, newId);
      } catch (err) {
        console.warn('Background finalization notice:', err);
      }
    });

    return newId;
  }

  async handleSelfTermination(userId: string): Promise<void> {
    if (!this.conversationId) return;
    try {
      if (this.completedMessages.length > 0) {
        await this.triggerRollingSummary(userId, this.conversationId, true);
      }
      await updateConversationStatus(userId, this.conversationId, 'completed', this.liveSessionId);
    } catch (err) {
      console.warn('Error terminating conversation session:', err);
    }
    this.activeStreamingTurn = null;
    this.notify();
  }

  async setConversation(userId: string, conversationId: string): Promise<void> {
    if (this.conversationId === conversationId && (this.completedMessages.length > 0 || this.resumeContext)) {
      return;
    }

    this.conversationId = conversationId;
    this.completedMessages = [];
    this.activeStreamingTurn = null;
    this.resumeContext = null;

    try {
      const [messages, convs] = await Promise.all([
        getConversationMessages(userId, conversationId),
        getConversations(userId),
      ]);

      const conv = convs.find((c: any) => c.id === conversationId);
      this.rollingSummary = conv?.rollingSummary || conv?.summary || '';
      this.syncIncomingMessages(messages, conversationId);
      this.persistenceStatus = 'SYNCED';
    } catch (err) {
      console.warn('Failed to load conversation details:', err);
    }

    this.notify();
  }

  updateActiveStreamingTurn(turnId: string, userChunk?: string, assistantChunk?: string): void {
    const existing = this.activeStreamingTurn?.turnId === turnId ? this.activeStreamingTurn : null;
    this.activeStreamingTurn = {
      turnId,
      userText: userChunk !== undefined ? (existing ? existing.userText + userChunk : userChunk) : (existing?.userText || ''),
      assistantText: assistantChunk !== undefined ? (existing ? existing.assistantText + assistantChunk : assistantChunk) : (existing?.assistantText || ''),
    };
    this.notify();
  }

  setActiveStreamingTurnDirect(turnId: string, userText: string, assistantText: string): void {
    this.activeStreamingTurn = {
      turnId,
      userText,
      assistantText,
    };
    this.notify();
  }

  clearActiveStreamingTurn(): void {
    this.activeStreamingTurn = null;
    this.notify();
  }

  setOrderedMessages(messages: ChatMessage[]): void {
    this.completedMessages = [...messages];
    this.notify();
  }

  syncIncomingMessages(incoming: ChatMessage[], targetConvId?: string): void {
    const expectedConvId = targetConvId || this.conversationId;
    const filteredIncoming = expectedConvId
      ? incoming
          .filter((m) => !m.conversationId || m.conversationId === expectedConvId)
          .map((m) => (!m.conversationId && expectedConvId ? { ...m, conversationId: expectedConvId } : m))
      : incoming;

    const map = new Map<string, ChatMessage>();
    this.completedMessages
      .filter((m) => !expectedConvId || !m.conversationId || m.conversationId === expectedConvId)
      .forEach((m) => map.set(m.id, m));
    filteredIncoming.forEach((m) => map.set(m.id, m));
    this.completedMessages = Array.from(map.values()).sort((a, b) =>
      (a.createdAt || a.timestamp || '').localeCompare(b.createdAt || b.timestamp || '')
    );
    this.notify();
  }

  async appendMessageLocally(msg: ChatMessage): Promise<void> {
    const existingIdx = this.completedMessages.findIndex((m) => m.id === msg.id);
    if (existingIdx !== -1) {
      this.completedMessages[existingIdx] = msg;
    } else {
      this.completedMessages = [...this.completedMessages, msg];
    }
    this.notify();
  }

  async persistMessageWithRetry(
    userId: string,
    conversationId: string,
    msg: Omit<ChatMessage, 'id'>,
    customId?: string,
    retries = 3
  ): Promise<string> {
    this.persistenceStatus = 'PENDING_SYNC';
    this.notify();

    const stableId = customId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullMsg: ChatMessage = {
      ...msg,
      id: stableId,
      messageId: stableId,
      conversationId,
      persistenceStatus: 'PENDING_SYNC',
    };

    await this.appendMessageLocally(fullMsg);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await addConversationMessage(userId, conversationId, msg, stableId);
        fullMsg.persistenceStatus = 'SYNCED';
        this.persistenceStatus = 'SYNCED';
        await this.appendMessageLocally(fullMsg);
        return stableId;
      } catch (err) {
        console.warn(`Message persistence attempt ${attempt} failed:`, err);
        if (attempt === retries) {
          fullMsg.persistenceStatus = 'SYNC_FAILED';
          this.persistenceStatus = 'SYNC_FAILED';
          await this.appendMessageLocally(fullMsg);
        }
      }
    }

    return stableId;
  }

  async commitUserVoiceMessageLocally(
    userId: string,
    conversationId: string,
    userText: string,
    turnId: string,
    agentDomain: AgentDomain = 'orchestrator'
  ): Promise<void> {
    const cleanText = deduplicateTranscript(userText ? userText.trim() : '');
    if (!cleanText) return;
    const userMsgId = `user_${turnId}`;
    const existing = this.completedMessages.find((m) => m.id === userMsgId);
    if (existing) return;

    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: userMsgId,
      messageId: userMsgId,
      conversationId,
      role: 'user',
      text: cleanText,
      content: cleanText,
      turnId,
      liveSessionId: this.liveSessionId,
      source: 'voice',
      model: 'gemini-3.1-flash-live-preview',
      agent: agentDomain,
      createdAt: now,
      timestamp: now,
      persistenceStatus: 'PENDING_SYNC',
    };

    const map = new Map<string, ChatMessage>();
    this.completedMessages.forEach((m) => map.set(m.id, m));
    map.set(userMsg.id, userMsg);
    this.completedMessages = Array.from(map.values()).sort((a, b) =>
      (a.createdAt || a.timestamp || '').localeCompare(b.createdAt || b.timestamp || '')
    );
    this.notify();

    addConversationMessage(userId, conversationId, userMsg, userMsgId).catch((err) => {
      console.warn('[ConversationManager] User message background sync error:', err);
    });
  }

  async finalizeVoiceTurn(
    userId: string,
    conversationId: string,
    userText: string,
    modelText: string,
    turnId: string,
    agentDomain: AgentDomain = 'orchestrator'
  ): Promise<void> {
    const cleanUserText = deduplicateTranscript(userText ? userText.trim() : '');
    const now = new Date().toISOString();
    const assistantTime = new Date(Date.now() + 2).toISOString();
    const userMsgId = `user_${turnId}`;
    const assistantMsgId = `assistant_${turnId}`;

    const userPayload: Omit<ChatMessage, 'id'> = {
      role: 'user',
      text: cleanUserText,
      content: cleanUserText,
      turnId,
      liveSessionId: this.liveSessionId,
      source: 'voice',
      model: 'gemini-3.1-flash-live-preview',
      agent: agentDomain,
      createdAt: now,
      timestamp: now,
    };

    const assistantPayload: Omit<ChatMessage, 'id'> = {
      role: 'assistant',
      text: modelText ? modelText.trim() : '',
      content: modelText ? modelText.trim() : '',
      turnId,
      liveSessionId: this.liveSessionId,
      source: 'voice',
      model: 'gemini-3.1-flash-live-preview',
      agent: agentDomain,
      createdAt: assistantTime,
      timestamp: assistantTime,
    };

    const localMessages: ChatMessage[] = [];
    if (userPayload.text) {
      localMessages.push({
        id: userMsgId,
        messageId: userMsgId,
        conversationId,
        ...userPayload,
        persistenceStatus: 'PENDING_SYNC',
      });
    }
    if (assistantPayload.text) {
      localMessages.push({
        id: assistantMsgId,
        messageId: assistantMsgId,
        conversationId,
        ...assistantPayload,
        persistenceStatus: 'PENDING_SYNC',
      });
    }

    if (localMessages.length > 0) {
      const map = new Map<string, ChatMessage>();
      this.completedMessages.forEach((m) => map.set(m.id, m));
      localMessages.forEach((m) => map.set(m.id, m));
      this.completedMessages = Array.from(map.values()).sort((a, b) =>
        (a.createdAt || a.timestamp || '').localeCompare(b.createdAt || b.timestamp || '')
      );
    }

    this.activeStreamingTurn = null;
    this.notify();

    const persistPromises: Promise<any>[] = [];
    if (userPayload.text) {
      persistPromises.push(
        this.persistMessageWithRetry(userId, conversationId, userPayload, userMsgId)
      );
    }
    if (assistantPayload.text) {
      persistPromises.push(
        this.persistMessageWithRetry(userId, conversationId, assistantPayload, assistantMsgId)
      );
    }

    await Promise.all(persistPromises);

    this.turnsSinceSummary += 1;

    if (this.turnsSinceSummary >= 4) {
      this.turnsSinceSummary = 0;
      this.triggerRollingSummary(userId, conversationId, false).catch(() => { });
    }

    this.notify();
  }

  async sendTextMessage(
    userId: string,
    conversationId: string,
    text: string,
    options?: {
      userProfile?: any;
      userData?: any;
      activeDomain?: AgentDomain;
    }
  ): Promise<{ userMessageId: string; assistantMessageId: string; responseText: string }> {
    const now = new Date().toISOString();
    const turnId = this.getNextTurnId('txt');
    const userMsgId = `user_${turnId}`;
    const domain = options?.activeDomain || 'orchestrator';

    this.setAgentActivity({
      domain,
      state: 'Processing text with Gemini 3.8 Flash',
    });

    await this.persistMessageWithRetry(
      userId,
      conversationId,
      {
        role: 'user',
        text,
        content: text,
        source: 'text',
        model: 'gemini-3.8-flash',
        agent: domain,
        turnId,
        liveSessionId: this.liveSessionId,
        createdAt: now,
        timestamp: now,
      },
      userMsgId
    );

    let assistantText = '';
    let chosenDomain: AgentDomain = domain;

    let toolResultMeta: any = null;
    try {
      const recentHistory = this.completedMessages.slice(-8).map((m) => ({
        role: m.role,
        content: m.text || m.content || '',
      }));

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          message: text,
          userId,
          conversationId,
          conversationHistory: recentHistory,
          rollingSummary: this.rollingSummary,
          activeDomain: domain,
          userProfile: options?.userProfile,
          userData: options?.userData,
          calendarState: calendarStateManager.getState(),
          calendarToken: calendarStateManager.getAccessToken(),
          timerState: timerManager.getState(),
          simulateCalendarEmpty: typeof window !== 'undefined' && window.localStorage?.getItem('lifeforge_test_calendar_empty') === 'true',
          simulateCalendarFail: typeof window !== 'undefined' && window.localStorage?.getItem('lifeforge_test_calendar_fail') === 'true',
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`Coach API response status ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payloadStr = trimmed.replace(/^data:\s*/, '');
            try {
              const payload = JSON.parse(payloadStr);
              if (payload.type === 'chunk' && payload.text) {
                this.updateActiveStreamingTurn(turnId, undefined, payload.text);
              } else if (payload.type === 'done') {
                data = payload;
                assistantText = payload.text || '';
              }
            } catch {
            }
          }
        }

        if (!data) {
          assistantText = this.activeStreamingTurn?.assistantText || '';
          data = { text: assistantText };
        }
      } else {
        data = await res.json();
        assistantText = data.text || '';
      }
      if (data.pendingTimer?.durationMinutes || /Shall I start it\?/i.test(assistantText)) {
        const matchMin = assistantText.match(/(\d+)\s*-?\s*minute/i);
        const mins = data.pendingTimer?.durationMinutes || (matchMin ? Number(matchMin[1]) : 25);
        timerManager.requestConfirmation(mins);
      }
      if (data.agentDomain) {
        chosenDomain = data.agentDomain as AgentDomain;
      } else if (data.proposedActions?.domain) {
        chosenDomain = data.proposedActions.domain as AgentDomain;
      }
      if (data.toolResult) {
        toolResultMeta = data.toolResult;
        globalToolGateway.recordExecution({
          requestId: data.toolResult.requestId || `req_${Date.now()}`,
          agentTaskId: data.toolResult.agentTaskId || 'task_coach',
          conversationId,
          turnId,
          tool: data.toolResult.tool,
          agent: data.toolResult.agent || (data.toolResult.tool.includes('goal') || data.toolResult.tool.includes('task') ? 'Goal/Task Agent' : data.toolResult.tool.includes('reflection') ? 'Reflection Agent' : 'Orchestrator'),
          arguments: data.toolResult.arguments || {},
          status: data.toolResult.success ? (data.toolResult.requiresConfirmation ? 'WAITING_CONFIRMATION' : 'COMPLETED') : 'FAILED',
          state: data.toolResult.success ? (data.toolResult.requiresConfirmation ? 'WAITING_CONFIRMATION' : 'COMPLETED') : 'FAILED',
          startedAt: now,
          completedAt: new Date().toISOString(),
          duration: 0.5,
          result: data.toolResult.data,
          error: data.toolResult.error,
        });

        if (data.toolResult.success) {
          if (data.toolResult.tool === 'start_focus_timer') {
            const mins = data.toolResult.arguments?.durationMinutes || 25;
            timerManager.start(mins, 'focus');
          } else if (data.toolResult.tool === 'pause_focus_timer') {
            timerManager.pause();
          } else if (data.toolResult.tool === 'resume_focus_timer') {
            timerManager.resume();
          } else if (data.toolResult.tool === 'restart_focus_timer') {
            timerManager.restart();
          } else if (data.toolResult.tool === 'stop_focus_timer') {
            timerManager.stop();
          }
        }
      }
    } catch (err: any) {
      assistantText = 'I received your message. Let us break down the immediate obstacle, prioritize your deep work window, and execute without hesitation.';
    } finally {
      this.clearActiveStreamingTurn();
    }

    const assistantMsgId = `assistant_${turnId}`;
    const assistantTime = new Date().toISOString();

    await this.persistMessageWithRetry(
      userId,
      conversationId,
      {
        role: 'assistant',
        text: assistantText,
        content: assistantText,
        source: 'text',
        model: 'gemini-3.8-flash',
        agent: chosenDomain,
        turnId,
        liveSessionId: this.liveSessionId,
        metadata: toolResultMeta ? { toolResult: toolResultMeta } : undefined,
        createdAt: assistantTime,
        timestamp: assistantTime,
      },
      assistantMsgId
    );

    this.turnsSinceSummary += 1;

    this.setAgentActivity({
      domain: chosenDomain,
      state: 'Completed',
    });

    if (this.turnsSinceSummary >= 4) {
      this.turnsSinceSummary = 0;
      this.triggerRollingSummary(userId, conversationId, false).catch(() => { });
    }

    return {
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
      responseText: assistantText,
    };
  }

  async resumeConversation(userId: string, conversationId: string): Promise<ResumeContextPayload> {
    this.conversationId = conversationId;
    this.liveSessionId = `live_resume_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const [messages, allConvs] = await Promise.all([
      getConversationMessages(userId, conversationId),
      getConversations(userId),
    ]);

    const targetConv = allConvs.find((c) => c.id === conversationId);
    const summary = targetConv?.rollingSummary || targetConv?.summary || '';

    const recentTail = messages.slice(-8).map((m) => ({
      role: m.role,
      text: m.text || m.content || '',
      content: m.content || m.text || '',
    }));

    const payload: ResumeContextPayload = {
      conversationSummary: summary,
      recentMessages: recentTail,
    };

    this.rollingSummary = summary;
    this.completedMessages = [];
    this.syncIncomingMessages(messages, conversationId);
    this.resumeContext = payload;
    this.persistenceStatus = 'SYNCED';

    await updateConversationStatus(userId, conversationId, 'active', this.liveSessionId);
    this.notify();
    return payload;
  }

  async triggerRollingSummary(userId: string, conversationId: string, isFinal: boolean = false): Promise<void> {
    if (this.isGeneratingSummary || this.completedMessages.length === 0) return;
    this.isGeneratingSummary = true;

    try {
      const res = await fetch('/api/conversation/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          userId,
          messages: this.completedMessages.slice(-12),
          existingSummary: this.rollingSummary,
          isFinal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.rollingSummary) {
          this.rollingSummary = data.rollingSummary;
          await updateConversationSummary(userId, conversationId, data.rollingSummary, data.activeAgent);
        }
      }
    } catch (err) {
      console.warn('Rolling summary failed non-critically:', err);
    } finally {
      this.isGeneratingSummary = false;
      this.notify();
    }
  }

  async endLiveSession(userId: string, conversationId?: string): Promise<void> {
    const targetConvId = conversationId || this.conversationId;
    if (this.activeStreamingTurn) {
      const turn = this.activeStreamingTurn;
      this.activeStreamingTurn = null;
      if (targetConvId && (turn.userText || turn.assistantText)) {
        await this.finalizeVoiceTurn(
          userId,
          targetConvId,
          turn.userText || '',
          turn.assistantText || '',
          turn.turnId,
          'orchestrator'
        );
      }
    }
    if (targetConvId) {
      await updateConversationStatus(userId, targetConvId, 'completed', this.liveSessionId);
      await this.triggerRollingSummary(userId, targetConvId, true).catch(() => {});
    }
    this.setAgentActivity({
      domain: 'orchestrator',
      state: 'Session completed',
      detail: 'Live session ended and transcripts finalized',
      updatedAt: new Date().toLocaleTimeString(),
    });
    this.notify();
  }
}

export const globalConversationManager = new ConversationManager();
