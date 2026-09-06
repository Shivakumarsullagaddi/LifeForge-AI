import { loadEnvConfig } from '@next/env';
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { createServer } from 'http';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { executeAgentTask } from './lib/live/agentHandoff';
import { calendarStateManager, fetchUpcomingCalendarEvents } from './lib/calendar';
import { resumeService } from './lib/placement/resumeService';
import { initReflectionScheduler } from './lib/reflection-scheduler';
import { globalToolGateway } from './lib/tools/gateway';

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port, dir: projectDir });
const handle = app.getRequestHandler();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface ClientSessionState {
  userId: string;
  userProfile?: any;
  activeDomain?: string;
  userData?: any;
  calendarState?: string;
  calendarToken?: string | null;
  conversationId?: string;
  resumeContext?: any;
  liveSession?: any;
  pingInterval?: NodeJS.Timeout;
  isAlive: boolean;
  lastUserTranscript?: string;
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('Error handling request', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host || `localhost:${port}`;
    const protocol = (req.socket as any)?.encrypted ? 'https' : 'http';
    const requestUrl = new URL(req.url || '/', `${protocol}://${host}`);
    if (requestUrl.pathname === '/api/live-ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    const sessionState: ClientSessionState = {
      userId: 'anonymous_user',
      isAlive: true,
    };

    // Keepalive ping/pong
    clientWs.on('pong', () => {
      sessionState.isAlive = true;
    });

    sessionState.pingInterval = setInterval(() => {
      if (!sessionState.isAlive) {
        console.log('[Live WS] Client heartbeat timed out, terminating');
        clientWs.terminate();
        return;
      }
      sessionState.isAlive = false;
      clientWs.ping();
    }, 25000);

    const safeSend = (payload: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'calendar_state_update') {
          if (msg.calendarState) {
            sessionState.calendarState = msg.calendarState;
            calendarStateManager.setState(msg.calendarState);
          }
          if (msg.calendarToken) {
            sessionState.calendarToken = msg.calendarToken;
            calendarStateManager.setAccessToken(msg.calendarToken);
          }
          return;
        }

        if (msg.type === 'USER_ACTION') {
          console.log(`[USER_ACTION] ${msg.action} result=${msg.result} user=${sessionState.userId}`);
          let calendarNarrative = '';

          if (msg.action === 'CONNECT_CALENDAR') {
            if (msg.result === 'CONNECTING') {
              sessionState.calendarState = 'AUTHORIZING';
              calendarNarrative = '[System Event: User is connecting Google Calendar now in the UI.]';
            } else if (msg.result === 'CONNECTED') {
              sessionState.calendarState = 'CONNECTED';
              const token = msg.payload?.token || msg.calendarToken || msg.token || (sessionState.userId.startsWith('test_') ? 'mock_google_calendar_test_token' : null);
              sessionState.calendarToken = token;
              if (token) {
                calendarStateManager.setState('CONNECTED');
                calendarStateManager.setAccessToken(token);
              }

              let eventDetails = '';
              let calEvents: any[] = [];
              try {
                const sod = new Date();
                sod.setHours(0, 0, 0, 0);
                calEvents = await fetchUpcomingCalendarEvents(token, { timeMin: sod.toISOString(), maxResults: 10 });
                if (calEvents.length > 0) {
                  eventDetails = `Found ${calEvents.length} upcoming event${calEvents.length === 1 ? '' : 's'}: ` + calEvents.map((e: any) => `"${e.summary || e.title}" (${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (e.startDateTime ? new Date(e.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'scheduled')})`).join(', ');
                } else {
                  eventDetails = 'No upcoming events found in calendar.';
                }
              } catch (e: any) {
                console.error('[Live WS] Error fetching calendar events on connect:', e);
                eventDetails = 'Calendar connected, but failed to fetch events: ' + (e?.message || 'API error');
              }

              safeSend({
                type: 'agent_task_complete',
                domain: 'calendar',
                spokenSummary: calEvents.length > 0 ? `Google Calendar connected. ${eventDetails}.` : 'Google Calendar connected. No upcoming events found in your calendar.',
                structuredDetails: {
                  events: calEvents,
                  count: calEvents.length,
                  verified: true,
                  tool: 'get_calendar_events',
                  status: 'CONNECTED',
                },
                toolExecution: {
                  requestId: `live_cal_connect_${Date.now()}`,
                  agentTaskId: `task_cal_${Date.now()}`,
                  conversationId: sessionState.conversationId || 'live_voice_session',
                  turnId: `turn_${Date.now()}`,
                  tool: 'get_calendar_events',
                  agent: 'Calendar Agent',
                  status: 'COMPLETED',
                  state: 'COMPLETED',
                  arguments: {},
                  result: { events: calEvents, count: calEvents.length },
                  startedAt: new Date(Date.now() - 200).toISOString(),
                  completedAt: new Date().toISOString(),
                  duration: 0.2,
                },
              });

              if (calEvents.length > 0) {
                calendarNarrative = `[System Event: Google Calendar successfully CONNECTED. Verified real events from user calendar: ${eventDetails}. You MUST immediately report these exact upcoming events to the user. NEVER guess, make up, or hallucinate other events.]`;
              } else {
                calendarNarrative = `[System Event: Google Calendar successfully CONNECTED. Verified 0 upcoming events. You MUST immediately state to the user: "Your Google Calendar is connected, and you have no upcoming events scheduled." NEVER invent dummy events.]`;
              }
            } else if (msg.result === 'FAILED') {
              sessionState.calendarState = 'DISCONNECTED';
              sessionState.calendarToken = null;
              calendarStateManager.setState('ERROR');
              calendarNarrative = `[System Event: Google Calendar connection was unsuccessful: ${msg.payload?.error || 'Authorization failed'}. Tell the user directly that the calendar connection was unsuccessful.]`;
            }
          } else if (msg.action === 'CANCEL_CALENDAR' || msg.action === 'DISMISS_CALENDAR') {
            sessionState.calendarState = 'DISCONNECTED';
            sessionState.calendarToken = null;
            calendarStateManager.setDisconnected();
            calendarNarrative = '[System Event: User dismissed or cancelled Google Calendar connection. Calendar is now DISCONNECTED.]';
          } else if (msg.action === 'UPLOAD_RESUME' && msg.result === 'READY') {
            if (msg.payload?.resumeProfile) {
              sessionState.resumeContext = msg.payload.resumeProfile;
            }
          }

          if (sessionState.liveSession) {
            let narrative = calendarNarrative;
            if (!narrative) {
              if (msg.action === 'UPLOAD_RESUME') {
                narrative = msg.result === 'READY'
                  ? '[System Event: User uploaded resume. Resume state is now READY and analyzed.]'
                  : '[System Event: User cancelled the resume upload request.]';
              } else if (msg.action === 'CANCEL_RESUME') {
                narrative = '[System Event: User cancelled the resume upload request.]';
              } else if (msg.action === 'CONFIRM_DELETE') {
                narrative = `[System Event: User confirmed deletion of ${msg.payload?.taskTitle || 'item'}.]`;
              } else if (msg.action === 'REJECT_DELETE') {
                narrative = `[System Event: User rejected deletion of ${msg.payload?.taskTitle || 'item'}.]`;
              }
            }

            if (narrative) {
              try {
                sessionState.liveSession.sendRealtimeInput({
                  text: narrative,
                });
              } catch (e) {
                console.error('[Live WS] Error sending USER_ACTION narrative to liveSession:', e);
              }
            }
          }
          return;
        }

        if (msg.type === 'init') {
          console.log(`[Live WS] Received init request for user: ${msg.userId}, conversation: ${msg.conversationId}`);
          if (sessionState.liveSession) {
            try {
              sessionState.liveSession.close();
            } catch { }
            sessionState.liveSession = undefined;
          }
          sessionState.userId = msg.userId || 'current_user';
          sessionState.conversationId = msg.conversationId || 'live_voice_session';
          sessionState.userProfile = msg.userProfile;
          sessionState.activeDomain = msg.activeDomain || 'orchestrator';
          sessionState.userData = msg.userData;
          if (msg.userData?.placementProfile?.resumeProfile) {
            resumeService.syncResumeContext(
              sessionState.userId,
              msg.userData.placementProfile.resumeProfile,
              msg.userData.resumeMetadata
            );
          }
          const activeCalToken = msg.calendarToken || null;
          const activeCalState = msg.calendarState || 'DISCONNECTED';
          sessionState.calendarToken = activeCalToken;
          sessionState.calendarState = activeCalState;
          if (activeCalToken) {
            calendarStateManager.setAccessToken(activeCalToken);
            calendarStateManager.setState(activeCalState);
          } else {
            calendarStateManager.setDisconnected();
          }

          const userName = sessionState.userProfile?.displayName || 'Student';
          const targetGoal = sessionState.userProfile?.primaryGoal || 'mastering computer science & engineering placements';

          let resumeBlock = '';
          const userResume = msg.userData?.placementProfile?.resumeProfile;
          if (userResume && (userResume.summary || (userResume.skills && userResume.skills.length > 0))) {
            resumeBlock += `\n\nUSER UPLOADED RESUME (SOURCE OF TRUTH FROM PLACEMENT):\n` +
              (userResume.fileName ? `- File: ${userResume.fileName}\n` : '') +
              (userResume.summary ? `- Summary: ${userResume.summary}\n` : '') +
              (userResume.skills?.length ? `- Verified Skills: ${userResume.skills.join(', ')}\n` : '') +
              (userResume.strengths?.length ? `- Strengths: ${userResume.strengths.join('; ')}\n` : '') +
              (userResume.gaps?.length ? `- Gaps: ${userResume.gaps.join('; ')}\n` : '') +
              (userResume.projects?.length ? `- Projects: ${userResume.projects.map((p: any) => p.title).join(', ')}\n` : '');
          }

          if (msg.resumeContext) {
            const rc = msg.resumeContext;
            if (rc.conversationSummary) {
              resumeBlock += `\n\nPRIOR CONVERSATION SUMMARY (Continue context seamlessly):\n${rc.conversationSummary}`;
            }
            if (rc.relevantMemories && rc.relevantMemories.length > 0) {
              resumeBlock += `\n\nLINKED USER MEMORIES:\n` + rc.relevantMemories.map((m: any) => `- ${m.content || m}`).join('\n');
            }
            if (rc.recentMessages && rc.recentMessages.length > 0) {
              resumeBlock += `\n\nRECENT CONVERSATION TURNS:\n` + rc.recentMessages.map((m: any) => `${(m.role || '').toUpperCase()}: ${m.text || m.content || ''}`).join('\n');
            }
          }

          const systemInstruction = `You are LifeForge AI Live Voice Coach, a disciplined, direct, calm, intelligent, supportive, and solution-oriented mentor speaking in real-time with ${userName}.
Target Goal: ${targetGoal}.${resumeBlock}

CORE COACHING PRINCIPLES:
- "If you fall, stand up and continue. Avoid unnecessary excuses. Focus on solutions."
- "Do the work you genuinely want to become excellent at."
- "Learn through logic rather than rote memorization."
- "Something is better than nothing."

VOICE GUIDELINES:
- Speak naturally, concisely, and punchily (1 to 3 sentences per spoken turn).
- Avoid robotic filler, bullet point readings, or marketing fluff.
- Be encouraging yet strictly accountable.
- Never diagnose medical or psychiatric conditions.
- Never suggest sleep deprivation, starvation, or self-harm as punishment.
- For deep history retrieval, complex study problems, placement skill-gap analysis, or company research, invoke the \`request_agent_task\` tool so Gemini 3.8 Flash can perform specialist reasoning.

CANONICAL TOOL INSTRUCTIONS:
- TIMER START CONFIRMATION: When the user asks to start a study or focus session (e.g. "I want to study for 25 minutes", "Start a 25 minute focus session"), you MUST NOT invoke start_focus_timer immediately. You MUST ask for confirmation first: "You want me to start a 25-minute focus session. Shall I start it?" (use the exact duration requested). Only when the user answers "Yes", "start it", or gives affirmative confirmation, call the \`start_focus_timer\` tool.
- TIMER PAUSE: When the user says "Pause the focus session" or "pause", call \`pause_focus_timer\`.
- TIMER RESUME: When the user says "Continue the focus session", "Resume the focus session", or "resume", call \`resume_focus_timer\`.
- TIMER RESTART: When the user says "Restart the focus session", call \`restart_focus_timer\`.
- TIMER STOP: When the user says "Stop the focus session", call \`stop_focus_timer\`.
- GOAL CREATION: When the user says "Create a goal to ...", call \`create_goal\` with the goal title.
- TASK CREATION: When the user says "Create a task to ...", call \`create_task\` with the task title.
- GOAL & TASK RETRIEVAL (CRITICAL RULE):
  * When the user asks to check, see, list, count, or verify their goals (e.g. "How many goals do I have?", "Check how many goals I have", "What are my goals?", "Do I have any goals?"):
    - ALWAYS call \`get_goals\`.
    - Recite the exact count and titles returned. NEVER say there are no goals saved without calling \`get_goals\`.
  * When the user asks to check, see, list, count, or verify their tasks (e.g. "How many tasks do I have?", "Check my tasks", "What tasks do I have?"):
    - ALWAYS call \`get_tasks\`.
    - Recite the exact count and titles returned. NEVER say there are no tasks without calling \`get_tasks\`.
- GOAL & TASK EDITING / UPDATING:
  * When the user asks to edit, update, rename, or change status or progress of a goal:
    - ALWAYS call \`update_goal\` with the goal title and requested updates.
  * When the user asks to edit, update, rename, or change status of a task:
    - ALWAYS call \`update_task\` with the task title and requested updates.
- GOAL DELETION: When the user says "Delete my ... goal", call \`delete_goal\` with the exact goal title.
- TASK DELETION: When the user says "Delete my ... task", call \`delete_task\` with the exact task title.
- CALENDAR CREATION & SCHEDULING:
  * When the user asks to schedule, create, or add a calendar event or meeting (e.g. "Create an event on my calendar", "Schedule a mock interview tomorrow at 10 AM", "Put focus session on my calendar"):
    - ALWAYS call \`create_calendar_event\` with the event summary, startDateTime, and duration.
- CALENDAR DELETION:
  * When the user asks to delete, cancel, or remove an event from their calendar (e.g. "Delete that event", "Delete the Deep Work event from my calendar", "Can you please delete that event?"):
    - ALWAYS call \`delete_calendar_event\` with the event title, summary, or ID.
    - NEVER say you cannot delete calendar events. Call \`delete_calendar_event\` and instruct the user to confirm in the action panel.
- REFLECTION: When the user says "Log today's reflection", call \`create_reflection\`.
- RESUME UPLOAD, ANALYSIS & PLACEMENT (CRITICAL RULE):
  * The Resume card is permanently fixed in the Live System panel on the right side.
  * When the user asks to upload, update, review, check, or inquire about their resume (e.g. "I want to upload my updated resume", "Upload my updated resume", "I want to upload my resume", "Please analyze my resume"):
    - ALWAYS call \`request_resume_upload\` or \`get_resume_summary\` with isUploadRequest: true.
    - When the user asks to upload/update their resume, YOU MUST EXPLICITLY SAY: "Please upload your resume using the Resume card in the Live System panel on the right."
    - If a resume is already uploaded, provide the verified skills and projects extracted, and let them know they can click "Upload Updated Resume" in the panel on the right anytime.
- CALENDAR INQUIRIES & PERMISSION (STRICT ANTI-HALLUCINATION RULE):
  * The Google Calendar card is permanently fixed in the Live System panel on the right side.
  * When the user asks about schedule, meetings, upcoming events, or calendar (e.g. "Get the events in the calendar", "What is on my calendar?", "Check my schedule"):
    - ALWAYS call \`get_calendar_events\`.
    - ZERO HALLUCINATION POLICY: NEVER invent, make up, or hallucinate event names or times.
    - If \`get_calendar_events\` returns events, ONLY recite the EXACT event titles and start times provided in the tool response.
    - If \`get_calendar_events\` returns 0 events or empty array, state clearly and concisely: "I checked your calendar, and you have no upcoming events scheduled."
    - If Google Calendar is not connected, directly instruct the user: "Google Calendar is not connected yet. Please click 'Connect Calendar' in the Live System panel on the right."
    - If calendar connection failed or was unsuccessful, state directly that the connection was unsuccessful and they can click Retry.
  * When Google Calendar connects successfully (received system event), immediately inform the user of the retrieved events or state that no upcoming events were scheduled.
- END SESSION: When the user says "Let's end the session", respond: "Okay, we'll end this session now." and call \`end_live_session\`.`;

          try {
            // Connect to Gemini 3.1 Flash Live
            const liveSession = await ai.live.connect({
              model: 'gemini-3.1-flash-live-preview',
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Zephyr',
                    },
                  },
                },
                systemInstruction,
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: 'start_focus_timer',
                        description: 'Start the canonical 25-minute Pomodoro focus interval timer. Only call this after user confirms.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            durationMinutes: {
                              type: Type.NUMBER,
                              description: 'Focus duration in minutes, default is 25.',
                            },
                          },
                        },
                      },
                      {
                        name: 'pause_focus_timer',
                        description: 'Pause the currently running focus timer.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'resume_focus_timer',
                        description: 'Resume the currently paused focus timer.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'restart_focus_timer',
                        description: 'Restart the focus timer from the beginning.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'stop_focus_timer',
                        description: 'Stop or cancel the canonical focus timer.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'get_focus_timer',
                        description: 'Get remaining time and state of the canonical focus timer.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'create_goal',
                        description: 'Create a milestone or learning goal for the student in Firestore.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            title: {
                              type: Type.STRING,
                              description: 'Title of the goal.',
                            },
                            domain: {
                              type: Type.STRING,
                              description: 'Domain: study, placement, wellbeing, or career.',
                            },
                          },
                          required: ['title'],
                        },
                      },
                      {
                        name: 'create_task',
                        description: 'Create an actionable task item in Firestore.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            title: {
                              type: Type.STRING,
                              description: 'Title of the task.',
                            },
                            domain: {
                              type: Type.STRING,
                              description: 'Domain: study, placement, wellbeing, or career.',
                            },
                          },
                          required: ['title'],
                        },
                      },
                      {
                        name: 'get_goals',
                        description: 'Retrieve all current goals and milestones from the Firestore database. You MUST call this whenever the user asks about their goals or how many goals they have.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'get_tasks',
                        description: 'Retrieve all actionable tasks from the Firestore database. You MUST call this whenever the user asks about their tasks or how many tasks they have.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {},
                        },
                      },
                      {
                        name: 'update_goal',
                        description: 'Edit or update an existing goal in Firestore. Update title, progress, status, or priority.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            goalId: {
                              type: Type.STRING,
                              description: 'ID or current title of the goal to edit.',
                            },
                            title: {
                              type: Type.STRING,
                              description: 'Current title of the goal to edit.',
                            },
                            newTitle: {
                              type: Type.STRING,
                              description: 'New updated title for the goal.',
                            },
                            progress: {
                              type: Type.NUMBER,
                              description: 'Updated progress percentage (0 to 100).',
                            },
                            status: {
                              type: Type.STRING,
                              description: 'Updated status: in_progress, completed, paused.',
                            },
                            priority: {
                              type: Type.STRING,
                              description: 'Updated priority: low, medium, high.',
                            },
                          },
                        },
                      },
                      {
                        name: 'update_task',
                        description: 'Edit or update an existing task in Firestore. Update title, status, priority, or domain.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            taskId: {
                              type: Type.STRING,
                              description: 'ID or current title of the task to edit.',
                            },
                            title: {
                              type: Type.STRING,
                              description: 'Current title of the task to edit.',
                            },
                            newTitle: {
                              type: Type.STRING,
                              description: 'New updated title for the task.',
                            },
                            status: {
                              type: Type.STRING,
                              description: 'Updated status: pending, in_progress, completed.',
                            },
                            priority: {
                              type: Type.STRING,
                              description: 'Updated priority: low, medium, high.',
                            },
                          },
                        },
                      },
                      {
                        name: 'delete_goal',
                        description: 'Request deletion of an existing goal. Requires confirmation.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            goalId: {
                              type: Type.STRING,
                              description: 'Goal ID or exact title to delete.',
                            },
                            title: {
                              type: Type.STRING,
                              description: 'Exact title of the goal to delete.',
                            },
                            goalTitle: {
                              type: Type.STRING,
                              description: 'Exact title of the goal to delete.',
                            },
                          },
                          required: ['goalId'],
                        },
                      },
                      {
                        name: 'delete_task',
                        description: 'Request deletion of an existing task. Requires confirmation.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            taskId: {
                              type: Type.STRING,
                              description: 'Task ID or exact title to delete.',
                            },
                            title: {
                              type: Type.STRING,
                              description: 'Exact title of the task to delete.',
                            },
                            taskTitle: {
                              type: Type.STRING,
                              description: 'Exact title of the task to delete.',
                            },
                          },
                          required: ['taskId'],
                        },
                      },
                      {
                        name: 'get_resume_summary',
                        description: 'Retrieve verified technical skills, projects, and interview questions from analyzed resume, or prompt for resume upload if requested.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            isUploadRequest: {
                              type: Type.BOOLEAN,
                              description: 'Set to true if user wants to upload, update, or re-upload resume.',
                            },
                          },
                        },
                      },
                      {
                        name: 'request_resume_upload',
                        description: 'Prompt user to upload their resume when user says they want to upload or update their resume.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            reason: {
                              type: Type.STRING,
                              description: 'Reason for requesting resume upload.',
                            },
                          },
                        },
                      },
                      {
                        name: 'create_calendar_event',
                        description: 'Schedule and create a new event or session in Google Calendar.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            summary: {
                              type: Type.STRING,
                              description: 'Title or summary of the calendar event.',
                            },
                            startDateTime: {
                              type: Type.STRING,
                              description: 'Start date and time in ISO format.',
                            },
                            durationMinutes: {
                              type: Type.NUMBER,
                              description: 'Duration of the event in minutes (default 60).',
                            },
                            description: {
                              type: Type.STRING,
                              description: 'Optional description of the event.',
                            },
                          },
                          required: ['summary'],
                        },
                      },
                      {
                        name: 'delete_calendar_event',
                        description: 'Request deletion of a Google Calendar event. Requires user confirmation in the action panel.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            eventId: {
                              type: Type.STRING,
                              description: 'ID of the calendar event to delete.',
                            },
                            summary: {
                              type: Type.STRING,
                              description: 'Exact or partial title/summary of the calendar event to delete.',
                            },
                            title: {
                              type: Type.STRING,
                              description: 'Title of the calendar event to delete.',
                            },
                          },
                        },
                      },
                      {
                        name: 'get_calendar_events',
                        description: 'Retrieve upcoming Google Calendar schedule events. If Google Calendar is not connected, returns connected: false and error. When disconnected, you must instruct the user to click Connect Calendar.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            daysAhead: {
                              type: Type.NUMBER,
                              description: 'Days ahead to check calendar.',
                            },
                          },
                        },
                      },
                      {
                        name: 'create_reflection',
                        description: 'Log today reflection entry directly to Firestore.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            whatWorked: { type: Type.STRING },
                            whatLearned: { type: Type.STRING },
                          },
                        },
                      },
                      {
                        name: 'request_agent_task',
                        description: 'Delegate complex student inquiries, study/placement retrieval, placement analysis, or research to the Gemini 3.8 Flash reasoning engine.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            domain: {
                              type: Type.STRING,
                              description: 'The specialist agent domain: study, placement, wellbeing, reflection, research, calendar, goals, safety, or orchestrator (for multi-domain composition).',
                            },
                            query: {
                              type: Type.STRING,
                              description: 'The specific question or task for Gemini 3.8 Flash.',
                            },
                          },
                          required: ['domain', 'query'],
                        },
                      },
                      {
                        name: 'end_live_session',
                        description: 'Conclude and terminate the live coaching session when the user says goodbye, requests to stop, or indicates they are done.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            reason: {
                              type: Type.STRING,
                              description: 'Reason for concluding the session.',
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
              callbacks: {
                onmessage: async (message: LiveServerMessage) => {
                  try {
                    const parts = message.serverContent?.modelTurn?.parts || [];
                    for (const part of parts) {
                      if (part.inlineData?.data) {
                        safeSend({
                          type: 'audio',
                          data: part.inlineData.data,
                        });
                      }
                      if (part.text) {
                        safeSend({
                          type: 'model_transcript',
                          text: part.text,
                        });
                      }
                    }

                    const serverContentAny = message.serverContent as any;
                    const modelTranscript =
                      serverContentAny?.outputAudioTranscription?.text ||
                      serverContentAny?.outputTranscription?.text;
                    if (modelTranscript) {
                      safeSend({
                        type: 'model_transcript',
                        text: modelTranscript,
                      });
                    }

                    const userTranscript =
                      serverContentAny?.inputAudioTranscription?.text ||
                      serverContentAny?.inputTranscription?.text;
                    if (userTranscript) {
                      sessionState.lastUserTranscript = (sessionState.lastUserTranscript || '') + userTranscript;
                      safeSend({
                        type: 'user_transcript',
                        text: userTranscript,
                      });
                    }

                    if (message.serverContent?.interrupted) {
                      safeSend({ type: 'interrupted' });
                    }

                    if (message.serverContent?.turnComplete) {
                      safeSend({ type: 'turn_complete' });
                      sessionState.lastUserTranscript = '';
                    }

                    const toolCalls = message.toolCall?.functionCalls || [];
                    for (const call of toolCalls) {
                      if (call.name === 'end_live_session') {
                        const reason = (call.args as any)?.reason || 'User ended live session';
                        safeSend({
                          type: 'end_session_requested',
                          reason,
                        });
                        try {
                          await liveSession.sendToolResponse({
                            functionResponses: [
                              {
                                id: call.id,
                                name: call.name,
                                response: {
                                  output: 'Live coaching session ended successfully.',
                                },
                              },
                            ],
                          });
                        } catch (toolSendErr) {
                          console.error('[Live WS] sendToolResponse error for end_live_session:', toolSendErr);
                        }
                      } else if (call.name === 'request_agent_task') {
                        const { domain = 'study', query = '' } = (call.args as any) || {};

                        safeSend({
                          type: 'agent_task_start',
                          domain,
                          query,
                        });

                        if (sessionState.calendarState) {
                          calendarStateManager.setState(sessionState.calendarState as any);
                        }
                        if (sessionState.calendarToken) {
                          calendarStateManager.setAccessToken(sessionState.calendarToken);
                        }

                        let taskResult: any;
                        try {
                          taskResult = await executeAgentTask({
                            userId: sessionState.userId,
                            domain: domain as any,
                            query,
                            userData: sessionState.userData,
                            calendarState: sessionState.calendarState,
                            calendarToken: sessionState.calendarToken,
                          });
                        } catch (taskErr: any) {
                          console.error('[Live WS] executeAgentTask error:', taskErr);
                          taskResult = {
                            spokenSummary: `I've noted your request on ${domain}. Let's keep working through your primary goals.`,
                            structuredDetails: { error: taskErr?.message || 'Task processing fallback' },
                            citations: [],
                            domain,
                          };
                        }

                        const toolName = taskResult.structuredDetails?.tool || (domain === 'calendar' ? 'get_calendar_events' : domain === 'placement' ? 'get_resume_summary' : 'request_agent_task');
                        const agentName = domain === 'calendar' ? 'Calendar Agent' : domain === 'placement' ? 'Placement Agent' : domain === 'goal' ? 'Goal/Task Agent' : 'Orchestrator';
                        const isSuccess = taskResult.structuredDetails?.status !== 'DISCONNECTED' && taskResult.structuredDetails?.hasResume !== false && !taskResult.structuredDetails?.error;

                        const sanitizedResult = (toolName.includes('resume') && taskResult.structuredDetails)
                          ? {
                            hasResume: taskResult.structuredDetails.hasResume,
                            status: taskResult.structuredDetails.status,
                            actionRequired: taskResult.structuredDetails.actionRequired,
                            resumeId: taskResult.structuredDetails.resumeId,
                            analysisStatus: taskResult.structuredDetails.analysisStatus,
                            fileName: taskResult.structuredDetails.fileName,
                            skillCount: Array.isArray(taskResult.structuredDetails.skills) ? taskResult.structuredDetails.skills.length : undefined,
                            projectCount: Array.isArray(taskResult.structuredDetails.projects) ? taskResult.structuredDetails.projects.length : undefined,
                            questionCount: Array.isArray(taskResult.structuredDetails.interviewQuestions) ? taskResult.structuredDetails.interviewQuestions.length : undefined,
                            message: taskResult.structuredDetails.message,
                          }
                          : taskResult.structuredDetails;

                        safeSend({
                          type: 'agent_task_complete',
                          domain,
                          spokenSummary: taskResult.spokenSummary,
                          structuredDetails: taskResult.structuredDetails,
                          citations: taskResult.citations,
                          toolExecution: {
                            requestId: `live_${Date.now()}`,
                            agentTaskId: `task_${domain}_${Date.now()}`,
                            conversationId: sessionState.conversationId || 'live_voice_session',
                            turnId: `turn_${Date.now()}`,
                            tool: toolName,
                            agent: agentName,
                            status: isSuccess ? 'COMPLETED' : 'FAILED',
                            state: isSuccess ? 'COMPLETED' : 'FAILED',
                            arguments: { query, domain },
                            result: sanitizedResult,
                            error: !isSuccess ? taskResult.structuredDetails?.error || { message: taskResult.spokenSummary } : undefined,
                            startedAt: new Date(Date.now() - 600).toISOString(),
                            completedAt: new Date().toISOString(),
                            duration: 0.6,
                          },
                        });

                        try {
                          await liveSession.sendToolResponse({
                            functionResponses: [
                              {
                                id: call.id,
                                name: call.name,
                                response: {
                                  output: taskResult.spokenSummary,
                                },
                              },
                            ],
                          });
                        } catch (toolSendErr) {
                          console.error('[Live WS] sendToolResponse error:', toolSendErr);
                        }
                      } else {
                        const toolName = call.name || '';
                        const toolArgs = (call.args as any) || {};
                        const domain = toolName.includes('timer')
                          ? 'study'
                          : toolName.includes('goal') || toolName.includes('task')
                            ? 'goals'
                            : toolName.includes('calendar')
                              ? 'calendar'
                              : toolName.includes('resume')
                                ? 'placement'
                                : toolName.includes('reflection')
                                  ? 'reflection'
                                  : 'orchestrator';

                        safeSend({
                          type: 'agent_task_start',
                          domain,
                          query: `Tool call: ${toolName}`,
                        });

                        if (toolName.includes('calendar')) {
                          const effToken = sessionState.calendarToken || null;
                          const effState = sessionState.calendarState || 'DISCONNECTED';
                          sessionState.calendarToken = effToken;
                          sessionState.calendarState = effState;
                          if (effToken) {
                            calendarStateManager.setAccessToken(effToken);
                            calendarStateManager.setState(effState as any);
                          } else {
                            calendarStateManager.setDisconnected();
                          }
                        }

                        let toolResult: any;
                        try {
                          toolResult = await globalToolGateway.executeTool(
                            sessionState.userId,
                            {
                              requestId: `live_call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                              agentTaskId: `task_${toolName}_${Date.now()}`,
                              conversationId: sessionState.conversationId || 'live_voice_session',
                              turnId: `turn_${Date.now()}`,
                              toolCallId: call.id || (call as any).callId || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                              tool: toolName,
                              arguments: toolArgs,
                              userData: {
                                ...sessionState.userData,
                                calendarToken: sessionState.calendarToken,
                                calendarState: sessionState.calendarState,
                              },
                            },
                            {
                              userData: {
                                ...sessionState.userData,
                                calendarToken: sessionState.calendarToken,
                                calendarState: sessionState.calendarState,
                              },
                            }
                          );
                        } catch (err: any) {
                          console.error(`[Live WS] Error executing canonical tool ${toolName}:`, err);
                          toolResult = {
                            success: false,
                            tool: toolName,
                            requestId: `live_call_${Date.now()}`,
                            timestamp: new Date().toISOString(),
                            data: null,
                            error: { code: 'EXECUTION_ERROR', message: err?.message || 'Tool execution failed' },
                            requiresConfirmation: false,
                          };
                        }

                        let isSuccess = toolResult.success;
                        const isWaitingConf = toolResult.requiresConfirmation;
                        let spokenSummary = '';
                        if (toolName === 'start_focus_timer') {
                          spokenSummary = `Starting your ${toolArgs.durationMinutes || 25}-minute focus session now. Eliminate distractions and execute.`;
                        } else if (toolName === 'pause_focus_timer') {
                          spokenSummary = 'Focus session paused.';
                        } else if (toolName === 'resume_focus_timer') {
                          spokenSummary = 'Focus session resumed.';
                        } else if (toolName === 'restart_focus_timer') {
                          spokenSummary = 'Focus session restarted from the beginning.';
                        } else if (toolName === 'stop_focus_timer') {
                          spokenSummary = 'Focus session stopped.';
                        } else if (toolName === 'create_goal') {
                          spokenSummary = isSuccess ? `Goal created: "${toolArgs.title}".` : 'Failed to create goal.';
                        } else if (toolName === 'get_goals') {
                          const goals = (toolResult.data as any)?.goals || [];
                          const count = goals.length;
                          spokenSummary = count > 0
                            ? `You have ${count} goal${count === 1 ? '' : 's'}: ${goals.map((g: any) => `"${g.title}" (${g.progress ?? 0}% complete)`).join(', ')}.`
                            : 'I just checked, and you currently have no goals saved in your dashboard.';
                        } else if (toolName === 'update_goal') {
                          const g = toolResult.data as any;
                          spokenSummary = isSuccess && g
                            ? `Goal "${g.title || toolArgs.newTitle || toolArgs.title || 'Goal'}" updated successfully.`
                            : 'Failed to update goal.';
                        } else if (toolName === 'create_task') {
                          spokenSummary = isSuccess ? `Task created: "${toolArgs.title}".` : 'Failed to create task.';
                        } else if (toolName === 'get_tasks') {
                          const tasks = (toolResult.data as any)?.tasks || [];
                          const count = tasks.length;
                          spokenSummary = count > 0
                            ? `You have ${count} task${count === 1 ? '' : 's'}: ${tasks.map((t: any) => `"${t.title}" (${t.status || 'pending'})`).join(', ')}.`
                            : 'I just checked, and you currently have no tasks saved in your dashboard.';
                        } else if (toolName === 'update_task') {
                          const t = toolResult.data as any;
                          spokenSummary = isSuccess && t
                            ? `Task "${t.title || toolArgs.newTitle || toolArgs.title || 'Task'}" updated successfully.`
                            : 'Failed to update task.';
                        } else if (toolName === 'delete_goal') {
                          const itemTitle = (toolResult.data as any)?.goalTitle || toolArgs.goalTitle || toolArgs.title || toolArgs.goalId || 'this goal';
                          spokenSummary = `Do you want to delete the goal "${itemTitle}"? Please confirm in the action panel.`;
                        } else if (toolName === 'delete_task') {
                          const itemTitle = (toolResult.data as any)?.taskTitle || toolArgs.taskTitle || toolArgs.title || toolArgs.taskId || 'this task';
                          spokenSummary = `Do you want to delete the task "${itemTitle}"? Please confirm in the action panel.`;
                        } else if (toolName === 'create_reflection') {
                          spokenSummary = isSuccess ? "Today's reflection has been logged to your growth timeline." : 'Failed to log reflection.';
                        } else if (toolName === 'request_resume_upload') {
                          spokenSummary = 'Please upload your resume.';
                          toolResult.success = true;
                          toolResult.data = {
                            actionRequired: 'UPLOAD_RESUME',
                            status: 'RESUME_REQUIRED',
                            prompt: 'Please upload your resume.',
                          };
                        } else if (toolName === 'get_resume_summary') {
                          const resData = toolResult.data as any;
                          const userQuery = sessionState.lastUserTranscript || '';
                          const isUpdateRequest = Boolean(toolArgs?.isUploadRequest) || /(?:upload|update|re-upload|reupload|new resume|updated resume)/i.test(userQuery);
                          if (isUpdateRequest || !resData?.hasResume) {
                            spokenSummary = 'Please upload your resume.';
                            toolResult.data = {
                              ...(resData || {}),
                              actionRequired: 'UPLOAD_RESUME',
                              status: 'RESUME_REQUIRED',
                              prompt: 'Please upload your resume.',
                            };
                          } else if (resData?.hasResume && resData?.skills?.length > 0) {
                            spokenSummary = `I verified your uploaded resume (${resData.fileName || 'resume'}). You have ${resData.skills.length} technical skills including ${resData.skills.join(', ')}.`;
                          } else {
                            spokenSummary = 'Please upload your resume.';
                          }
                        } else if (toolName === 'create_calendar_event') {
                          const isCalConnected = sessionState.calendarState === 'CONNECTED' && Boolean(sessionState.calendarToken);
                          if (!isCalConnected || !isSuccess) {
                            spokenSummary = 'Google Calendar is not connected yet. Please click "Connect Calendar" in the Live System panel on the right.';
                            isSuccess = false;
                            toolResult.success = false;
                          } else {
                            const ev = (toolResult.data as any)?.event || toolResult.data;
                            spokenSummary = `Event "${toolArgs.summary || toolArgs.title || 'Focus Session'}" scheduled successfully on your Google Calendar.`;
                          }
                        } else if (toolName === 'delete_calendar_event') {
                          const itemTitle = (toolResult.data as any)?.summary || (toolResult.data as any)?.title || toolArgs.summary || toolArgs.title || toolArgs.eventId || 'this calendar event';
                          spokenSummary = `Do you want to delete the calendar event "${itemTitle}"? Please confirm in the action panel.`;
                        } else if (toolName === 'get_calendar_events') {
                          const isCalConnected = sessionState.calendarState === 'CONNECTED' && Boolean(sessionState.calendarToken);
                          if (!isCalConnected || !isSuccess || toolResult.error?.code === 'CALENDAR_NOT_CONNECTED' || String(toolResult.error?.message).includes('not connected')) {
                            spokenSummary = 'Google Calendar is not connected yet. Please click "Connect Calendar" in the Live System panel on the right.';
                            isSuccess = false;
                            toolResult.success = false;
                            toolResult.error = toolResult.error || {
                              code: 'CALENDAR_NOT_CONNECTED',
                              message: 'Google Calendar is not connected',
                              failureStage: 'AUTHORIZATION',
                              retryable: true,
                            };
                          } else {
                            const events = (toolResult.data as any)?.events || [];
                            spokenSummary = events.length > 0
                              ? `You have ${events.length} upcoming calendar event${events.length === 1 ? '' : 's'}: ${events.map((e: any) => `${e.summary || e.title} (${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (e.startDateTime ? new Date(e.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'scheduled')})`).join(', ')}.`
                              : 'You have no upcoming calendar events scheduled.';
                          }
                        } else {
                          spokenSummary = `Executed ${toolName}.`;
                        }

                        safeSend({
                          type: 'agent_task_complete',
                          domain,
                          spokenSummary,
                          structuredDetails: toolResult.data,
                          toolExecution: {
                            requestId: toolResult.requestId,
                            agentTaskId: `task_${toolName}_${Date.now()}`,
                            conversationId: sessionState.conversationId || 'live_voice_session',
                            turnId: `turn_${Date.now()}`,
                            tool: toolName,
                            agent: domain === 'goals' ? 'Goal/Task Agent' : domain === 'study' ? 'Study Agent' : domain === 'calendar' ? 'Calendar Agent' : domain === 'placement' ? 'Placement Agent' : 'LifeForge Live Coach',
                            status: isWaitingConf ? 'WAITING_CONFIRMATION' : (isSuccess ? 'COMPLETED' : 'FAILED'),
                            state: isWaitingConf ? 'WAITING_CONFIRMATION' : (isSuccess ? 'COMPLETED' : 'FAILED'),
                            arguments: toolArgs,
                            result: toolResult.data,
                            error: toolResult.error,
                            startedAt: new Date(Date.now() - 300).toISOString(),
                            completedAt: new Date().toISOString(),
                            duration: 0.3,
                          },
                        });

                        let functionResponsePayload: any = { output: spokenSummary };
                        if (toolName === 'get_goals') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            goals: (toolResult.data as any)?.goals || [],
                            count: (toolResult.data as any)?.count ?? ((toolResult.data as any)?.goals?.length || 0),
                          };
                        } else if (toolName === 'get_tasks') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            tasks: (toolResult.data as any)?.tasks || [],
                            count: (toolResult.data as any)?.count ?? ((toolResult.data as any)?.tasks?.length || 0),
                          };
                        } else if (toolName === 'update_goal') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            success: isSuccess,
                            goal: toolResult.data,
                          };
                        } else if (toolName === 'update_task') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            success: isSuccess,
                            task: toolResult.data,
                          };
                        } else if (toolName === 'create_calendar_event') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            success: isSuccess,
                            event: (toolResult.data as any)?.event || toolResult.data,
                          };
                        } else if (toolName === 'delete_calendar_event') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            confirmationRequired: true,
                            event: toolResult.data,
                          };
                        } else if (toolName === 'request_resume_upload') {
                          functionResponsePayload = {
                            output: 'Please upload your resume.',
                            actionRequired: 'UPLOAD_RESUME',
                            status: 'RESUME_REQUIRED',
                          };
                        } else if (toolName === 'get_resume_summary' && toolResult.data) {
                          const rd = toolResult.data as any;
                          functionResponsePayload = {
                            output: spokenSummary,
                            hasResume: Boolean(rd.hasResume),
                            fileName: rd.fileName,
                            skills: rd.skills || [],
                            projects: rd.projects || [],
                            experience: rd.experience || [],
                            education: rd.education || [],
                            interviewQuestions: rd.interviewQuestions || [],
                            strengths: rd.strengths || [],
                            gaps: rd.gaps || [],
                          };
                        } else if (toolName === 'get_calendar_events') {
                          const isCalConnected = sessionState.calendarState === 'CONNECTED' && Boolean(sessionState.calendarToken);
                          const events = isCalConnected ? ((toolResult.data as any)?.events || []) : [];
                          functionResponsePayload = {
                            output: spokenSummary,
                            connected: isCalConnected,
                            requiresConnection: !isCalConnected,
                            events: events.map((e: any) => ({
                              title: e.summary || e.title || 'Untitled Event',
                              start: e.start?.dateTime || e.startDateTime || e.start?.date,
                              end: e.end?.dateTime || e.endDateTime || e.end?.date,
                              description: e.description || '',
                              location: e.location || '',
                            })),
                            eventSummaries: events.map((e: any) => `${e.summary || e.title} at ${e.start?.dateTime || e.startDateTime || 'scheduled'}`).join('; '),
                            error: !isCalConnected
                              ? 'Google Calendar is not connected yet. You MUST explicitly instruct the user to click "Connect Calendar" in the Live System panel on the right. Do NOT say there are no events.'
                              : (toolResult.error ? toolResult.error.message : null),
                          };
                        } else if (toolName === 'create_reflection') {
                          functionResponsePayload = {
                            output: spokenSummary,
                            success: isSuccess,
                            reflection: (toolResult.data as any)?.reflection || toolResult.data,
                          };
                        }

                        try {
                          await liveSession.sendToolResponse({
                            functionResponses: [
                              {
                                id: call.id,
                                name: call.name,
                                response: functionResponsePayload,
                              },
                            ],
                          });
                        } catch (toolSendErr) {
                          console.error(`[Live WS] sendToolResponse error for ${toolName}:`, toolSendErr);
                        }
                      }
                    }
                  } catch (callbackErr) {
                    console.error('[Live WS] Error processing LiveServerMessage:', callbackErr);
                  }
                },
                onclose: () => {
                  console.log('[Live WS] Gemini Live session closed');
                  safeSend({ type: 'session_closed' });
                },
                onerror: (liveErr) => {
                  console.error('[Live WS] Gemini Live session error:', liveErr);
                  safeSend({ type: 'session_error', error: String(liveErr) });
                },
              },
            });

            sessionState.liveSession = liveSession;
            safeSend({
              type: 'session_ready',
              model: 'gemini-3.1-flash-live-preview',
              calendarState: sessionState.calendarState || calendarStateManager.getState(),
              calendarToken: sessionState.calendarToken || calendarStateManager.getAccessToken(),
            });
            console.log(`[Live WS] Session connected for user: ${sessionState.userId}`);
          } catch (connErr: any) {
            console.error('[Live WS] Failed to connect to Gemini Live:', connErr);
            safeSend({
              type: 'session_error',
              error: connErr.message || 'Failed to establish Gemini Live session',
            });
          }
        }

        // 2. Incoming 16kHz PCM Audio from Client
        else if (msg.type === 'audio' && sessionState.liveSession && msg.data) {
          try {
            sessionState.liveSession.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } catch (audioErr) {
            console.error('[Live WS] Failed to send audio chunk to Gemini Live:', audioErr);
          }
        }

        else if (msg.type === 'interrupt') {
          console.log(`[Live WS] Barge-in signal received for user: ${sessionState.userId}`);
        }

        // 4. Update Cached User Data (for hybrid retrieval handoffs)
        else if (msg.type === 'update_user_data') {
          sessionState.userData = msg.userData;
        }
      } catch (parseErr) {
        console.error('[Live WS] Error parsing client message:', parseErr);
      }
    });

    // Cleanup on disconnect
    const cleanup = () => {
      if (sessionState.pingInterval) {
        clearInterval(sessionState.pingInterval);
      }
      if (sessionState.liveSession) {
        try {
          sessionState.liveSession.close();
        } catch (e) {
          // ignore
        }
        sessionState.liveSession = null;
      }
      console.log(`[Live WS] Cleaned up session for user: ${sessionState.userId}`);
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', (err) => {
      console.error('[Live WS] Client WebSocket error:', err);
      cleanup();
    });
  });

  server.listen(port, '0.0.0.0', () => {
    initReflectionScheduler();
    console.log(`> LifeForge AI server listening on http://${hostname}:${port}`);
  });
});
