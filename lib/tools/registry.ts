import {
  getConversations,
  getConversationMessages,
  getGoals,
  addGoal,
  updateGoalProgress,
  getTasks,
  addTask,
  updateTaskStatus,
  deleteTask,
  getStudySessions,
  addStudySession,
  addActionConfirmation,
  getPlacementProfile,
  savePlacementProfile,
  getReflections,
  addReflection,
} from '@/lib/firebase';
import type { ChatMessage, GoalItem, TaskItem } from '@/lib/types';
import { globalToolGateway } from './gateway';

export interface ToolDefinition {
  name: string;
  category: 'conversation' | 'goals' | 'tasks' | 'study' | 'calendar' | 'placement' | 'reflection';
  description: string;
  allowedAgents?: string[];
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  authorizationRequirement?: string;
  confirmationRequirement?: boolean;
  requiresConfirmation?: boolean;
}

export const REQUIRED_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_conversation',
    category: 'conversation',
    description: 'Retrieve conversation metadata and summary by conversationId.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'get_recent_messages',
    category: 'conversation',
    description: 'Retrieve the most recent chronological messages for a conversation.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'search_conversation',
    category: 'conversation',
    description: 'Search historical conversation turns by keyword.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'summarize_conversation',
    category: 'conversation',
    description: 'Trigger asynchronous rolling summary update for the active conversation.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'create_goal',
    category: 'goals',
    description: 'Create a milestone or semester goal.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        domain: { type: 'string', enum: ['study', 'placement', 'wellbeing', 'habits', 'career'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        targetDate: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_goal',
    category: 'goals',
    description: 'Update goal progress percentage or status.',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        progress: { type: 'number' },
      },
      required: ['goalId', 'progress'],
    },
  },
  {
    name: 'get_goal',
    category: 'goals',
    description: 'Retrieve student goals.',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
      },
    },
  },
  {
    name: 'delete_goal',
    category: 'goals',
    description: 'Request deletion of an existing goal. Must trigger user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        goalTitle: { type: 'string' },
      },
      required: ['goalId'],
    },
    requiresConfirmation: true,
  },
  {
    name: 'create_task',
    category: 'tasks',
    description: 'Create an actionable task item.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        domain: { type: 'string', enum: ['study', 'placement', 'wellbeing', 'habits', 'career'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        dueDate: { type: 'string' },
        goalId: { type: 'string' },
        estimatedMinutes: { type: 'number' },
        isDeepWork: { type: 'boolean' },
      },
      required: ['title'],
    },
  },
  {
    name: 'edit_task',
    category: 'tasks',
    description: 'Edit or update an existing task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
        title: { type: 'string' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_task',
    category: 'tasks',
    description: 'Update task completion status.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
      },
      required: ['taskId', 'status'],
    },
  },
  {
    name: 'get_task',
    category: 'tasks',
    description: 'Retrieve pending or completed tasks.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
      },
    },
  },
  {
    name: 'delete_task',
    category: 'tasks',
    description: 'Request deletion of an existing task. Must trigger user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        taskTitle: { type: 'string' },
      },
      required: ['taskId'],
    },
    requiresConfirmation: true,
  },
  {
    name: 'start_focus_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Initiate a canonical 25-minute Pomodoro focus interval.',
    parameters: {
      type: 'object',
      properties: {
        durationMinutes: { type: 'number' },
      },
    },
    requiresConfirmation: false,
  },
  {
    name: 'pause_focus_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Pause the running focus timer.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'resume_focus_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Resume the paused focus timer.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'restart_focus_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Restart the focus timer from the beginning.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'stop_focus_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Stop or cancel the canonical focus timer.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'start_break_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Initiate a 5-minute break timer.',
    parameters: {
      type: 'object',
      properties: {
        durationMinutes: { type: 'number' },
      },
    },
    requiresConfirmation: false,
  },
  {
    name: 'get_focus_timer',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Get remaining time and status of the canonical focus timer.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'save_study_session',
    category: 'study',
    allowedAgents: ['Study Agent'],
    description: 'Log a completed deep work or active recall study block.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        durationMinutes: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['subject', 'durationMinutes'],
    },
  },
  {
    name: 'get_calendar_connection_status',
    category: 'calendar',
    allowedAgents: ['Calendar Agent'],
    description: 'Check Google Calendar OAuth connection state.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'connect_calendar',
    category: 'calendar',
    allowedAgents: ['Calendar Agent'],
    description: 'Prompt user to connect their Google Calendar account.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_calendar_events',
    category: 'calendar',
    description: 'Retrieve upcoming Google Calendar schedule events.',
    parameters: {
      type: 'object',
      properties: {
        daysAhead: { type: 'number' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    category: 'calendar',
    description: 'Schedule a new study or practice block on Google Calendar.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['summary', 'startTime', 'endTime'],
    },
  },
  {
    name: 'update_calendar_event',
    category: 'calendar',
    description: 'Reschedule or modify an existing calendar event.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        summary: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'delete_calendar_event',
    category: 'calendar',
    description: 'Remove an event from Google Calendar.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'upload_resume',
    category: 'placement',
    description: 'Guide the user to upload and parse their resume document.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'analyze_resume',
    category: 'placement',
    description: 'Analyze student resume against industry engineering role criteria.',
    parameters: {
      type: 'object',
      properties: {
        targetRole: { type: 'string' },
      },
    },
  },
  {
    name: 'get_resume_summary',
    category: 'placement',
    description: 'Retrieve structured skills, projects, and strengths from analyzed resume.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_resume_analysis',
    category: 'placement',
    description: 'Retrieve comprehensive technical skills, gaps, and projects from analyzed resume.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_resume_questions',
    category: 'placement',
    allowedAgents: ['Placement Agent'],
    description: 'Retrieve interview questions generated from analyzed resume projects.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'analyze_skill_gap',
    category: 'placement',
    description: 'Generate placement readiness matrix and critical gap analysis.',
    parameters: {
      type: 'object',
      properties: {
        targetRole: { type: 'string' },
      },
    },
  },
  {
    name: 'research_company',
    category: 'placement',
    description: 'Research company interview patterns with fresh Google Search grounding.',
    parameters: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        role: { type: 'string' },
      },
      required: ['company'],
    },
  },
  {
    name: 'generate_interview_questions',
    category: 'placement',
    allowedAgents: ['Placement Agent'],
    description: 'Generate targeted technical interview questions from resume projects.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
      },
    },
    requiresConfirmation: false,
  },
  {
    name: 'generate_resume_interview_questions',
    category: 'placement',
    allowedAgents: ['Placement Agent'],
    description: 'Generate targeted technical interview questions from resume projects.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
      },
    },
    requiresConfirmation: false,
  },
  {
    name: 'generate_daily_reflection',
    category: 'reflection',
    allowedAgents: ['Reflection Agent'],
    description: 'Synthesize daily progress, habit discipline, and mood signals.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'generate_reflection',
    category: 'reflection',
    allowedAgents: ['Reflection Agent'],
    description: 'Generate daily or periodic reflection insights.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'generate_weekly_reflection',
    category: 'reflection',
    allowedAgents: ['Reflection Agent'],
    description: 'Generate comprehensive weekly pattern analysis and recommendations.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'create_reflection',
    category: 'reflection',
    description: 'Log today reflection entry directly to Firestore.',
    parameters: {
      type: 'object',
      properties: {
        whatWorked: { type: 'string' },
        whatFailed: { type: 'string' },
        whatLearned: { type: 'string' },
        disciplineScore: { type: 'number' },
        focusScore: { type: 'number' },
      },
    },
    requiresConfirmation: false,
  },
  {
    name: 'get_reflection',
    category: 'reflection',
    description: 'Retrieve logged reflections from Firestore.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'get_resume_status',
    category: 'placement',
    description: 'Check if student resume has been uploaded and analyzed in Storage and Firestore.',
    parameters: {
      type: 'object',
      properties: {},
    },
    requiresConfirmation: false,
  },
  {
    name: 'request_resume_upload',
    category: 'placement',
    description: 'Prompt user to upload resume for technical placement analysis.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
    requiresConfirmation: false,
  },
  {
    name: 'end_live_session',
    category: 'conversation',
    description: 'End the current live session, finalize conversation, close Live WebSocket, and release microphone.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
    requiresConfirmation: false,
  },
];

