import { SessionContext, ScoredMemory } from "../types";
import { MemoryStore } from "../store";
/**
 * Gathers the current session context from the git repository.
 */
export declare function gatherContext(repoPath: string, prompt: string): SessionContext;
/**
 * Retrieves the most relevant memories using LLM-enhanced query refinement,
 * embedding-based semantic similarity, and error signature matching.
 * Falls back gracefully at each layer.
 */
export declare function retrieve(store: MemoryStore, context: SessionContext, topK?: number, memoriesDir?: string): Promise<ScoredMemory[]>;
