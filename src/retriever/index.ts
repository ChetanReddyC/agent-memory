import { execSync } from "child_process";
import { MemoryRecord, SessionContext, ScoredMemory } from "../types";
import { MemoryStore } from "../store";
import { scoreMemory } from "./scorer";
import { generateEmbedding, cosineSimilarity, EmbeddingStore } from "./embeddings";
import { refineQuery } from "./query";

/** Default: return top 5 memories */
const DEFAULT_TOP_K = 5;

/** Minimum score threshold — below this, memory isn't relevant enough */
const MIN_SCORE_THRESHOLD = 15;

/**
 * Gathers the current session context from the git repository.
 */
export function gatherContext(repoPath: string, prompt: string): SessionContext {
  let modifiedFiles: string[] = [];
  let recentFiles: string[] = [];
  let branch = "unknown";

  try {
    branch = execSync("git branch --show-current", {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();
  } catch {
    // Ignore
  }

  try {
    const diff = execSync("git diff --name-only HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
    });
    modifiedFiles = diff.split("\n").filter((f) => f.trim().length > 0);
  } catch {
    // Ignore — might be initial commit
  }

  try {
    const log = execSync("git log -3 --name-only --pretty=format:", {
      cwd: repoPath,
      encoding: "utf-8",
    });
    recentFiles = [...new Set(log.split("\n").filter((f) => f.trim().length > 0))];
  } catch {
    // Ignore
  }

  return {
    modified_files: modifiedFiles,
    branch,
    prompt,
    recent_files: recentFiles,
  };
}

/**
 * Retrieves the most relevant memories using LLM-enhanced query refinement,
 * embedding-based semantic similarity, and error signature matching.
 * Falls back gracefully at each layer.
 */
export async function retrieve(
  store: MemoryStore,
  context: SessionContext,
  topK: number = DEFAULT_TOP_K,
  memoriesDir?: string
): Promise<ScoredMemory[]> {
  const allMemories = store.loadAll();
  if (allMemories.length === 0) return [];

  // Step 1: Refine the query using LLM (or heuristic fallback)
  const refined = refineQuery(context.prompt);

  // Merge file hints from query refinement into context files
  const enhancedContext: SessionContext = {
    ...context,
    recent_files: [
      ...context.recent_files,
      ...refined.file_hints,
    ],
  };

  // Step 2: Generate embedding for the refined query
  let promptEmbedding: number[] | null = null;
  let embeddingStore: EmbeddingStore | null = null;

  if (memoriesDir) {
    try {
      embeddingStore = new EmbeddingStore(memoriesDir);
      promptEmbedding = await generateEmbedding(refined.refined_query);
    } catch {
      promptEmbedding = null;
    }
  }

  // Step 3: Score every memory with all 5 signals
  const scored = allMemories
    .map((memory) => {
      let embeddingSimilarity: number | undefined;

      if (promptEmbedding && embeddingStore) {
        const memoryVector = embeddingStore.get(memory.checkpoint_id);
        if (memoryVector) {
          embeddingSimilarity = cosineSimilarity(promptEmbedding, memoryVector);
        }
      }

      return scoreMemory(memory, enhancedContext, embeddingSimilarity, refined.error_codes);
    })
    .filter((sm) => sm.score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
