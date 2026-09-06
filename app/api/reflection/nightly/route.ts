import { NextRequest, NextResponse } from 'next/server';
import { runDailyReflectionForUser, getCurrentDateKolkata } from '@/lib/reflection-scheduler';
import { logStructured } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId;
    const targetDate = body.date || getCurrentDateKolkata();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required for scheduled nightly reflection' },
        { status: 400 }
      );
    }

    logStructured('REFLECTION', `Nightly reflection job triggered for user`, {
      userId,
      date: targetDate,
      scheduledTime: '23:30',
    });

    const result = await runDailyReflectionForUser(userId, targetDate);

    return NextResponse.json({
      success: true,
      job: 'NIGHTLY_REFLECTION_2330',
      userId,
      date: targetDate,
      reflectionId: result?.reflectionId,
      alreadyExists: result?.alreadyExists ?? false,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Nightly reflection job failed' },
      { status: 500 }
    );
  }
}
