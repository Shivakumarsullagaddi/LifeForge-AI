import { RetrievalRecord, SearchResultItem } from './types';
import { generateSafeSummary } from './sanitizer';

// Common English stopwords to ignore in search tokens
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'tell', 'show', 'find', 'get', 'give', 'list', 'check', 'what', 'why', 'how', 'when'
]);

/**
 * Tokenize and normalize query or document into meaningful keywords
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * BM25 / TF-IDF Style Keyword Search Engine
 */
export function keywordSearch(
  query: string,
  records: RetrievalRecord[],
  options: { minScore?: number } = {}
): SearchResultItem[] {
  if (!query || records.length === 0) return [];

  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return [];

  const minScore = options.minScore ?? 0.15;
  const totalDocs = records.length;

  // Calculate Document Frequency (DF) for each query token
  const tokenDocFreq: Record<string, number> = {};
  for (const token of queryTokens) {
    let count = 0;
    for (const record of records) {
      const allText = `${record.title} ${record.content} ${(record.tags || []).join(' ')} ${record.domain || ''} ${record.category || ''}`.toLowerCase();
      if (allText.includes(token)) {
        count++;
      }
    }
    tokenDocFreq[token] = count;
  }

  const results: SearchResultItem[] = [];

  for (const record of records) {
    const titleTokens = tokenizeText(record.title || '');
    const contentTokens = tokenizeText(record.content || '');
    const tagTokens = (record.tags || []).map((t) => t.toLowerCase());
    const domainTokens = tokenizeText(`${record.domain || ''} ${record.category || ''}`);

    let totalScore = 0;
    let matchedKeywords: string[] = [];

    for (const token of queryTokens) {
      const df = tokenDocFreq[token] || 0;
      // Inverse Document Frequency with smoothing
      const idf = Math.max(0.75, Math.log(1 + (totalDocs - df + 1.0) / (df + 0.5)));

      // Term Frequencies across boosted fields
      const titleTf = titleTokens.filter((t) => t === token || t.includes(token)).length;
      const contentTf = contentTokens.filter((t) => t === token || t.includes(token)).length;
      const tagTf = tagTokens.filter((t) => t === token || t.includes(token)).length;
      const domainTf = domainTokens.filter((t) => t === token || t.includes(token)).length;

      // Field weighted scoring: Title is 2.8x, Tags 2.2x, Domain 2.0x, Content 1.0x
      const weightedTf = titleTf * 2.8 + tagTf * 2.2 + domainTf * 2.0 + contentTf * 1.0;

      if (weightedTf > 0) {
        matchedKeywords.push(token);
        // BM25-like sub-linear saturation
        const tokenScore = (weightedTf / (weightedTf + 1.2)) * idf;
        totalScore += tokenScore;
      }
    }

    if (matchedKeywords.length > 0) {
      // Coverage bonus: reward matching more distinct query tokens
      const coverageRatio = matchedKeywords.length / queryTokens.length;
      const avgTermScore = totalScore / matchedKeywords.length;
      const rawScore = (avgTermScore * 0.45) + (coverageRatio * 0.55);
      const finalScore = Math.min(1.0, Math.max(0, Number(rawScore.toFixed(3))));

      if (finalScore >= minScore) {
        results.push({
          id: record.id,
          type: record.type,
          title: record.title,
          safeSummary: generateSafeSummary(record.title, record.content),
          rawContentSnippet: record.content.slice(0, 300),
          score: finalScore,
          matchTypes: ['keyword'],
          date: record.date,
          domain: record.domain || record.category,
          metadata: {
            matchedKeywords,
            coverageRatio,
            tags: record.tags,
            priority: record.priority,
            status: record.status,
          },
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
