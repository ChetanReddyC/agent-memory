import { MemoryRecord } from "../types";
/**
 * Lists all checkpoint IDs in the repository.
 */
export declare function listCheckpoints(repoPath: string): string[];
/**
 * Core distillation: takes a raw checkpoint and produces a compact MemoryRecord.
 *
 * Tries LLM-powered distillation (Claude CLI) first for higher quality.
 * Falls back to heuristic extraction if Claude CLI is not available.
 */
export declare function distill(repoPath: string, checkpointId: string, memoriesDir?: string): Promise<MemoryRecord>;
