import {
  getResumeMetadata as getFirebaseResumeMetadata,
  saveResumeMetadata as saveFirebaseResumeMetadata,
  getPlacementProfile as getFirebasePlacementProfile,
  savePlacementProfile as saveFirebasePlacementProfile,
} from '@/lib/firebase';
import { resumeStateManager } from '@/lib/resume';
import type { PlacementProfile, ResumeProfileData } from '@/lib/types';

export interface ResumeStatusResult {
  hasResume: boolean;
  status: 'READY' | 'RESUME_REQUIRED' | 'UPLOADING' | 'ANALYZING' | 'ERROR';
  resumeId?: string;
  fileName?: string;
  uploadedAt?: string;
  analysisStatus?: 'READY' | 'COMPLETED' | 'PENDING' | 'FAILED';
  message?: string;
}

export interface ResumeSummaryResult {
  hasResume: boolean;
  status: 'READY' | 'RESUME_REQUIRED' | 'ERROR';
  resumeId?: string;
  fileName?: string;
  uploadedAt?: string;
  analysisStatus?: 'READY' | 'COMPLETED' | 'PENDING' | 'FAILED';
  summary?: string;
  skills?: string[];
  projects?: Array<{ title: string; description: string; techStack: string[] }>;
  experience?: Array<{ role: string; organization: string; duration: string; highlights: string[] }>;
  education?: Array<{ degree: string; institution: string; year?: string; grade?: string }>;
  strengths?: string[];
  gaps?: string[];
  interviewQuestions?: Array<{ question: string; category: string; expectedPoints: string[] }>;
  message?: string;
}

function hashUserId(uid: string): string {
  if (!uid) return 'anonymous';
  if (uid.startsWith('test_')) return uid;
  if (uid.length <= 8) return uid;
  return `${uid.slice(0, 4)}...${uid.slice(-4)}`;
}

class ResumeService {
  private inMemoryProfileCache = new Map<string, ResumeProfileData>();
  private inMemoryMetadataCache = new Map<string, any>();

  syncResumeContext(userId: string, profile?: ResumeProfileData | null, metadata?: any): void {
    if (profile) {
      this.inMemoryProfileCache.set(userId, profile);
      resumeStateManager.setResume(profile);
    }
    if (metadata) {
      this.inMemoryMetadataCache.set(userId, metadata);
    }
  }

  clearResumeContext(userId: string): void {
    this.inMemoryProfileCache.delete(userId);
    this.inMemoryMetadataCache.delete(userId);
    resumeStateManager.setResume(null);
  }

