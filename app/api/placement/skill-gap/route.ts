import { GoogleGenAI, Type, Schema } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { executeHybridRetrieval } from '@/lib/retrieval/hybridEngine';
import { adaptUserRecords } from '@/lib/retrieval/recordAdapter';
import { RetrievalRecord } from '@/lib/retrieval/types';
import type { PlacementProfile, SkillGapAnalysisResult } from '@/lib/types';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

import { parseJsonBody, safeJsonParse } from '@/lib/request-parser';

export async function POST(req: NextRequest) {
  const parsedReq = await parseJsonBody<any>(req, {
    requiredFields: ['placementProfile'],
  });

  if (!parsedReq.ok) {
    return parsedReq.response;
  }

  try {
    const body = parsedReq.data;
    const {
      userId = 'current_user',
      placementProfile,
      userData,
    }: {
      userId: string;
      placementProfile: PlacementProfile;
      userData?: {
        journals?: any[];
        memories?: any[];
        goals?: any[];
        tasks?: any[];
        reflections?: any[];
        studySessions?: any[];
      };
    } = body;

    if (!placementProfile) {
      return NextResponse.json({ error: 'Placement profile is required' }, { status: 400 });
    }

    // 1. Run Hybrid Retrieval over student's historical struggles & interview notes
    let retrievalRecords: RetrievalRecord[] = [];
    if (userData) {
      retrievalRecords = adaptUserRecords(userId, userData);
    }

    const query = `interview placement preparation DSA system design DBMS OS ${placementProfile.targetRole} ${placementProfile.targetCompanies.join(' ')}`;
    const searchResult = await executeHybridRetrieval(query, retrievalRecords, {
      topK: 6,
      minScore: 0.20,
    });

    const retrievedContextBlock = searchResult.formattedContextBlock;

    // 2. Format profile and session data
    const skillsSummary = (placementProfile.skills || [])
      .map((s) => `- ${s.name} (${s.category}): Level=${s.level}, Completed=${s.completed ? 'YES' : 'NO'}, VerifiedByPractice=${s.verifiedByPractice ? 'YES' : 'NO'}${s.notes ? ` (Notes: ${s.notes})` : ''}`)
      .join('\n');

    const projectsSummary = (placementProfile.projects || [])
      .map((p) => `- Project: "${p.title}" | Stack: ${p.techStack.join(', ')} | Description: ${p.description} | Defense: ${p.interviewDefensePoints.join('; ')}`)
      .join('\n');

    const interviewsSummary = (placementProfile.upcomingInterviews || [])
      .map((i) => `- ${i.company} (${i.role}) on ${i.date} [Stage: ${i.stage} | Focus: ${i.focusAreas.join(', ')}]`)
      .join('\n');

    const systemInstruction = `You are LifeForge AI's Lead Placement & Technical Interview Architect.
Your task is to perform an authentic, rigorous, evidence-based Skill-Gap Analysis for an ambitious college student preparing for top engineering placements.

CRITICAL INSTRUCTIONS:
- DO NOT INVENT OR HALLUCINATE SKILL LEVELS. Ground every strength and weakness in the user's recorded skills, study history, completed tasks, and retrieved journal/reflection records.
- If a skill is marked 'Fundamentals' or uncompleted, treat it as a potential gap for Tier-1 companies (like Google, Amazon, Microsoft, Stripe).
- Contrast the student's current competencies with what is strictly required for their target role: "${placementProfile.targetRole}" and target companies: "${placementProfile.targetCompanies.join(', ')}".
- Emphasize logic, deep work, active recall, and trade-off defense.
- Return structured output adhering strictly to the JSON schema.`;

    const prompt = `Perform a comprehensive skill-gap analysis for the following student:

TARGET ROLE: ${placementProfile.targetRole}
TARGET COMPANIES: ${placementProfile.targetCompanies.join(', ')}
EXPERIENCE SUMMARY: ${placementProfile.experience || 'Undergraduate Computer Science Student'}
RESUME STATUS: ${placementProfile.resumeStatus}
DECLARED WEAK AREAS: ${(placementProfile.weakAreas || []).join(', ') || 'None specified'}

SELF-REPORTED & RECORDED TECHNICAL SKILLS:
${skillsSummary || 'No skills listed'}

PROJECT PORTFOLIO & INTERVIEW DEFENSE:
${projectsSummary || 'No projects listed'}

UPCOMING INTERVIEWS:
${interviewsSummary || 'No upcoming interviews scheduled'}

${retrievedContextBlock}

Produce a personalized skill gap analysis report with concrete sprint recommendations and actionable goal/task proposals.`;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        targetRole: { type: Type.STRING },
        strengths: {
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
        criticalGaps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              impact: { type: Type.STRING },
            },
            required: ['title', 'category', 'impact'],
          },
        },
        missingRequiredSkills: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['name', 'reason'],
          },
        },
        urgency: {
          type: Type.STRING,
          enum: ['low', 'medium', 'high'],
        },
        sprintPlan: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              phase: { type: Type.STRING },
              focus: { type: Type.STRING },
              recommendedHours: { type: Type.NUMBER },
              actionableTasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['phase', 'focus', 'recommendedHours', 'actionableTasks'],
          },
        },
        proposedGoals: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              domain: { type: Type.STRING, enum: ['placement', 'study'] },
              priority: { type: Type.STRING, enum: ['low', 'medium', 'high', 'urgent'] },
            },
            required: ['title', 'domain', 'priority'],
          },
        },
        proposedTasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              domain: { type: Type.STRING, enum: ['placement', 'study'] },
              priority: { type: Type.STRING, enum: ['low', 'medium', 'high', 'urgent'] },
              estimatedMinutes: { type: Type.NUMBER },
              isDeepWork: { type: Type.BOOLEAN },
            },
            required: ['title', 'domain', 'priority', 'estimatedMinutes', 'isDeepWork'],
          },
        },
      },
      required: [
        'targetRole',
        'strengths',
        'criticalGaps',
        'missingRequiredSkills',
        'urgency',
        'sprintPlan',
        'proposedGoals',
        'proposedTasks',
      ],
    };

    let response;
    let attempts = 0;
    while (attempts < 3) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.3,
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
      throw new Error('Empty response received from Gemini');
    }

    const parsed: SkillGapAnalysisResult = safeJsonParse(resultText, {} as SkillGapAnalysisResult);
    parsed.analyzedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      analysis: parsed,
      retrievalContext: {
        searchedRecords: searchResult.executionStats.totalRecordsSearched,
        matchedRecords: searchResult.results.length,
        durationMs: searchResult.executionStats.durationMs,
        matchedItems: searchResult.results.map((r) => ({
          type: r.type,
          title: r.title,
          score: r.score,
        })),
      },
    });
  } catch (error: any) {
    console.error('Skill-Gap API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate skill-gap analysis' },
      { status: 500 }
    );
  }
}
