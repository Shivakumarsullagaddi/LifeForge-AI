import { GoogleGenAI } from '@google/genai';
import { executeHybridRetrieval } from '@/lib/retrieval/hybridEngine';
import { adaptUserRecords } from '@/lib/retrieval/recordAdapter';
import { RetrievalRecord } from '@/lib/retrieval/types';
import { globalToolGateway } from '@/lib/tools/gateway';
import { calendarStateManager } from '@/lib/calendar';
import { resumeService } from '@/lib/placement/resumeService';
import { centralOrchestrator } from '@/lib/orchestrator/orchestrator';
import { authoritativeState } from '@/lib/state/applicationState';
import { logStructured } from '@/lib/logger';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface AgentTaskRequest {
  userId: string;
  domain:
    | 'study'
    | 'placement'
    | 'wellbeing'
    | 'reflection'
    | 'research'
    | 'calendar'
    | 'goals'
    | 'orchestrator'
    | 'safety';
  query: string;
  userData?: {
    journals?: any[];
    memories?: any[];
    goals?: any[];
    tasks?: any[];
    reflections?: any[];
    studySessions?: any[];
    placementProfile?: any;
    resumeMetadata?: any;
  };
  calendarState?: string;
  calendarToken?: string | null;
}

export interface AgentTaskResponse {
  spokenSummary: string;
  structuredDetails?: Record<string, any>;
  domain: string;
  citations?: Array<{ title?: string; uri?: string }>;
  groundingSources?: string[];
}

