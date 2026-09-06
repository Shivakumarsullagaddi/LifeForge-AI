import { GoogleCalendarEventItem } from './types';
import { loginWithGoogle, getCachedAccessToken, setCachedAccessToken } from './firebase';
import { logStructured } from './logger';

export type CalendarConnectionState =
  | 'DISCONNECTED'
  | 'AUTHORIZING'
  | 'AUTHORIZED'
  | 'VERIFYING'
  | 'CONNECTED'
  | 'EXPIRED'
  | 'ERROR';

export interface CalendarListResponse {
  items?: GoogleCalendarEventItem[];
  nextPageToken?: string;
  error?: {
    code: number;
    message: string;
  };
}

export async function fetchUpcomingCalendarEvents(
  accessToken: string,
  options?: {
    maxResults?: number;
    timeMin?: string;
    timeMax?: string;
    timeZone?: string;
  } | number
): Promise<GoogleCalendarEventItem[]> {
  const opts = typeof options === 'number' ? { maxResults: options } : (options || {});
  const resolvedTimeZone = opts.timeZone || 'Asia/Kolkata';

  if (!accessToken || accessToken === 'null' || accessToken === 'undefined') {
    throw new Error('Google Calendar is not connected: Missing access token');
  }

  if (accessToken === 'mock_google_calendar_test_token') {
    if (typeof window !== 'undefined') {
      if (window.localStorage?.getItem('lifeforge_test_calendar_fail') === 'true') {
        throw new Error('Calendar retrieval failed: Google Calendar API simulated 500 failure');
      }
      if (window.localStorage?.getItem('lifeforge_test_calendar_empty') === 'true') {
        return [];
      }
    }
    try {
      const { testStore } = await import('./test-store');
      return testStore.getCalendarEvents ? testStore.getCalendarEvents('test_e2e_student') : [];
    } catch {
      return [];
    }
  }
  const sod = new Date();
  sod.setHours(0, 0, 0, 0);
  const defaultTimeMin = sod.toISOString();
  const params = new URLSearchParams({
    timeMin: opts.timeMin || defaultTimeMin,
    maxResults: String(opts.maxResults || 20),
    singleEvents: 'true',
    orderBy: 'startTime',
    ...(opts.timeMax ? { timeMax: opts.timeMax } : {}),
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Failed to fetch calendar events: ${response.statusText}`
    );
  }

  const data: CalendarListResponse = await response.json();
  return (data.items || []).map((item: any) => {
    const startIso = item.start?.dateTime || item.start?.date || '';
    const endIso = item.end?.dateTime || item.end?.date || '';
    return {
      ...item,
      id: item.id,
      eventId: item.id,
      calendarId: 'primary',
      title: item.summary || 'Untitled Event',
      summary: item.summary || 'Untitled Event',
      description: item.description || '',
      start: item.start || { dateTime: startIso, timeZone: resolvedTimeZone },
      end: item.end || { dateTime: endIso, timeZone: resolvedTimeZone },
      startDateTime: startIso,
      endDateTime: endIso,
      timezone: item.start?.timeZone || item.end?.timeZone || resolvedTimeZone,
      location: item.location || '',
      source: 'google_calendar',
      status: item.status || 'confirmed',
    };
  });
}

export const getUpcomingGoogleCalendarEvents = fetchUpcomingCalendarEvents;

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime?: string;
    location?: string;
  }
): Promise<GoogleCalendarEventItem> {
  let startIso: string;
  const startDate = new Date(event.startDateTime);
  if (!isNaN(startDate.getTime())) {
    startIso = startDate.toISOString();
  } else {
    startIso = new Date(Date.now() + 3600000).toISOString();
  }

  let endIso: string;
  const endDate = event.endDateTime ? new Date(event.endDateTime) : null;
  if (endDate && !isNaN(endDate.getTime()) && endDate.getTime() > new Date(startIso).getTime()) {
    endIso = endDate.toISOString();
  } else {
    endIso = new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
  }

  if (!accessToken || accessToken === 'null' || accessToken === 'undefined') {
    throw new Error('Google Calendar is not connected: Missing access token');
  }

  if (accessToken === 'mock_google_calendar_test_token') {
    const createdEvent: GoogleCalendarEventItem = {
      id: `mock_created_${Date.now()}`,
      eventId: `mock_created_${Date.now()}`,
      calendarId: 'primary',
      summary: event.summary,
      title: event.summary,
      description: event.description || 'Scheduled via LifeForge AI Study & Career Coach',
      start: { dateTime: startIso },
      end: { dateTime: endIso },
      startDateTime: startIso,
      endDateTime: endIso,
      location: event.location || 'Focus Space',
      status: 'confirmed',
    };
    try {
      const { testStore } = await import('./test-store');
      testStore.addCalendarEvent('test_e2e_student', createdEvent);
    } catch {}
    return createdEvent;
  }

  const payload = {
    summary: event.summary,
    description: event.description || 'Scheduled via LifeForge AI Study & Career Coach',
    location: event.location || 'Focus Space',
    start: {
      dateTime: startIso,
    },
    end: {
      dateTime: endIso,
    },
  };

  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Failed to schedule calendar event: ${response.statusText}`
    );
  }

  return await response.json();
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  if (!accessToken || accessToken === 'null' || accessToken === 'undefined') {
    throw new Error('Google Calendar is not connected: Missing access token');
  }

  if (accessToken === 'mock_google_calendar_test_token') {
    try {
      const { testStore } = await import('./test-store');
      testStore.deleteCalendarEvent('test_e2e_student', eventId);
    } catch {}
    return;
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Failed to delete calendar event: ${response.statusText}`
    );
  }
}

export class CalendarStateManager {
  private state: CalendarConnectionState = 'DISCONNECTED';
  private accessToken: string | null = null;
  private error: string | null = null;
  private listeners: Set<() => void> = new Set();
  private verifiedEvents: GoogleCalendarEventItem[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const local = window.localStorage.getItem('lifeforge_calendar_state');
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.state === 'CONNECTED' && parsed.accessToken) {
            this.state = 'CONNECTED';
            this.accessToken = parsed.accessToken;
            setCachedAccessToken(parsed.accessToken);
          }
        }
      } catch {}
      const cached = getCachedAccessToken();
      if (cached && !this.accessToken) {
        this.accessToken = cached;
      }
    }
  }

  private persist(): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          'lifeforge_calendar_state',
          JSON.stringify({
            state: this.state,
            accessToken: this.accessToken,
          })
        );
      } catch {}
    }
  }

  getState(): CalendarConnectionState {
    return this.state;
  }

  getAccessToken(): string | null {
    return this.accessToken || getCachedAccessToken();
  }

  getError(): string | null {
    return this.error;
  }

  getVerifiedEvents(): GoogleCalendarEventItem[] {
    return [...this.verifiedEvents];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  setState(newState: CalendarConnectionState, err?: string | null): void {
    this.state = newState;
    this.error = err || null;
    this.persist();
    this.notify();
  }

  setDisconnected(): void {
    this.state = 'DISCONNECTED';
    this.accessToken = null;
    this.error = null;
    this.verifiedEvents = [];
    setCachedAccessToken(null);
    this.persist();
    this.notify();
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    setCachedAccessToken(token);
    if (token) {
      this.state = 'CONNECTED';
    }
    this.persist();
    this.notify();
  }

  async verifyCalendarAccess(token: string): Promise<boolean> {
    this.setState('VERIFYING');
    await new Promise((r) => setTimeout(r, 150));
    try {
      const items = await fetchUpcomingCalendarEvents(token, 5);
      this.accessToken = token;
      setCachedAccessToken(token);
      this.verifiedEvents = items;
      this.setState('CONNECTED');
      return true;
    } catch (err: any) {
      this.setState('ERROR', err.message || 'Failed to verify Google Calendar access');
      return false;
    }
  }

  async initiateCalendarOAuth(): Promise<boolean> {
    this.setState('AUTHORIZING');
    await new Promise((r) => setTimeout(r, 150));
    try {
      const { accessToken: token } = await loginWithGoogle();
      if (!token) {
        this.setState('ERROR', 'OAuth completed but no access token was granted');
        return false;
      }
      this.accessToken = token;
      this.setState('AUTHORIZED');
      await new Promise((r) => setTimeout(r, 150));
      const ok = await this.verifyCalendarAccess(token);
      logStructured('CALENDAR', `OAuth verification result: ${ok ? 'CONNECTED' : 'ERROR'}`);
      return ok;
    } catch (err: any) {
      const message = err?.message || 'Google OAuth authorization failed';
      this.setState('ERROR', message);
      logStructured('CALENDAR', `OAuth authorization error: ${message}`);
      return false;
    }
  }
}

const globalForCalendar = globalThis as unknown as {
  __lifeforge_calendar_manager?: CalendarStateManager;
};

export const calendarStateManager =
  globalForCalendar.__lifeforge_calendar_manager || new CalendarStateManager();

if (!globalForCalendar.__lifeforge_calendar_manager) {
  globalForCalendar.__lifeforge_calendar_manager = calendarStateManager;
}
