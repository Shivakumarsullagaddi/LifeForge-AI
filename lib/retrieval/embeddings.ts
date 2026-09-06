import { GoogleGenAI } from '@google/genai';

/**
 * Modular Embedding Provider Interface
 * Allows swapping the vector model provider without modifying retrieval logic.
 */
export interface EmbeddingProvider {
  name: string;
  dimension: number;
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Fast string hash for caching vectors
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}

// In-memory LRU-like vector cache
const vectorCache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 1000;

function getCachedVector(key: string): number[] | undefined {
  return vectorCache.get(key);
}

function setCachedVector(key: string, vector: number[]): void {
  if (vectorCache.size >= MAX_CACHE_SIZE) {
    const firstKey = vectorCache.keys().next().value;
    if (firstKey) vectorCache.delete(firstKey);
  }
  vectorCache.set(key, vector);
}

/**
 * Local deterministic dense vectorizer (Fallback & Testing)
 * Produces a normalized 256-dimensional subword/character n-gram frequency vector.
 */
export class LocalDeterministicEmbeddingProvider implements EmbeddingProvider {
  name = 'local-subword-768';
  dimension = 768;

  async generateEmbedding(text: string): Promise<number[]> {
    const normalized = text.toLowerCase().trim();
    const vec = new Array(this.dimension).fill(0);

    if (!normalized) return vec;

    // Word tokens
    const words = normalized.split(/\W+/).filter(Boolean);
    for (const word of words) {
      let h = 0;
      for (let i = 0; i < word.length; i++) {
        h = (h * 31 + word.charCodeAt(i)) % this.dimension;
      }
      vec[Math.abs(h)] += 1.5;
    }

    // Character tri-grams for subword semantic capture
    for (let i = 0; i < normalized.length - 2; i++) {
      const tri = normalized.slice(i, i + 3);
      let h = 0;
      for (let j = 0; j < tri.length; j++) {
        h = (h * 37 + tri.charCodeAt(j)) % this.dimension;
      }
      vec[Math.abs(h)] += 0.5;
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vec[i] /= norm;
      }
    }

    return vec;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.generateEmbedding(t)));
  }
}

/**
 * Gemini Embedding Provider using gemini-embedding-2-preview
 */
// In-flight promise map for request deduplication
const inFlightEmbeddings = new Map<string, Promise<number[]>>();
let isRateLimitedUntil = 0;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  name = 'gemini-embedding-2-preview';
  dimension = 768;
  private fallback = new LocalDeterministicEmbeddingProvider();

  async generateEmbedding(text: string): Promise<number[]> {
    const clean = text.trim();
    if (!clean) {
      return new Array(this.dimension).fill(0);
    }

    const cacheKey = `gemini_${hashString(clean)}`;
    const cached = getCachedVector(cacheKey);
    if (cached) return cached;

    if (!process.env.GEMINI_API_KEY || Date.now() < isRateLimitedUntil) {
      return this.fallback.generateEmbedding(clean);
    }

    const inFlight = inFlightEmbeddings.get(cacheKey);
    if (inFlight) return inFlight;

    const requestPromise = (async () => {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const res = await ai.models.embedContent({
          model: 'gemini-embedding-2-preview',
          contents: clean,
        });

        const rawRes = res as any;
        const values = rawRes.embedding?.values || rawRes.embeddings?.[0]?.values;
        if (values && Array.isArray(values) && values.length > 0) {
          setCachedVector(cacheKey, values);
          return values;
        }

        return this.fallback.generateEmbedding(clean);
      } catch (err: any) {
        if (err?.message?.includes('429') || err?.status === 429 || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          isRateLimitedUntil = Date.now() + 60000;
          console.warn('Gemini embedding rate-limited (429), switching to local deterministic provider for 60s.');
        } else {
          console.warn('Gemini embedding notice, using deterministic fallback:', err);
        }
        return this.fallback.generateEmbedding(clean);
      } finally {
        inFlightEmbeddings.delete(cacheKey);
      }
    })();

    inFlightEmbeddings.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.generateEmbedding(t)));
  }
}

/**
 * Cosine Similarity between two dense float vectors
 * Returns a score between -1.0 and 1.0 (normalized to 0.0 - 1.0 for retrieval).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;

  const len = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // Normalize from [-1, 1] to [0, 1]
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

// Default singleton provider
export const defaultEmbeddingProvider = new GeminiEmbeddingProvider();
