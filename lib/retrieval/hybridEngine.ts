import {
  RetrievalRecord,
  SearchResultItem,
  HybridRetrievalOptions,
  MatchType,
  IntentAnalysisResult,
} from './types';
import { analyzeQueryIntent } from './intentUnderstanding';
import { exactSearch } from './exactSearch';
import { keywordSearch } from './keywordSearch';
import { semanticSearch } from './semanticSearch';
import { formatRetrievedContextForPrompt } from './sanitizer';

export interface HybridSearchResult {
  query: string;
  intent: IntentAnalysisResult;
  results: SearchResultItem[];
  formattedContextBlock: string;
  executionStats: {
    totalRecordsSearched: number;
    exactMatchesCount: number;
    keywordMatchesCount: number;
    semanticMatchesCount: number;
    durationMs: number;
  };
}

/**
 * Executes the complete Hybrid & Semantic Retrieval Pipeline:
 *
 * User Query
 *  → Intent Understanding
 *  → Exact Search
 *  → Keyword Search
 *  → Semantic Search
 *  → Candidate Merge
 *  → Deduplication
 *  → Reranking (Reciprocal Rank Fusion + Multi-Match Boost)
 *  → Top Relevant Results
 *  → Safe Prompt Context Block
 */
export async function executeHybridRetrieval(
  query: string,
  records: RetrievalRecord[],
  options: HybridRetrievalOptions = {}
): Promise<HybridSearchResult> {
  const startTime = Date.now();
  const topK = options.topK ?? 6;
  const minScore = options.minScore ?? 0.28;

  // Default weights
  const wExact = options.weights?.exact ?? 0.40;
  const wKeyword = options.weights?.keyword ?? 0.35;
  const wSemantic = options.weights?.semantic ?? 0.45;

  if (!query || !query.trim() || records.length === 0) {
    const emptyIntent = analyzeQueryIntent(query || '');
    return {
      query: query || '',
      intent: emptyIntent,
      results: [],
      formattedContextBlock: '',
      executionStats: {
        totalRecordsSearched: records.length,
        exactMatchesCount: 0,
        keywordMatchesCount: 0,
        semanticMatchesCount: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // 1. Intent Understanding
  const intent = analyzeQueryIntent(query);

  // Filter records by requested types if specified
  let targetRecords = records;
  if (options.typesFilter && options.typesFilter.length > 0) {
    targetRecords = targetRecords.filter((r) => options.typesFilter!.includes(r.type));
  } else if (intent.inferredTypes && intent.inferredTypes.length > 0) {
    // Soft boost rather than hard filter if inferred from query
  }

  if (options.domainFilter) {
    targetRecords = targetRecords.filter((r) => !r.domain || r.domain === options.domainFilter);
  }

  // 2, 3, 4. Run Exact, Keyword, and Semantic search in parallel
  const [exactResults, keywordResults, semanticResults] = await Promise.all([
    Promise.resolve(exactSearch(query, targetRecords, intent.extractedDates)),
    Promise.resolve(keywordSearch(query, targetRecords, { minScore: 0.12 })),
    semanticSearch(query, targetRecords, { minScore: 0.30 }),
  ]);

  // 5 & 6. Candidate Merge and Deduplication
  const mergedMap = new Map<string, {
    record: RetrievalRecord;
    exactScore: number;
    keywordScore: number;
    semanticScore: number;
    matchTypes: Set<MatchType>;
    bestSnippet?: string;
    safeSummary: string;
  }>();

  // Helper to ensure record entry in merged map
  const getOrInitCandidate = (item: SearchResultItem) => {
    let candidate = mergedMap.get(item.id);
    if (!candidate) {
      const originalRecord = records.find((r) => r.id === item.id);
      if (!originalRecord) return null;
      candidate = {
        record: originalRecord,
        exactScore: 0,
        keywordScore: 0,
        semanticScore: 0,
        matchTypes: new Set<MatchType>(),
        bestSnippet: item.rawContentSnippet,
        safeSummary: item.safeSummary,
      };
      mergedMap.set(item.id, candidate);
    }
    return candidate;
  };

  // Add Exact Matches
  for (const item of exactResults) {
    const candidate = getOrInitCandidate(item);
    if (candidate) {
      candidate.exactScore = item.score;
      candidate.matchTypes.add('exact');
      if (item.rawContentSnippet) candidate.bestSnippet = item.rawContentSnippet;
    }
  }

  // Add Keyword Matches
  for (const item of keywordResults) {
    const candidate = getOrInitCandidate(item);
    if (candidate) {
      candidate.keywordScore = item.score;
      candidate.matchTypes.add('keyword');
      if (item.rawContentSnippet) candidate.bestSnippet = item.rawContentSnippet;
    }
  }

  // Add Semantic Matches
  for (const item of semanticResults) {
    const candidate = getOrInitCandidate(item);
    if (candidate) {
      candidate.semanticScore = item.score;
      candidate.matchTypes.add('semantic');
      if (item.rawContentSnippet) candidate.bestSnippet = item.rawContentSnippet;
    }
  }

  // 7. Reranking using Multi-Signal Hybrid Scoring
  const rankedItems: SearchResultItem[] = [];

  for (const [id, candidate] of mergedMap.entries()) {
    const { record, exactScore, keywordScore, semanticScore, matchTypes } = candidate;

    // Base weighted score
    let totalWeight = 0;
    let weightedSum = 0;

    if (exactScore > 0) {
      weightedSum += exactScore * wExact;
      totalWeight += wExact;
    }
    if (keywordScore > 0) {
      weightedSum += keywordScore * wKeyword;
      totalWeight += wKeyword;
    }
    if (semanticScore > 0) {
      weightedSum += semanticScore * wSemantic;
      totalWeight += wSemantic;
    }

    let finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Multi-Match Boost: If matched by multiple search strategies, boost confidence
    if (matchTypes.size >= 3) {
      finalScore = Math.min(1.0, finalScore * 1.35);
    } else if (matchTypes.size === 2) {
      finalScore = Math.min(1.0, finalScore * 1.20);
    }

    // Inferred Domain Boost
    if (intent.inferredDomain && (record.domain === intent.inferredDomain || record.category === intent.inferredDomain)) {
      finalScore = Math.min(1.0, finalScore * 1.15);
    }

    // Inferred Record Type Boost
    if (intent.inferredTypes && intent.inferredTypes.includes(record.type)) {
      finalScore = Math.min(1.0, finalScore * 1.15);
    }

    if (finalScore >= minScore) {
      rankedItems.push({
        id,
        type: record.type,
        title: record.title,
        safeSummary: candidate.safeSummary,
        rawContentSnippet: candidate.bestSnippet,
        score: Number(finalScore.toFixed(3)),
        matchTypes: Array.from(matchTypes),
        date: record.date,
        domain: record.domain || record.category,
        metadata: {
          exactScore,
          keywordScore,
          semanticScore,
          matchTypesCount: matchTypes.size,
          tags: record.tags,
        },
      });
    }
  }

  // Sort descending by final score
  rankedItems.sort((a, b) => b.score - a.score);

  // Take top K results
  const topResults = rankedItems.slice(0, topK);

  // 8. Generate safe prompt block
  const formattedContextBlock = formatRetrievedContextForPrompt(topResults);

  return {
    query,
    intent,
    results: topResults,
    formattedContextBlock,
    executionStats: {
      totalRecordsSearched: records.length,
      exactMatchesCount: exactResults.length,
      keywordMatchesCount: keywordResults.length,
      semanticMatchesCount: semanticResults.length,
      durationMs: Date.now() - startTime,
    },
  };
}
