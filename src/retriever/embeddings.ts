import * as fs from "fs";
import * as path from "path";
import { MemoryRecord } from "../types";

const HF_API_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

/**
 * Generates an embedding vector using the free Hugging Face Inference API.
 * Uses all-MiniLM-L6-v2 — 384-dim vectors, same quality as local model.
 * Zero npm dependencies — just native fetch.
 * Requires HF_TOKEN env variable (free at https://huggingface.co/settings/tokens).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error("HF_TOKEN not set. Get a free token at https://huggingface.co/settings/tokens");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // API returns nested array for single input — extract the vector
  if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "number") {
    return data[0] as number[];
  }
  if (Array.isArray(data) && typeof data[0] === "number") {
    return data as number[];
  }

  throw new Error("Unexpected embedding API response format");
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
