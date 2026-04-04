import { execSync } from "child_process";
import { MemoryRecord, SessionContext, ScoredMemory } from "../types";
import { MemoryStore } from "../store";
import { scoreMemory } from "./scorer";

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
    // Current branch
    branch = execSync("git branch --show-current", {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();
  } catch {
    // Ignore
  }

  try {
    // Modified files (staged + unstaged)
    const diff = execSync("git diff --name-only HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
    });
    modifiedFiles = diff.split("\n").filter((f) => f.trim().length > 0);
  } catch {
    // Ignore — might be initial commit
  }

  try {
    // Recently committed files (last 3 commits)
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
 * Retrieves the most relevant memories for the current context.
 *
 * 1. Loads all memories from the store
 * 2. Scores each against the current context
 * 3. Filters below threshold
 * 4. Returns top-K sorted by score
 */
export function retrieve(
  store: MemoryStore,
  context: SessionContext,
  topK: number = DEFAULT_TOP_K
): ScoredMemory[] {
  const allMemories = store.loadAll();

  if (allMemories.length === 0) return [];

  // Score every memory against current context
  const scored = allMemories
    .map((memory) => scoreMemory(memory, context))
    .filter((sm) => sm.score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  // Return top-K
  return scored.slice(0, topK);
}
