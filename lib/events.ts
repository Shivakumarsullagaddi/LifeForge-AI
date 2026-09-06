export type UserActionType =
  | 'CONNECT_CALENDAR'
  | 'CALENDAR_CONNECT'
  | 'CANCEL_CALENDAR'
  | 'CALENDAR_CANCEL'
  | 'DISMISS_CALENDAR'
  | 'UPLOAD_RESUME'
  | 'CANCEL_RESUME'
  | 'CONFIRM_DELETE'
  | 'DELETE_CONFIRM'
  | 'REJECT_DELETE'
  | 'DELETE_CANCEL'
  | 'START_TIMER'
  | 'PAUSE_TIMER'
  | 'RESUME_TIMER'
  | 'RESTART_TIMER'
  | 'STOP_TIMER'
  | 'CONFIRM_TIMER'
  | 'CANCEL_TIMER';

export interface StructuredUserActionEvent {
  type: 'USER_ACTION';
  actionId: string;
  conversationId: string;
  turnId: string;
  action: UserActionType;
  result: 'CONNECTED' | 'CANCELLED' | 'USER_CANCELLED' | 'READY' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'CONNECTING' | 'DISMISSED';
  payload?: any;
  calendarToken?: string | null;
  timestamp: string;
}

type ActionEventListener = (event: StructuredUserActionEvent) => void;
const actionListeners: Set<ActionEventListener> = new Set();

export function subscribeUserActions(listener: ActionEventListener): () => void {
  actionListeners.add(listener);
  return () => {
    actionListeners.delete(listener);
  };
}

import { uiActionBus, UIActionType } from './events/uiEvents';

export function emitUserAction(event: StructuredUserActionEvent): void {
  actionListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.error('[UserAction] Listener error:', e);
    }
  });

  try {
    const busAction = event.action as unknown as UIActionType;
    uiActionBus.emit(busAction, event.payload, undefined, event.conversationId);
  } catch (err) {
    console.error('[UserAction] uiActionBus sync error:', err);
  }
}
