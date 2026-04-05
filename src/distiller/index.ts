import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { EntireCheckpointMeta, MemoryRecord, TranscriptEntry } from "../types";
import {
  extractUserMessages,
  extractAssistantMessages,
  extractToolCalls,
  generateTags,
} from "./extractor";
import { distillWithLLM } from "./llm";
import { generateEmbedding, buildEmbeddingText, EmbeddingStore } from "../retriever/embeddings";

/**
 * Reads the raw JSONL transcript from a checkpoint sub-index on the Entire branch.
 */
function readCheckpointTranscript(repoPath: string, checkpointId: string, subIndex: number = 0): TranscriptEntry[] {
  const shard = checkpointId.slice(0, 2);
  const remaining = checkpointId.slice(2);
  const gitPath = `${shard}/${remaining}/${subIndex}/full.jsonl`;

  try {
    const raw = execSync(`git show entire/checkpoints/v1:${gitPath}`, {
      cwd: repoPath,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });

    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TranscriptEntry);
  } catch {
    throw new Error(`Failed to read transcript for checkpoint ${checkpointId}/${subIndex}`);
  }
}

/**
 * Reads checkpoint metadata from a sub-index on the Entire branch.
 */
function readCheckpointMeta(repoPath: string, checkpointId: string, subIndex: number = 0): EntireCheckpointMeta {
  const shard = checkpointId.slice(0, 2);
  const remaining = checkpointId.slice(2);
  const gitPath = `${shard}/${remaining}/${subIndex}/metadata.json`;

  try {
    const raw = execSync(`git show entire/checkpoints/v1:${gitPath}`, {
      cwd: repoPath,
      encoding: "utf-8",
    });
    return JSON.parse(raw) as EntireCheckpointMeta;
  } catch {
    throw new Error(`Failed to read metadata for checkpoint ${checkpointId}/${subIndex}`);
  }
}

/**
 * Lists all sub-indices for a checkpoint (0, 1, 2, ...).
 */
function listSubCheckpoints(repoPath: string, checkpointId: string): number[] {
  const shard = checkpointId.slice(0, 2);
  const remaining = checkpointId.slice(2);

  try {
    const raw = execSync(`git ls-tree entire/checkpoints/v1:${shard}/${remaining}/`, {
      cwd: repoPath,
      encoding: "utf-8",
    });

    const subIndices: number[] = [];
    for (const line of raw.split("\n")) {
      const match = line.match(/\b(\d+)$/);
      if (match) {
        subIndices.push(parseInt(match[1], 10));
      }
    }
    return subIndices.sort((a, b) => a - b);
  } catch {
    return [0];
  }
}

/**
 * Lists all checkpoint+sub-index pairs in the repository.
 * Returns IDs like "4802aa6ca39b:0", "4802aa6ca39b:1", etc.
 * Each sub-index is a separate session that needs its own distillation.
 */
