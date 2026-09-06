import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const testUser = {
    uid: 'test_e2e_student',
    email: 'test-student@lifeforge.test',
    displayName: 'LifeForge E2E Student',
    photoURL: '',
    timezone: 'UTC',
    primaryGoal: 'Master technical placements and build disciplined study routines',
    studyPhilosophy: 'Learn through logic, deep focus, and active recall',
    disciplinedStreakDays: 3,
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json({ success: true, user: testUser });
}
