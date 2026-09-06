import { NextRequest, NextResponse } from 'next/server';
import { testStore } from '@/lib/test-store';
import { parseJsonBody } from '@/lib/request-parser';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const collection = searchParams.get('collection');

  if (!userId || !userId.startsWith('test_')) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'Valid test userId required' } },
      { status: 400 }
    );
  }

  switch (collection) {
    case 'goals':
      return NextResponse.json(testStore.getGoals(userId));
    case 'tasks':
      return NextResponse.json(testStore.getTasks(userId));
    case 'reflections':
      return NextResponse.json(testStore.getReflections(userId));
    case 'confirmations':
      return NextResponse.json(testStore.getActionConfirmations(userId));
    case 'placement_profile':
      return NextResponse.json(testStore.getPlacementProfile(userId));
    case 'resume_metadata':
      return NextResponse.json(testStore.getResumeMetadata(userId));
    case 'conversations':
      return NextResponse.json(testStore.getConversations(userId));
    case 'messages':
      return NextResponse.json(testStore.getConversationMessages(userId, searchParams.get('conversationId') || ''));
    default:
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Unknown collection' } },
        { status: 400 }
      );
  }
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<any>(req, {
    requiredFields: ['action', 'userId'],
    validate: (d) => {
      if (typeof d.userId !== 'string' || !d.userId.startsWith('test_')) {
        return { valid: false, error: 'Valid test userId required' };
      }
      return { valid: true };
    },
  });

  if (!parsed.ok) {
    return parsed.response;
  }

  const { action, userId, data, id, updates, status } = parsed.data;

  try {
    switch (action) {
      case 'addGoal': {
        const goalId = testStore.addGoal(userId, data);
        return NextResponse.json({ id: goalId, success: true });
      }
      case 'updateGoal': {
        testStore.updateGoal(userId, id, updates);
        return NextResponse.json({ success: true });
      }
      case 'deleteGoal': {
        testStore.deleteGoal(userId, id);
        return NextResponse.json({ success: true });
      }
      case 'addTask': {
        const taskId = testStore.addTask(userId, data);
        return NextResponse.json({ id: taskId, success: true });
      }
      case 'updateTask': {
        testStore.updateTask(userId, id, updates);
        return NextResponse.json({ success: true });
      }
      case 'deleteTask': {
        testStore.deleteTask(userId, id);
        return NextResponse.json({ success: true });
      }
      case 'addReflection': {
        const reflectionId = testStore.addReflection(userId, data);
        return NextResponse.json({ id: reflectionId, success: true });
      }
      case 'addActionConfirmation': {
        const confId = testStore.addActionConfirmation(userId, data);
        return NextResponse.json({ id: confId, success: true });
      }
      case 'resolveActionConfirmation': {
        testStore.resolveActionConfirmation(userId, id, status);
        return NextResponse.json({ success: true });
      }
      case 'savePlacementProfile': {
        testStore.savePlacementProfile(userId, data);
        return NextResponse.json({ success: true });
      }
      case 'saveResumeMetadata': {
        testStore.saveResumeMetadata(userId, data);
        return NextResponse.json({ success: true });
      }
      case 'createConversation': {
        const convId = testStore.createConversation(userId, data);
        return NextResponse.json({ id: convId, success: true });
      }
      case 'updateConversation': {
        testStore.updateConversation(userId, id, updates);
        return NextResponse.json({ success: true });
      }
      case 'addMessage': {
        const msgId = testStore.addConversationMessage(userId, parsed.data.conversationId, data);
        return NextResponse.json({ id: msgId, success: true });
      }
      case 'clearConversations': {
        testStore.clearConversations(userId);
        return NextResponse.json({ success: true });
      }
      case 'clearUser': {
        testStore.clearTestUser(userId);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_REQUEST', message: 'Unknown action' } },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal error' } },
      { status: 500 }
    );
  }
}