  async getResumeStatus(
    userId: string,
    context?: { placementProfile?: any; resumeMetadata?: any }
  ): Promise<ResumeStatusResult> {
    const hashed = hashUserId(userId);
    console.log(`[ResumeTool] userId=${hashed} resume lookup started`);

    if (context?.placementProfile?.resumeProfile) {
      this.syncResumeContext(userId, context.placementProfile.resumeProfile, context.resumeMetadata);
    }

    let metadata = this.inMemoryMetadataCache.get(userId) || null;
    let profile: PlacementProfile | null = null;
    let resumeProfile: ResumeProfileData | null = this.inMemoryProfileCache.get(userId) || null;

    try {
      const fetchedMeta = await getFirebaseResumeMetadata(userId).catch(() => null);
      if (fetchedMeta) metadata = fetchedMeta;
    } catch {}

    try {
      const fetchedProfile = await getFirebasePlacementProfile(userId).catch(() => null);
      if (fetchedProfile) {
        profile = fetchedProfile;
        if (fetchedProfile.resumeProfile) {
          resumeProfile = fetchedProfile.resumeProfile;
        }
      }
    } catch {}

    if (!resumeProfile) {
      resumeProfile = context?.placementProfile?.resumeProfile || resumeStateManager.getResume();
    }
    if (!metadata && context?.resumeMetadata) {
      metadata = context.resumeMetadata;
    }

    const hasExtracted = (resumeProfile?.skills && resumeProfile.skills.length > 0) || !!resumeProfile?.summary;
    const documentFound = !!(resumeProfile || metadata) && hasExtracted;
    console.log(`[Resume Lookup] status=${documentFound ? 'FOUND' : 'NOT_FOUND'}`);

    if (!documentFound) {
      console.log(`[Resume Tool Result] status=FAILED reason=NO_RESUME`);
      return {
        hasResume: false,
        status: 'RESUME_REQUIRED',
        message: 'No resume is uploaded yet. Please upload your resume so I can analyze it.',
      };
    }

    const analysisStatus = metadata?.analysisStatus || (resumeProfile as any)?.analysisStatus || 'READY';
    console.log(`[Resume Analysis] status=${analysisStatus}`);
    console.log(`[Resume Tool Result] status=SUCCESS`);

    return {
      hasResume: true,
      status: 'READY',
      resumeId: metadata?.resumeId || resumeProfile?.resumeId || 'current_resume',
      fileName: metadata?.fileName || resumeProfile?.fileName || 'candidate_resume',
      uploadedAt: metadata?.uploadedAt || resumeProfile?.uploadedAt || new Date().toISOString(),
      analysisStatus: analysisStatus === 'COMPLETED' ? 'READY' : (analysisStatus as any),
    };
  }

  async getResumeMetadata(userId: string): Promise<any | null> {
    const cached = this.inMemoryMetadataCache.get(userId);
    if (cached) return cached;
    try {
      const meta = await getFirebaseResumeMetadata(userId);
      if (meta) {
        this.inMemoryMetadataCache.set(userId, meta);
        return meta;
      }
    } catch {}
    return null;
  }

  async getResumeSummary(
    userId: string,
    context?: { placementProfile?: any; resumeMetadata?: any }
  ): Promise<ResumeSummaryResult> {
    const hashed = hashUserId(userId);
    console.log(`[Tool] tool=get_resume_summary agent=LifeForge Live Coach userIdHash=${hashed}`);

    if (context?.placementProfile?.resumeProfile) {
      this.syncResumeContext(userId, context.placementProfile.resumeProfile, context.resumeMetadata);
    }

    let metadata = this.inMemoryMetadataCache.get(userId) || null;
    let resumeProfile: ResumeProfileData | null = this.inMemoryProfileCache.get(userId) || null;

    try {
      const fetchedMeta = await getFirebaseResumeMetadata(userId).catch(() => null);
      if (fetchedMeta) metadata = fetchedMeta;
    } catch {}

    try {
      const profile = await getFirebasePlacementProfile(userId).catch(() => null);
      if (profile?.resumeProfile) {
        resumeProfile = profile.resumeProfile;
      }
    } catch {}

    if (!resumeProfile) {
      resumeProfile = context?.placementProfile?.resumeProfile || resumeStateManager.getResume();
    }
    if (!metadata && context?.resumeMetadata) {
      metadata = context.resumeMetadata;
    }

    const hasExtracted = (resumeProfile?.skills && resumeProfile.skills.length > 0) || !!resumeProfile?.summary;
    const documentFound = !!(resumeProfile || metadata) && hasExtracted;
    console.log(`[Resume Lookup] status=${documentFound ? 'FOUND' : 'NOT_FOUND'}`);

    if (!documentFound) {
      console.log(`[Resume Tool Result] status=FAILED`);
      return {
        hasResume: false,
        status: 'RESUME_REQUIRED',
        message: 'No resume is uploaded yet or analysis is still pending.',
      };
    }

    console.log(`[Resume Analysis] status=READY`);
    console.log(`[Resume Tool Result] status=SUCCESS`);

    const resumeId = metadata?.resumeId || resumeProfile?.resumeId || 'current_resume';
    const fileName = metadata?.fileName || resumeProfile?.fileName || 'resume.pdf';
    const uploadedAt = metadata?.uploadedAt || resumeProfile?.uploadedAt || new Date().toISOString();

    return {
      hasResume: true,
      status: 'READY',
      resumeId,
      fileName,
      uploadedAt,
      analysisStatus: 'READY',
      summary: resumeProfile?.summary || '',
      skills: resumeProfile?.skills || [],
      projects: resumeProfile?.projects || [],
      experience: resumeProfile?.experience || [],
      education: resumeProfile?.education || [],
      strengths: resumeProfile?.strengths || [],
      gaps: resumeProfile?.gaps || [],
      interviewQuestions: resumeProfile?.interviewQuestions || [],
    };
  }

