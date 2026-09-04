import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { executeHybridRetrieval } from '@/lib/retrieval/hybridEngine';
import { adaptUserRecords } from '@/lib/retrieval/recordAdapter';
import { RetrievalRecord } from '@/lib/retrieval/types';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface CoachRequestBody {
  message: string;
  userId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userProfile?: {
    displayName?: string;
    primaryGoal?: string;
    targetPlacements?: string[];
    studyPhilosophy?: string;
    disciplinedStreakDays?: number;
  };
  userData?: {
    journals?: any[];
    memories?: any[];
    goals?: any[];
    tasks?: any[];
    reflections?: any[];
    conversations?: any[];
    studySessions?: any[];
  };
  userContext?: {
    activeGoals?: Array<{ id: string; title: string; domain: string; progress: number }>;
    pendingTasks?: Array<{ id: string; title: string; priority: string; domain: string; isDeepWork?: boolean }>;
    activeMemories?: Array<{ id: string; type: string; content: string }>;
    recentReflections?: Array<{ date: string; whatWorked?: string; whatFailed?: string; lessonsLearned?: string }>;
    recentJournals?: Array<{ title: string; category?: string; actionTakeaway?: string }>;
  };
  activeDomain?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CoachRequestBody = await req.json();
    const {
      message,
      userId = 'current_user',
      conversationHistory = [],
      userProfile,
      userData,
      userContext,
      activeDomain,
    } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 1. Build Retrieval Database for Hybrid + Semantic Search
    let retrievalRecords: RetrievalRecord[] = [];

    if (userData) {
      retrievalRecords = adaptUserRecords(userId, userData);
    } else if (userContext) {
      // Convert userContext to records if full userData is not passed
      const synthesizedJournals = (userContext.recentJournals || []).map((j, i) => ({
        id: `journal_${i}`,
        userId,
        title: j.title,
        content: `Category: ${j.category || 'General'}. Action takeaway: ${j.actionTakeaway || 'None'}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const synthesizedMemories = (userContext.activeMemories || []).map((m) => ({
        id: m.id,
        userId,
        type: m.type as any,
        content: m.content,
        source: 'user_context',
        confidence: 0.95,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const synthesizedGoals = (userContext.activeGoals || []).map((g) => ({
        id: g.id,
        userId,
        title: g.title,
        domain: (g.domain || 'study') as any,
        priority: 'high' as const,
        status: 'in_progress' as const,
        progress: g.progress,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const synthesizedTasks = (userContext.pendingTasks || []).map((t) => ({
        id: t.id,
        userId,
        title: t.title,
        priority: (t.priority || 'medium') as any,
        domain: (t.domain || 'study') as any,
        status: 'pending' as const,
        isDeepWork: t.isDeepWork,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const synthesizedReflections = (userContext.recentReflections || []).map((r, i) => ({
        id: `ref_${i}`,
        userId,
        type: 'daily' as const,
        date: r.date,
        whatWorked: r.whatWorked,
        whatFailed: r.whatFailed,
        lessonsLearned: r.lessonsLearned,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      retrievalRecords = adaptUserRecords(userId, {
        journals: synthesizedJournals,
        memories: synthesizedMemories,
        goals: synthesizedGoals,
        tasks: synthesizedTasks,
        reflections: synthesizedReflections,
      });
    }

    // 2. Execute Hybrid + Semantic Retrieval Pipeline
    const searchResult = await executeHybridRetrieval(message, retrievalRecords, {
      topK: 5,
      minScore: 0.24,
    });

    const retrievedContextBlock = searchResult.formattedContextBlock;

    const systemPrompt = `You are LifeForge AI — a personal AI Life, Study & Career Coach for ambitious college students.

CORE COACHING PERSONALITY:
- DISCIPLINED, DIRECT, CALM, INTELLIGENT, SUPPORTIVE, NON-JUDGMENTAL, SOLUTION-ORIENTED, CURIOUS, PERSISTENT, REALISTIC, ACCOUNTABLE.
- You challenge excuses firmly but constructively: "Let's solve the next step", "That did not work. Let's change the approach."
- You never insult, shame, or encourage self-punishment (never withhold food, sleep, or rest as punishment).
- You translate strict discipline into safe accountability: schedule correction, recovery planning, priority reset, time-boxed recovery sprints.

PHILOSOPHY & PRINCIPLES:
1. Do the work you genuinely want to become excellent at.
2. Give sustained time and attention to meaningful goals.
3. Intentionality over blind imitation.
4. Learn through logic rather than rote memorization.
5. Practice repeatedly, ask questions, clear misconceptions, teach-back technique.
6. Something is better than nothing.
7. Focus on solutions: "Let's identify why, recover remaining time, and protect tomorrow."

MULTI-AGENT DOMAINS:
1. ORCHESTRATOR: General multi-step intent routing and synthesized life direction.
2. REFLECTION & WELLBEING AGENT: Analyze student's recorded data (daily reflections, weekly reviews, study sessions, missed tasks, past struggles). When asked "How did I do this week?", "What am I doing wrong repeatedly?", "What improved this month?", or "Why am I falling behind?", provide an evidence-grounded review strictly using the retrieved history and metrics. Never diagnose medical/psychiatric conditions.
3. STUDY COACH: 25/5 Pomodoro focus sessions, active recall ("teach this concept back to me"), spaced repetition, practice problems, misconception clearing.
4. PLACEMENT AGENT: Technical interview preparation (DSA, OS, DBMS, Networks, System Design), resume defense, skill-gap analysis, trade-offs.
5. RESEARCH AGENT: Fresh company and internship trend research (grounded in Google Search when appropriate).
6. MEMORY AGENT: Identify key candidate facts, values, habits, or routines worth remembering.
7. GOALS & TASKS AGENT: Propose structured milestone goals or daily deep-work tasks.

USER PROFILE:
- Name: ${userProfile?.displayName || 'Student'}
- Primary Goal: ${userProfile?.primaryGoal || 'Master technical problem solving and build consistent daily discipline'}
- Target Placements: ${userProfile?.targetPlacements?.join(', ') || 'Tier-1 Engineering Roles'}
- Study Philosophy: ${userProfile?.studyPhilosophy || 'Learn through logic and consistent practice'}
- Current Active Domain: ${activeDomain || 'orchestrator'}

${retrievedContextBlock ? `${retrievedContextBlock}\n` : ''}

RESPONSE FORMAT REQUIREMENT:
You must provide a well-structured coaching response based on the student's question and relevant retrieved background. If you identify a candidate long-term memory, actionable goal, or task to propose to the user, include it at the end enclosed in structured tags:
<PROPOSED_ACTIONS>
{
  "domain": "study | placement | wellbeing | goal | memory | orchestrator",
  "severity": "low | medium | high",
  "urgency": "low | medium | high",
  "candidateMemory": "Optional short memory to remember (e.g. 'Prefers studying DSA early morning')",
  "proposedTask": "Optional title for a suggested deep work task (e.g. 'Implement LRU Cache in C++')",
  "proposedGoal": "Optional title for a suggested milestone goal"
}
</PROPOSED_ACTIONS>

Keep your spoken/written coaching advice clear, actionable, and formatted in clean markdown.`;

    // Construct conversation history for Gemini
    const contents: any[] = [];
    
    // Add recent history (up to last 6 turns)
    const recentHistory = conversationHistory.slice(-6);
    for (const turn of recentHistory) {
      contents.push({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      });
    }

    // Add current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const isPlacementResearch =
      message.toLowerCase().includes('company') ||
      message.toLowerCase().includes('internship') ||
      message.toLowerCase().includes('hiring') ||
      message.toLowerCase().includes('opening') ||
      message.toLowerCase().includes('trend') ||
      activeDomain === 'research';

    const toolsConfig: any[] = [];
    if (isPlacementResearch) {
      toolsConfig.push({ googleSearch: {} });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        ...(toolsConfig.length > 0 ? { tools: toolsConfig } : {}),
      },
    });

    const fullText = response.text || '';

    // Extract structured action tag if present
    let cleanedText = fullText;
    let proposedActionData: any = null;

    const actionTagMatch = fullText.match(/<PROPOSED_ACTIONS>([\s\S]*?)<\/PROPOSED_ACTIONS>/);
    if (actionTagMatch) {
      try {
        proposedActionData = JSON.parse(actionTagMatch[1].trim());
        cleanedText = fullText.replace(/<PROPOSED_ACTIONS>[\s\S]*?<\/PROPOSED_ACTIONS>/, '').trim();
      } catch (e) {
        console.warn('Failed to parse proposed action JSON:', e);
      }
    }

    return NextResponse.json({
      text: cleanedText,
      proposedActions: proposedActionData,
      groundingMetadata: response.candidates?.[0]?.groundingMetadata || null,
      retrieval: {
        searchedCount: searchResult.executionStats.totalRecordsSearched,
        matchedCount: searchResult.results.length,
        durationMs: searchResult.executionStats.durationMs,
        matchedItems: searchResult.results.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          score: r.score,
          matchTypes: r.matchTypes,
        })),
      },
    });
  } catch (error: any) {
    console.error('Gemini Coach API Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate coaching response',
        fallback: true,
      },
      { status: 500 }
    );
  }
}
