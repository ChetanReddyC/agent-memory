import { MemoryRecord } from "../types";
/**
 * Lists all checkpoint+sub-index pairs in the repository.
 * Returns IDs like "4802aa6ca39b:0", "4802aa6ca39b:1", etc.
 * Each sub-index is a separate session that needs its own distillation.
 */
export declare function listCheckpoints(repoPath: string): string[];
/**
 * Core distillation: takes a raw checkpoint and produces a compact MemoryRecord.
 *
 * Tries LLM-powered distillation (Claude CLI) first for higher quality.
 * Falls back to heuristic extraction if Claude CLI is not available.
 */
export declare function distill(repoPath: string, checkpointId: string, memoriesDir?: string): Promise<MemoryRecord>;
