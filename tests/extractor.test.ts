import { extractUserMessages, extractAssistantMessages, extractToolCalls, generateTags } from "../src/distiller/extractor";
import { TranscriptEntry } from "../src/types";

describe("extractUserMessages", () => {
  it("extracts string content from user entries", () => {
    const entries: TranscriptEntry[] = [
      { type: "user", message: { role: "user", content: "fix the auth bug" } },
      { type: "assistant", message: { role: "assistant", content: "sure" } },
      { type: "user", message: { role: "user", content: "still broken" } },
    ];
    const result = extractUserMessages(entries);
    expect(result).toEqual(["fix the auth bug", "still broken"]);
  });

  it("extracts array content from multimodal user entries", () => {
    const entries: TranscriptEntry[] = [
      {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "check this error" },
            { type: "image", text: undefined },
            { type: "text", text: "from the logs" },
          ],
        },
      },
    ];
    const result = extractUserMessages(entries);
    expect(result).toEqual(["check this error\nfrom the logs"]);
  });

  it("skips entries without content", () => {
    const entries: TranscriptEntry[] = [
      { type: "user" },
      { type: "user", message: { role: "user", content: "" } },
      { type: "user", message: { role: "user", content: "valid" } },
    ];
    const result = extractUserMessages(entries);
    expect(result).toEqual(["valid"]);
  });

  it("ignores non-user entry types", () => {
    const entries: TranscriptEntry[] = [
      { type: "attachment", message: { role: "user", content: "file.txt" } },
      { type: "permission-mode" },
      { type: "user", message: { role: "user", content: "hello" } },
    ];
    const result = extractUserMessages(entries);
    expect(result).toEqual(["hello"]);
  });
});

describe("extractAssistantMessages", () => {
  it("extracts text from assistant entries", () => {
    const entries: TranscriptEntry[] = [
      { type: "assistant", message: { role: "assistant", content: "I'll fix that" } },
    ];
    const result = extractAssistantMessages(entries);
    expect(result).toEqual(["I'll fix that"]);
  });

  it("extracts text blocks and skips thinking blocks", () => {
    const entries: TranscriptEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "let me think..." },
            { type: "text", text: "Here's the fix" },
          ],
        },
      },
    ];
    const result = extractAssistantMessages(entries);
    expect(result).toEqual(["Here's the fix"]);
  });

  it("returns empty when all blocks are thinking/tool_use", () => {
    const entries: TranscriptEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "analyzing the problem..." },
            { type: "tool_use", name: "Read" } as any,
          ],
        },
      },
    ];
    const result = extractAssistantMessages(entries);
    expect(result).toEqual([]);
  });
});

describe("extractToolCalls", () => {
  it("extracts tool names from assistant entries", () => {
    const entries: TranscriptEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Read" } as any,
            { type: "text", text: "reading file" },
            { type: "tool_use", name: "Edit" } as any,
          ],
        },
      },
    ];
    const result = extractToolCalls(entries);
    expect(result).toEqual(["Read", "Edit"]);
  });

  it("returns empty for non-assistant entries", () => {
    const entries: TranscriptEntry[] = [
      { type: "user", message: { role: "user", content: "hello" } },
    ];
    const result = extractToolCalls(entries);
    expect(result).toEqual([]);
  });
});

describe("generateTags", () => {
  it("generates tags from file paths", () => {
    const tags = generateTags(["src/lib/kvHybrid.ts", "src/api/route.ts"], [], []);
    expect(tags).toContain("kvhybrid");
    expect(tags).toContain("route");
    expect(tags).toContain("lib");
    expect(tags).toContain("api");
  });

  it("generates tags from error patterns in messages", () => {
    const tags = generateTags([], ["getting 401 unauthorized"], ["check authentication"]);
    expect(tags).toContain("auth");
  });

  it("detects deployment-related tags", () => {
    const tags = generateTags([], ["deploy failed"], ["docker container crashed"]);
    expect(tags).toContain("deployment");
    expect(tags).toContain("docker");
  });
});
