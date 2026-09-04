import { GoogleCalendarEventItem } from './types';

export interface CalendarListResponse {
  items?: GoogleCalendarEventItem[];
  nextPageToken?: string;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Fetch upcoming Google Calendar events for the user.
 */
export async function fetchUpcomingCalendarEvents(
  accessToken: string,
  maxResults = 20
): Promise<GoogleCalendarEventItem[]> {
  const now = new Date().toISOString();
  const params = new URLSearchParams({
    timeMin: now,
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
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
  return data.items || [];
}

/**
 * Schedule a new study, focus, or interview session to Google Calendar.
 * Destructive / mutating external action: must always have explicit user confirmation.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startDateTime: string; // ISO String
    endDateTime: string;   // ISO String
    location?: string;
  }
): Promise<GoogleCalendarEventItem> {
  const payload = {
    summary: event.summary,
    description: event.description || 'Scheduled via LifeForge AI Study & Career Coach',
    location: event.location || 'Focus Space',
    start: {
      dateTime: event.startDateTime,
    },
    end: {
      dateTime: event.endDateTime,
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

/**
 * Delete a calendar event by ID.
 * Destructive action: requires confirmation.
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
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