export function listCheckpoints(repoPath: string): string[] {
  try {
    const raw = execSync("git ls-tree -r --name-only entire/checkpoints/v1", {
      cwd: repoPath,
      encoding: "utf-8",
    });

    // First collect unique checkpoint IDs
    const checkpointIds = new Set<string>();
    for (const line of raw.split("\n")) {
      const match = line.match(/^([0-9a-f]{2})\/([0-9a-f]+)\//);
      if (match) {
        checkpointIds.add(match[1] + match[2]);
      }
    }

    // Then expand each checkpoint into its sub-indices
    const results: string[] = [];
    for (const cpId of checkpointIds) {
      const subIndices = listSubCheckpoints(repoPath, cpId);
      for (const sub of subIndices) {
        results.push(`${cpId}:${sub}`);
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Core distillation: takes a raw checkpoint and produces a compact MemoryRecord.
 *
 * Tries LLM-powered distillation (Claude CLI) first for higher quality.
 * Falls back to heuristic extraction if Claude CLI is not available.
 */
export async function distill(repoPath: string, checkpointId: string, memoriesDir?: string): Promise<MemoryRecord> {
  // Parse sub-index from "checkpointId:subIndex" format
  const parts = checkpointId.split(":");
  const cpId = parts[0];
  const subIndex = parts.length > 1 ? parseInt(parts[1], 10) : 0;

  const meta = readCheckpointMeta(repoPath, cpId, subIndex);
  const entries = readCheckpointTranscript(repoPath, cpId, subIndex);

  const userMessages = extractUserMessages(entries);
  const assistantMessages = extractAssistantMessages(entries);
  const toolCalls = extractToolCalls(entries);

  // Generate searchable tags
  const filesTouched = meta.files_touched || [];
  const tags = generateTags(filesTouched, userMessages, assistantMessages);

  // Normalize file paths
  const files = filesTouched.map((f) => {
    const parts = f.split(/[/\\]/);
    return parts.slice(-3).join("/");
  });

  // Try LLM distillation first
  const llmResult = distillWithLLM(entries, meta);

  let record: MemoryRecord;

  if (llmResult) {
    record = {
      checkpoint_id: checkpointId,
      session_id: meta.session_id || checkpointId,
      date: (meta.created_at || new Date().toISOString()).split("T")[0],
      branch: meta.branch || "unknown",
      files,
      tags,
      turn_count: meta.session_metrics?.turn_count || 0,
      token_usage: (meta.token_usage?.output_tokens || 0) + (meta.token_usage?.input_tokens || 0),
      intent: llmResult.intent,
      decisions: llmResult.decisions,
      failed_approaches: llmResult.failed_approaches,
      warnings: llmResult.warnings,
      resolution: llmResult.resolution,
      error_signatures: llmResult.error_signatures || [],
      cause_chain: llmResult.cause_chain || [],
      file_dependencies: llmResult.file_dependencies || [],
      key_insight: llmResult.key_insight || "",
    };
  } else {
    // Fallback: heuristic extraction
    const intent = userMessages.length > 0
      ? userMessages[0].slice(0, 200).replace(/\n/g, " ").trim()
      : "Unknown intent";

    const decisions = extractDecisions(assistantMessages);
    const failedApproaches = extractFailures(userMessages, assistantMessages);
    const warnings = extractWarnings(assistantMessages);
    const resolution = extractResolution(assistantMessages);

    record = {
      checkpoint_id: checkpointId,
      session_id: meta.session_id || checkpointId,
      date: (meta.created_at || new Date().toISOString()).split("T")[0],
      branch: meta.branch || "unknown",
      files,
      tags,
      turn_count: meta.session_metrics?.turn_count || 0,
      token_usage: (meta.token_usage?.output_tokens || 0) + (meta.token_usage?.input_tokens || 0),
      intent,
      decisions,
      failed_approaches: failedApproaches,
      warnings,
      resolution,
      error_signatures: [],
      cause_chain: [],
      file_dependencies: [],
      key_insight: "",
    };
  }

  // Generate embedding vector for this memory
  if (memoriesDir) {
    try {
      const embeddingText = buildEmbeddingText(record);
      const vector = await generateEmbedding(embeddingText);
      const embeddingStore = new EmbeddingStore(memoriesDir);
      embeddingStore.set(checkpointId, vector);
      embeddingStore.save();
    } catch {
      // Embedding generation failed — memory still works without it
    }
  }

  return record;
}

/** Extracts key decisions from assistant messages */
function extractDecisions(messages: string[]): string[] {
  const decisions: string[] = [];
  const decisionPatterns = [
    /the (?:core |root |main )?(?:issue|problem|cause|error) (?:is|was)[:.]?\s*(.+)/i,
    /root cause[:.]?\s*(.+)/i,
    /(?:i'll|let me|we need to|we should|the fix is to)\s+(.+)/i,
    /(?:changed|updated|switched|modified|replaced)\s+(.+)/i,
  ];

  for (const msg of messages) {
    const sentences = msg.split(/[.!]\s+/);
    for (const sentence of sentences) {
      for (const pattern of decisionPatterns) {
        const match = sentence.match(pattern);
        if (match && match[1] && match[1].length > 20 && match[1].length < 200) {
          decisions.push(match[1].trim());
          break;
        }
      }
    }
  }

  // Deduplicate and limit
  return [...new Set(decisions)].slice(0, 5);
}

/** Extracts failed approaches from the conversation */
function extractFailures(userMessages: string[], assistantMessages: string[]): string[] {
  const failures: string[] = [];
  const failurePatterns = [
    /still (?:getting|seeing|having|shows?)\s+(.+)/i,
    /(?:that |it )?(?:didn't work|still fails|same error|still broken)/i,
    /(?:tried|attempted)\s+(.+?)(?:\s+but|\s+however)/i,
    /even after\s+(.+)/i,
  ];

  for (const msg of [...userMessages, ...assistantMessages]) {
    const sentences = msg.split(/[.!]\s+/);
    for (const sentence of sentences) {
      for (const pattern of failurePatterns) {
        const match = sentence.match(pattern);
        if (match) {
          const failure = (match[1] || sentence).slice(0, 150).trim();
          if (failure.length > 15) {
            failures.push(failure);
            break;
          }
        }
      }
    }
  }

  return [...new Set(failures)].slice(0, 5);
}

/** Extracts warnings and caveats from assistant messages */
function extractWarnings(messages: string[]): string[] {
  const warnings: string[] = [];
  const warningPatterns = [
    /(?:important|note|warning|careful|make sure|don't forget)[:.]?\s*(.+)/i,
    /(?:must|need to|have to|should)\s+(?:also\s+)?(.+)/i,
    /(?:otherwise|or else)\s+(.+)/i,
  ];

  for (const msg of messages) {
    const sentences = msg.split(/[.!]\s+/);
    for (const sentence of sentences) {
      for (const pattern of warningPatterns) {
        const match = sentence.match(pattern);
        if (match && match[1] && match[1].length > 20 && match[1].length < 200) {
          warnings.push(match[1].trim());
          break;
        }
      }
    }
  }

  return [...new Set(warnings)].slice(0, 5);
}

/** Extracts the resolution from the last few assistant messages */
function extractResolution(messages: string[]): string {
  if (messages.length === 0) return "Session ended without clear resolution";

  // Take the last 2 assistant messages and look for resolution language
  const lastMessages = messages.slice(-2).join(" ");
  const resolutionPatterns = [
    /(?:fixed|resolved|working|done|completed)[:.]?\s*(.+)/i,
    /(?:the solution was|this fixes|this resolves)\s+(.+)/i,
  ];

  for (const pattern of resolutionPatterns) {
    const match = lastMessages.match(pattern);
    if (match && match[1]) {
      return match[1].slice(0, 200).trim();
    }
  }

  // Fallback: summarize from last message
  const lastMsg = messages[messages.length - 1];
  return lastMsg.slice(0, 200).replace(/\n/g, " ").trim();
}
