import { TranscriptEntry } from "../types";
/**
 * Extracts user messages from raw JSONL transcript entries.
 * Filters out system messages, attachments, and tool calls.
 */
export declare function extractUserMessages(entries: TranscriptEntry[]): string[];
/**
 * Extracts assistant messages from raw JSONL transcript entries.
 * Pulls out text content, skipping thinking blocks and tool calls.
 */
export declare function extractAssistantMessages(entries: TranscriptEntry[]): string[];
/**
 * Extracts tool calls from the transcript.
 * Returns tool name and a brief description of what was done.
 */
export declare function extractToolCalls(entries: TranscriptEntry[]): string[];
/**
 * Generates tags from file paths, error patterns, and key terms.
 */
export declare function generateTags(files: string[], userMessages: string[], assistantMessages: string[]): string[];
