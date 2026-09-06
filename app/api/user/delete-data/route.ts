import { NextRequest, NextResponse } from 'next/server';
import { testStore } from '@/lib/test-store';
import { resumeService } from '@/lib/placement/resumeService';
import { resumeStateManager } from '@/lib/resume';

export async function POST(req: NextRequest) {
  try {
    const { userId, type } = await req.json();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });
    }

    if (userId.startsWith('test_')) {
      switch (type) {
        case 'goals-tasks':
          testStore.clearGoalsAndTasks(userId);
          break;
        case 'conversations':
          testStore.clearConversations(userId);
          break;
        case 'reflections':
          testStore.clearReflections(userId);
          break;
        case 'resume':
          testStore.clearResume(userId);
          resumeService.clearResumeContext(userId);
          resumeStateManager.reset();
          break;
        case 'sessions':
          break;
        case 'purge':
          testStore.clearTestUser(userId);
          resumeService.clearResumeContext(userId);
          resumeStateManager.reset();
          break;
        default:
          return NextResponse.json({ success: false, error: 'Invalid deletion type' }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    const {
      adminDeleteAllGoalsAndTasks,
      adminDeleteAllConversations,
      adminDeleteAllReflections,
      adminDeletePlacementProfile,
      adminDeleteAllStudySessions,
      adminPurgeAllUserData,
    } = await import('@/lib/firebase-admin');

    switch (type) {
      case 'goals-tasks':
        await adminDeleteAllGoalsAndTasks(userId);
        break;
      case 'conversations':
        await adminDeleteAllConversations(userId);
        break;
      case 'reflections':
        await adminDeleteAllReflections(userId);
        break;
      case 'resume':
        await adminDeletePlacementProfile(userId);
        resumeService.clearResumeContext(userId);
        resumeStateManager.reset();
        break;
      case 'sessions':
        await adminDeleteAllStudySessions(userId);
        break;
      case 'purge':
        await adminPurgeAllUserData(userId);
        resumeService.clearResumeContext(userId);
        resumeStateManager.reset();
        break;
      default:
        return NextResponse.json({ success: false, error: 'Invalid deletion type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete data error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Deletion failed' }, { status: 500 });
  }
}