  async saveResumeMetadata(userId: string, metadata: any): Promise<void> {
    await saveFirebaseResumeMetadata(userId, metadata);
    this.inMemoryMetadataCache.set(userId, metadata);

    const verified = await getFirebaseResumeMetadata(userId).catch(() => null);
    if (!verified && !userId.startsWith('test_')) {
      this.inMemoryMetadataCache.set(userId, metadata);
    }
  }

  async saveResumeAnalysis(userId: string, resumeProfile: ResumeProfileData): Promise<void> {
    this.inMemoryProfileCache.set(userId, resumeProfile);
    resumeStateManager.setResume(resumeProfile);

    await saveFirebasePlacementProfile(userId, {
      resumeProfile,
      resumeStatus: 'interview_ready',
    });
  }
}

export interface CanonicalExtractedResume {
  summary: string | null;
  education: Array<{ degree: string; institution: string; year?: string; grade?: string }>;
  experience: Array<{ role: string; organization: string; duration: string; highlights: string[] }>;
  projects: Array<{ title: string; description: string; techStack: string[] }>;
  achievements: string[];
  skills: string[];
  certifications: string[];
  technologies: string[];
  research: string[];
  publications: string[];
  links: string[];
  strengths: string[];
  gaps: string[];
  interviewQuestions: Array<{ question: string; category: string; expectedPoints: string[] }>;
}

export interface CanonicalResumeResult {
  exists: boolean;
  status: 'READY' | 'RESUME_NOT_FOUND' | 'ERROR';
  resumeId: string | null;
  fileName: string | null;
  uploadedAt: string | null;
  analysisStatus: 'READY' | 'COMPLETED' | 'PENDING' | 'FAILED' | null;
  extracted: CanonicalExtractedResume | null;
  message?: string;
}

