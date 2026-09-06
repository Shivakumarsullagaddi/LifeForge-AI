import { NextResponse } from 'next/server';
import { getRotatedMotivationalQuote } from '@/lib/motivation/motivation-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const quote = getRotatedMotivationalQuote();
    return NextResponse.json({ success: true, quote });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to retrieve quote' }, { status: 500 });
  }
}
