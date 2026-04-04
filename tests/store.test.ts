import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MemoryStore } from "../src/store";
import { MemoryRecord } from "../src/types";

function createTestRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    checkpoint_id: "abc123",
    session_id: "sess-001",
    date: "2026-04-03",
    branch: "main",
    files: ["src/index.ts"],
    tags: ["api", "auth"],
    turn_count: 10,
    token_usage: 5000,
    intent: "Fix auth bug",
    decisions: ["Root cause was expired token"],
    failed_approaches: ["Tried resetting cache"],
    warnings: ["Token rotates every 24h"],
    resolution: "Updated token refresh logic",
    error_signatures: ["401 Unauthorized"],
    cause_chain: ["401 → expired token → no refresh logic"],
    file_dependencies: ["Changing auth.ts requires updating config.ts"],
    key_insight: "Always check token expiry first",
    ...overrides,
  };
}

describe("MemoryStore", () => {
  let tmpDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-test-"));
    store = new MemoryStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(store.count()).toBe(0);
    expect(store.loadAll()).toEqual([]);
  });

  it("saves and loads a record", () => {
    const record = createTestRecord();
    store.save(record);

    const loaded = store.load("abc123");
    expect(loaded).not.toBeNull();
    expect(loaded!.intent).toBe("Fix auth bug");
    expect(loaded!.error_signatures).toEqual(["401 Unauthorized"]);
    expect(loaded!.key_insight).toBe("Always check token expiry first");
  });

  it("checks existence", () => {
    expect(store.exists("abc123")).toBe(false);
    store.save(createTestRecord());
    expect(store.exists("abc123")).toBe(true);
  });

  it("counts records", () => {
    expect(store.count()).toBe(0);
    store.save(createTestRecord({ checkpoint_id: "a" }));
    store.save(createTestRecord({ checkpoint_id: "b" }));
    expect(store.count()).toBe(2);
  });

  it("loads all records sorted by date descending", () => {
    store.save(createTestRecord({ checkpoint_id: "old", date: "2026-01-01" }));
    store.save(createTestRecord({ checkpoint_id: "new", date: "2026-04-03" }));

    const all = store.loadAll();
    expect(all.length).toBe(2);
    expect(all[0].checkpoint_id).toBe("new");
    expect(all[1].checkpoint_id).toBe("old");
  });

  it("returns null for non-existent record", () => {
    expect(store.load("nonexistent")).toBeNull();
  });

  it("overwrites existing record on save with same checkpoint_id", () => {
    store.save(createTestRecord({ intent: "original intent" }));
    expect(store.load("abc123")!.intent).toBe("original intent");

    store.save(createTestRecord({ intent: "updated intent" }));
    expect(store.load("abc123")!.intent).toBe("updated intent");
    expect(store.count()).toBe(1); // still 1, not 2
  });
});