export async function getCanonicalResume(
  userId: string,
  context?: { placementProfile?: any; resumeMetadata?: any }
): Promise<CanonicalResumeResult> {
  const hashed = hashUserId(userId);
  const storagePath = `users/${userId}/placement/resumes/[resumeId]`;
  const metadataFirestorePath = `users/${userId}/resume_metadata/current`;
  const placementProfileFirestorePath = `users/${userId}/placement_profile/default`;
  const resumeAnalysisFirestorePath = `users/${userId}/placement_profile/default.resumeProfile`;

  console.log(`[CanonicalResume] lookup paths:
  1. Firebase Storage path: ${storagePath}
  2. Resume metadata Firestore path: ${metadataFirestorePath}
  3. Resume analysis Firestore path: ${resumeAnalysisFirestorePath}
  4. Placement profile path: ${placementProfileFirestorePath}
  5. Exact authenticated Firebase UID: ${userId} (hash: ${hashed})`);

  let metadata: any = null;
  let profile: PlacementProfile | null = null;
  let resumeProfile: ResumeProfileData | null = null;

  if (context?.placementProfile?.resumeProfile) {
    resumeService.syncResumeContext(userId, context.placementProfile.resumeProfile, context.resumeMetadata);
  }

  try {
    metadata = await getFirebaseResumeMetadata(userId).catch(() => null);
  } catch {}

  try {
    profile = await getFirebasePlacementProfile(userId).catch(() => null);
    if (profile?.resumeProfile) {
      resumeProfile = profile.resumeProfile;
    }
  } catch {}

  if (!resumeProfile) {
    const cached = (resumeService as any).inMemoryProfileCache.get(userId);
    resumeProfile = cached || context?.placementProfile?.resumeProfile || resumeStateManager.getResume();
  }
  if (!metadata) {
    const cachedMeta = (resumeService as any).inMemoryMetadataCache.get(userId);
    metadata = cachedMeta || context?.resumeMetadata || null;
  }

  const hasExtractedContent = (resumeProfile?.skills && resumeProfile.skills.length > 0) || !!resumeProfile?.summary;
  if (!hasExtractedContent || (!metadata?.resumeId && !resumeProfile?.resumeId)) {
    console.log(`[CanonicalResume] status=RESUME_NOT_FOUND userId=${hashed}`);
    return {
      exists: false,
      status: 'RESUME_NOT_FOUND',
      resumeId: metadata?.resumeId || resumeProfile?.resumeId || null,
      fileName: metadata?.fileName || resumeProfile?.fileName || null,
      uploadedAt: metadata?.uploadedAt || resumeProfile?.uploadedAt || null,
      analysisStatus: (metadata?.analysisStatus === 'FAILED' || (resumeProfile as any)?.analysisStatus === 'FAILED') ? 'FAILED' : null,
      extracted: null,
      message: 'No resume is uploaded yet or analysis is still pending.',
    };
  }

  const resumeId = metadata?.resumeId || resumeProfile?.resumeId;
  const fileName = metadata?.fileName || resumeProfile?.fileName || 'uploaded_resume';
  const uploadedAt = metadata?.uploadedAt || resumeProfile?.uploadedAt || new Date().toISOString();
  const analysisStatus = metadata?.analysisStatus || (resumeProfile as any)?.analysisStatus || 'READY';

  const extracted: CanonicalExtractedResume = {
    summary: resumeProfile?.summary || null,
    education: Array.isArray(resumeProfile?.education) ? resumeProfile.education : [],
    experience: Array.isArray(resumeProfile?.experience) ? resumeProfile.experience : [],
    projects: Array.isArray(resumeProfile?.projects) ? resumeProfile.projects : [],
    achievements: Array.isArray((resumeProfile as any)?.achievements) ? (resumeProfile as any).achievements : [],
    skills: Array.isArray(resumeProfile?.skills) ? resumeProfile.skills : [],
    certifications: Array.isArray((resumeProfile as any)?.certifications) ? (resumeProfile as any).certifications : [],
    technologies: Array.isArray((resumeProfile as any)?.technologies)
      ? (resumeProfile as any).technologies
      : Array.isArray(resumeProfile?.skills)
      ? resumeProfile.skills
      : [],
    research: Array.isArray((resumeProfile as any)?.research) ? (resumeProfile as any).research : [],
    publications: Array.isArray((resumeProfile as any)?.publications) ? (resumeProfile as any).publications : [],
    links: Array.isArray((resumeProfile as any)?.links) ? (resumeProfile as any).links : [],
    strengths: Array.isArray(resumeProfile?.strengths) ? resumeProfile.strengths : [],
    gaps: Array.isArray(resumeProfile?.gaps) ? resumeProfile.gaps : [],
    interviewQuestions: Array.isArray(resumeProfile?.interviewQuestions) ? resumeProfile.interviewQuestions : [],
  };

  console.log(`[CanonicalResume] status=FOUND userId=${hashed} resumeId=${resumeId}`);
  return {
    exists: true,
    status: 'READY',
    resumeId,
    fileName,
    uploadedAt,
    analysisStatus: analysisStatus === 'COMPLETED' ? 'READY' : analysisStatus,
    extracted,
  };
}

export const resumeService = new ResumeService();
