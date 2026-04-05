import { MemoryRecord, SessionContext, ScoredMemory } from "../types";
/**
 * Scores a memory record against the current session context.
 * Uses 5 signals: file overlap, semantic similarity, error signature match, recency, importance.
 */
export declare function scoreMemory(memory: MemoryRecord, context: SessionContext, embeddingSimilarity?: number, errorCodes?: string[]): ScoredMemory;
