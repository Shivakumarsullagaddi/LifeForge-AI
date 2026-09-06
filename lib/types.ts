export type AgentDomain =
  | 'orchestrator'
  | 'study'
  | 'placement'
  | 'wellbeing'
  | 'career'
  | 'research'
  | 'calendar'
  | 'goal'
  | 'reflection'
  | 'safety';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  timezone?: string;
  primaryGoal?: string;
  targetPlacements?: string[];
  studyPhilosophy?: string;
  disciplinedStreakDays?: number;
  lastActiveDate?: string;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalItem {
  id: string;
  userId: string;
  title: string;
  description?: string;
  domain: 'study' | 'placement' | 'wellbeing' | 'habits' | 'career';
  priority: PriorityLevel;
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold';
  targetDate?: string;
  progress: number; // 0 - 100
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  userId: string;
  goalId?: string;
  title: string;
  description?: string;
  domain: 'study' | 'placement' | 'wellbeing' | 'habits' | 'career';
  priority: PriorityLevel;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: string;
  estimatedMinutes?: number;
  isDeepWork?: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReflectionEntry {
  id: string;
  userId: string;
  type: 'daily' | 'weekly' | 'post_session' | 'milestone';
  date: string;
  whatHappened?: string;
  whatWorked?: string;
  whatFailed?: string;
  whatWasAvoided?: string;
  whatLearned?: string;
  nextImprovement?: string;
  keyWins?: string[];
  challengesFaced?: string[];
  lessonsLearned?: string;
  nextCommitments?: string[];
  disciplineScore?: number; // 1 - 5
  focusScore?: number; // 1 - 5
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export type PersistenceStatus = 'LOCAL' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_FAILED';

export interface ConversationSession {
  id: string;
  conversationId?: string;
  userId: string;
  title: string;
  agentDomain: AgentDomain;
  activeAgent?: string;
  summary?: string;
  rollingSummary?: string;
  memorySummaryId?: string;
  currentSessionId?: string;
  activeSessionId?: string;
  status?: 'active' | 'archived' | 'completed';
  isPinned?: boolean;
  messageCount?: number;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  messageId?: string;
  conversationId?: string;
  liveSessionId?: string;
  turnId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  text?: string;
  agentDomain?: AgentDomain;
  agent?: string;
  model?: string;
  source?: 'voice' | 'text' | 'tool' | 'agent';
  citations?: { title: string; url: string }[];
  toolCallSummary?: string;
  metadata?: Record<string, any>;
  persistenceStatus?: PersistenceStatus;
  createdAt: string;
  timestamp?: string;
}

export interface ActionConfirmation {
  id: string;
  userId: string;
  actionType?: 'delete_goal' | 'delete_task' | 'delete_calendar_event' | 'delete_all_data' | 'export_data' | 'external_calendar_write';
  type?: string;
  title: string;
  description: string;
  payload?: any;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
  requestedAt: string;
  resolvedAt?: string;
}

export interface StudySessionRecord {
  id: string;
  userId: string;
  topic: string;
  technique: 'pomodoro' | 'active_recall' | 'teach_back' | 'deep_work';
  durationMinutes: number;
  completedCycles: number;
  notes?: string;
  misconceptionsCleared?: string[];
  createdAt: string;
}

export interface PlacementProject {
  id: string;
  title: string;
  techStack: string[];
  description: string;
  keyTradeoffs?: string;
  interviewDefensePoints: string[];
}

export interface UpcomingInterview {
  id: string;
  company: string;
  role: string;
  date: string;
  stage: 'Online Assessment' | 'Technical Round 1' | 'Technical Round 2 (System Design)' | 'Hiring Manager / Behavioral' | 'HR / Offer';
  focusAreas: string[];
}

export interface PlacementSkill {
  id: string;
  name: string;
  category: 'DSA' | 'Core CS' | 'System Design' | 'Backend' | 'Behavioral';
  level: 'Fundamentals' | 'Intermediate' | 'Mastery';
  completed: boolean;
  verifiedByPractice?: boolean;
  lastPracticedDate?: string;
  notes?: string;
}

export interface ResumeProfileData {
  resumeId?: string;
  fileName?: string;
  uploadedAt?: string;
  summary?: string;
  skills: string[];
  projects: Array<{ title: string; description: string; techStack: string[] }>;
  experience: Array<{ role: string; organization: string; duration: string; highlights: string[] }>;
  education: Array<{ degree: string; institution: string; year?: string; grade?: string }>;
  strengths: string[];
  gaps: string[];
  achievements?: string[];
  certifications?: string[];
  technologies?: string[];
  research?: string[];
  publications?: string[];
  links?: string[];
  interviewQuestions: Array<{ question: string; category: string; expectedPoints: string[] }>;
}

export interface PlacementProfile {
  id: string;
  userId: string;
  targetRole: string;
  targetCompanies: string[];
  skills: PlacementSkill[];
  weakAreas: string[];
  experience: string;
  projects: PlacementProject[];
  resumeStatus: 'needs_review' | 'in_progress' | 'interview_ready';
  resumeProfile?: ResumeProfileData;
  preparationProgress: number;
  upcomingInterviews: UpcomingInterview[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillGapAnalysisResult {
  targetRole: string;
  strengths: Array<{ title: string; evidence: string }>;
  criticalGaps: Array<{ title: string; category: string; impact: string }>;
  missingRequiredSkills: Array<{ name: string; reason: string }>;
  urgency: 'low' | 'medium' | 'high';
  sprintPlan: Array<{ phase: string; focus: string; recommendedHours: number; actionableTasks: string[] }>;
  proposedGoals: Array<{ title: string; domain: 'placement' | 'study'; priority: PriorityLevel }>;
  proposedTasks: Array<{ title: string; domain: 'placement' | 'study'; priority: PriorityLevel; estimatedMinutes: number; isDeepWork: boolean }>;
  analyzedAt: string;
}

export interface GoogleCalendarEventItem {
  id: string;
  eventId?: string;
  calendarId?: string;
  summary: string;
  title?: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  startDateTime?: string;
  endDateTime?: string;
  timezone?: string;
  htmlLink?: string;
  status?: string;
}

export interface WeeklyReflectionReport {
  id?: string;
  periodLabel: string; // e.g. "Week of Aug 28 - Sep 3, 2026"
  startDate: string;
  endDate: string;
  achievements: Array<{ title: string; evidence: string }>;
  missedOrAvoided: Array<{ title: string; reason: string }>;
  recurringPatterns: Array<{ pattern: string; type: 'productive' | 'friction' | 'avoidance'; recommendation: string }>;
  studyAnalysis: {
    totalStudyHours: number;
    completedCycles: number;
    difficultTopics: string[];
    strongestImprovements: string[];
  };
  careerPlacementAnalysis: {
    prepProgress: string;
    skillGapsIdentified: string[];
    upcomingPriorities: string[];
  };
  routineDiscipline: {
    avgDisciplineScore: number;
    consistencyObservation: string;
  };
  nextWeekPriorities: Array<{
    priority: string;
    actionPlan: string;
    suggestedGoal?: string;
    suggestedTasks?: string[];
  }>;
  groundedQuote?: string; // from personal principles
  generatedAt: string;
}

export interface GrowthTrendMetrics {
  currentWeekStudyMinutes: number;
  previousWeekStudyMinutes: number;
  studyTimeChangePercent: number;
  currentWeekCompletedTasks: number;
  previousWeekCompletedTasks: number;
  taskCompletionChangePercent: number;
  activeGoalsCount: number;
  avgDisciplineScore: number;
  reflectionsLoggedCount: number;
  topStrugglingTopics: string[];
  topMasteredSkills: string[];
}

