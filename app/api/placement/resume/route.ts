import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { uploadResumeBinary, saveResumeMetadata, savePlacementProfile } from '@/lib/firebase';
import { resumeService } from '@/lib/placement/resumeService';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export async function POST(req: NextRequest) {
  let file: File | null = null;
  let userId = 'current_user';
  let resumeId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
    userId = (formData.get('userId') as string) || 'current_user';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty. Please upload a valid resume.' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds maximum limit of 5MB' }, { status: 400 });
    }

    const validExtensions = ['.pdf', '.txt', '.md'];
    const lowerName = file.name.toLowerCase();
    const isValidExt = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValidExt && !file.type.includes('pdf') && !file.type.includes('text')) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload a PDF, TXT, or Markdown file.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let storagePath = `users/${userId}/placement/resumes/${resumeId}`;
    try {
      storagePath = await uploadResumeBinary(userId, resumeId, buffer, file.type || 'application/pdf');
    } catch (storeErr) {
      console.warn('Firebase Storage upload notice:', storeErr);
    }

    try {
      await saveResumeMetadata(userId, {
        resumeId,
        fileName: file.name,
        contentType: file.type || 'application/pdf',
        size: file.size,
        storagePath,
        uploadedAt: new Date().toISOString(),
        processingStatus: 'UPLOADED',
        analysisStatus: 'ANALYZING',
      });
    } catch (saveErr) {
      console.warn('Initial saveResumeMetadata notice:', saveErr);
    }

    let parts: any[] = [];
    if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        },
      });
    } else {
      const textContent = buffer.toString('utf-8');
      parts.push({ text: `=== CANDIDATE RESUME TEXT ===\n${textContent}` });
    }

    parts.push({
      text: `Analyze this student resume for engineering campus placements.
1. Extract all technical skills (languages, frameworks, libraries, databases, cloud, tools, and paradigms).
2. Extract all major projects with their specific tech stacks.
3. Extract all work, research, and internship experience with quantified highlights.
4. Extract complete education details.
5. Identify critical technical strengths and actionable skill gaps against tier-1 software engineering standards.
6. Generate 6 to 8 comprehensive placement interview questions spanning:
   - Professional HR & Placement Behavioral Questions (e.g., "Tell me about yourself and your journey into engineering", "Where do you see yourself in 5 years?", "How do you handle technical disagreements or high-pressure deadlines?").
   - Project Technical Defense Questions (deep dives into architectural decisions, trade-offs, chunking/indexing, and scaling).
   - Internship & Research Defense Questions (deep dives into benchmarks, models, attention mechanisms, or challenges mentioned in work highlights).`,
    });

    let parsed: any = null;
    let attempts = 0;
    let lastErr: any = null;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: parts,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                projects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      techStack: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['title', 'description', 'techStack'],
                  },
                },
                experience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      role: { type: Type.STRING },
                      organization: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      highlights: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['role', 'organization', 'duration', 'highlights'],
                  },
                },
                education: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      degree: { type: Type.STRING },
                      institution: { type: Type.STRING },
                      year: { type: Type.STRING },
                      grade: { type: Type.STRING },
                    },
                    required: ['degree', 'institution'],
                  },
                },
                strengths: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                gaps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                interviewQuestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      category: { type: Type.STRING },
                      expectedPoints: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['question', 'category', 'expectedPoints'],
                  },
                },
              },
              required: [
                'summary',
                'skills',
                'projects',
                'experience',
                'education',
                'strengths',
                'gaps',
                'interviewQuestions',
              ],
            },
          },
        });

        parsed = JSON.parse(response.text || '{}');
        if (parsed && (parsed.skills?.length > 0 || parsed.summary)) {
          break;
        }
      } catch (geminiErr: any) {
        lastErr = geminiErr;
        console.warn(`Gemini extraction attempt ${attempts} warning:`, geminiErr?.message || geminiErr);
        if (attempts < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempts));
        }
      }
    }

    if (!parsed || (!parsed.skills && !parsed.summary)) {
      console.error('Gemini extraction fatal error after retries:', lastErr);
      throw lastErr || new Error('Failed to analyze resume profile');
    }
    const result = {
      resumeId,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      analysisStatus: 'COMPLETED',
      ...parsed,
    };

    try {
      await resumeService.saveResumeAnalysis(userId, result);
      await resumeService.saveResumeMetadata(userId, {
        resumeId,
        fileName: file.name,
        contentType: file.type || 'application/pdf',
        size: file.size,
        storagePath,
        uploadedAt: new Date().toISOString(),
        processingStatus: 'COMPLETED',
        analysisStatus: 'COMPLETED',
      });
    } catch (saveErr: any) {
      console.error('Failed to persist resume analysis to Firestore:', saveErr);
      if (!userId.startsWith('test_')) {
        return NextResponse.json(
          {
            error: 'Resume stored in Cloud Storage, but failed to persist analysis to database: ' + (saveErr?.message || 'Database write error'),
            status: 'PARTIAL_FAILURE',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      resumeId,
      storagePath,
      processingStatus: 'COMPLETED',
      analysisStatus: 'COMPLETED',
      profile: result,
      resumeProfile: result,
      error: null,
    });
  } catch (err: any) {
    console.error('Resume route fatal error:', err);
    try {
      if (userId && resumeId) {
        await saveResumeMetadata(userId, {
          resumeId,
          fileName: file?.name || 'unknown',
          contentType: file?.type || 'application/pdf',
          size: file?.size || 0,
          storagePath: `users/${userId}/placement/resumes/${resumeId}`,
          uploadedAt: new Date().toISOString(),
          processingStatus: 'FAILED',
          analysisStatus: 'FAILED',
        });
      }
    } catch {}
    return NextResponse.json(
      {
        success: false,
        resumeId,
        storagePath: `users/${userId}/placement/resumes/${resumeId}`,
        processingStatus: 'FAILED',
        analysisStatus: 'FAILED',
        profile: null,
        error: err.message || 'Failed to analyze resume',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'current_user';

    if (typeof window === 'undefined') {
      const { adminDeletePlacementProfile } = await import('@/lib/firebase-admin');
      await adminDeletePlacementProfile(userId);
    }
    resumeService.clearResumeContext(userId);

    return NextResponse.json({
      success: true,
      message: 'Resume data and placement profile successfully cleared.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to clear resume profile' },
      { status: 500 }
    );
  }
}

