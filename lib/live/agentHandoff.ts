import { GoogleGenAI } from '@google/genai';
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

export interface AgentTaskRequest {
  userId: string;
  domain: 'study' | 'placement' | 'wellbeing' | 'reflection' | 'research' | 'calendar' | 'goals' | 'orchestrator';
  query: string;
  userData?: {
    journals?: any[];
    memories?: any[];
    goals?: any[];
    tasks?: any[];
    reflections?: any[];
    studySessions?: any[];
    placementProfile?: any;
  };
}

export interface AgentTaskResponse {
  spokenSummary: string;
  structuredDetails?: Record<string, any>;
  domain: string;
  citations?: Array<{ title?: string; uri?: string }>;
  groundingSources?: string[];
}

export async function executeAgentTask(request: AgentTaskRequest): Promise<AgentTaskResponse> {
  const { userId, domain, query, userData } = request;

  try {
    // 1. Prepare Retrieval Context from user records
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

    // 2. Determine System Instruction based on domain
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

    if (domain === 'placement') {
      systemInstruction += `\nSPECIALIZATION: Placement & Interview Preparation. Analyze skill gaps, explain DSA trade-offs, system design principles, or technical interview strategies.`;
    } else if (domain === 'study') {
      systemInstruction += `\nSPECIALIZATION: Study Coach & Active Recall. Suggest 25/5 Pomodoro cycles, teach-back technique, active retrieval, and clearing conceptual misconceptions.`;
    } else if (domain === 'reflection') {
      systemInstruction += `\nSPECIALIZATION: Evidence-Grounded Reflection. Review recorded habits, study hours, and task completions honestly without false assumptions.`;
    } else if (domain === 'wellbeing') {
      systemInstruction += `\nSPECIALIZATION: Wellbeing & Controllable Action. Validate emotional concerns calmly, identify what is within the user's control, and suggest a simple grounding step.`;
    } else if (domain === 'research') {
      systemInstruction += `\nSPECIALIZATION: Current Tech & Company Research. Provide accurate, fresh industry trends.`;
    }

    const prompt = `Student Query: "${query}"

${retrievalContextBlock ? `=== RETRIEVED PRIVATE USER CONTEXT ===\n${retrievalContextBlock}\n` : ''}

Synthesize a precise, high-clarity solution for the student.`;

    // 3. Call Gemini 3.8 Flash
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
    
    // Extract first 1-2 sentences as spoken summary
    const cleanSentences = fullText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('#') && !s.startsWith('-') && !s.startsWith('*'));
    
    const spokenSummary = cleanSentences.slice(0, 2).join(' ') || fullText.slice(0, 200);

    // Extract citations if grounded in Google Search
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
      domain,
      structuredDetails: {
        fullText,
        retrievedRecords: topRecords,
        domain,
      },
      citations: citations.length > 0 ? citations : undefined,
    };
  } catch (err: any) {
    console.error('Error executing Gemini 3.8 Flash agent task:', err);
    return {
      spokenSummary: `I analyzed your question regarding ${domain}. Let's focus on the first actionable step: break down the problem and tackle one piece for 15 minutes.`,
      domain,
      structuredDetails: {
        error: err.message || 'Agent task execution failed',
      },
    };
  }
}
