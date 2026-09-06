export type ResumeProcessingState =
  | 'NOT_UPLOADED'
  | 'UPLOADING'
  | 'ANALYZING'
  | 'READY'
  | 'ERROR';

import type { ResumeProfileData } from '@/lib/types';
export type { ResumeProfileData };

export class ResumeStateManager {
  private state: ResumeProcessingState = 'NOT_UPLOADED';
  private error: string | null = null;
  private currentResume: ResumeProfileData | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const local = window.localStorage.getItem('lifeforge_resume_state');
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed.state) this.state = parsed.state;
          if (parsed.resume) this.currentResume = parsed.resume;
        }
      } catch {}
    }
  }

  getState(): ResumeProcessingState {
    return this.state;
  }

  getError(): string | null {
    return this.error;
  }

  getResume(): ResumeProfileData | null {
    return this.currentResume;
  }

  setState(newState: ResumeProcessingState, error?: string | null): void {
    this.state = newState;
    this.error = error || null;
    this.persist();
    this.notify();
  }

  setResume(resume: ResumeProfileData | null): void {
    this.currentResume = resume;
    if (resume?.summary || (resume?.skills && resume.skills.length > 0)) {
      this.state = 'READY';
      this.error = null;
    } else if (!resume) {
      this.state = 'NOT_UPLOADED';
      this.error = null;
    }
    this.persist();
    this.notify();
  }

  reset(): void {
    this.state = 'NOT_UPLOADED';
    this.error = null;
    this.currentResume = null;
    this.persist();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('ResumeStateManager listener error:', e);
      }
    });
  }

  private persist(): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          'lifeforge_resume_state',
          JSON.stringify({ state: this.state, resume: this.currentResume })
        );
      } catch {}
    }
  }
}

const globalForResume = globalThis as unknown as {
  __lifeforge_resume_manager?: ResumeStateManager;
};

export const resumeStateManager =
  globalForResume.__lifeforge_resume_manager || new ResumeStateManager();

if (!globalForResume.__lifeforge_resume_manager) {
  globalForResume.__lifeforge_resume_manager = resumeStateManager;
}
