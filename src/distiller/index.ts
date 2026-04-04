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
 * Reads the raw JSONL transcript from a checkpoint on the Entire branch.
 */
function readCheckpointTranscript(repoPath: string, checkpointId: string): TranscriptEntry[] {
  const shard = checkpointId.slice(0, 2);
  const remaining = checkpointId.slice(2);
  const gitPath = `${shard}/${remaining}/0/full.jsonl`;

  try {
    const raw = execSync(`git show entire/checkpoints/v1:${gitPath}`, {
      cwd: repoPath,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large sessions
    });

    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TranscriptEntry);
  } catch {
    throw new Error(`Failed to read transcript for checkpoint ${checkpointId}`);
  }
}

/**
 * Reads checkpoint metadata from the Entire branch.
 */
function readCheckpointMeta(repoPath: string, checkpointId: string): EntireCheckpointMeta {
  const shard = checkpointId.slice(0, 2);
  const remaining = checkpointId.slice(2);
  const gitPath = `${shard}/${remaining}/0/metadata.json`;

  try {
    const raw = execSync(`git show entire/checkpoints/v1:${gitPath}`, {
      cwd: repoPath,
      encoding: "utf-8",
    });
    return JSON.parse(raw) as EntireCheckpointMeta;
  } catch {
    throw new Error(`Failed to read metadata for checkpoint ${checkpointId}`);
  }
}

/**
 * Lists all checkpoint IDs in the repository.
 */
export function listCheckpoints(repoPath: string): string[] {
  try {
    const raw = execSync("git ls-tree -r --name-only entire/checkpoints/v1", {
      cwd: repoPath,
      encoding: "utf-8",
    });

    const checkpointIds = new Set<string>();
    for (const line of raw.split("\n")) {
      // Pattern: XX/YYYYYYYYYY/... → checkpoint ID is XX + YYYYYYYYYY
      const match = line.match(/^([0-9a-f]{2})\/([0-9a-f]+)\//);
      if (match) {
        checkpointIds.add(match[1] + match[2]);
      }
    }
    return Array.from(checkpointIds);
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
  const meta = readCheckpointMeta(repoPath, checkpointId);
  const entries = readCheckpointTranscript(repoPath, checkpointId);

  const userMessages = extractUserMessages(entries);
  const assistantMessages = extractAssistantMessages(entries);
  const toolCalls = extractToolCalls(entries);

  // Generate searchable tags
  const tags = generateTags(meta.files_touched, userMessages, assistantMessages);

  // Normalize file paths
  const files = meta.files_touched.map((f) => {
    const parts = f.split(/[/\\]/);
    return parts.slice(-3).join("/");
  });

  // Try LLM distillation first
  const llmResult = distillWithLLM(entries, meta);

  let record: MemoryRecord;

  if (llmResult) {
    record = {
      checkpoint_id: checkpointId,
      session_id: meta.session_id,
      date: meta.created_at.split("T")[0],
      branch: meta.branch,
      files,
      tags,
      turn_count: meta.session_metrics.turn_count,
      token_usage: meta.token_usage.output_tokens + meta.token_usage.input_tokens,
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
      session_id: meta.session_id,
      date: meta.created_at.split("T")[0],
      branch: meta.branch,
      files,
      tags,
      turn_count: meta.session_metrics.turn_count,
      token_usage: meta.token_usage.output_tokens + meta.token_usage.input_tokens,
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
