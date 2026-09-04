import { NextRequest, NextResponse } from 'next/server';
import { executeHybridRetrieval } from '@/lib/retrieval/hybridEngine';
import { adaptUserRecords } from '@/lib/retrieval/recordAdapter';
import { RetrievalRecord } from '@/lib/retrieval/types';

interface RetrievalRequestBody {
  query: string;
  userId?: string;
  topK?: number;
  minScore?: number;
  typesFilter?: any[];
  domainFilter?: string;
  userData?: {
    journals?: any[];
    memories?: any[];
    goals?: any[];
    tasks?: any[];
    reflections?: any[];
    conversations?: any[];
    studySessions?: any[];
  };
  records?: RetrievalRecord[];
}

export async function POST(req: NextRequest) {
  try {
    const body: RetrievalRequestBody = await req.json();
    const { query, userId = 'current_user', topK = 6, minScore = 0.25, typesFilter, domainFilter, userData, records } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query string is required' }, { status: 400 });
    }

    let searchRecords: RetrievalRecord[] = [];

    if (records && Array.isArray(records)) {
      // Ensure user isolation
      searchRecords = records.filter((r) => !userId || r.userId === userId);
    } else if (userData) {
      searchRecords = adaptUserRecords(userId, userData);
    }

    const searchResult = await executeHybridRetrieval(query, searchRecords, {
      topK,
      minScore,
      typesFilter,
      domainFilter,
    });

    return NextResponse.json({
      success: true,
      query: searchResult.query,
      intent: searchResult.intent,
      results: searchResult.results,
      formattedContextBlock: searchResult.formattedContextBlock,
      executionStats: searchResult.executionStats,
    });
  } catch (error: any) {
    console.error('Retrieval API Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Retrieval failed',
      },
      { status: 500 }
    );
  }
}
