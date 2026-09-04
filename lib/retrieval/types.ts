export type RetrievalRecordType =
  | 'journal'
  | 'memory'
  | 'goal'
  | 'task'
  | 'reflection'
  | 'conversation'
  | 'study_session';

export interface RetrievalRecord {
  id: string;
  userId: string;
  type: RetrievalRecordType;
  title: string;
  content: string;
  date?: string;
  category?: string;
  tags?: string[];
  domain?: string;
  priority?: string;
  status?: string;
  confidence?: number;
  metadata?: Record<string, any>;
  embedding?: number[];
  textHash?: string;
}

export type MatchType = 'exact' | 'keyword' | 'semantic';

export interface SearchResultItem {
  id: string;
  type: RetrievalRecordType;
  title: string;
  safeSummary: string;
  rawContentSnippet?: string;
  score: number; // 0.0 to 1.0 normalized
  matchTypes: MatchType[];
  date?: string;
  domain?: string;
  metadata?: Record<string, any>;
}

export interface HybridRetrievalOptions {
  topK?: number;
  minScore?: number;
  weights?: {
    exact?: number;
    keyword?: number;
    semantic?: number;
  };
  typesFilter?: RetrievalRecordType[];
  domainFilter?: string;
}

export interface IntentAnalysisResult {
  cleanedQuery: string;
  rawQuery: string;
  extractedDates: string[];
  extractedKeywords: string[];
  inferredTypes?: RetrievalRecordType[];
  inferredDomain?: string;
  isExactLookup: boolean;
  intentCategory: 'struggle_lookup' | 'progress_check' | 'fact_retrieval' | 'general_query';
}