export async function executeAgentTask(request: AgentTaskRequest): Promise<AgentTaskResponse> {
  const { userId, domain, query, userData, calendarState, calendarToken } = request;

  if (calendarState) {
    calendarStateManager.setState(calendarState as any);
  }
  if (calendarToken) {
    calendarStateManager.setAccessToken(calendarToken);
  }

  try {
    const appState = authoritativeState.getState();
    const decision = centralOrchestrator.route({
      userId,
      userMessage: query,
      conversationId: 'live_voice_session',
      applicationState: appState,
    });

    if (decision.specialist === 'Timer') {
      if (decision.requiresConfirmation) {
        return {
          spokenSummary: decision.confirmationPrompt || 'Do you want me to start a 25-minute focus session?',
          structuredDetails: {
            actionRequired: 'CONFIRM_TIMER',
            status: 'WAITING_CONFIRMATION',
            tool: 'start_timer',
            durationMinutes: decision.toolParameters?.durationMinutes || 25,
          },
          domain: 'study',
        };
      }

      const toolRes = await globalToolGateway.executeTool(userId, {
        requestId: `live_timer_${Date.now()}`,
        agentTaskId: 'live_task_timer',
        conversationId: 'live_voice_session',
        turnId: `turn_${Date.now()}`,
        tool: decision.recommendedTool || 'start_timer',
        arguments: decision.toolParameters || {},
      });

      const timerData = (toolRes.data as any) || {};
      const actionName = decision.recommendedTool;
      const spokenSummary =
        actionName === 'stop_timer'
          ? 'Focus timer stopped.'
          : actionName === 'pause_timer'
          ? 'Focus timer paused.'
          : actionName === 'resume_timer'
          ? 'Focus timer resumed.'
          : `Started a ${decision.toolParameters?.durationMinutes || 25}-minute Pomodoro focus session. Let's make every minute count!`;

      logStructured('AGENT', `Timer Specialist executed`, { tool: actionName, status: 'RUNNING' });

      return {
        spokenSummary,
        structuredDetails: {
          ...timerData,
          tool: actionName || 'start_timer',
          verified: true,
        },
        domain: 'study',
      };
    }

    if (decision.specialist === 'Calendar') {
      if (calendarState !== 'CONNECTED' || !calendarToken) {
        return {
          spokenSummary: 'Google Calendar is not connected yet. Please click "Connect Calendar" in the Live System panel on the right.',
          structuredDetails: {
            status: 'DISCONNECTED',
            actionRequired: 'CONNECT_CALENDAR',
            error: {
              code: 'CALENDAR_NOT_CONNECTED',
              message: 'Google Calendar is not connected',
              failureStage: 'AUTHORIZATION',
            },
            tool: 'get_calendar_events',
          },
          domain: 'calendar',
        };
      }

      const isTomorrow = /tomorrow/i.test(query);
      let timeMin: string | undefined;
      let timeMax: string | undefined;
      if (isTomorrow) {
        const tomorrowStart = new Date();
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setHours(23, 59, 59, 999);
        timeMin = tomorrowStart.toISOString();
        timeMax = tomorrowEnd.toISOString();
      } else {
        const sod = new Date();
        sod.setHours(0, 0, 0, 0);
        timeMin = sod.toISOString();
      }

      const toolRes = await globalToolGateway.executeTool(
        userId,
        {
          requestId: `live_cal_${Date.now()}`,
          agentTaskId: 'live_task_cal',
          conversationId: 'live_voice_session',
          turnId: `turn_${Date.now()}`,
          tool: 'get_calendar_events',
          arguments: { timeMin, timeMax },
          userData: {
            ...userData,
            calendarToken,
            calendarState,
          },
        },
        {
          userData: {
            ...userData,
            calendarToken,
            calendarState,
          },
        }
      );

      if (!toolRes.success) {
        return {
          spokenSummary: 'Google Calendar is not connected yet. Please connect your calendar in the coaching interface to check your schedule.',
          structuredDetails: {
            status: 'DISCONNECTED',
            actionRequired: 'CONNECT_CALENDAR',
            error: toolRes.error || {
              code: 'CALENDAR_NOT_CONNECTED',
              failureStage: 'AUTHORIZATION',
            },
            tool: 'get_calendar_events',
          },
          domain: 'calendar',
        };
      }

      const events = (toolRes.data as any)?.events || [];
      const count = events.length;
      let spokenSummary = 'You have no upcoming events on your calendar.';
      if (count > 0) {
        const eventDescriptions = events.slice(0, 5).map((e: any) => {
          const title = e.title || e.summary || 'Event';
          const startIso = e.startDateTime || e.start?.dateTime;
          const endIso = e.endDateTime || e.end?.dateTime;
          if (startIso) {
            const sDate = new Date(startIso);
            const dateStr = sDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
            const startStr = sDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
            let timeSpan = `on ${dateStr} at ${startStr}`;
            if (endIso) {
              const eDate = new Date(endIso);
              const endStr = eDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
              timeSpan = `on ${dateStr} from ${startStr} to ${endStr}`;
            }
            return `${title} ${timeSpan}`;
          }
          return title;
        });
        spokenSummary = `I found ${count} upcoming event${count === 1 ? '' : 's'}: ${eventDescriptions.join('; ')}.`;
      }

      logStructured('AGENT', `Calendar Agent executed`, { count, events: events.length });

      return {
        spokenSummary,
        structuredDetails: {
          events,
          count,
          verified: true,
          tool: 'get_calendar_events',
        },
        domain: 'calendar',
      };
    }

    if (decision.specialist === 'Placement') {
      if (userData?.placementProfile?.resumeProfile) {
        resumeService.syncResumeContext(userId, userData.placementProfile.resumeProfile, userData.resumeMetadata);
      }

      const toolRes = await globalToolGateway.executeTool(
        userId,
        {
          requestId: `live_res_${Date.now()}`,
          agentTaskId: 'live_task_res',
          conversationId: 'live_voice_session',
          turnId: `turn_${Date.now()}`,
          tool: 'get_resume_summary',
          arguments: {},
          userData,
        },
        { userData }
      );

      const resData = toolRes.data as any;
      if (!resData?.hasResume || /(?:upload|update|re-upload|reupload|new resume|updated resume)/i.test(query)) {
        return {
          spokenSummary: 'Please upload your updated resume using the "Upload Resume" button in the Live System sidebar on the right or under the Placements tab. Once uploaded, I will extract your technical skills, projects, and experience directly into my knowledge base.',
          structuredDetails: {
            hasResume: Boolean(resData?.hasResume),
            status: 'RESUME_REQUIRED',
            actionRequired: 'UPLOAD_RESUME',
            tool: 'request_resume_upload',
          },
          domain: 'placement',
        };
      }

      const skills = resData.skills || [];
      const projects = resData.projects || [];
      let spokenSummary = '';
      if (/(?:project|projects)/i.test(query) && projects.length > 0) {
        const topProjects = projects.slice(0, 2).map((p: any) => p.title || p.name).join(' and ');
        spokenSummary = `Your resume features major projects including ${topProjects}. Would you like to practice technical interview questions for them?`;
      } else if (skills.length > 0) {
        spokenSummary = `Your resume is analyzed. Key strengths include ${skills.slice(0, 4).join(', ')}. Let us practice technical interview questions.`;
      } else {
        spokenSummary = 'Your resume is uploaded and ready for analysis.';
      }

      logStructured('AGENT', `Placement Agent executed`, { hasResume: true, skillsCount: skills.length, projectsCount: projects.length });

      return {
        spokenSummary,
        structuredDetails: {
          ...resData,
          tool: 'get_resume_summary',
        },
        domain: 'placement',
      };
    }

    if (decision.specialist === 'GoalTask' && decision.recommendedTool === 'create_goal') {
      const goalTitle = decision.toolParameters?.title || query.replace(/(?:create|add)\s+(?:a\s+)?goal(?:\s+for|\s+to)?\s*[:"-]?/i, '').trim() || 'Master target skill';
      const toolRes = await globalToolGateway.executeTool(userId, {
        requestId: `live_goal_${Date.now()}`,
        agentTaskId: 'live_task_goal',
        conversationId: 'live_voice_session',
        turnId: `turn_${Date.now()}`,
        tool: 'create_goal',
        arguments: { title: goalTitle, domain: 'academic' },
      });

      if (!toolRes.success) {
        return {
          spokenSummary: 'Failed to create goal. Please check your network and database connection.',
          structuredDetails: { error: toolRes.error, tool: 'create_goal' },
          domain: 'goals',
        };
      }

      const goalId = (toolRes.data as any)?.goalId || 'goal_created';
      logStructured('AGENT', `Goal Specialist created goal`, { goalId, title: goalTitle });
      return {
        spokenSummary: `Your goal has been created: "${goalTitle}". It is now tracked in your Goals dashboard.`,
        structuredDetails: {
          goalId,
          title: goalTitle,
          tool: 'create_goal',
          verified: true,
          goal: (toolRes.data as any)?.goal,
        },
        domain: 'goals',
      };
    }

    if (decision.specialist === 'GoalTask' && decision.recommendedTool === 'create_task') {
      const taskTitle = decision.toolParameters?.title || query.replace(/(?:create|add)\s+(?:a\s+)?task(?:\s+for|\s+to)?\s*[:"-]?/i, '').trim() || 'Complete assigned milestone';
      const toolRes = await globalToolGateway.executeTool(userId, {
        requestId: `live_task_${Date.now()}`,
        agentTaskId: 'live_task_task',
        conversationId: 'live_voice_session',
        turnId: `turn_${Date.now()}`,
        tool: 'create_task',
        arguments: { title: taskTitle, domain: 'academic' },
      });

      if (!toolRes.success) {
        return {
          spokenSummary: 'Failed to create task. Please check your network and database connection.',
          structuredDetails: { error: toolRes.error, tool: 'create_task' },
          domain: 'goals',
        };
      }

      const taskId = (toolRes.data as any)?.taskId || 'task_created';
      logStructured('AGENT', `Task Specialist created task`, { taskId, title: taskTitle });
      return {
        spokenSummary: `Your task has been created: "${taskTitle}". It is now tracked in your Tasks dashboard.`,
        structuredDetails: {
          taskId,
          title: taskTitle,
          tool: 'create_task',
          verified: true,
        },
        domain: 'goals',
      };
    }

    let retrievalContextBlock = '';
    let topRecords: any[] = [];
    if (userData) {
      const records: RetrievalRecord[] = adaptUserRecords(userId, userData);
      if (records.length > 0) {
        const retrievalResult = await executeHybridRetrieval(query, records, {
          topK: 6,
          minScore: 0.15,
        });
        retrievalContextBlock = retrievalResult.formattedContextBlock;
        topRecords = retrievalResult.results.map((r) => ({
          title: r.title,
          type: r.type,
          score: r.score,
        }));
      }
    }

    let systemInstruction = `You are the Gemini 3.8 Flash Specialist Agent in LifeForge AI.
Your responsibility is deep reasoning, private user data retrieval, study problem solving, or career research.
You are called as a sub-agent by the Gemini 3.1 Flash Live voice engine.

CORE PHILOSOPHY:
- "If you fall, stand up and continue. Avoid unnecessary excuses. Focus on solutions."
- "Learn through logic rather than rote memorization."
- "Something is better than nothing."
- Never diagnose medical or psychiatric conditions.
- Never recommend starvation, sleep deprivation, or self-harm.

OUTPUT FORMAT:
Provide your response in two parts:
1. Spoken Summary (1-3 sentences, direct, calm, natural speech that Gemini 3.1 Live can speak aloud immediately).
2. Structured Breakdown (key points, recommendations, or next action steps).`;

    const domainStr = domain as string;
    if (domainStr === 'placement') {
      systemInstruction += `\nSPECIALIZATION: Placement & Interview Preparation. Analyze skill gaps, explain DSA trade-offs, system design principles, or technical interview strategies.`;
    } else if (domainStr === 'study') {
      systemInstruction += `\nSPECIALIZATION: Study Coach & Active Recall. Suggest 25/5 Pomodoro cycles, teach-back technique, active retrieval, and clearing conceptual misconceptions.`;
    } else if (domainStr === 'reflection') {
      systemInstruction += `\nSPECIALIZATION: Evidence-Grounded Reflection. Review recorded habits, study hours, and task completions honestly without false assumptions.`;
    } else if (domainStr === 'wellbeing') {
      systemInstruction += `\nSPECIALIZATION: Wellbeing & Controllable Action. Validate emotional concerns calmly, identify what is within the user's control, and suggest a simple grounding step.`;
    } else if (domainStr === 'research') {
      systemInstruction += `\nSPECIALIZATION: Current Tech & Company Research. Provide accurate, fresh industry trends.`;
    } else if (domainStr === 'calendar') {
      systemInstruction += `\nSPECIALIZATION: Google Calendar & Time Allocation. Suggest optimal study blocks, protect focus windows, and balance schedule demands.`;
    } else if (domainStr === 'goals') {
      systemInstruction += `\nSPECIALIZATION: Goals & Tasks Architecture. Break large milestones into 15-minute high-impact tasks and prioritize immediate actionable steps.`;
    } else if (domainStr === 'safety') {
      systemInstruction += `\nSPECIALIZATION: Safety & Grounding. Provide stabilizing emotional perspective, prevent burnout, and focus strictly on actionable solutions.`;
    } else if (domainStr === 'orchestrator') {
      systemInstruction += `\nSPECIALIZATION: Multi-Agent Dynamic Composition. Synthesize across Wellbeing, Placement, Study, Calendar, and Goals to formulate an integrated, multi-step action roadmap.`;
    }

    const prompt = `Student Query: "${query}"

${retrievalContextBlock ? `=== RETRIEVED PRIVATE USER CONTEXT ===\n${retrievalContextBlock}\n` : ''}

Synthesize a precise, high-clarity solution for the student.`;

    const useSearch = domain === 'research' || query.toLowerCase().includes('current') || query.toLowerCase().includes('opening') || query.toLowerCase().includes('interview trend');

    const config: any = {
      systemInstruction,
      temperature: 0.3,
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config,
    });

    const fullText = response.text || '';
    
    const cleanSentences = fullText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('#') && !s.startsWith('-') && !s.startsWith('*'));
    
    const spokenSummary = cleanSentences.slice(0, 2).join(' ') || fullText.slice(0, 200);

    const citations: Array<{ title?: string; uri?: string }> = [];
    const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          citations.push({
            title: chunk.web.title || 'Source',
            uri: chunk.web.uri,
          });
        }
      }
    }

    return {
      spokenSummary,
      structuredDetails: {
        rawReasoning: fullText,
        retrievedRecordsCount: topRecords.length,
        retrievedItems: topRecords,
      },
      domain,
      citations,
      groundingSources: groundingMetadata?.webSearchQueries || [],
    };
  } catch (error: any) {
    return {
      spokenSummary: `I've noted your question on ${domain}. Let's focus on executing your core learning objectives step by step.`,
      structuredDetails: {
        error: error?.message || 'Agent task fallback processing',
        domain,
      },
      domain,
      citations: [],
    };
  }
}
