import {
  JournalEntry,
  MemoryItem,
  GoalItem,
  TaskItem,
  ReflectionEntry,
  ConversationSession,
  StudySessionRecord,
} from '../types';
import { RetrievalRecord } from './types';

/**
 * Normalizes all Firestore entities into the standard RetrievalRecord format.
 * Strictly verifies userId to prevent any cross-user leakage.
 */
export function adaptUserRecords(
  userId: string,
  data: {
    journals?: JournalEntry[];
    memories?: MemoryItem[];
    goals?: GoalItem[];
    tasks?: TaskItem[];
    reflections?: ReflectionEntry[];
    conversations?: ConversationSession[];
    studySessions?: StudySessionRecord[];
  }
): RetrievalRecord[] {
  const records: RetrievalRecord[] = [];

  // 1. Journals
  if (data.journals) {
    for (const j of data.journals) {
      if (j.userId !== userId) continue; // Isolation guard
      records.push({
        id: j.id,
        userId: j.userId,
        type: 'journal',
        title: j.title || 'Untitled Journal',
        content: `${j.content || ''}${j.actionTakeaway ? ` | Takeaway: ${j.actionTakeaway}` : ''}`,
        date: j.createdAt,
        category: j.category,
        tags: j.tags || [],
        metadata: {
          mood: j.mood,
          clarityLevel: j.clarityLevel,
          energyLevel: j.energyLevel,
          actionTakeaway: j.actionTakeaway,
        },
      });
    }
  }

  // 2. Memories
  if (data.memories) {
    for (const m of data.memories) {
      if (m.userId !== userId) continue; // Isolation guard
      records.push({
        id: m.id,
        userId: m.userId,
        type: 'memory',
        title: `Memory: ${m.type.replace('_', ' ')}`,
        content: m.content,
        date: m.createdAt,
        category: m.category || m.type,
        confidence: m.confidence,
        status: m.status,
        metadata: {
          memoryType: m.type,
          source: m.source,
          status: m.status,
          confidence: m.confidence,
        },
      });
    }
  }

  // 3. Goals
  if (data.goals) {
    for (const g of data.goals) {
      if (g.userId !== userId) continue; // Isolation guard
      records.push({
        id: g.id,
        userId: g.userId,
        type: 'goal',
        title: `Goal: ${g.title}`,
        content: `${g.description || ''} | Domain: ${g.domain} | Progress: ${g.progress}% | Status: ${g.status}`,
        date: g.createdAt,
        domain: g.domain,
        priority: g.priority,
        status: g.status,
        metadata: {
          domain: g.domain,
          progress: g.progress,
          targetDate: g.targetDate,
        },
      });
    }
  }

  // 4. Tasks
  if (data.tasks) {
    for (const t of data.tasks) {
      if (t.userId !== userId) continue; // Isolation guard
      records.push({
        id: t.id,
        userId: t.userId,
        type: 'task',
        title: `Task: ${t.title}`,
        content: `${t.description || ''} | Domain: ${t.domain} | Priority: ${t.priority} | Status: ${t.status}${t.isDeepWork ? ' | Deep Work' : ''}`,
        date: t.dueDate || t.createdAt,
        domain: t.domain,
        priority: t.priority,
        status: t.status,
        metadata: {
          domain: t.domain,
          isDeepWork: t.isDeepWork,
          estimatedMinutes: t.estimatedMinutes,
        },
      });
    }
  }

  // 5. Reflections
  if (data.reflections) {
    for (const r of data.reflections) {
      if (r.userId !== userId) continue; // Isolation guard
      const parts: string[] = [];
      if (r.whatHappened) parts.push(`Happened: ${r.whatHappened}`);
      if (r.whatWorked) parts.push(`Worked: ${r.whatWorked}`);
      if (r.keyWins && r.keyWins.length > 0) parts.push(`Wins: ${r.keyWins.join(', ')}`);
      if (r.whatFailed) parts.push(`Failed/Struggled: ${r.whatFailed}`);
      if (r.challengesFaced && r.challengesFaced.length > 0) parts.push(`Challenges: ${r.challengesFaced.join(', ')}`);
      if (r.whatLearned || r.lessonsLearned) parts.push(`Learned: ${r.whatLearned || r.lessonsLearned}`);
      if (r.nextImprovement) parts.push(`Next Improvement: ${r.nextImprovement}`);
      if (r.nextCommitments && r.nextCommitments.length > 0) parts.push(`Commitments: ${r.nextCommitments.join(', ')}`);

      records.push({
        id: r.id,
        userId: r.userId,
        type: 'reflection',
        title: `${r.type.toUpperCase()} Reflection - ${r.date || r.createdAt.slice(0, 10)}`,
        content: parts.join(' | ') || 'Daily reflection review',
        date: r.date || r.createdAt,
        metadata: {
          reflectionType: r.type,
          disciplineScore: r.disciplineScore,
          focusScore: r.focusScore,
        },
      });
    }
  }

  // 6. Study Sessions
  if (data.studySessions) {
    for (const s of data.studySessions) {
      if (s.userId !== userId) continue;
      records.push({
        id: s.id,
        userId: s.userId,
        type: 'study_session',
        title: `Study Session: ${s.topic}`,
        content: `Technique: ${s.technique} | Duration: ${s.durationMinutes}m | Cycles: ${s.completedCycles} | Notes: ${s.notes || 'None'}${s.misconceptionsCleared ? ` | Misconceptions Cleared: ${s.misconceptionsCleared.join(', ')}` : ''}`,
        date: s.createdAt,
        domain: 'study',
        metadata: {
          technique: s.technique,
          durationMinutes: s.durationMinutes,
        },
      });
    }
  }

  // 7. Conversation Summaries
  if (data.conversations) {
    for (const c of data.conversations) {
      if (c.userId !== userId) continue;
      if (c.summary) {
        records.push({
          id: c.id,
          userId: c.userId,
          type: 'conversation',
          title: `Conversation: ${c.title}`,
          content: c.summary,
          date: c.createdAt,
          domain: c.agentDomain,
          metadata: {
            agentDomain: c.agentDomain,
          },
        });
      }
    }
  }

  return records;
}
