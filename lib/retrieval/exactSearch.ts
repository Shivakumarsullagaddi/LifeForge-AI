import { RetrievalRecord, SearchResultItem } from './types';
import { generateSafeSummary } from './sanitizer';

/**
 * Exact Match Search Engine
 * Detects and scores exact ID, date, title, and phrase matches with high precision.
 */
export function exactSearch(
  query: string,
  records: RetrievalRecord[],
  extractedDates: string[] = []
): SearchResultItem[] {
  if (!query || records.length === 0) return [];

  const rawTrimmed = query.trim();
  const lowerQuery = rawTrimmed.toLowerCase();
  const results: SearchResultItem[] = [];

  // Extract quoted phrases if present: e.g. "binary search tree"
  const quotedMatches = Array.from(rawTrimmed.matchAll(/"([^"]+)"/g)).map((m) => m[1].toLowerCase());

  for (const record of records) {
    let score = 0;
    const matchReasons: string[] = [];

    // 1. Exact ID match
    if (record.id.toLowerCase() === lowerQuery || lowerQuery.includes(record.id.toLowerCase())) {
      score = Math.max(score, 1.0);
      matchReasons.push('id_match');
    }

    // 2. Exact Title match
    const lowerTitle = (record.title || '').toLowerCase();
    if (lowerTitle === lowerQuery) {
      score = Math.max(score, 0.98);
      matchReasons.push('exact_title_match');
    } else if (lowerTitle.includes(lowerQuery) && lowerQuery.length > 3) {
      score = Math.max(score, 0.90);
      matchReasons.push('title_substring_match');
    }

    // 3. Quoted Phrase match in content or title
    const lowerContent = (record.content || '').toLowerCase();
    for (const phrase of quotedMatches) {
      if (phrase.length > 2) {
        if (lowerTitle.includes(phrase)) {
          score = Math.max(score, 0.95);
          matchReasons.push('quoted_phrase_title');
        } else if (lowerContent.includes(phrase)) {
          score = Math.max(score, 0.88);
          matchReasons.push('quoted_phrase_content');
        }
      }
    }

    // 4. Exact Date match
    const recordDate = (record.date || '').slice(0, 10);
    if (recordDate) {
      for (const extractedDate of extractedDates) {
        if (recordDate === extractedDate || recordDate.startsWith(extractedDate)) {
          score = Math.max(score, 0.85);
          matchReasons.push('date_match');
        }
      }
      if (lowerQuery.includes(recordDate)) {
        score = Math.max(score, 0.85);
        matchReasons.push('date_query_match');
      }
    }

    if (score > 0) {
      results.push({
        id: record.id,
        type: record.type,
        title: record.title,
        safeSummary: generateSafeSummary(record.title, record.content),
        rawContentSnippet: record.content.slice(0, 300),
        score,
        matchTypes: ['exact'],
        date: record.date,
        domain: record.domain || record.category,
        metadata: {
          matchReasons,
          tags: record.tags,
          priority: record.priority,
          status: record.status,
        },
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
