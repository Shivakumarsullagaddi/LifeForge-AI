import { RetrievalRecord, SearchResultItem } from './types';
import { EmbeddingProvider, defaultEmbeddingProvider, cosineSimilarity, hashString } from './embeddings';
import { generateSafeSummary } from './sanitizer';

/**
 * Semantic Vector Search Engine
 * Uses dense vector embeddings and cosine similarity to find conceptually related records.
 */
export async function semanticSearch(
  query: string,
  records: RetrievalRecord[],
  options: {
    minScore?: number;
    provider?: EmbeddingProvider;
  } = {}
): Promise<SearchResultItem[]> {
  if (!query || records.length === 0) return [];

  const provider = options.provider || defaultEmbeddingProvider;
  const minScore = options.minScore ?? 0.38;

  // 1. Generate query embedding
  const queryEmbedding = await provider.generateEmbedding(query);
  if (!queryEmbedding || queryEmbedding.length === 0) return [];

  // 2. Prepare texts for candidate records that need embedding
  const recordsNeedingEmbedding: Array<{ record: RetrievalRecord; text: string }> = [];

  for (const record of records) {
    if (!record.embedding || record.embedding.length === 0) {
      const textToEmbed = `${record.title}. ${record.content}. ${(record.tags || []).join(', ')}`;
      recordsNeedingEmbedding.push({ record, text: textToEmbed });
    }
  }

  // 3. Batch generate embeddings for missing records
  if (recordsNeedingEmbedding.length > 0) {
    const texts = recordsNeedingEmbedding.map((r) => r.text);
    try {
      const generatedEmbeddings = await provider.generateEmbeddings(texts);
      for (let i = 0; i < recordsNeedingEmbedding.length; i++) {
        const item = recordsNeedingEmbedding[i];
        item.record.embedding = generatedEmbeddings[i];
        item.record.textHash = hashString(item.text);
      }
    } catch (err) {
      console.warn('Failed to batch generate semantic embeddings:', err);
    }
  }

  // 4. Compute cosine similarity for each record
  const results: SearchResultItem[] = [];

  for (const record of records) {
    if (record.embedding && record.embedding.length > 0) {
      const sim = cosineSimilarity(queryEmbedding, record.embedding);

      if (sim >= minScore) {
        results.push({
          id: record.id,
          type: record.type,
          title: record.title,
          safeSummary: generateSafeSummary(record.title, record.content),
          rawContentSnippet: record.content.slice(0, 300),
          score: sim,
          matchTypes: ['semantic'],
          date: record.date,
          domain: record.domain || record.category,
          metadata: {
            semanticSimilarity: sim,
            providerName: provider.name,
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
