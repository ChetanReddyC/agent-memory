import { scoreMemory } from "../src/retriever/scorer";
import { MemoryRecord, SessionContext } from "../src/types";

function createMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    checkpoint_id: "test123",
    session_id: "sess-001",
    date: new Date().toISOString().split("T")[0], // today
    branch: "main",
    files: ["src/auth.ts", "src/config.ts"],
    tags: ["auth", "config"],
    turn_count: 15,
    token_usage: 8000,
    intent: "Fix authentication token expiry bug",
    decisions: ["Root cause was expired JWT token"],
    failed_approaches: ["Tried clearing Redis cache"],
    warnings: ["JWT tokens expire every 24 hours"],
    resolution: "Added token refresh middleware",
    error_signatures: ["401 Unauthorized", "JWT expired"],
    cause_chain: ["401 → no refresh → token expired after 24h"],
    file_dependencies: ["auth.ts depends on config.ts for token settings"],
    key_insight: "Always implement token refresh for long-lived sessions",
    ...overrides,
  };
}

function createContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    modified_files: [],
    branch: "main",
    prompt: "",
    recent_files: [],
    ...overrides,
  };
}

describe("scoreMemory", () => {
  describe("file overlap", () => {
    it("scores high when files match", () => {
      const memory = createMemory({ files: ["src/auth.ts", "src/config.ts"] });
      const context = createContext({ recent_files: ["src/auth.ts"] });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.file_overlap).toBe(100);
    });

    it("scores partial overlap correctly", () => {
      const memory = createMemory({ files: ["src/auth.ts", "src/config.ts", "src/db.ts"] });
      const context = createContext({ recent_files: ["src/auth.ts", "src/other.ts"] });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.file_overlap).toBe(50);
    });

    it("scores zero when no files match", () => {
      const memory = createMemory({ files: ["src/auth.ts"] });
      const context = createContext({ recent_files: ["src/other.ts"] });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.file_overlap).toBe(0);
    });

    it("scores zero when context has no files", () => {
      const memory = createMemory();
      const context = createContext({ modified_files: [], recent_files: [] });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.file_overlap).toBe(0);
    });

    it("matches on filename not full path", () => {
      const memory = createMemory({ files: ["old/path/auth.ts"] });
      const context = createContext({ recent_files: ["new/path/auth.ts"] });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.file_overlap).toBe(100);
    });
  });

  describe("keyword similarity", () => {
    it("scores high when prompt keywords match memory content", () => {
      const memory = createMemory({ intent: "Fix authentication token expiry bug" });
      const context = createContext({ prompt: "authentication token expired" });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.semantic_similarity).toBeGreaterThan(50);
    });

    it("scores zero for unrelated prompt", () => {
      const memory = createMemory({ intent: "Fix authentication bug" });
      const context = createContext({ prompt: "center div flexbox" });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.semantic_similarity).toBeLessThan(50);
    });

    it("scores zero for empty prompt", () => {
      const memory = createMemory();
      const context = createContext({ prompt: "" });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.semantic_similarity).toBe(0);
    });

    it("scores zero for stopword-only prompt", () => {
      const memory = createMemory();
      const context = createContext({ prompt: "the is a was were been have has" });
      const result = scoreMemory(memory, context);
      expect(result.breakdown.semantic_similarity).toBe(0);
    });
  });

  describe("error signature match", () => {
    it("scores high when error codes match signatures", () => {
      const memory = createMemory({ error_signatures: ["401 Unauthorized", "500 Internal Server Error"] });
      const context = createContext();
      const result = scoreMemory(memory, context, undefined, ["401"]);
      expect(result.breakdown.error_match).toBe(100);
    });

    it("scores partial when some codes match", () => {
      const memory = createMemory({ error_signatures: ["401 Unauthorized"] });
      const context = createContext();
      const result = scoreMemory(memory, context, undefined, ["401", "503"]);
      expect(result.breakdown.error_match).toBe(50);
    });

    it("scores zero when no codes match", () => {
      const memory = createMemory({ error_signatures: ["401 Unauthorized"] });
      const context = createContext();
      const result = scoreMemory(memory, context, undefined, ["503"]);
      expect(result.breakdown.error_match).toBe(0);
    });

    it("scores zero when memory has no signatures", () => {
      const memory = createMemory({ error_signatures: [] });
      const context = createContext();
      const result = scoreMemory(memory, context, undefined, ["401"]);
      expect(result.breakdown.error_match).toBe(0);
    });

    it("scores zero when no error codes provided", () => {
      const memory = createMemory();
      const context = createContext();
      const result = scoreMemory(memory, context);
      expect(result.breakdown.error_match).toBe(0);
    });

    it("matches case-insensitively", () => {
      const memory = createMemory({ error_signatures: ["TypeError: fetch failed"] });
      const context = createContext();
      const result = scoreMemory(memory, context, undefined, ["typeerror: fetch failed"]);
      expect(result.breakdown.error_match).toBe(100);
    });
  });

  describe("recency", () => {
    it("scores high for today", () => {
      const memory = createMemory({ date: new Date().toISOString().split("T")[0] });
      const context = createContext();
      const result = scoreMemory(memory, context);
      expect(result.breakdown.recency).toBeGreaterThan(90);
    });

    it("decays for older memories", () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const memory = createMemory({ date: thirtyDaysAgo });
      const context = createContext();
      const result = scoreMemory(memory, context);
      expect(result.breakdown.recency).toBeLessThan(30);
    });
  });

  describe("importance", () => {
    it("scores higher for more decisions and warnings", () => {
      const simple = createMemory({ decisions: ["one"], failed_approaches: [], warnings: [] });
      const complex = createMemory({
        decisions: ["one", "two", "three"],
        failed_approaches: ["fail1", "fail2"],
        warnings: ["warn1", "warn2", "warn3"],
      });
      const context = createContext();
      const simpleResult = scoreMemory(simple, context);
      const complexResult = scoreMemory(complex, context);
      expect(complexResult.breakdown.decision_importance).toBeGreaterThan(
        simpleResult.breakdown.decision_importance
      );
    });
  });

  describe("embedding similarity override", () => {
    it("uses embedding score when provided", () => {
      const memory = createMemory();
      const context = createContext({ prompt: "completely unrelated words" });
      const result = scoreMemory(memory, context, 0.85);
      expect(result.breakdown.semantic_similarity).toBe(85);
    });
  });

  describe("overall score", () => {
    it("uses 4-signal formula when no error codes provided", () => {
      const memory = createMemory();
      const context = createContext({
        prompt: "authentication token expired",
        recent_files: ["src/auth.ts"],
      });
      const result = scoreMemory(memory, context);
      const expected =
        result.breakdown.file_overlap * 0.4 +
        result.breakdown.semantic_similarity * 0.3 +
        result.breakdown.recency * 0.2 +
        result.breakdown.decision_importance * 0.1;
      expect(result.score).toBeCloseTo(expected, 5);
    });

    it("uses 5-signal formula when error codes match", () => {
      const memory = createMemory({ error_signatures: ["401 Unauthorized"] });
      const context = createContext({ recent_files: ["src/auth.ts"] });
      const result = scoreMemory(memory, context, undefined, ["401"]);
      const expected =
        result.breakdown.file_overlap * 0.3 +
        result.breakdown.semantic_similarity * 0.25 +
        result.breakdown.error_match! * 0.2 +
        result.breakdown.recency * 0.15 +
        result.breakdown.decision_importance * 0.1;
      expect(result.score).toBeCloseTo(expected, 5);
    });

    it("weighted formula holds with embedding override too", () => {
      const memory = createMemory();
      const context = createContext({ recent_files: ["src/auth.ts"] });
      const result = scoreMemory(memory, context, 0.72);
      const expected =
        result.breakdown.file_overlap * 0.4 +
        72 * 0.3 +
        result.breakdown.recency * 0.2 +
        result.breakdown.decision_importance * 0.1;
      expect(result.score).toBeCloseTo(expected, 5);
      expect(result.breakdown.semantic_similarity).toBe(72);
    });
  });
});
