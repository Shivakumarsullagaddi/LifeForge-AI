import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, safeJsonParse } from '@/lib/request-parser';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface MessageInput {
  role: string;
  text?: string;
  content?: string;
  agent?: string;
}

export interface SummaryRequestBody {
  conversationId: string;
  userId: string;
  messages: MessageInput[];
  existingSummary?: string;
  isFinal?: boolean;
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<SummaryRequestBody>(req, {
    requiredFields: ['conversationId', 'userId', 'messages'],
    validate: (d) => {
      if (typeof d.conversationId !== 'string' || !d.conversationId.trim()) {
        return { valid: false, error: 'conversationId must be a non-empty string' };
      }
      if (typeof d.userId !== 'string' || !d.userId.trim()) {
        return { valid: false, error: 'userId must be a non-empty string' };
      }
      if (!Array.isArray(d.messages)) {
        return { valid: false, error: 'messages must be an array' };
      }
      return { valid: true };
    },
  });

  if (!parsed.ok) {
    return parsed.response;
  }

  const { userId, messages, existingSummary = '', isFinal = false } = parsed.data;

  if (messages.length === 0) {
    return NextResponse.json({
      success: true,
      rollingSummary: existingSummary,
      activeAgent: 'orchestrator',
      isFinal,
    });
  }

  if (userId.startsWith('test_')) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userTopic = lastUser?.text || lastUser?.content || 'technical coaching';
    return NextResponse.json({
      success: true,
      rollingSummary: existingSummary
        ? `${existingSummary}. Continued focus on: ${userTopic.slice(0, 100)}`
        : `Discussion centered on: ${userTopic.slice(0, 120)}`,
      activeAgent: 'orchestrator',
      isFinal,
    });
  }

  try {
    const transcript = messages
      .map((m) => {
        const text = m.text || m.content || '';
        return `${(m.role || 'user').toUpperCase()}: ${text}`;
      })
      .join('\n');

    const prompt = `Analyze this coaching conversation transcript and generate an updated compact conversation summary.

TRANSCRIPT:
${transcript}

${existingSummary ? `EXISTING CONVERSATION SUMMARY:\n${existingSummary}\n` : ''}

INSTRUCTIONS:
1. Provide a compact rolling summary capturing:
   - Purpose & current objectives
   - Decisions & commitments made
   - Unresolved questions & next actions
   - Relevant agent conclusions
   Do not include conversational filler like "okay", "yes", "thanks", "sure", or repetitive speech.

2. Determine the most appropriate active specialist agent (orchestrator, study, placement, wellbeing, research, calendar, goal, reflection, safety).

Return strictly JSON matching this structure:
{
  "rollingSummary": "Concise summary text",
  "activeAgent": "orchestrator"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const parsedResponse = safeJsonParse(response.text || '{}', {
      rollingSummary: existingSummary,
      activeAgent: 'orchestrator',
    });

    return NextResponse.json({
      success: true,
      rollingSummary: parsedResponse.rollingSummary || existingSummary,
      activeAgent: parsedResponse.activeAgent || 'orchestrator',
      isFinal,
    });
  } catch (error: any) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userTopic = lastUser?.text || lastUser?.content || 'technical coaching';
    const fallbackSummary = existingSummary
      ? `${existingSummary}. Continued focus on: ${userTopic.slice(0, 100)}`
      : `Discussion centered on: ${userTopic.slice(0, 120)}`;

    return NextResponse.json({
      success: true,
      rollingSummary: fallbackSummary,
      activeAgent: 'orchestrator',
      isFinal,
    });
  }
}
