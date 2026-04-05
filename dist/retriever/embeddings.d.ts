import { MemoryRecord } from "../types";
/**
 * Generates an embedding vector for the given text.
 * Returns a 384-dimensional float array.
 */
export declare function generateEmbedding(text: string): Promise<number[]>;
/**
 * Builds the text to embed from a memory record.
 * Concatenates the semantic fields — skips file paths and tags (handled by file_overlap scoring).
 */
export declare function buildEmbeddingText(memory: MemoryRecord): string;
/**
 * Compute cosine similarity between two vectors. Returns 0-1.
 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Embedding store — manages the embeddings.json index file.
 */
export declare class EmbeddingStore {
    private filePath;
    private cache;
    constructor(memoriesDir: string);
    private load;
    save(): void;
    get(checkpointId: string): number[] | null;
    set(checkpointId: string, vector: number[]): void;
    has(checkpointId: string): boolean;
    getAll(): Record<string, number[]>;
}
