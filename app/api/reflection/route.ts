import { GoogleGenAI, Type, Schema } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { executeHybridRetrieval } from '@/lib/retrieval/hybridEngine';
import { adaptUserRecords } from '@/lib/retrieval/recordAdapter';
import { RetrievalRecord } from '@/lib/retrieval/types';
import type { WeeklyReflectionReport, GrowthTrendMetrics } from '@/lib/types';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId = 'current_user',
      userData,
      timeframe = 'weekly', // 'weekly' | 'trend'
    }: {
      userId: string;
      userData?: {
        journals?: any[];
        memories?: any[];
        goals?: any[];
        tasks?: any[];
        reflections?: any[];
        studySessions?: any[];
        placementProfile?: any;
      };
      timeframe?: 'weekly' | 'trend';
    } = body;

    const journals = userData?.journals || [];
    const reflections = userData?.reflections || [];
    const tasks = userData?.tasks || [];
    const goals = userData?.goals || [];
    const studySessions = userData?.studySessions || [];
    const placementProfile = userData?.placementProfile;

    // 1. Calculate Grounded Quantitative Metrics from real stored documents
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Current Week Study Time
    const currentWeekSessions = studySessions.filter((s: any) => {
      const d = new Date(s.createdAt);
      return d >= sevenDaysAgo;
    });
    const currentWeekStudyMinutes = currentWeekSessions.reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0);
    const currentWeekCycles = currentWeekSessions.reduce((acc: number, s: any) => acc + (s.completedCycles || 0), 0);

    // Previous Week Study Time
    const previousWeekSessions = studySessions.filter((s: any) => {
      const d = new Date(s.createdAt);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    });
    const previousWeekStudyMinutes = previousWeekSessions.reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0);

    const studyTimeChangePercent = previousWeekStudyMinutes === 0
      ? currentWeekStudyMinutes > 0 ? 100 : 0
      : Math.round(((currentWeekStudyMinutes - previousWeekStudyMinutes) / previousWeekStudyMinutes) * 100);

    // Task Completion
    const currentWeekCompletedTasks = tasks.filter((t: any) => {
      if (t.status !== 'completed') return false;
      const d = new Date(t.updatedAt || t.createdAt);
      return d >= sevenDaysAgo;
    }).length;

    const previousWeekCompletedTasks = tasks.filter((t: any) => {
      if (t.status !== 'completed') return false;
      const d = new Date(t.updatedAt || t.createdAt);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    }).length;

    const taskCompletionChangePercent = previousWeekCompletedTasks === 0
      ? currentWeekCompletedTasks > 0 ? 100 : 0
      : Math.round(((currentWeekCompletedTasks - previousWeekCompletedTasks) / previousWeekCompletedTasks) * 100);

    // Reflections and Discipline Score
    const recentReflections = reflections.filter((r: any) => {
      const d = new Date(r.createdAt || r.date);
      return d >= sevenDaysAgo;
    });
    const avgDisciplineScore = recentReflections.length > 0
      ? Number((recentReflections.reduce((acc: number, r: any) => acc + (r.disciplineScore || 3), 0) / recentReflections.length).toFixed(1))
      : 4.2;

    // Identified Weak/Struggling Topics from real study notes & misconceptions
    const recordedMisconceptions: string[] = [];
    studySessions.forEach((s: any) => {
      if (s.misconceptionsCleared && Array.isArray(s.misconceptionsCleared)) {
        recordedMisconceptions.push(...s.misconceptionsCleared);
      }
    });

    const activeGoalsCount = goals.filter((g: any) => g.status === 'in_progress').length;

    // If only trend stats are requested
    const trendMetrics: GrowthTrendMetrics = {
      currentWeekStudyMinutes,
      previousWeekStudyMinutes,
      studyTimeChangePercent,
      currentWeekCompletedTasks,
      previousWeekCompletedTasks,
      taskCompletionChangePercent,
      activeGoalsCount,
      avgDisciplineScore,
      reflectionsLoggedCount: recentReflections.length,
      topStrugglingTopics: placementProfile?.weakAreas || ['Dynamic Programming', 'Graph Traversals'],
      topMasteredSkills: (placementProfile?.skills || [])
        .filter((s: any) => s.level === 'Mastery' || s.completed)
        .map((s: any) => s.name)
        .slice(0, 5),
    };

    if (timeframe === 'trend') {
      return NextResponse.json({ trendMetrics });
    }

    // 2. Hybrid Retrieval for Qualitative Evidence Synthesis
    let retrievalRecords: RetrievalRecord[] = [];
    if (userData) {
      retrievalRecords = adaptUserRecords(userId, userData);
    }

    const reflectionSearch = await executeHybridRetrieval(
      'daily reflection weekly review achievements struggled avoided lessons discipline focus practice',
      retrievalRecords,
      { topK: 8, minScore: 0.15 }
    );

    const retrievedContextBlock = reflectionSearch.formattedContextBlock;

    // 3. Structured Output Definition using Gemini 3.8 Flash
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        periodLabel: { type: Type.STRING },
        startDate: { type: Type.STRING },
        endDate: { type: Type.STRING },
        achievements: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              evidence: { type: Type.STRING },
            },
            required: ['title', 'evidence'],
          },
        },
        missedOrAvoided: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['title', 'reason'],
          },
        },
        recurringPatterns: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pattern: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['productive', 'friction', 'avoidance'] },
              recommendation: { type: Type.STRING },
            },
            required: ['pattern', 'type', 'recommendation'],
          },
        },
        studyAnalysis: {
          type: Type.OBJECT,
          properties: {
            totalStudyHours: { type: Type.NUMBER },
            completedCycles: { type: Type.INTEGER },
            difficultTopics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            strongestImprovements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['totalStudyHours', 'completedCycles', 'difficultTopics', 'strongestImprovements'],
        },
        careerPlacementAnalysis: {
          type: Type.OBJECT,
          properties: {
            prepProgress: { type: Type.STRING },
            skillGapsIdentified: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            upcomingPriorities: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['prepProgress', 'skillGapsIdentified', 'upcomingPriorities'],
        },
        routineDiscipline: {
          type: Type.OBJECT,
          properties: {
            avgDisciplineScore: { type: Type.NUMBER },
            consistencyObservation: { type: Type.STRING },
          },
          required: ['avgDisciplineScore', 'consistencyObservation'],
        },
        nextWeekPriorities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              priority: { type: Type.STRING },
              actionPlan: { type: Type.STRING },
              suggestedGoal: { type: Type.STRING },
              suggestedTasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['priority', 'actionPlan'],
          },
        },
        groundedQuote: { type: Type.STRING },
      },
      required: [
        'periodLabel',
        'startDate',
        'endDate',
        'achievements',
        'missedOrAvoided',
        'recurringPatterns',
        'studyAnalysis',
        'careerPlacementAnalysis',
        'routineDiscipline',
        'nextWeekPriorities',
        'groundedQuote',
      ],
    };

    const systemInstruction = `You are the Lead Reflection & Growth Intelligence Agent for LifeForge AI.
Your role is to perform an honest, evidence-grounded review of the student's study routines, task completions, placement preparation, and reflections.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. EVIDENCE-GROUNDED ONLY: Every achievement, missed task, and recurring pattern MUST be traceable to the recorded user data. Never invent statistics, completed projects, or imaginary study sessions.
2. DISCIPLINE & GROWTH PHILOSOPHY:
   - "If you fall, stand up and continue. Avoid unnecessary excuses. Focus on solutions."
   - "Do the work you genuinely want to become excellent at."
   - "Learn through logic rather than rote memorization."
   - "Something is better than nothing."
3. MENTAL WELLBEING BOUNDARIES:
   - Never diagnose psychiatric conditions (e.g. ADHD, Depression).
   - Use evidence phrasing: "Your recorded sessions show...", "Based on 4 completed tasks...", "Your reflection logs indicate...".
   - Never recommend sleep deprivation, skipping meals, or extreme self-punishment.
4. ACTIONABLE FEEDBACK LOOP: Suggest clear, realistic goals and tasks for the upcoming week that the user can choose to adopt with 1-click.`;

    const userPrompt = `Synthesize a rigorous Weekly Reflection Report for this student.

=== QUANTITATIVE METRICS (STORED IN DATABASE) ===
- Current Week Study Time: ${(currentWeekStudyMinutes / 60).toFixed(1)} hours (${currentWeekStudyMinutes} minutes across ${currentWeekCycles} Pomodoro cycles)
- Previous Week Study Time: ${(previousWeekStudyMinutes / 60).toFixed(1)} hours (Trend: ${studyTimeChangePercent >= 0 ? '+' : ''}${studyTimeChangePercent}%)
- Current Week Tasks Completed: ${currentWeekCompletedTasks} (vs ${previousWeekCompletedTasks} previous week)
- Active Goals: ${activeGoalsCount}
- Average Self-Reported Discipline: ${avgDisciplineScore}/5 (${recentReflections.length} daily reflections logged)
- Recorded Misconceptions & Study Struggles: ${recordedMisconceptions.length > 0 ? recordedMisconceptions.join(', ') : 'None explicitly logged'}

=== PLACEMENT PROFILE ===
- Target Role: ${placementProfile?.targetRole || 'Software Development Engineer'}
- Target Companies: ${(placementProfile?.targetCompanies || []).join(', ') || 'Tech Companies'}
- Weak Areas Declared: ${(placementProfile?.weakAreas || []).join(', ') || 'Dynamic Programming, Graph Theory'}
- Resume Status: ${placementProfile?.resumeStatus || 'in_progress'}

=== HYBRID RETRIEVAL EVIDENCE ===
${retrievedContextBlock || 'No prior reflection logs found. Generate initial baseline growth evaluation based on available study and task records.'}

Generate a comprehensive, structured Weekly Reflection Report adhering strictly to the JSON schema.`;

    let response;
    let attempts = 0;
    while (attempts < 3) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.25,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });
        break;
      } catch (err: any) {
        attempts++;
        if (attempts >= 3) throw err;
        await new Promise((res) => setTimeout(res, 1200 * attempts));
      }
    }

    const resultText = response?.text;
    if (!resultText) {
      throw new Error('Failed to generate weekly reflection report from Gemini');
    }

    const report: WeeklyReflectionReport = JSON.parse(resultText);

    return NextResponse.json({
      report,
      trendMetrics,
    });
  } catch (err: any) {
    console.error('Reflection analysis error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate reflection report' },
      { status: 500 }
    );
  }
}
