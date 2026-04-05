import * as fs from "fs";
import * as path from "path";
import { MemoryRecord } from "../types";

let pipeline: any = null;
let pipelineLoading: Promise<any> | null = null;

/**
 * Lazily loads the embedding model. First call downloads ~30MB model (cached after).
 * Uses all-MiniLM-L6-v2 — 384-dim vectors, fast, good quality.
 */
async function getEmbeddingPipeline(): Promise<any> {
  if (pipeline) return pipeline;

  if (!pipelineLoading) {
    pipelineLoading = (async () => {
      const { pipeline: createPipeline } = await import("@huggingface/transformers");
      pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      return pipeline;
    })();
  }

  return pipelineLoading;
}

/**
 * Generates an embedding vector for the given text.
 * Returns a 384-dimensional float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Builds the text to embed from a memory record.
 * Concatenates the semantic fields — skips file paths and tags (handled by file_overlap scoring).
 */
export function buildEmbeddingText(memory: MemoryRecord): string {
  return [
    memory.intent,
    ...memory.decisions,
    ...memory.failed_approaches,
    ...memory.warnings,
    memory.resolution,
    ...(memory.error_signatures || []),
    ...(memory.cause_chain || []),
    ...(memory.file_dependencies || []),
    memory.key_insight || "",
  ]
    .filter((s) => s.length > 0)
    .join(". ");
}

/**
 * Compute cosine similarity between two vectors. Returns 0-1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Embedding store — manages the embeddings.json index file.
 */
export class EmbeddingStore {
  private filePath: string;
  private cache: Record<string, number[]> = {};

  constructor(memoriesDir: string) {
    this.filePath = path.join(memoriesDir, "embeddings.json");
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.cache = JSON.parse(raw);
    }
  }

  save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache), "utf-8");
  }

  get(checkpointId: string): number[] | null {
    return this.cache[checkpointId] || null;
  }

  set(checkpointId: string, vector: number[]): void {
    this.cache[checkpointId] = vector;
  }

  has(checkpointId: string): boolean {
    return checkpointId in this.cache;
  }

  getAll(): Record<string, number[]> {
    return this.cache;
  }
}
