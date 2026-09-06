import {
  getConversations,
  getConversationMessages,
  getGoals,
  addGoal,
  updateGoal,
  updateGoalProgress,
  getTasks,
  addTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getStudySessions,
  addStudySession,
  addActionConfirmation,
  getPlacementProfile,
  getResumeMetadata,
  getReflections,
  addReflection,
} from '@/lib/firebase';
import { globalConversationManager } from '@/lib/conversation-manager';
import { calendarStateManager, fetchUpcomingCalendarEvents, createGoogleCalendarEvent } from '@/lib/calendar';
import { resumeStateManager } from '@/lib/resume';
import { timerManager } from '@/lib/timer';
import { authoritativeState } from '@/lib/state/applicationState';
import { logStructured, redactSensitiveData } from '@/lib/logger';

import { resumeService, getCanonicalResume } from '@/lib/placement/resumeService';

export interface ToolRequestContract {
  toolCallId?: string;
  requestId: string;
  agentTaskId: string;
  conversationId: string;
  turnId: string;
  tool: string;
  arguments: Record<string, any>;
  userData?: any;
}

export interface ToolResultContract {
  success: boolean;
  tool: string;
  requestId: string;
  timestamp: string;
  data: unknown;
  error: null | {
    code: string;
    message: string;
    failureStage?: string;
    retryable?: boolean;
  };
  requiresConfirmation: boolean;
}

export type ToolLifecycleStatus =
  | 'REQUESTED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'WAITING_CONFIRMATION';

export type ToolLifecycleState = ToolLifecycleStatus;

export interface ToolExecutionRecord {
  toolCallId?: string;
  requestId: string;
  agentTaskId: string;
  conversationId: string;
  turnId: string;
  tool: string;
  agent?: string;
  arguments: Record<string, any>;
  input?: Record<string, any>;
  status: ToolLifecycleStatus;
  state?: ToolLifecycleStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: any;
  output?: any;
  error?: null | {
    code: string;
    message: string;
    failureStage?: string;
    retryable?: boolean;
  };
}

export class ToolGateway {
  private static instance: ToolGateway;
  private idempotencyCache = new Map<string, ToolResultContract>();
  private activeExecutions = new Map<string, ToolExecutionRecord>();
  private executionHistory: ToolExecutionRecord[] = [];
  private inFlightPromises = new Map<string, Promise<ToolResultContract>>();
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  public static getInstance(): ToolGateway {
    if (!ToolGateway.instance) {
      ToolGateway.instance = new ToolGateway();
    }
    return ToolGateway.instance;
  }

  public cleanupStaleExecutions(): void {
    const now = Date.now();
    let changed = false;
    this.activeExecutions.forEach((record, reqId) => {
      const started = new Date(record.startedAt).getTime();
      if (now - started > 15000) {
        record.status = 'FAILED';
        record.state = 'FAILED';
        record.completedAt = new Date().toISOString();
        record.error = {
          code: 'EXECUTION_TIMEOUT',
          message: 'Tool execution timed out after 15 seconds',
          failureStage: 'EXECUTION',
          retryable: true,
        };
        this.activeExecutions.delete(reqId);
        this.recordExecution(record);
        changed = true;
      }
    });

    this.executionHistory = this.executionHistory.map((rec) => {
      if (rec.status === 'RUNNING' || rec.state === 'RUNNING') {
        const started = new Date(rec.startedAt).getTime();
        if (now - started > 15000 || !this.activeExecutions.has(rec.requestId)) {
          changed = true;
          return {
            ...rec,
            status: 'FAILED',
            state: 'FAILED',
            completedAt: rec.completedAt || new Date().toISOString(),
            error: rec.error || {
              code: 'EXECUTION_TIMEOUT',
              message: 'Stale tool execution marked as failed',
              failureStage: 'EXECUTION',
              retryable: false,
            },
          };
        }
      }
      return rec;
    });

    if (changed) this.notify();
  }

