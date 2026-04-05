import * as fs from "fs";
import * as path from "path";
import { MemoryRecord } from "../types";

/**
 * Simple file-based memory store.
 * Each memory record is saved as a JSON file in the memories directory.
 * Named by checkpoint_id for easy lookup and dedup.
 */
export class MemoryStore {
  private memoriesDir: string;

  constructor(memoriesDir: string) {
    this.memoriesDir = memoriesDir;
    if (!fs.existsSync(memoriesDir)) {
      fs.mkdirSync(memoriesDir, { recursive: true });
    }
  }

  /** Sanitize checkpoint ID for filesystem (: not allowed on Windows) */
  private sanitizeId(checkpointId: string): string {
    return checkpointId.replace(/:/g, "_");
  }

  /** Save a memory record */
  save(record: MemoryRecord): void {
    const filePath = path.join(this.memoriesDir, `${this.sanitizeId(record.checkpoint_id)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
  }

  /** Load a specific memory by checkpoint ID */
  load(checkpointId: string): MemoryRecord | null {
    const filePath = path.join(this.memoriesDir, `${this.sanitizeId(checkpointId)}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as MemoryRecord;
  }

  /** Load all memories */
  loadAll(): MemoryRecord[] {
    if (!fs.existsSync(this.memoriesDir)) return [];

    return fs
      .readdirSync(this.memoriesDir)
      .filter((f) => f.endsWith(".json") && f !== "embeddings.json")
      .map((f) => {
        const raw = fs.readFileSync(path.join(this.memoriesDir, f), "utf-8");
        return JSON.parse(raw) as MemoryRecord;
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
  }

  /** Check if a checkpoint has already been distilled */
  exists(checkpointId: string): boolean {
    return fs.existsSync(path.join(this.memoriesDir, `${this.sanitizeId(checkpointId)}.json`));
  }

  /** Count total memories */
  count(): number {
    if (!fs.existsSync(this.memoriesDir)) return 0;
    return fs.readdirSync(this.memoriesDir).filter((f) => f.endsWith(".json") && f !== "embeddings.json").length;
  }
}
