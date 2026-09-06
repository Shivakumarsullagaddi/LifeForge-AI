'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import {
  fetchUpcomingCalendarEvents,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  calendarStateManager,
  type CalendarConnectionState,
} from '@/lib/calendar';
import { addActionConfirmation } from '@/lib/firebase';
import type { GoogleCalendarEventItem } from '@/lib/types';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Trash2,
  Lock,
  Sparkles,
  CalendarCheck,
  MapPin,
  Flame,
} from 'lucide-react';

export const CalendarView: React.FC = () => {
  const { user, accessToken, requestGoogleCalendarAuth } = useAuth();
  const [calendarState, setCalendarState] = useState<CalendarConnectionState>(() => calendarStateManager.getState());
  const [events, setEvents] = useState<GoogleCalendarEventItem[]>(() => calendarStateManager.getVerifiedEvents());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const getDefaultStart = () => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  };

  const getDefaultEnd = () => {
    const start = new Date();
    start.setHours(start.getHours() + 2, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  };

  // New Event Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [summary, setSummary] = useState('Deep Work: DSA & System Design Sprints');
  const [description, setDescription] = useState('25/5 Pomodoro focus blocks scheduled with LifeForge AI Coach');
  const [startDateTime, setStartDateTime] = useState(getDefaultStart);
  const [endDateTime, setEndDateTime] = useState(getDefaultEnd);
  const [location, setLocation] = useState('Study Lab / Quiet Room');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Delete Confirmation Modal State
  const [deletingEvent, setDeletingEvent] = useState<GoogleCalendarEventItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const initDefaultTimes = useCallback(() => {
    setStartDateTime(getDefaultStart());
    setEndDateTime(getDefaultEnd());
  }, []);

  const loadCalendarEvents = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchUpcomingCalendarEvents(token, 25);
      setEvents(items);
    } catch (err: any) {
      console.error('Failed to load Google Calendar events:', err);
      setError(err.message || 'Unable to load calendar events. Token may be expired.');
    } finally {
      setLoading(false);
    }
  }, []);

  const isConnected = calendarState === 'CONNECTED';
  const effectiveToken = accessToken || calendarStateManager.getAccessToken();

  useEffect(() => {
    const unsub = calendarStateManager.subscribe(() => {
      setCalendarState(calendarStateManager.getState());
      const vEvents = calendarStateManager.getVerifiedEvents();
      if (vEvents.length > 0) {
        setEvents(vEvents);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (accessToken && calendarStateManager.getState() === 'DISCONNECTED') {
      calendarStateManager.verifyCalendarAccess(accessToken).catch(() => {});
    }
  }, [accessToken]);

  const handleConnectCalendar = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const ok = await calendarStateManager.initiateCalendarOAuth();
      if (ok) {
        const token = calendarStateManager.getAccessToken();
        if (token) {
          await loadCalendarEvents(token);
        }
      } else {
        setError(calendarStateManager.getError() || 'Google Calendar authorization was not granted.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate Google Calendar');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleScheduleEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveToken || !summary.trim() || !startDateTime || !endDateTime) return;

    setIsSubmittingEvent(true);
    setError(null);

    try {
      const isoStart = new Date(startDateTime).toISOString();
      const isoEnd = new Date(endDateTime).toISOString();

      await createGoogleCalendarEvent(effectiveToken, {
        summary: summary.trim(),
        description: description.trim(),
        startDateTime: isoStart,
        endDateTime: isoEnd,
        location: location.trim(),
      });

      setIsCreateModalOpen(false);
      await loadCalendarEvents(effectiveToken);
    } catch (err: any) {
      console.error('Failed to create calendar event:', err);
      setError(err.message || 'Failed to create event in Google Calendar');
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!effectiveToken || !deletingEvent) return;
    setIsDeleting(true);
    try {
      if (user) {
        await addActionConfirmation(user.uid, {
          actionType: 'external_calendar_write',
          title: `Deleted Calendar Event: ${deletingEvent.summary}`,
          description: `User-confirmed removal of external calendar event ${deletingEvent.id}`,
          status: 'approved',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          requestedAt: new Date().toISOString(),
          resolvedAt: new Date().toISOString(),
        });
      }

      await deleteGoogleCalendarEvent(effectiveToken, deletingEvent.id);
      setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id));
      setDeletingEvent(null);
    } catch (err: any) {
      console.error('Failed to delete event:', err);
      setError(err.message || 'Failed to delete calendar event');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatEventDate = (dtString?: string, dateOnlyString?: string) => {
    if (dtString) {
      const d = new Date(dtString);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (dateOnlyString) {
      return new Date(dateOnlyString).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
    return 'Undated';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Calendar Integration Status */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <Badge variant="amber" size="sm">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Google Calendar Sync</span>
            </Badge>
            <Badge variant={isConnected ? 'emerald' : calendarState === 'AUTHORIZING' || calendarState === 'VERIFYING' ? 'amber' : 'slate'} size="sm">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {isConnected
                  ? 'Calendar Connected'
                  : calendarState === 'AUTHORIZING'
                  ? 'Authorizing...'
                  : calendarState === 'VERIFYING'
                  ? 'Verifying...'
                  : 'Permission Required'}
              </span>
            </Badge>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Schedule & Study Session Synchronization
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Inspect upcoming technical interviews, college exams, and time-block 25/5 Pomodoro focus sessions directly with your Google Calendar.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          {isConnected ? (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  initDefaultTimes();
                  setIsCreateModalOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Schedule Focus Block</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => effectiveToken && loadCalendarEvents(effectiveToken)}
                isLoading={loading}
                className="gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync</span>
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={handleConnectCalendar}
              isLoading={isAuthenticating || calendarState === 'AUTHORIZING' || calendarState === 'VERIFYING'}
              className="gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>
                {calendarState === 'AUTHORIZING'
                  ? 'Authorizing OAuth...'
                  : calendarState === 'VERIFYING'
                  ? 'Verifying Calendar API...'
                  : 'Connect Google Calendar'}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Error / Alert banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-200">Calendar Error</div>
            <p className="mt-0.5">{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnectCalendar}
            className="text-xs text-rose-300 border-rose-800"
          >
            Re-authorize
          </Button>
        </div>
      )}

      {/* Quick Study Session Suggestions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>DSA & Logic Practice Block</span>
            </div>
            <Badge variant="amber" size="sm">90 min</Badge>
          </div>
          <p className="text-xs text-slate-400">
            3x 25/5 active recall cycles dedicated to Graphs, Dynamic Programming, and Tree Traversals.
          </p>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isConnected}
            onClick={() => {
              setSummary('Deep Work: DSA Graphs & DP Sprints');
              setDescription('3 Pomodoro cycles solving LeetCode Medium/Hard graphs with active recall');
              setIsCreateModalOpen(true);
            }}
            className="text-xs text-amber-400 p-0 hover:underline"
          >
            + Quick Block on Calendar
          </Button>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Teach-Back & Core CS</span>
            </div>
            <Badge variant="sky" size="sm">60 min</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Operating Systems & DBMS revision using the teach-back method (Virtual Memory, ACID, Indexing).
          </p>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isConnected}
            onClick={() => {
              setSummary('Core CS Revision: OS & DBMS Teach-Back');
              setDescription('Explain virtual memory, page replacement, and indexing mechanisms from scratch');
              setIsCreateModalOpen(true);
            }}
            className="text-xs text-sky-400 p-0 hover:underline"
          >
            + Quick Block on Calendar
          </Button>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mock Interview & Resume Defense</span>
            </div>
            <Badge variant="emerald" size="sm">45 min</Badge>
          </div>
          <p className="text-xs text-slate-400">
            System architecture trade-offs and behavioral STAR questions with the Placement Agent.
          </p>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isConnected}
            onClick={() => {
              setSummary('Mock Interview: System Design & STAR Stories');
              setDescription('Defense of key project architectural tradeoffs with LifeForge Coach');
              setIsCreateModalOpen(true);
            }}
            className="text-xs text-emerald-400 p-0 hover:underline"
          >
            + Quick Block on Calendar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-amber-500" />
              <span>Upcoming Google Calendar Events</span>
            </CardTitle>
            <CardDescription>
              {isConnected
                ? `${events.length} upcoming events found on your primary calendar`
                : 'Connect your Google Calendar to view upcoming schedules'}
            </CardDescription>
          </div>
          {isConnected && (
            <Badge variant="slate" size="sm">
              Primary Calendar
            </Badge>
          )}
        </CardHeader>

        <div className="space-y-3">
          {!isConnected ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl space-y-3">
              <Lock className="w-10 h-10 text-slate-500 mx-auto opacity-60" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-200">Google Calendar Not Connected</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Grant permission to securely view and schedule focus blocks, interview dates, and study sessions directly in your calendar.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={handleConnectCalendar}
                isLoading={isAuthenticating || calendarState === 'AUTHORIZING' || calendarState === 'VERIFYING'}
                className="gap-2 text-xs"
              >
                <CalendarIcon className="w-3.5 h-3.5" /> Authorize Google Calendar
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="h-16 bg-slate-900 rounded-xl animate-pulse" />
              <div className="h-16 bg-slate-900 rounded-xl animate-pulse" />
              <div className="h-16 bg-slate-900 rounded-xl animate-pulse" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl space-y-3">
              <CalendarCheck className="w-10 h-10 text-emerald-500 mx-auto opacity-70" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-200">No Upcoming Events Found</h3>
                <p className="text-xs text-slate-400">
                  Your calendar is completely open. Schedule a focused study sprint or mock interview!
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  initDefaultTimes();
                  setIsCreateModalOpen(true);
                }}
                className="gap-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Schedule Focus Sprint
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 rounded-lg transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200 truncate">
                        {event.summary || '(Untitled Event)'}
                      </span>
                      {event.summary?.toLowerCase().includes('interview') && (
                        <Badge variant="rose" size="sm">Interview</Badge>
                      )}
                      {event.summary?.toLowerCase().includes('study') && (
                        <Badge variant="amber" size="sm">Study Block</Badge>
                      )}
                      {event.summary?.toLowerCase().includes('deep work') && (
                        <Badge variant="sky" size="sm">Deep Work</Badge>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-1">{event.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {formatEventDate(event.start?.dateTime, event.start?.date)}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {event.htmlLink && (
                      <a
                        href={event.htmlLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Open in Google Calendar"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => setDeletingEvent(event)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                      title="Remove event"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Schedule Focus Event Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Schedule Focus or Study Block"
        description="This will add a synchronized event to your Google Calendar."
      >
        <form onSubmit={handleScheduleEvent} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold">Event Title / Subject</label>
            <input
              type="text"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Deep Work: Graph Algorithms & Dynamic Programming"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold">Start Time</label>
              <input
                type="datetime-local"
                required
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold">End Time</label>
              <input
                type="datetime-local"
                required
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold">Location (Optional)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Study Desk / Google Meet / Library"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold">Description / Study Goals</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key concepts to master, problems to solve, active recall goals..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-[11px] text-amber-300/90 leading-relaxed">
            <strong>User Confirmation:</strong> By clicking Confirm, this session will be created in your Google Calendar account.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmittingEvent}
              className="gap-2"
            >
              <CalendarCheck className="w-3.5 h-3.5" /> Confirm & Schedule
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingEvent)}
        onClose={() => setDeletingEvent(null)}
        title="Confirm Calendar Event Deletion"
        description="Are you sure you want to remove this event from Google Calendar?"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <div className="font-semibold text-slate-100">{deletingEvent?.summary}</div>
            <div className="text-[11px] text-slate-400">
              {formatEventDate(deletingEvent?.start?.dateTime, deletingEvent?.start?.date)}
            </div>
          </div>

          <p className="text-slate-300 leading-relaxed">
            This will permanently remove the event from your Google Calendar. This action cannot be undone.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingEvent(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isDeleting}
              onClick={handleConfirmDelete}
              className="gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
