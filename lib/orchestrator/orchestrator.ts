import { ApplicationState, authoritativeState } from '@/lib/state/applicationState';

export type SpecialistDomain =
  | 'Timer'
  | 'Calendar'
  | 'Placement'
  | 'GoalTask'
  | 'Reflection'
  | 'GeneralCoach';

export interface OrchestratorDecision {
  specialist: SpecialistDomain;
  agentName: string;
  recommendedTool?: string;
  toolParameters?: Record<string, any>;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  confidence: number;
  reasoning: string;
}

export interface RouteContext {
  userId: string;
  userMessage: string;
  conversationId?: string | null;
  applicationState: ApplicationState;
}

export class CentralOrchestrator {
  private static instance: CentralOrchestrator;

  public static getInstance(): CentralOrchestrator {
    if (!CentralOrchestrator.instance) {
      CentralOrchestrator.instance = new CentralOrchestrator();
    }
    return CentralOrchestrator.instance;
  }

  public route(context: RouteContext): OrchestratorDecision {
    const raw = context.userMessage.trim();
    const query = raw.toLowerCase();

    if (
      /(?:pomodoro|timer|stopwatch|focus\s+(?:timer|session|clock)|study\s+(?:for\s+)?\d+\s*min|break\s+(?:timer|clock)|start\s+(?:a\s+)?\d+\s*min)/i.test(query) ||
      /(?:pause|resume|stop|reset|check)\s+(?:the\s+)?timer/i.test(query) ||
      query === 'start timer' ||
      query === 'stop timer' ||
      query === 'pause timer' ||
      query === 'resume timer'
    ) {
      if (/stop\s+(?:the\s+)?timer/i.test(query)) {
        return {
          specialist: 'Timer',
          agentName: 'Timer Specialist',
          recommendedTool: 'stop_timer',
          confidence: 1.0,
          reasoning: 'User requested stopping the focus timer',
        };
      }
      if (/pause\s+(?:the\s+)?timer/i.test(query)) {
        return {
          specialist: 'Timer',
          agentName: 'Timer Specialist',
          recommendedTool: 'pause_timer',
          confidence: 1.0,
          reasoning: 'User requested pausing the focus timer',
        };
      }
      if (/resume\s+(?:the\s+)?timer/i.test(query)) {
        return {
          specialist: 'Timer',
          agentName: 'Timer Specialist',
          recommendedTool: 'resume_timer',
          confidence: 1.0,
          reasoning: 'User requested resuming the focus timer',
        };
      }

      const matchMinutes = query.match(/(\d+)\s*(?:minutes?|mins?)/i);
      const minutes = matchMinutes ? parseInt(matchMinutes[1], 10) : 25;

      const isDirectCommand = /^(?:start|set)\s+(?:a\s+)?(?:\d+\s*min(?:ute)?\s+)?(?:pomodoro|timer)/i.test(query);

      if (isDirectCommand) {
        return {
          specialist: 'Timer',
          agentName: 'Timer Specialist',
          recommendedTool: 'start_timer',
          toolParameters: { durationMinutes: minutes, mode: 'focus' },
          requiresConfirmation: false,
          confidence: 1.0,
          reasoning: 'Direct command to start focus timer without confirmation requirement',
        };
      }

      return {
        specialist: 'Timer',
        agentName: 'Timer Specialist',
        recommendedTool: 'start_timer',
        toolParameters: { durationMinutes: minutes, mode: 'focus' },
        requiresConfirmation: true,
        confirmationPrompt: `Do you want me to start a ${minutes}-minute focus session?`,
        confidence: 0.95,
        reasoning: 'Natural language timer request requiring confirmation',
      };
    }

    if (
      /(?:calendar|google\s+calendar|gcal|my\s+events|upcoming\s+events|my\s+schedule|calendar\s+events)/i.test(query)
    ) {
      const isConnected = context.applicationState.calendar.status === 'CONNECTED';
      if (!isConnected && !/(?:connect|link|auth|oauth)/i.test(query)) {
        return {
          specialist: 'Calendar',
          agentName: 'Calendar Agent',
          recommendedTool: 'get_calendar_status',
          confidence: 0.98,
          reasoning: 'Calendar status check required before querying events',
        };
      }
      return {
        specialist: 'Calendar',
        agentName: 'Calendar Agent',
        recommendedTool: 'get_calendar_events',
        toolParameters: { maxResults: 5 },
        confidence: 0.95,
        reasoning: 'User requested calendar schedule and events',
      };
    }

    if (
      /(?:resume|cv|uploaded\s+file|my\s+skills|skill\s+gap|ats\s+score|interview\s+prep|interview\s+questions)/i.test(query)
    ) {
      const hasResume = context.applicationState.resume.status === 'READY';
      if (!hasResume && /(?:upload|send|attach)/i.test(query)) {
        return {
          specialist: 'Placement',
          agentName: 'Placement Agent',
          recommendedTool: 'request_resume_upload',
          confidence: 0.95,
          reasoning: 'User requesting resume upload prompt',
        };
      }
      return {
        specialist: 'Placement',
        agentName: 'Placement Agent',
        recommendedTool: 'get_resume_summary',
        confidence: 0.95,
        reasoning: 'User inquiring about resume summary or extracted analysis',
      };
    }

    if (
      /(?:create|add|set|new)\s+(?:a\s+)?goal/i.test(query) ||
      /(?:my\s+goals|list\s+goals|show\s+goals|delete\s+goal|remove\s+goal)/i.test(query)
    ) {
      if (/(?:delete|remove)\s+goal/i.test(query)) {
        return {
          specialist: 'GoalTask',
          agentName: 'Goal Specialist',
          recommendedTool: 'delete_goal',
          requiresConfirmation: true,
          confirmationPrompt: 'Are you sure you want to delete this goal?',
          confidence: 0.95,
          reasoning: 'Goal deletion requires human confirmation',
        };
      }
      if (/(?:create|add|set|new)\s+(?:a\s+)?goal/i.test(query)) {
        const title = raw.replace(/^(?:please\s+)?(?:create|add|set|new)\s+(?:a\s+)?goal(?:\s+to)?\s*/i, '').trim() || 'Master target skill';
        return {
          specialist: 'GoalTask',
          agentName: 'Goal Specialist',
          recommendedTool: 'create_goal',
          toolParameters: { title, domain: 'academic' },
          confidence: 0.95,
          reasoning: 'Goal creation intent',
        };
      }
      return {
        specialist: 'GoalTask',
        agentName: 'Goal Specialist',
        recommendedTool: 'get_goals',
        confidence: 0.9,
        reasoning: 'List goals intent',
      };
    }

    if (
      /(?:create|add|new)\s+(?:a\s+)?task/i.test(query) ||
      /(?:my\s+tasks|list\s+tasks|show\s+tasks|delete\s+task|remove\s+task)/i.test(query)
    ) {
      if (/(?:delete|remove)\s+task/i.test(query)) {
        return {
          specialist: 'GoalTask',
          agentName: 'Task Specialist',
          recommendedTool: 'delete_task',
          requiresConfirmation: true,
          confirmationPrompt: 'Are you sure you want to delete this task?',
          confidence: 0.95,
          reasoning: 'Task deletion requires human confirmation',
        };
      }
      if (/(?:create|add|new)\s+(?:a\s+)?task/i.test(query)) {
        const title = raw.replace(/^(?:please\s+)?(?:create|add|new)\s+(?:a\s+)?task(?:\s+to)?\s*/i, '').trim() || 'Complete assigned work';
        return {
          specialist: 'GoalTask',
          agentName: 'Task Specialist',
          recommendedTool: 'create_task',
          toolParameters: { title, domain: 'academic' },
          confidence: 0.95,
          reasoning: 'Task creation intent',
        };
      }
      return {
        specialist: 'GoalTask',
        agentName: 'Task Specialist',
        recommendedTool: 'get_tasks',
        confidence: 0.9,
        reasoning: 'List tasks intent',
      };
    }

    if (/(?:reflect|reflection|daily\s+review|journal|nightly\s+reflection)/i.test(query)) {
      return {
        specialist: 'Reflection',
        agentName: 'Reflection Specialist',
        recommendedTool: 'create_reflection',
        confidence: 0.9,
        reasoning: 'User requested reflection entry creation',
      };
    }

    return {
      specialist: 'GeneralCoach',
      agentName: 'General Coach',
      confidence: 0.8,
      reasoning: 'General conversational coaching, reasoning, or guidance',
    };
  }
}

export const centralOrchestrator = CentralOrchestrator.getInstance();
