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

import { parseJsonBody } from '@/lib/request-parser';

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<RetrievalRequestBody>(req, {
    requiredFields: ['query'],
    validate: (d) => {
      if (typeof d.query !== 'string' || !d.query.trim()) {
        return { valid: false, error: 'Query string is required' };
      }
      return { valid: true };
    },
  });

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const body: RetrievalRequestBody = parsed.data;
    const { query, userId = 'current_user', topK = 6, minScore = 0.25, typesFilter, domainFilter, userData, records } = body;

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
