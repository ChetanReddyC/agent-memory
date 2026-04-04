import { formatForInjection, formatAsJSON } from "../src/injector";
import { ScoredMemory, MemoryRecord } from "../src/types";

function createScoredMemory(overrides: Partial<MemoryRecord> = {}, score = 75): ScoredMemory {
  return {
    memory: {
      checkpoint_id: "test123",
      session_id: "sess-001",
      date: "2026-04-03",
      branch: "main",
      files: ["src/auth.ts"],
      tags: ["auth"],
      turn_count: 10,
      token_usage: 5000,
      intent: "Fix auth token expiry",
      decisions: ["Root cause: expired JWT"],
      failed_approaches: ["Tried clearing cache"],
      warnings: ["Tokens expire every 24h"],
      resolution: "Added refresh middleware",
      error_signatures: ["401 Unauthorized"],
      cause_chain: ["401 → expired JWT → no refresh"],
      file_dependencies: ["auth.ts requires config.ts"],
      key_insight: "Always check token expiry first",
      ...overrides,
    },
    score,
    breakdown: {
      file_overlap: 50,
      semantic_similarity: 80,
      recency: 90,
      decision_importance: 70,
    },
  };
}

describe("formatForInjection", () => {
  it("returns empty string for no memories", () => {
    expect(formatForInjection([])).toBe("");
  });

  it("includes header and footer", () => {
    const output = formatForInjection([createScoredMemory()]);
    expect(output).toContain("=== AGENT MEMORY");
    expect(output).toContain("=== END AGENT MEMORY ===");
  });

  it("includes all memory fields", () => {
    const output = formatForInjection([createScoredMemory()]);
    expect(output).toContain("Fix auth token expiry");
    expect(output).toContain("Root cause: expired JWT");
    expect(output).toContain("Tried clearing cache");
    expect(output).toContain("Tokens expire every 24h");
    expect(output).toContain("Added refresh middleware");
  });

  it("includes new analytical fields", () => {
    const output = formatForInjection([createScoredMemory()]);
    expect(output).toContain("Error signatures:");
    expect(output).toContain("401 Unauthorized");
    expect(output).toContain("Cause chain:");
    expect(output).toContain("401 → expired JWT → no refresh");
    expect(output).toContain("File dependencies:");
    expect(output).toContain("auth.ts requires config.ts");
    expect(output).toContain("Key insight:");
    expect(output).toContain("Always check token expiry first");
  });

  it("shows relevance score", () => {
    const output = formatForInjection([createScoredMemory({}, 82)]);
    expect(output).toContain("relevance: 82%");
  });

  it("skips empty sections", () => {
    const output = formatForInjection([
      createScoredMemory({
        error_signatures: [],
        cause_chain: [],
        file_dependencies: [],
        key_insight: "",
      }),
    ]);
    expect(output).not.toContain("Error signatures:");
    expect(output).not.toContain("Cause chain:");
    expect(output).not.toContain("File dependencies:");
    expect(output).not.toContain("Key insight:");
  });

  it("handles multiple memories", () => {
    const output = formatForInjection([
      createScoredMemory({ intent: "Fix auth" }, 90),
      createScoredMemory({ intent: "Fix deploy" }, 60),
    ]);
    expect(output).toContain("Fix auth");
    expect(output).toContain("Fix deploy");
  });
});

describe("formatAsJSON", () => {
  it("returns valid JSON", () => {
    const json = formatAsJSON([createScoredMemory()]);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
  });

  it("includes all fields", () => {
    const json = formatAsJSON([createScoredMemory()]);
    const parsed = JSON.parse(json);
    const item = parsed[0];
    expect(item.date).toBe("2026-04-03");
    expect(item.relevance).toBe(75);
    expect(item.files).toEqual(["src/auth.ts"]);
    expect(item.decisions).toEqual(["Root cause: expired JWT"]);
    expect(item.failed_approaches).toEqual(["Tried clearing cache"]);
    expect(item.warnings).toEqual(["Tokens expire every 24h"]);
    expect(item.resolution).toBe("Added refresh middleware");
    expect(item.error_signatures).toEqual(["401 Unauthorized"]);
    expect(item.cause_chain).toEqual(["401 → expired JWT → no refresh"]);
    expect(item.file_dependencies).toEqual(["auth.ts requires config.ts"]);
    expect(item.key_insight).toBe("Always check token expiry first");
  });

  it("returns empty array for no memories", () => {
    const json = formatAsJSON([]);
    expect(JSON.parse(json)).toEqual([]);
  });
});
