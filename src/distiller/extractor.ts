import { TranscriptEntry } from "../types";

/**
 * Extracts user messages from raw JSONL transcript entries.
 * Filters out system messages, attachments, and tool calls.
 */
export function extractUserMessages(entries: TranscriptEntry[]): string[] {
  return entries
    .filter((e) => e.type === "user" && e.message?.content)
    .map((e) => {
      const content = e.message!.content;
      if (typeof content === "string") return content;
      // Handle array content (multimodal messages)
      return content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    })
    .filter((msg) => msg.length > 0);
}

/**
 * Extracts assistant messages from raw JSONL transcript entries.
 * Pulls out text content, skipping thinking blocks and tool calls.
 */
export function extractAssistantMessages(entries: TranscriptEntry[]): string[] {
  return entries
    .filter((e) => e.type === "assistant" && e.message?.content)
    .map((e) => {
      const content = e.message!.content;
      if (typeof content === "string") return content;
      return content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    })
    .filter((msg) => msg.length > 0);
}

/**
 * Extracts tool calls from the transcript.
 * Returns tool name and a brief description of what was done.
 */
export function extractToolCalls(entries: TranscriptEntry[]): string[] {
  const tools: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "assistant" || !entry.message?.content) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === "tool_use") {
        const toolBlock = block as { name?: string; input?: Record<string, unknown> };
        if (toolBlock.name) {
          tools.push(toolBlock.name);
        }
      }
    }
  }
  return tools;
}

/**
 * Generates tags from file paths, error patterns, and key terms.
 */
export function generateTags(
  files: string[],
  userMessages: string[],
  assistantMessages: string[]
): string[] {
  const tags = new Set<string>();

  // Tags from file paths
  for (const file of files) {
    const parts = file.split("/");
    const fileName = parts[parts.length - 1].replace(/\.(ts|js|tsx|jsx|py|go|rs)$/, "");
    tags.add(fileName.toLowerCase());

    // Add directory context
    if (parts.length > 1) {
      tags.add(parts[parts.length - 2].toLowerCase());
    }
  }

  // Tags from error patterns in user messages
  const allText = [...userMessages, ...assistantMessages].join(" ").toLowerCase();
  const errorPatterns: Record<string, string> = {
    "401": "auth",
    "403": "forbidden",
    "404": "not-found",
    "500": "server-error",
    cors: "cors",
    timeout: "timeout",
    "unauthorized": "auth",
    "authentication": "auth",
    "permission": "permissions",
    "database": "database",
    "migration": "migration",
    "deploy": "deployment",
    "docker": "docker",
    "env": "environment",
    "cache": "cache",
    "redis": "redis",
    "api": "api",
  };

  for (const [pattern, tag] of Object.entries(errorPatterns)) {
    if (allText.includes(pattern)) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}
