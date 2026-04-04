/**
 * Embeddings module — placeholder for vector-based semantic similarity.
 *
 * Currently, the retriever uses keyword overlap for semantic matching.
 * This module can be upgraded to use real embeddings (OpenAI, Cohere, local models)
 * for more accurate semantic retrieval.
 *
 * Future implementation:
 * 1. On distill: generate embedding vector for each memory record
 * 2. On retrieve: generate embedding for the current prompt
 * 3. Use cosine similarity to find closest memories
 *
 * This would replace the keyword-based computeSemanticSimilarity in scorer.ts
 */

export interface EmbeddingVector {
  checkpoint_id: string;
  vector: number[];
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