export interface CanonicalToolResult<T = any> {
  success: boolean;
  tool: string;
  requestId: string;
  timestamp: number;
  data?: T;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationId?: string;
  requiresCalendarConnect?: boolean;
  requiresResumeUpload?: boolean;
}

export async function executeLifeForgeTool(
  userId: string,
  toolName: string,
  args: Record<string, any>,
  options?: {
    activeConversationId?: string;
    userDataCache?: any;
    onStartTimer?: (mins?: number) => void;
  }
): Promise<CanonicalToolResult> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const agentTaskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const gatewayResult = await globalToolGateway.executeTool(
    userId,
    {
      requestId,
      agentTaskId,
      conversationId: options?.activeConversationId || '',
      turnId: `turn_${Date.now()}`,
      tool: toolName,
      arguments: args,
    },
    {
      onStartTimer: options?.onStartTimer,
    }
  );

  return {
    success: gatewayResult.success,
    tool: gatewayResult.tool,
    requestId: gatewayResult.requestId,
    timestamp: Date.now(),
    data: gatewayResult.data,
    error: gatewayResult.error?.message,
    requiresConfirmation: gatewayResult.requiresConfirmation,
    confirmationId: (gatewayResult.data as any)?.confirmationId,
    requiresCalendarConnect: (gatewayResult.data as any)?.status === 'calendar_connection_required',
    requiresResumeUpload: (gatewayResult.data as any)?.status === 'RESUME_REQUIRED',
  };
}
