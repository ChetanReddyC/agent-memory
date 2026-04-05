import { MemoryRecord } from "../types";
/**
 * Simple file-based memory store.
 * Each memory record is saved as a JSON file in the memories directory.
 * Named by checkpoint_id for easy lookup and dedup.
 */
export declare class MemoryStore {
    private memoriesDir;
    constructor(memoriesDir: string);
    /** Save a memory record */
    save(record: MemoryRecord): void;
    /** Load a specific memory by checkpoint ID */
    load(checkpointId: string): MemoryRecord | null;
    /** Load all memories */
    loadAll(): MemoryRecord[];
    /** Check if a checkpoint has already been distilled */
    exists(checkpointId: string): boolean;
    /** Count total memories */
    count(): number;
}
