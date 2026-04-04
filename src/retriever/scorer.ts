import { MemoryRecord, SessionContext, ScoredMemory } from "../types";
import { cosineSimilarity } from "./embeddings";

/**
 * Scores a memory record against the current session context.
 * Uses pre-computed embedding similarity if available, falls back to keyword matching.
 */
export function scoreMemory(
  memory: MemoryRecord,
  context: SessionContext,
  embeddingSimilarity?: number
): ScoredMemory {
  const fileOverlap = computeFileOverlap(memory.files, [
    ...context.modified_files,
    ...context.recent_files,
  ]);

  // Use embedding similarity if provided, otherwise fall back to keywords
  const semantic = embeddingSimilarity !== undefined
    ? embeddingSimilarity * 100
    : computeKeywordSimilarity(memory, context.prompt);

  const recency = computeRecencyScore(memory.date);
  const importance = computeImportanceScore(memory);

  // Weighted combination
  const score =
    fileOverlap * 0.4 +
    semantic * 0.3 +
    recency * 0.2 +
    importance * 0.1;

  return {
    memory,
    score,
    breakdown: {
      file_overlap: fileOverlap,
      semantic_similarity: semantic,
      recency,
      decision_importance: importance,
    },
  };
}

/**
 * File overlap: what percentage of current files were touched in this memory?
 * Matches on filename (not full path) to catch reorganized files.
 */
function computeFileOverlap(memoryFiles: string[], contextFiles: string[]): number {
  if (!memoryFiles || !contextFiles || contextFiles.length === 0) return 0;

  const memoryNames = new Set(memoryFiles.map((f) => f.split("/").pop()!.toLowerCase()));
  const contextNames = contextFiles.map((f) => f.split(/[/\\]/).pop()!.toLowerCase());

  let matches = 0;
  for (const name of contextNames) {
    if (memoryNames.has(name)) matches++;
  }

  return Math.min(100, (matches / contextNames.length) * 100);
}

/**
 * Keyword similarity: fallback when embeddings aren't available.
 */
function computeKeywordSimilarity(memory: MemoryRecord, prompt: string): number {
  if (!prompt || prompt.trim().length === 0) return 0;

  const memoryText = [
    memory.intent || "",
    ...(memory.decisions || []),
    ...(memory.failed_approaches || []),
    ...(memory.warnings || []),
    memory.resolution || "",
    ...(memory.error_signatures || []),
    ...(memory.cause_chain || []),
    ...(memory.file_dependencies || []),
    memory.key_insight || "",
    ...(memory.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "this",
    "that", "these", "those", "i", "me", "my", "we", "our",
    "you", "your", "it", "its", "and", "or", "but", "in", "on",
    "at", "to", "for", "of", "with", "from", "not", "no", "so",
    "if", "then", "than", "when", "what", "how", "why", "where",
    "just", "also", "still", "again", "now", "hey", "see", "im",
  ]);

  const promptWords = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (promptWords.length === 0) return 0;

  let matches = 0;
  for (const word of promptWords) {
    if (memoryText.includes(word)) matches++;
  }

  return Math.min(100, (matches / promptWords.length) * 100);
}

/**
 * Recency score: exponential decay from today.
 * Yesterday = 100, 1 week ago = ~70, 1 month ago = ~30, 3 months = ~5
 */
function computeRecencyScore(dateStr: string): number {
  const memoryDate = new Date(dateStr);
  const now = new Date();
  const daysAgo = (now.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24);

  return Math.max(0, 100 * Math.exp(-0.05 * daysAgo));
}

/**
 * Importance score: sessions with more decisions, warnings, and failures
 * are more important to remember.
 */
function computeImportanceScore(memory: MemoryRecord): number {
  let score = 0;
  score += Math.min(40, (memory.decisions || []).length * 10);
  score += Math.min(30, (memory.failed_approaches || []).length * 10);
  score += Math.min(30, (memory.warnings || []).length * 10);
  return Math.min(100, score);
}
