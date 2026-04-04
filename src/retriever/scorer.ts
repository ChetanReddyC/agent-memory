import { MemoryRecord, SessionContext, ScoredMemory } from "../types";

/**
 * Scores a memory record against the current session context.
 * Returns a score between 0-100 with breakdown.
 */
export function scoreMemory(memory: MemoryRecord, context: SessionContext): ScoredMemory {
  const fileOverlap = computeFileOverlap(memory.files, [
    ...context.modified_files,
    ...context.recent_files,
  ]);
  const semantic = computeSemanticSimilarity(memory, context.prompt);
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
  if (contextFiles.length === 0) return 0;

  // Extract just filenames for fuzzy matching
  const memoryNames = new Set(memoryFiles.map((f) => f.split("/").pop()!.toLowerCase()));
  const contextNames = contextFiles.map((f) => f.split(/[/\\]/).pop()!.toLowerCase());

  let matches = 0;
  for (const name of contextNames) {
    if (memoryNames.has(name)) matches++;
  }

  // Score: percentage of context files that match, capped at 100
  return Math.min(100, (matches / contextNames.length) * 100);
}

/**
 * Semantic similarity: keyword overlap between prompt and memory content.
 * This is a simple TF approach — can be upgraded to embeddings later.
 */
function computeSemanticSimilarity(memory: MemoryRecord, prompt: string): number {
  if (!prompt || prompt.trim().length === 0) return 0;

  // Build keyword set from memory
  const memoryText = [
    memory.intent,
    ...memory.decisions,
    ...memory.failed_approaches,
    ...memory.warnings,
    memory.resolution,
    ...(memory.error_signatures || []),
    ...(memory.cause_chain || []),
    ...(memory.file_dependencies || []),
    memory.key_insight || "",
    ...memory.tags,
  ]
    .join(" ")
    .toLowerCase();

  // Extract meaningful words from prompt (skip common words)
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

  // Exponential decay: score = 100 * e^(-0.05 * days)
  return Math.max(0, 100 * Math.exp(-0.05 * daysAgo));
}

/**
 * Importance score: sessions with more decisions, warnings, and failures
 * are more important to remember.
 */
function computeImportanceScore(memory: MemoryRecord): number {
  let score = 0;

  // More decisions = more important
  score += Math.min(40, memory.decisions.length * 10);

  // Failed approaches = learned something
  score += Math.min(30, memory.failed_approaches.length * 10);

  // Warnings = critical knowledge
  score += Math.min(30, memory.warnings.length * 10);

  return Math.min(100, score);
}