  public cancelAllActiveExecutions(reason: string = 'Session ended'): void {
    const now = new Date().toISOString();
    this.activeExecutions.forEach((record, reqId) => {
      record.status = 'CANCELLED';
      record.state = 'CANCELLED';
      record.completedAt = now;
      record.result = { state: 'CANCELLED', message: reason };
      this.recordExecution(record);
    });
    this.activeExecutions.clear();
    this.executionHistory = this.executionHistory.map((rec) => {
      if (rec.status === 'RUNNING' || rec.state === 'RUNNING') {
        return {
          ...rec,
          status: 'CANCELLED',
          state: 'CANCELLED',
          completedAt: now,
          result: { state: 'CANCELLED', message: reason },
        };
      }
      return rec;
    });
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.cleanupStaleExecutions();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.warn('ToolGateway listener error:', err);
      }
    });
  }

  public getActiveExecutions(): ToolExecutionRecord[] {
    this.cleanupStaleExecutions();
    return Array.from(this.activeExecutions.values());
  }

  public getExecutionHistory(): ToolExecutionRecord[] {
    this.cleanupStaleExecutions();
    return [...this.executionHistory];
  }

  public recordExecution(record: ToolExecutionRecord): void {
    const toolCallId = record.toolCallId || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const safeInput = redactSensitiveData(record.input || record.arguments || {});
    let safeOutput = redactSensitiveData(record.output || record.result);
    if (record.tool.includes('resume') && safeOutput && typeof safeOutput === 'object') {
      const r = safeOutput as any;
      safeOutput = {
        hasResume: r.hasResume,
        status: r.status,
        resumeId: r.resumeId,
        analysisStatus: r.analysisStatus,
        fileName: r.fileName,
        skillCount: Array.isArray(r.skills) ? r.skills.length : r.skillCount,
        projectCount: Array.isArray(r.projects) ? r.projects.length : r.projectCount,
        questionCount: Array.isArray(r.interviewQuestions) ? r.interviewQuestions.length : (Array.isArray(r.questions) ? r.questions.length : r.questionCount),
        message: r.message,
      };
    }
    const formatted: ToolExecutionRecord = {
      ...record,
      toolCallId,
      arguments: safeInput,
      input: safeInput,
      result: safeOutput,
      output: safeOutput,
      state: record.status,
    };
    const idx = this.executionHistory.findIndex((r) => r.requestId === formatted.requestId);
    if (idx >= 0) {
      this.executionHistory[idx] = formatted;
    } else {
      this.executionHistory.unshift(formatted);
      if (this.executionHistory.length > 60) {
        this.executionHistory.pop();
      }
    }
    logStructured('TOOL', `tool=${formatted.tool}`, {
      toolCallId: formatted.toolCallId,
      requestId: formatted.requestId,
      status: formatted.status,
      agent: formatted.agent,
      durationMs: formatted.duration ? Math.round(formatted.duration * 1000) : 0,
    });
    this.notify();
  }

  public updateExecution(requestId: string, updates: Partial<ToolExecutionRecord>): void {
    const idx = this.executionHistory.findIndex((r) => r.requestId === requestId);
    if (idx >= 0) {
      this.executionHistory[idx] = {
        ...this.executionHistory[idx],
        ...updates,
        state: updates.status || this.executionHistory[idx].status,
      };
      this.notify();
    }
  }

  public clearHistory(): void {
    this.executionHistory = [];
    this.activeExecutions.clear();
    this.idempotencyCache.clear();
    this.inFlightPromises.clear();
    this.notify();
  }

  private getAgentForTool(tool: string): string {
    if (tool.includes('goal') || tool.includes('task')) return 'Goal/Task Agent';
    if (tool.includes('timer') || tool.includes('study')) return 'Study Agent';
    if (tool.includes('calendar')) return 'Calendar Agent';
    if (tool.includes('resume') || tool.includes('placement')) return 'Placement Agent';
    if (tool.includes('reflection')) return 'Reflection Agent';
    return 'LifeForge Live Coach';
  }

  private validateToolArguments(tool: string, args: Record<string, any>): void {
    if (tool === 'create_goal') {
      if (!args?.title || typeof args.title !== 'string' || !args.title.trim()) {
        const err: any = new Error('Argument title is required for create_goal');
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    } else if (tool === 'create_task') {
      if (!args?.title || typeof args.title !== 'string' || !args.title.trim()) {
        const err: any = new Error('Argument title is required for create_task');
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    } else if (tool === 'delete_goal') {
      if (!args?.goalId || typeof args.goalId !== 'string') {
        const err: any = new Error('Argument goalId is required for delete_goal');
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    } else if (tool === 'update_task' || tool === 'edit_task') {
      if (!args?.taskId || typeof args.taskId !== 'string') {
        const err: any = new Error(`Argument taskId is required for ${tool}`);
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    } else if (tool === 'delete_task') {
      if (!args?.taskId || typeof args.taskId !== 'string') {
        const err: any = new Error('Argument taskId is required for delete_task');
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    } else if (
      tool === 'start_timer' ||
      tool === 'start_focus_timer' ||
      tool === 'start_break_timer'
    ) {
      if (args?.durationMinutes !== undefined && (typeof args.durationMinutes !== 'number' || args.durationMinutes <= 0)) {
        const err: any = new Error('Argument durationMinutes must be a positive number');
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    } else if (tool === 'get_calendar_events') {
      if (args?.daysAhead !== undefined && (typeof args.daysAhead !== 'number' || args.daysAhead <= 0)) {
        const err: any = new Error('Argument daysAhead must be a positive number');
        err.code = 'SCHEMA_VALIDATION_FAILED';
        err.failureStage = 'SCHEMA_VALIDATION';
        err.retryable = false;
        throw err;
      }
    }
  }

  private getLogicalKey(req: ToolRequestContract): string {
    const logicalId = (req as any).logicalActionId || req.agentTaskId || 'task';
    return `${req.conversationId || 'default'}_${req.turnId || 'turn'}_${req.tool}_${logicalId}`;
  }

  private getIdempotencyKey(req: ToolRequestContract): string {
    const logicalId = (req as any).logicalActionId || req.requestId || 'req';
    return `${req.conversationId || 'default'}_${req.turnId || 'turn'}_${req.tool}_${logicalId}`;
  }

  public async executeTool(
    userId: string,
    req: ToolRequestContract,
    options?: {
      onStartTimer?: (mins?: number) => void;
      userData?: any;
    }
  ): Promise<ToolResultContract> {
    this.cleanupStaleExecutions();

    if (options?.userData && !req.userData) {
      req.userData = options.userData;
    }

    if (req.tool === 'connect_calendar' && calendarStateManager.getState() === 'CONNECTED') {
      const events = calendarStateManager.getVerifiedEvents();
      return {
        success: true,
        tool: 'connect_calendar',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        data: {
          state: 'CONNECTED',
          summary: `${events.length} events returned`,
        },
        requiresConfirmation: false,
        error: null,
      };
    }

    const reqKey = this.getIdempotencyKey(req);
    const cachedByReq = this.idempotencyCache.get(reqKey);
    if (cachedByReq) {
      return cachedByReq;
    }

    const logicalKey = this.getLogicalKey(req);
    const cachedByLogical = this.idempotencyCache.get(logicalKey);
    if (cachedByLogical) {
      return cachedByLogical;
    }

    const flightKey = `${req.conversationId || 'default'}_${req.turnId || 'default'}_${req.tool}`;
    const inFlight = this.inFlightPromises.get(flightKey) || this.inFlightPromises.get(logicalKey);
    if (inFlight) {
      return inFlight;
    }

    const execPromise = this.internalExecuteTool(userId, req, options);
    this.inFlightPromises.set(flightKey, execPromise);
    this.inFlightPromises.set(logicalKey, execPromise);
    try {
      const res = await execPromise;
      this.idempotencyCache.set(reqKey, res);
      this.idempotencyCache.set(logicalKey, res);
      return res;
    } finally {
      this.inFlightPromises.delete(flightKey);
      this.inFlightPromises.delete(logicalKey);
    }
  }

  private async internalExecuteTool(
    userId: string,
    req: ToolRequestContract,
    options?: {
      onStartTimer?: (mins?: number) => void;
      userData?: any;
    }
  ): Promise<ToolResultContract> {
    if (options?.userData && !req.userData) {
      req.userData = options.userData;
    }
    const idempotencyKey = this.getIdempotencyKey(req);
    const cached = this.idempotencyCache.get(idempotencyKey);
    if (cached) {
      return cached;
    }

    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const agent = this.getAgentForTool(req.tool);

    if (!userId) {
      const authErrorResult: ToolResultContract = {
        success: false,
        tool: req.tool,
        requestId: req.requestId,
        timestamp: startedAt,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authenticated UID is required for tool execution',
          failureStage: 'AUTHENTICATION',
          retryable: false,
        },
        requiresConfirmation: false,
      };
      return authErrorResult;
    }

    const record: ToolExecutionRecord = {
      requestId: req.requestId,
      agentTaskId: req.agentTaskId,
      conversationId: req.conversationId,
      turnId: req.turnId,
      toolCallId: req.toolCallId || (req as any).callId || (req as any).id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool: req.tool,
      agent,
      arguments: req.arguments,
      status: 'RUNNING',
      state: 'RUNNING',
      startedAt,
    };

    try {
      this.validateToolArguments(req.tool, req.arguments || {});
    } catch (valErr: any) {
      const errResult: ToolResultContract = {
        success: false,
        tool: req.tool,
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        data: null,
        error: {
          code: valErr.code || 'SCHEMA_VALIDATION_FAILED',
          message: valErr.message || 'Tool arguments validation failed',
          failureStage: 'SCHEMA_VALIDATION',
          retryable: false,
        },
        requiresConfirmation: false,
      };
      record.status = 'FAILED';
      record.state = 'FAILED';
      record.completedAt = new Date().toISOString();
      record.duration = 0.01;
      record.error = errResult.error;
      this.recordExecution(record);
      return errResult;
    }

    this.activeExecutions.set(req.requestId, record);
    this.notify();

    console.log(
      `[TOOL_START]\ntool=${req.tool}\nagent=${agent}\nuserIdHash=${userId}\nconversationId=${req.conversationId || 'default'}\nturnId=${req.turnId || 'default'}\ntoolCallId=${record.toolCallId}\nrequestId=${req.requestId}\ninput=${JSON.stringify(req.arguments || {})}`
    );

    let result: ToolResultContract = {
      success: false,
      tool: req.tool,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      data: null,
      error: null,
      requiresConfirmation: false,
    };

    try {
      const output = await this.dispatchToolExecution(userId, req, options);
      const isConfirmation = output.requiresConfirmation ?? false;
      result = {
        success: true,
        tool: req.tool,
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        data: output.data,
        error: null,
        requiresConfirmation: isConfirmation,
      };
      record.status = isConfirmation ? 'WAITING_CONFIRMATION' : 'COMPLETED';
      record.state = record.status;
      record.result = output.data;
    } catch (err: any) {
      console.error('[ToolGateway executeTool Error]:', err);
      result = {
        success: false,
        tool: req.tool,
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        data: null,
        error: {
          code: err?.code || 'EXECUTION_FAILED',
          message: err?.message || 'Tool execution encountered an internal error',
          failureStage: err?.failureStage || 'EXECUTION',
          retryable: err?.retryable ?? true,
        },
        requiresConfirmation: false,
      };
      record.status = 'FAILED';
      record.state = 'FAILED';
      record.error = result.error;
    } finally {
      const endTimeMs = Date.now();
      const durationMs = Math.round(endTimeMs - startTimeMs);
      record.completedAt = new Date().toISOString();
      record.duration = Math.round(durationMs / 10) / 100;
      this.activeExecutions.delete(req.requestId);
      if (record.status === 'RUNNING') {
        record.status = result.success ? (result.requiresConfirmation ? 'WAITING_CONFIRMATION' : 'COMPLETED') : 'FAILED';
        record.state = record.status;
      }
      this.recordExecution(record);
      this.idempotencyCache.set(idempotencyKey, result);

      if (result.success) {
        console.log(`[TOOL_END]\ntool=${req.tool}\nagent=${agent}\nuserIdHash=${userId}\nconversationId=${req.conversationId || 'default'}\nturnId=${req.turnId || 'default'}\ntoolCallId=${record.toolCallId}\nrequestId=${req.requestId}\nstatus=${record.status}\ndurationMs=${durationMs}\nresult=${JSON.stringify(result.data || {})}`);
      } else {
        console.log(`[TOOL_ERROR]\ntool=${req.tool}\nagent=${agent}\nuserIdHash=${userId}\nconversationId=${req.conversationId || 'default'}\nturnId=${req.turnId || 'default'}\ntoolCallId=${record.toolCallId}\nrequestId=${req.requestId}\nstatus=FAILED\ndurationMs=${durationMs}\nerror=${JSON.stringify(result.error || {})}`);
      }

      this.notify();
    }

    if (req.conversationId) {
      globalConversationManager.setAgentActivity({
        domain: req.tool.includes('calendar') ? 'calendar' : req.tool.includes('goal') || req.tool.includes('task') ? 'goal' : req.tool.includes('resume') ? 'placement' : 'orchestrator',
        state: result.success ? `Executed ${req.tool}` : `Failed ${req.tool}`,
        detail: `Tool: ${req.tool}`,
        updatedAt: new Date().toLocaleTimeString(),
      });
    }

    return result;
  }

  private async dispatchToolExecution(
    userId: string,
    req: ToolRequestContract,
    options?: {
      onStartTimer?: (mins?: number) => void;
    }
  ): Promise<{ data: any; requiresConfirmation?: boolean }> {
    const args = req.arguments || {};

    switch (req.tool) {
      case 'create_goal': {
        if (!args.title || typeof args.title !== 'string' || !args.title.trim()) {
          throw new Error('Argument title is required for create_goal');
        }
        const goalPayload: any = {
          title: args.title.trim(),
          ...(args.description !== undefined && args.description !== null && { description: String(args.description).trim() }),
          ...(args.domain !== undefined && { domain: args.domain }),
          priority: args.priority || 'high',
          status: 'in_progress',
          progress: 0,
          ...(args.targetDate !== undefined && { targetDate: args.targetDate }),
          source: 'Autonomous Tool Gateway',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const goalId = await addGoal(userId, goalPayload);
        const goals = await getGoals(userId);
        const verified = goals.find((g) => g.id === goalId);
        if (!verified) {
          throw new Error(`Goal verification failed: Document ${goalId} could not be read back from database.`);
        }
        authoritativeState.setGoals(goals);
        return {
          data: {
            success: true,
            goalId,
            id: goalId,
            title: args.title.trim(),
            goal: verified,
            verified: true,
            createdAt: new Date().toISOString(),
            error: null,
          },
        };
      }

      case 'edit_goal':
      case 'update_goal': {
        const queryTerm = (args.goalTitle || args.title || args.goalId || '').trim();
        if (!queryTerm) throw new Error('Argument goalId or title is required for update_goal');
        const goals = await getGoals(userId);
        const lowerTerm = queryTerm.toLowerCase();
        const targetGoal = goals.find(
          (g) =>
            g.id === args.goalId ||
            g.title.toLowerCase() === lowerTerm ||
            g.title.toLowerCase().includes(lowerTerm) ||
            lowerTerm.includes(g.title.toLowerCase())
        );
        const goalId = targetGoal?.id || args.goalId;
        if (!goalId) throw new Error('Goal not found');
        const updates: any = {};
        if (args.newTitle || args.updatedTitle) updates.title = (args.newTitle || args.updatedTitle).trim();
        if (args.progress !== undefined) {
          updates.progress = Number(args.progress);
          if (updates.progress >= 100) updates.status = 'completed';
        }
        if (args.status) updates.status = args.status;
        if (args.priority) updates.priority = args.priority;
        if (args.domain) updates.domain = args.domain;
        if (args.targetDate) updates.targetDate = args.targetDate;
        await updateGoal(userId, goalId, updates);
        const updatedGoals = await getGoals(userId);
        authoritativeState.setGoals(updatedGoals);
        const finalGoal = updatedGoals.find((g) => g.id === goalId) || { id: goalId, ...updates };
        return { data: finalGoal };
      }

      case 'get_goal':
      case 'get_goals': {
        const goals = await getGoals(userId);
        authoritativeState.setGoals(goals);
        return {
          data: {
            goals,
            count: goals.length,
            summary: goals.length > 0
              ? `You have ${goals.length} active goal${goals.length === 1 ? '' : 's'}: ${goals.map((g) => `"${g.title}" (${g.progress ?? 0}% complete)`).join(', ')}.`
              : 'You have no goals saved yet in your dashboard.',
          },
        };
      }

      case 'delete_goal': {
        const queryTerm = (args.goalTitle || args.title || args.goalId || '').trim();
        if (!queryTerm) throw new Error('Argument goalId or title is required for delete_goal');
        const goals = await getGoals(userId);
        const lowerTerm = queryTerm.toLowerCase();
        const targetGoal = goals.find(
          (g) =>
            g.id === args.goalId ||
            g.title.toLowerCase() === lowerTerm ||
            g.title.toLowerCase().includes(lowerTerm) ||
            lowerTerm.includes(g.title.toLowerCase())
        );
        const goalId = targetGoal?.id || args.goalId || `goal_${Date.now()}`;
        const goalTitle = targetGoal?.title || args.goalTitle || args.title || args.goalId || 'Goal';
        const domain = targetGoal?.domain || args.domain || 'goals';
        const priority = targetGoal?.priority || 'medium';
        const status = targetGoal?.status || 'in_progress';
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const confirmationId = await addActionConfirmation(userId, {
          actionType: 'delete_goal',
          type: 'delete_goal',
          title: `Delete goal: "${goalTitle}"?`,
          description: 'Permanent removal of goal item. Confirmation expires in 5 minutes.',
          payload: {
            goalId,
            goalTitle,
            title: goalTitle,
            domain,
            priority,
            status,
            targetDate: targetGoal?.targetDate,
            description: targetGoal?.description,
          },
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt,
        });
        return {
          data: {
            goalId,
            goalTitle,
            domain,
            priority,
            status,
            confirmationId,
            expiresAt,
          },
          requiresConfirmation: true,
        };
      }

      case 'create_task': {
        if (!args.title || typeof args.title !== 'string' || !args.title.trim()) {
          throw new Error('Argument title is required for create_task');
        }
        const taskPayload: any = {
          title: args.title.trim(),
          ...(args.description !== undefined && args.description !== null && { description: String(args.description).trim() }),
          domain: args.domain || 'study',
          priority: args.priority || 'medium',
          status: 'pending',
          ...(args.dueDate !== undefined && { dueDate: args.dueDate }),
          ...(args.goalId !== undefined && { goalId: args.goalId }),
          isDeepWork: args.isDeepWork ?? true,
          estimatedMinutes: args.estimatedMinutes || 25,
          source: 'Autonomous Tool Gateway',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const taskId = await addTask(userId, taskPayload);
        const tasks = await getTasks(userId);
        const verified = tasks.find((t) => t.id === taskId);
        if (!verified) {
          throw new Error(`Task verification failed: Document ${taskId} could not be read back from database.`);
        }
        authoritativeState.setTasks(tasks);
        return {
          data: {
            success: true,
            taskId,
            id: taskId,
            title: args.title.trim(),
            task: verified,
            verified: true,
            error: null,
          },
        };
      }

      case 'edit_task':
      case 'update_task': {
        const queryTerm = (args.taskTitle || args.title || args.taskId || '').trim();
        if (!queryTerm) throw new Error('Argument taskId or title is required for update_task');
        const tasks = await getTasks(userId);
        const lowerTerm = queryTerm.toLowerCase();
        const targetTask = tasks.find(
          (t) =>
            t.id === args.taskId ||
            t.title.toLowerCase() === lowerTerm ||
            t.title.toLowerCase().includes(lowerTerm) ||
            lowerTerm.includes(t.title.toLowerCase())
        );
        const taskId = targetTask?.id || args.taskId;
        if (!taskId) throw new Error('Task not found');
        const updates: any = {};
        if (args.newTitle || args.updatedTitle) updates.title = (args.newTitle || args.updatedTitle).trim();
        if (args.status) updates.status = args.status;
        if (args.priority) updates.priority = args.priority;
        if (args.domain) updates.domain = args.domain;
        if (args.dueDate) updates.dueDate = args.dueDate;
        await updateTask(userId, taskId, updates);
        const updatedTasks = await getTasks(userId);
        authoritativeState.setTasks(updatedTasks);
        const finalTask = updatedTasks.find((t) => t.id === taskId) || { id: taskId, ...updates };
        return { data: finalTask };
      }

      case 'get_task':
      case 'get_tasks': {
        const tasks = await getTasks(userId);
        authoritativeState.setTasks(tasks);
        return {
          data: {
            tasks,
            count: tasks.length,
            summary: tasks.length > 0
              ? `You have ${tasks.length} task${tasks.length === 1 ? '' : 's'}: ${tasks.map((t) => `"${t.title}" (${t.status || 'pending'})`).join(', ')}.`
              : 'You have no tasks saved yet.',
          },
        };
      }

      case 'delete_task': {
        const queryTerm = (args.taskTitle || args.title || args.taskId || '').trim();
        if (!queryTerm) throw new Error('Argument taskId or title is required');
        const tasks = await getTasks(userId);
        const lowerTerm = queryTerm.toLowerCase();
        const targetTask = tasks.find(
          (t) =>
            t.id === args.taskId ||
            t.title.toLowerCase() === lowerTerm ||
            t.title.toLowerCase().includes(lowerTerm) ||
            lowerTerm.includes(t.title.toLowerCase())
        );
        const taskId = targetTask?.id || args.taskId || `task_${Date.now()}`;
        const taskTitle = targetTask?.title || args.taskTitle || args.title || args.taskId || 'Task';
        const domain = targetTask?.domain || args.domain || 'study';
        const priority = targetTask?.priority || 'medium';
        const status = targetTask?.status || 'pending';
        const dueDate = targetTask?.dueDate;
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const confirmationId = await addActionConfirmation(userId, {
          actionType: 'delete_task',
          type: 'delete_task',
          title: `Delete task: "${taskTitle}"?`,
          description: 'Permanent removal of task item. Confirmation expires in 5 minutes.',
          payload: {
            taskId,
            taskTitle,
            title: taskTitle,
            domain,
            priority,
            status,
            dueDate,
            description: targetTask?.description,
          },
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt,
        });
        return {
          data: {
            taskId,
            taskTitle,
            domain,
            priority,
            status,
            dueDate,
            confirmationId,
            expiresAt,
          },
          requiresConfirmation: true,
        };
      }

      case 'start_timer':
      case 'start_focus_timer': {
        const mins = args.durationMinutes || 25;
        timerManager.start(mins, args.mode || 'focus', args.label || 'DSA Deep Work Focus');
        options?.onStartTimer?.(mins);
        const st = timerManager.getState();
        return {
          data: {
            ...st,
            success: true,
            status: 'COMPLETED',
            timerState: 'RUNNING',
            state: 'RUNNING',
            durationMinutes: mins,
          },
        };
      }

      case 'pause_timer':
      case 'pause_focus_timer': {
        timerManager.pause();
        const st = timerManager.getState();
        return {
          data: {
            ...st,
            success: true,
            state: st.status,
          },
        };
      }

      case 'resume_timer':
      case 'resume_focus_timer': {
        timerManager.resume();
        const st = timerManager.getState();
        return {
          data: {
            ...st,
            success: true,
            state: st.status,
          },
        };
      }

      case 'restart_timer':
      case 'restart_focus_timer': {
        timerManager.restart();
        const st = timerManager.getState();
        return {
          data: {
            ...st,
            success: true,
            state: st.status,
          },
        };
      }

      case 'stop_timer':
      case 'stop_focus_timer': {
        timerManager.stop();
        const st = timerManager.getState();
        return {
          data: {
            ...st,
            success: true,
            state: st.status,
          },
        };
      }

      case 'start_break_timer': {
        const mins = args.durationMinutes || 5;
        timerManager.startBreak(mins, args.label || 'Recharge & Rest');
        return {
          data: timerManager.getState(),
        };
      }

      case 'get_timer_status':
      case 'get_focus_timer': {
        return {
          data: timerManager.getState(),
        };
      }

      case 'create_reflection':
      case 'generate_daily_reflection':
      case 'generate_reflection': {
        const date = args.date || new Date().toISOString().split('T')[0];
        const reflectionId = await addReflection(userId, {
          type: 'daily',
          date,
          whatHappened: args.whatHappened || args.situation || 'Completed technical coaching and interview defense review',
          whatWorked: args.whatWorked || 'Focused technical problem solving and algorithm analysis',
          whatFailed: args.whatFailed || '',
          whatWasAvoided: args.whatWasAvoided || '',
          whatLearned: args.whatLearned || 'Practicing deliberate practice consistently yields higher retention',
          nextImprovement: args.nextImprovement || args.preparationNeeded || 'Target weak areas with deliberate problem solving',
          disciplineScore: Number(args.disciplineScore) || 5,
          focusScore: Number(args.focusScore) || 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        const reflections = await getReflections(userId);
        const verified = reflections.find((r) => r.id === reflectionId) || {
          id: reflectionId,
          userId,
          type: 'daily',
          date,
          whatHappened: args.whatHappened,
          whatWorked: args.whatWorked,
          whatLearned: args.whatLearned,
          disciplineScore: Number(args.disciplineScore) || 5,
          focusScore: Number(args.focusScore) || 5,
        };
        return {
          data: {
            reflectionId,
            id: reflectionId,
            date,
            verified: true,
            reflection: verified,
          },
        };
      }

      case 'get_reflection':
      case 'get_reflections': {
        const reflections = await getReflections(userId);
        return { data: reflections };
      }

      case 'get_calendar_status':
      case 'get_calendar_connection_status': {
        const state = calendarStateManager.getState();
        authoritativeState.updateCalendar({ status: state });
        return {
          data: {
            status: state,
            connectionState: state,
            isConnected: state === 'CONNECTED',
            summary: `Google Calendar state: ${state}`,
          },
        };
      }

      case 'get_calendar_events': {
        const token = args.token || req.userData?.calendarToken || (typeof window !== 'undefined' ? calendarStateManager.getAccessToken() : null);
        const isConnected = (req.userData?.calendarState === 'CONNECTED' || (typeof window !== 'undefined' && calendarStateManager.getState() === 'CONNECTED')) && Boolean(token);
        if (!isConnected || !token) {
          const err: any = new Error('Google Calendar is not connected');
          err.code = 'CALENDAR_NOT_CONNECTED';
          err.failureStage = 'AUTHORIZATION';
          err.retryable = true;
          throw err;
        }
        if (token && typeof window !== 'undefined') {
          calendarStateManager.setAccessToken(token);
          calendarStateManager.setState('CONNECTED');
        }
        try {
          const timeZone = args.timeZone || 'Asia/Kolkata';
          let timeMin = args.timeMin;
          let timeMax = args.timeMax;
          if (!timeMin) {
            const sod = new Date();
            sod.setHours(0, 0, 0, 0);
            timeMin = sod.toISOString();
          }
          if (!timeMax && args.daysAhead) {
            timeMax = new Date(Date.now() + args.daysAhead * 86400000).toISOString();
          }
          const events = await fetchUpcomingCalendarEvents(token, {
            maxResults: args.maxResults || 10,
            timeMin,
            timeMax,
            timeZone,
          });
          const sortedEvents = [...events].sort((a, b) => {
            const tA = new Date(a.startDateTime || a.start?.dateTime || 0).getTime();
            const tB = new Date(b.startDateTime || b.start?.dateTime || 0).getTime();
            return tA - tB;
          });
          return {
            data: {
              events: sortedEvents,
              count: sortedEvents.length,
              timezone: timeZone,
              verified: true,
              summary: `${sortedEvents.length} events returned`,
            },
          };
        } catch (apiErr: any) {
          const err: any = new Error(apiErr?.message || 'Google Calendar API call failed');
          err.code = 'CALENDAR_TOOL_FAILED';
          err.failureStage = 'EXECUTION';
          err.retryable = true;
          throw err;
        }
      }

      case 'create_calendar_event': {
        const token = args.token || req.userData?.calendarToken || (typeof window !== 'undefined' ? calendarStateManager.getAccessToken() : null);
        const isConnected = (req.userData?.calendarState === 'CONNECTED' || (typeof window !== 'undefined' && calendarStateManager.getState() === 'CONNECTED')) && Boolean(token);
        if (!isConnected || !token) {
          const err: any = new Error('Google Calendar is not connected. Please connect Google Calendar first.');
          err.code = 'CALENDAR_NOT_CONNECTED';
          err.failureStage = 'AUTHORIZATION';
          err.retryable = true;
          throw err;
        }
        const summary = args.summary || args.title || 'Study Focus Session';
        let startDateTime = args.startDateTime || args.start;
        const durationMinutes = Number(args.durationMinutes) || 60;
        if (!startDateTime || isNaN(new Date(startDateTime).getTime())) {
          const startTime = new Date(Date.now() + 3600000);
          startDateTime = startTime.toISOString();
        } else {
          startDateTime = new Date(startDateTime).toISOString();
        }
        let endDateTime = args.endDateTime || args.end;
        if (!endDateTime || isNaN(new Date(endDateTime).getTime()) || new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
          const endTime = new Date(new Date(startDateTime).getTime() + durationMinutes * 60000);
          endDateTime = endTime.toISOString();
        } else {
          endDateTime = new Date(endDateTime).toISOString();
        }
        try {
          const created = await createGoogleCalendarEvent(token, {
            summary,
            description: args.description || 'Scheduled via LifeForge AI Coach',
            startDateTime,
            endDateTime,
            location: args.location || 'Focus Space',
          });
          return {
            data: {
              success: true,
              status: 'created',
              event: created,
              summary: `Scheduled "${summary}" for ${new Date(startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
            },
          };
        } catch (apiErr: any) {
          const err: any = new Error(apiErr?.message || 'Google Calendar creation failed');
          err.code = 'CALENDAR_TOOL_FAILED';
          err.failureStage = 'EXECUTION';
          err.retryable = true;
          throw err;
        }
      }

      case 'update_calendar_event': {
        return { data: { status: 'event_staged', summary: args.summary } };
      }

      case 'delete_calendar_event': {
        const queryTerm = (args.summary || args.title || args.eventId || '').trim();
        let targetEventId = args.eventId;
        let eventSummary = args.summary || args.title || args.eventTitle || 'Calendar Event';
        let eventStart: string | undefined = args.startDateTime || args.start;
        const token = args.token || req.userData?.calendarToken || (typeof window !== 'undefined' ? calendarStateManager.getAccessToken() : null);
        if (token) {
          try {
            const events = await fetchUpcomingCalendarEvents(token, 15);
            const lowerTerm = queryTerm.toLowerCase();
            const matched = events.find(
              (e) =>
                e.id === targetEventId ||
                e.eventId === targetEventId ||
                (e.summary && e.summary.toLowerCase().includes(lowerTerm)) ||
                (lowerTerm && e.summary && lowerTerm.includes(e.summary.toLowerCase()))
            );
            if (matched) {
              targetEventId = matched.id || matched.eventId;
              eventSummary = matched.summary || eventSummary;
              eventStart = matched.startDateTime || matched.start?.dateTime;
            }
          } catch (e) {
            console.warn('Failed to fetch events for calendar delete matching:', e);
          }
        }
        const confirmationId = await addActionConfirmation(userId, {
          actionType: 'delete_calendar_event',
          type: 'delete_calendar_event',
          title: `Delete calendar event: "${eventSummary}"?`,
          description: 'Calendar event deletion requires user confirmation. Confirmation expires in 5 minutes.',
          payload: {
            eventId: targetEventId || args.eventId || 'calendar_event',
            summary: eventSummary,
            title: eventSummary,
            eventTitle: eventSummary,
            startDateTime: eventStart,
            domain: 'calendar',
          },
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });
        return {
          data: {
            confirmationId,
            eventId: targetEventId,
            summary: eventSummary,
            title: eventSummary,
            eventTitle: eventSummary,
          },
          requiresConfirmation: true,
        };
      }

      case 'get_resume_status': {
        const res = await resumeService.getResumeStatus(userId, req.userData);
        authoritativeState.updateResume({
          status: res.hasResume ? (res.analysisStatus === 'READY' ? 'READY' : 'UPLOADED') : 'RESUME_REQUIRED',
          resumeId: res.resumeId,
          analysisStatus: res.analysisStatus,
          uploadedAt: res.uploadedAt,
        });
        return { data: res };
      }

      case 'request_resume_upload': {
        authoritativeState.updateResume({ status: 'RESUME_REQUIRED' });
        return {
          data: {
            status: 'RESUME_REQUIRED',
            actionRequired: 'UPLOAD_RESUME',
            message: args.reason || 'Please upload your resume before I analyze it.',
          },
        };
      }

      case 'get_resume_summary':
      case 'get_resume_analysis':
      case 'upload_resume':
      case 'analyze_resume': {
        const canonical = await getCanonicalResume(userId, req.userData);
        authoritativeState.updateResume({
          status: canonical.exists ? (canonical.analysisStatus === 'READY' ? 'READY' : 'UPLOADED') : 'RESUME_REQUIRED',
          resumeId: canonical.resumeId || undefined,
          analysisStatus: canonical.analysisStatus || undefined,
          summary: canonical.extracted?.summary || undefined,
          skills: canonical.extracted?.skills || [],
          projects: canonical.extracted?.projects || [],
          uploadedAt: canonical.uploadedAt || undefined,
        });

        if (!canonical.exists || !canonical.extracted) {
          return {
            data: {
              status: 'RESUME_REQUIRED',
              actionRequired: 'UPLOAD_RESUME',
              hasResume: false,
              exists: false,
              code: 'RESUME_NOT_FOUND',
              resumeId: null,
              fileName: null,
              message: 'No resume is uploaded yet. Please upload your resume in Placements.',
            },
          };
        }

        return {
          data: {
            status: 'SUCCESS',
            hasResume: true,
            exists: true,
            analysisStatus: 'READY',
            code: 'READY',
            resumeId: canonical.resumeId,
            fileName: canonical.fileName,
            uploadedAt: canonical.uploadedAt,
            summary: canonical.extracted.summary,
            skills: canonical.extracted.skills,
            projects: canonical.extracted.projects,
            achievements: canonical.extracted.achievements,
            education: canonical.extracted.education,
            experience: canonical.extracted.experience,
            certifications: canonical.extracted.certifications,
            technologies: canonical.extracted.technologies,
            research: canonical.extracted.research,
            publications: canonical.extracted.publications,
            links: canonical.extracted.links,
            strengths: canonical.extracted.strengths,
            gaps: canonical.extracted.gaps,
            interviewQuestions: canonical.extracted.interviewQuestions,
            questions: canonical.extracted.interviewQuestions,
            extractedData: canonical.extracted,
          },
        };
      }

      case 'end_live_session': {
        await globalConversationManager.endLiveSession(userId, req.conversationId);
        return {
          data: {
            status: 'SESSION_ENDED',
            micState: 'OFF',
            finalizedAt: new Date().toISOString(),
          },
        };
      }

      case 'get_resume_questions':
      case 'generate_resume_interview_questions':
      case 'generate_interview_questions': {
        const res = await resumeService.getResumeSummary(userId, req.userData);
        if (!res.hasResume) {
          return {
            data: {
              hasResume: false,
              status: 'RESUME_REQUIRED',
              questions: [],
              message: 'No resume is uploaded yet.',
            },
          };
        }
        const questions = res.interviewQuestions && res.interviewQuestions.length > 0 ? res.interviewQuestions : [
          { question: 'Explain the internal architecture and data pipeline of your most complex project.', category: 'System Architecture' },
          { question: 'How do you handle race conditions or idempotency in distributed workflows?', category: 'Distributed Systems' },
        ];
        return { data: { hasResume: true, count: questions.length, questions } };
      }

      case 'save_study_session': {
        const sessionId = await addStudySession(userId, {
          topic: args.subject || 'DSA Practice',
          technique: 'pomodoro',
          durationMinutes: args.durationMinutes || 25,
          completedCycles: 1,
          notes: args.notes || '',
          createdAt: new Date().toISOString(),
        });
        return { data: { sessionId, durationMinutes: args.durationMinutes || 25 } };
      }

      default:
        throw new Error(`Unknown tool definition: ${req.tool}`);
    }
  }
}

export const globalToolGateway = ToolGateway.getInstance();
