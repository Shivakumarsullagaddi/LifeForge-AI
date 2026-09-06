import { IntentAnalysisResult, RetrievalRecordType } from './types';

/**
 * Fast Query Intent Analyzer & Entity Extractor
 */
export function analyzeQueryIntent(query: string): IntentAnalysisResult {
  const raw = (query || '').trim();
  const lower = raw.toLowerCase();

  // 1. Extract dates
  const extractedDates: string[] = [];
  // ISO date: YYYY-MM-DD
  const isoDates = raw.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (isoDates) {
    extractedDates.push(...isoDates);
  }

  // Relative dates
  const now = new Date();
  if (lower.includes('today')) {
    extractedDates.push(now.toISOString().slice(0, 10));
  } else if (lower.includes('yesterday')) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    extractedDates.push(yesterday.toISOString().slice(0, 10));
  }

  // 2. Extract record types inferred from query words
  const inferredTypes: RetrievalRecordType[] = [];
  if (/\b(goal|target|milestone|aim|objective)\b/i.test(raw)) {
    inferredTypes.push('goal');
  }
  if (/\b(task|todo|action|assignment|work on|pomodoro)\b/i.test(raw)) {
    inferredTypes.push('task');
  }
  if (/\b(reflection|retrospective|review|lessons?|learned|struggled|failed|worked)\b/i.test(raw)) {
    inferredTypes.push('reflection');
  }

  // 3. Extract domain keywords
  let inferredDomain: string | undefined;
  if (/\b(dsa|algo|data structure|leetcode|recursion|tree|graph|dp|system design|cs|study|revision)\b/i.test(raw)) {
    inferredDomain = 'study';
  } else if (/\b(interview|placement|resume|company|hiring|hr|rounds|package|internship)\b/i.test(raw)) {
    inferredDomain = 'placement';
  } else if (/\b(stress|anxiety|exhausted|burnout|sleep|breath|meditation|health|gym|karate|walk)\b/i.test(raw)) {
    inferredDomain = 'wellbeing';
  }

  // 4. Intent Classification
  let intentCategory: IntentAnalysisResult['intentCategory'] = 'general_query';
  if (/\b(struggle|stuck|failed|difficult|error|confused|problem|weak)\b/i.test(raw)) {
    intentCategory = 'struggle_lookup';
  } else if (/\b(progress|status|how much|completed|streak|score|done)\b/i.test(raw)) {
    intentCategory = 'progress_check';
  } else if (/\b(what is my|when did i|who is|my preference|my routine|my rule)\b/i.test(raw)) {
    intentCategory = 'fact_retrieval';
  }

  // 5. Exact lookup check
  const isExactLookup = /".+?"/.test(raw) || /\b[0-9a-f]{8}-[0-9a-f]{4}\b/i.test(raw);

  // 6. Keywords cleaning
  const cleanedKeywords = raw
    .replace(/[^\w\s+#.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return {
    cleanedQuery: raw,
    rawQuery: raw,
    extractedDates,
    extractedKeywords: Array.from(new Set(cleanedKeywords)),
    inferredTypes: inferredTypes.length > 0 ? inferredTypes : undefined,
    inferredDomain,
    isExactLookup,
    intentCategory,
  };
}
