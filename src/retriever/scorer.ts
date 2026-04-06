import { MemoryRecord, SessionContext, ScoredMemory } from "../types";

/**
 * Scores a memory record against the current session context.
 * Uses 5 signals: file overlap, semantic similarity, error signature match, recency, importance.
 */
export function scoreMemory(
  memory: MemoryRecord,
  context: SessionContext,
  embeddingSimilarity?: number,
  errorCodes?: string[]
): ScoredMemory {
  const fileOverlap = computeFileOverlap(memory.files, [
    ...context.modified_files,
    ...context.recent_files,
  ]);

  const semantic = embeddingSimilarity !== undefined
    ? embeddingSimilarity * 100
    : computeKeywordSimilarity(memory, context.prompt);

  const errorMatch = errorCodes && errorCodes.length > 0
    ? computeErrorSignatureMatch(memory, errorCodes)
    : 0;

  const recency = computeRecencyScore(memory.date);
  const importance = computeImportanceScore(memory);

  // Content relevance = signals that indicate topical match
  const contentRelevance = Math.max(semantic, errorMatch);

  // If content relevance is too low, recency/importance should not rescue the memory.
  // This prevents recent-but-irrelevant memories from being injected.
  // Content relevance must be at least 25% for recency/importance to have full effect.
  const boostFactor = contentRelevance >= 25 ? 1.0 : contentRelevance / 25;

  const score = errorMatch > 0
    ? fileOverlap * 0.3 + semantic * 0.25 + errorMatch * 0.2 + (recency * boostFactor) * 0.15 + (importance * boostFactor) * 0.1
    : fileOverlap * 0.4 + semantic * 0.3 + (recency * boostFactor) * 0.2 + (importance * boostFactor) * 0.1;

  return {
    memory,
    score,
    breakdown: {
      file_overlap: fileOverlap,
      semantic_similarity: semantic,
      recency,
      decision_importance: importance,
      error_match: errorMatch,
    },
  };
}

/**
 * File overlap: what percentage of current files were touched in this memory?
 */
function computeFileOverlap(memoryFiles: string[], contextFiles: string[]): number {
  if (!memoryFiles || !contextFiles || contextFiles.length === 0) return 0;

  // Filter out config/meta files that pollute overlap scoring
  const ignorePatterns = [".agent-memory", ".claude", ".entire", ".git", "node_modules"];
  const isRelevantFile = (f: string) => !ignorePatterns.some((p) => f.toLowerCase().includes(p));

  const memoryNames = new Set(
    memoryFiles.filter(isRelevantFile).map((f) => f.split("/").pop()!.toLowerCase())
  );
  const contextNames = contextFiles
    .filter(isRelevantFile)
    .map((f) => f.split(/[/\\]/).pop()!.toLowerCase());

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
 * Error signature match: exact match extracted error codes against stored signatures.
 * This is the highest-precision signal — a matching error code is almost always relevant.
 */
function computeErrorSignatureMatch(memory: MemoryRecord, errorCodes: string[]): number {
  const signatures = memory.error_signatures || [];
  if (signatures.length === 0 || errorCodes.length === 0) return 0;

  const sigText = signatures.join(" ").toLowerCase();

  let matches = 0;
  for (const code of errorCodes) {
    if (sigText.includes(code.toLowerCase())) {
      matches++;
    }
  }

  return Math.min(100, (matches / errorCodes.length) * 100);
}

/**
 * Recency score: exponential decay from today.
 */
function computeRecencyScore(dateStr: string): number {
  const memoryDate = new Date(dateStr);
  const now = new Date();
  const daysAgo = (now.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24);

  return Math.max(0, 100 * Math.exp(-0.05 * daysAgo));
}

/**
 * Importance score: sessions with more decisions, warnings, and failures matter more.
 */
function computeImportanceScore(memory: MemoryRecord): number {
  let score = 0;
  score += Math.min(40, (memory.decisions || []).length * 10);
  score += Math.min(30, (memory.failed_approaches || []).length * 10);
  score += Math.min(30, (memory.warnings || []).length * 10);
  return Math.min(100, score);
}
