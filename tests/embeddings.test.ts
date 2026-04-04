import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { cosineSimilarity, buildEmbeddingText, EmbeddingStore } from "../src/retriever/embeddings";
import { MemoryRecord } from "../src/types";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it("computes correct similarity for known vectors", () => {
    // cos([1,2,3], [4,5,6]) = 32 / (sqrt(14) * sqrt(77)) ≈ 0.9746
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(sim).toBeCloseTo(0.9746, 3);
  });
});

describe("buildEmbeddingText", () => {
  it("concatenates semantic fields from memory", () => {
    const memory: MemoryRecord = {
      checkpoint_id: "test",
      session_id: "sess",
      date: "2026-04-03",
      branch: "main",
      files: ["src/auth.ts"],
      tags: ["auth"],
      turn_count: 5,
      token_usage: 3000,
      intent: "Fix auth bug",
      decisions: ["Expired token was the cause"],
      failed_approaches: ["Tried cache clear"],
      warnings: ["Token rotates daily"],
      resolution: "Added refresh logic",
      error_signatures: ["401 Unauthorized"],
      cause_chain: ["401 → expired token"],
      file_dependencies: [],
      key_insight: "Check token expiry first",
    };

    const text = buildEmbeddingText(memory);
    expect(text).toContain("Fix auth bug");
    expect(text).toContain("Expired token was the cause");
    expect(text).toContain("Tried cache clear");
    expect(text).toContain("Token rotates daily");
    expect(text).toContain("Added refresh logic");
    expect(text).toContain("401 Unauthorized");
    expect(text).toContain("401 → expired token");
    expect(text).toContain("Check token expiry first");
    // Should NOT contain file paths or tags
    expect(text).not.toContain("src/auth.ts");
  });

  it("excludes tags from embedding text", () => {
    const memory: MemoryRecord = {
      checkpoint_id: "test",
      session_id: "sess",
      date: "2026-04-03",
      branch: "main",
      files: [],
      tags: ["uniquetag123", "anothertag456"],
      turn_count: 5,
      token_usage: 3000,
      intent: "Some intent",
      decisions: [],
      failed_approaches: [],
      warnings: [],
      resolution: "",
      error_signatures: [],
      cause_chain: [],
      file_dependencies: [],
      key_insight: "",
    };
    const text = buildEmbeddingText(memory);
    expect(text).not.toContain("uniquetag123");
    expect(text).not.toContain("anothertag456");
  });

  it("includes file_dependencies in embedding text", () => {
    const memory: MemoryRecord = {
      checkpoint_id: "test",
      session_id: "sess",
      date: "2026-04-03",
      branch: "main",
      files: [],
      tags: [],
      turn_count: 5,
      token_usage: 3000,
      intent: "Some intent",
      decisions: [],
      failed_approaches: [],
      warnings: [],
      resolution: "",
      error_signatures: [],
      cause_chain: [],
      file_dependencies: ["Changing auth.ts requires updating config.ts"],
      key_insight: "",
    };
    const text = buildEmbeddingText(memory);
    expect(text).toContain("Changing auth.ts requires updating config.ts");
  });

  it("handles empty arrays gracefully", () => {
    const memory: MemoryRecord = {
      checkpoint_id: "test",
      session_id: "sess",
      date: "2026-04-03",
      branch: "main",
      files: [],
      tags: [],
      turn_count: 0,
      token_usage: 0,
      intent: "Test",
      decisions: [],
      failed_approaches: [],
      warnings: [],
      resolution: "",
      error_signatures: [],
      cause_chain: [],
      file_dependencies: [],
      key_insight: "",
    };

    const text = buildEmbeddingText(memory);
    expect(text).toBe("Test");
  });
});

describe("EmbeddingStore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "embedding-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    const store = new EmbeddingStore(tmpDir);
    expect(store.has("abc")).toBe(false);
    expect(store.get("abc")).toBeNull();
  });

  it("stores and retrieves vectors", () => {
    const store = new EmbeddingStore(tmpDir);
    const vector = [0.1, 0.2, 0.3];
    store.set("abc", vector);
    store.save();

    expect(store.has("abc")).toBe(true);
    expect(store.get("abc")).toEqual(vector);
  });

  it("persists to disk and reloads", () => {
    const store1 = new EmbeddingStore(tmpDir);
    store1.set("abc", [0.5, -0.5]);
    store1.save();

    const store2 = new EmbeddingStore(tmpDir);
    expect(store2.has("abc")).toBe(true);
    expect(store2.get("abc")).toEqual([0.5, -0.5]);
  });

  it("returns all vectors", () => {
    const store = new EmbeddingStore(tmpDir);
    store.set("a", [1, 2]);
    store.set("b", [3, 4]);
    store.save();

    const all = store.getAll();
    expect(Object.keys(all)).toEqual(["a", "b"]);
  });
});
