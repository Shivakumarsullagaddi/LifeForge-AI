import { GoalItem, TaskItem } from '@/lib/types';
import type { CalendarConnectionState } from '@/lib/calendar';

export type CalendarStatus = CalendarConnectionState | 'DISCONNECTED' | 'AUTHORIZING' | 'VERIFYING' | 'CONNECTED' | 'EXPIRED' | 'ERROR';
export type ResumeStatus = 'RESUME_REQUIRED' | 'UPLOADED' | 'ANALYZING' | 'READY' | 'ERROR';
export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';
export type TimerMode = 'focus' | 'break';

export interface CalendarState {
  status: CalendarStatus;
  account?: string;
  lastVerifiedAt?: string;
}

export interface ResumeState {
  status: ResumeStatus;
  resumeAction?: 'CANCELLED' | 'UPLOADED' | 'DISMISSED' | null;
  resumeId?: string;
  analysisStatus?: 'PENDING' | 'READY' | 'FAILED' | 'COMPLETED';
  updatedAt?: string;
  uploadedAt?: string;
  summary?: string;
  skills?: string[];
  projects?: Array<{ name?: string; title?: string; description?: string; techStack?: string[] }>;
}

export interface TimerState {
  status: TimerStatus;
  mode: TimerMode;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
}

export type { GoalItem, TaskItem };

export interface LiveAgentState {
  activeAgent: string;
  connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
  audioStatus: 'IDLE' | 'LISTENING' | 'SPEAKING';
  lastHandoffAt?: string;
}

export interface ApplicationState {
  userId: string;
  activeConversationId: string | null;
  activeSessionId: string | null;
  calendar: CalendarState;
  resume: ResumeState;
  timer: TimerState;
  goals: GoalItem[];
  tasks: TaskItem[];
  liveAgent: LiveAgentState;
  lastUpdatedAt: string;
}

export function createDefaultApplicationState(userId: string = ''): ApplicationState {
  return {
    userId,
    activeConversationId: null,
    activeSessionId: null,
    calendar: {
      status: 'DISCONNECTED',
    },
    resume: {
      status: 'RESUME_REQUIRED',
    },
    timer: {
      status: 'IDLE',
      mode: 'focus',
      durationSeconds: 1500,
      remainingSeconds: 1500,
    },
    goals: [],
    tasks: [],
    liveAgent: {
      activeAgent: 'General Coach',
      connectionStatus: 'DISCONNECTED',
      audioStatus: 'IDLE',
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}

export type StateListener = (state: ApplicationState) => void;

class AuthoritativeStateManager {
  private static instance: AuthoritativeStateManager;
  private state: ApplicationState;
  private listeners: Set<StateListener> = new Set();

  private constructor() {
    this.state = createDefaultApplicationState();
  }

  public static getInstance(): AuthoritativeStateManager {
    if (!AuthoritativeStateManager.instance) {
      AuthoritativeStateManager.instance = new AuthoritativeStateManager();
    }
    return AuthoritativeStateManager.instance;
  }

  public getState(): ApplicationState {
    return { ...this.state };
  }

  public setUserId(userId: string): void {
    if (this.state.userId !== userId) {
      this.state.userId = userId;
      this.state.lastUpdatedAt = new Date().toISOString();
      this.notify();
    }
  }

  public updateCalendar(updates: Partial<CalendarState>): void {
    this.state.calendar = { ...this.state.calendar, ...updates };
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public updateResume(updates: Partial<ResumeState>): void {
    this.state.resume = { ...this.state.resume, ...updates };
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public updateTimer(updates: Partial<TimerState>): void {
    this.state.timer = { ...this.state.timer, ...updates };
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public setGoals(goals: GoalItem[]): void {
    this.state.goals = [...goals];
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public setTasks(tasks: TaskItem[]): void {
    this.state.tasks = [...tasks];
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public updateLiveAgent(updates: Partial<LiveAgentState>): void {
    this.state.liveAgent = { ...this.state.liveAgent, ...updates };
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public setConversation(conversationId: string | null, sessionId: string | null = null): void {
    this.state.activeConversationId = conversationId;
    if (sessionId !== null) {
      this.state.activeSessionId = sessionId;
    }
    this.state.lastUpdatedAt = new Date().toISOString();
    this.notify();
  }

  public reset(userId: string = ''): void {
    this.state = createDefaultApplicationState(userId);
    this.notify();
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[StateManager] Listener error:', err);
      }
    });
  }
}

export const authoritativeState = AuthoritativeStateManager.getInstance();
