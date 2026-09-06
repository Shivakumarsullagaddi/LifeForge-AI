import { authoritativeState } from '@/lib/state/applicationState';

export type UIActionType =
  | 'UPLOAD_RESUME'
  | 'UPLOAD_UPDATED_RESUME'
  | 'CANCEL_RESUME'
  | 'CONNECT_CALENDAR'
  | 'CANCEL_CALENDAR'
  | 'CONFIRM_DELETE'
  | 'CANCEL_DELETE'
  | 'START_TIMER'
  | 'PAUSE_TIMER'
  | 'RESUME_TIMER'
  | 'RESTART_TIMER'
  | 'STOP_TIMER'
  | 'CONFIRM_TIMER'
  | 'CANCEL_TIMER';

export interface UIActionEvent {
  eventId: string;
  userId: string;
  conversationId?: string | null;
  action: UIActionType;
  timestamp: string;
  payload?: Record<string, any>;
}

export type UIActionListener = (event: UIActionEvent) => void;

class UIActionBus {
  private static instance: UIActionBus;
  private listeners: Set<UIActionListener> = new Set();
  private history: UIActionEvent[] = [];

  public static getInstance(): UIActionBus {
    if (!UIActionBus.instance) {
      UIActionBus.instance = new UIActionBus();
    }
    return UIActionBus.instance;
  }

  public emit(action: UIActionType, payload?: Record<string, any>, userId?: string, conversationId?: string | null): UIActionEvent {
    const currentState = authoritativeState.getState();
    const resolvedUserId = userId || currentState.userId || 'anonymous';
    const resolvedConvId = conversationId !== undefined ? conversationId : currentState.activeConversationId;

    const event: UIActionEvent = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: resolvedUserId,
      conversationId: resolvedConvId,
      action,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.history.unshift(event);
    if (this.history.length > 50) {
      this.history.pop();
    }

    if (action === 'CANCEL_RESUME') {
      console.log('[UIEvent] CANCEL_RESUME handled');
      authoritativeState.updateResume({ resumeAction: 'CANCELLED' });
    } else if (action === 'UPLOAD_RESUME' || action === 'UPLOAD_UPDATED_RESUME') {
      console.log('[UIEvent] UPLOAD_RESUME handled');
      authoritativeState.updateResume({ resumeAction: 'UPLOADED' });
    } else if (action === 'CANCEL_CALENDAR') {
      console.log('[UIEvent] CANCEL_CALENDAR handled');
    } else if (action === 'CONNECT_CALENDAR') {
      authoritativeState.updateCalendar({ status: 'AUTHORIZING' });
    } else if (action === 'START_TIMER') {
      const duration = payload?.durationSeconds || 1500;
      authoritativeState.updateTimer({
        status: 'RUNNING',
        mode: payload?.mode || 'focus',
        durationSeconds: duration,
        remainingSeconds: duration,
        startedAt: new Date().toISOString(),
      });
    } else if (action === 'PAUSE_TIMER') {
      authoritativeState.updateTimer({
        status: 'PAUSED',
        pausedAt: new Date().toISOString(),
      });
    } else if (action === 'RESUME_TIMER') {
      authoritativeState.updateTimer({
        status: 'RUNNING',
      });
    } else if (action === 'STOP_TIMER') {
      authoritativeState.updateTimer({
        status: 'STOPPED',
      });
    }

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[UIActionBus] Listener error:', err);
      }
    });

    return event;
  }

  public subscribe(listener: UIActionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getRecentEvents(): UIActionEvent[] {
    return [...this.history];
  }
}

export const uiActionBus = UIActionBus.getInstance();
